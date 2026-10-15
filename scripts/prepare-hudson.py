"""Build Hudson County analysis from official Census 2020 and LODES 2023 inputs.
Usage: python3 scripts/prepare-hudson.py RAW_DIRECTORY DOWNLOAD_DATE
Build-time dependencies: shapely 2.1.2, pyshp 3.0.3. No runtime GIS dependency.
Input URLs and checksums are recorded in hudson-analysis-metadata.json.
"""
import collections,csv,gzip,hashlib,json,sys,zipfile,io
from pathlib import Path
import shapefile
from shapely import make_valid,set_precision
from shapely.geometry import shape,mapping,MultiPolygon
from shapely.ops import unary_union

raw=Path(sys.argv[1]);downloaded=sys.argv[2];out=Path('public/data')
with gzip.open(raw/'nj-xwalk.csv.gz','rt',newline='') as stream:
    crosswalk=list(csv.DictReader(stream))
county_rows=[row for row in crosswalk if row['cty']=='34017']
county_blocks={row['tabblk2020'] for row in county_rows}
tract_cities=collections.defaultdict(set)
for row in county_rows:tract_cities[row['trct']].add(row['ctycsub'])
assert all(len(cities)==1 for cities in tract_cities.values())
tract_ids=set(tract_cities)
tract_data=json.loads((raw/'hudson-tracts-2020.geojson').read_text())
assert not tract_data.get('exceededTransferLimit')
tracts=tract_data['features']
assert len(tracts)==183 and {f['properties']['GEOID'] for f in tracts}==tract_ids
municipal_data=json.loads((raw/'hudson-municipalities-2020.geojson').read_text())
assert not municipal_data.get('exceededTransferLimit')
municipalities=municipal_data['features'];assert len(municipalities)==12
cities={f['properties']['GEOID']:f for f in municipalities}
# Whole tracts belong to exactly one municipality; compare both counts and land area.
for city_id,city in cities.items():
    selected=[f for f in tracts if city_id in tract_cities[f['properties']['GEOID']]]
    for field in ['POP100','AREALAND']:
        assert sum(int(f['properties'][field]) for f in selected)==city['properties'][field]
total_population=sum(int(f['properties']['POP100']) for f in tracts)
land_total=sum(int(f['properties']['AREALAND']) for f in tracts)/1e6
assert total_population==724854

counts=collections.Counter();seen=set();dates=set()
with gzip.open(raw/'nj-wac-2023.csv.gz','rt',newline='') as stream:
    for row in csv.DictReader(stream):
        code=row['w_geocode']
        if code not in county_blocks:continue
        assert code not in seen;seen.add(code)
        jobs=int(row['C000']);assert jobs>=0
        counts[code[:11]]+=jobs;dates.add(row['createdate'])
assert counts and not (counts.keys()-tract_ids)

with zipfile.ZipFile(raw/'hudson-water-2020.zip') as archive:
    name=next(name[:-4] for name in archive.namelist() if name.endswith('.shp'))
    reader=shapefile.Reader(**{ext:io.BytesIO(archive.read(name+'.'+ext)) for ext in ['shp','shx','dbf']})
    water=unary_union([make_valid(shape(record.__geo_interface__)) for record in reader.shapes()])
land_mask=unary_union([make_valid(shape(city['geometry'])) for city in municipalities]).difference(water)
def polygons(geometry):
    if geometry.geom_type=='Polygon':return [geometry]
    return [part for g in getattr(geometry,'geoms',[]) for part in polygons(g)]
def land_geometry(geometry):
    clipped=make_valid(geometry).intersection(land_mask)
    clipped=set_precision(clipped,1e-6)
    parts=polygons(clipped);assert parts
    result=parts[0] if len(parts)==1 else MultiPolygon(parts)
    assert result.is_valid and not result.is_empty
    return mapping(result)
features=[];jobs_records={}
for feature in sorted(tracts,key=lambda f:f['properties']['GEOID']):
    p=feature['properties'];geoid=p['GEOID'];population=int(p['POP100']);land=int(p['AREALAND'])/1e6;jobs=counts[geoid]
    assert land>0
    city=cities[next(iter(tract_cities[geoid]))]['properties']['BASENAME']
    features.append({'type':'Feature','id':geoid,'geometry':land_geometry(shape(feature['geometry'])),'properties':{
        'geoid':geoid,'tract':p['BASENAME'],'borough':city,'city':city,'region':'Hudson County, NJ',
        'neighborhood':p['NAME'],'population':population,'land_km2':round(land,6),'density':round(population/land,2),'year':2020}})
    jobs_records[geoid]={'jobs':jobs,'density':round(jobs/land,2)}
def save(name,value):
    (out/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
def collection(features):return {'type':'FeatureCollection','features':features}
save('hudson-population-2020.geojson',collection(features))
save('hudson-municipalities.geojson',collection([{'type':'Feature','id':c['properties']['GEOID'],'geometry':land_geometry(shape(c['geometry'])),'properties':{'name':c['properties']['BASENAME'],'population':int(c['properties']['POP100'])}} for c in municipalities]))
save('hudson-labels.geojson',collection([{'type':'Feature','geometry':{'type':'Point','coordinates':[float(c['properties']['INTPTLON']),float(c['properties']['INTPTLAT'])]},'properties':{'name':c['properties']['BASENAME']}} for c in municipalities]))
save('hudson-jobs-2023.json',{'year':2023,'job_type':'JT00','workforce_segment':'S000','characteristic':'C000','jobs':sum(counts.values()),'workplace_blocks':len(seen),'tracts':jobs_records})
base='https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer'
sources={'tract_geometry_population_land':base+'/6','municipal_boundaries_and_population_cross_check':base+'/20',
    'workplace_counts':'https://lehd.ces.census.gov/data/lodes/LODES8/nj/wac/nj_wac_S000_JT00_2023.csv.gz',
    'block_municipality_crosswalk':'https://lehd.ces.census.gov/data/lodes/LODES8/nj/nj_xwalk.csv.gz',
    'water_geometry':'https://www2.census.gov/geo/tiger/TIGER2020/AREAWATER/tl_2020_34017_areawater.zip',
    'population_cross_check':'https://www.census.gov/quickfacts/hudsoncountynewjersey'}
metadata={'coverage':'All 12 municipalities of Hudson County, New Jersey (2020 Census county 34017).',
    'population_year':2020,'jobs_year':2023,'tracts':len(features),'municipalities':len(cities),'population':total_population,'land_km2':land_total,
    'jobs':sum(counts.values()),'workplace_blocks':len(seen),'county_blocks':len(county_blocks),'downloaded':downloaded,'sources':sources,
    'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(raw.iterdir()) if p.name in ['nj-xwalk.csv.gz','nj-wac-2023.csv.gz','hudson-tracts-2020.geojson','hudson-municipalities-2020.geojson','hudson-water-2020.zip']},
    'jobs_source_creation_dates':sorted(dates),
    'method':'Select all Hudson County blocks from the LODES crosswalk. Verify that each complete 2020 tract belongs to one municipality and cross-check population and land totals for all 12 municipalities against Census 2020 county subdivisions. Sum S000/JT00 C000 workplace jobs for county blocks. Divide counts by official 2020 Census land km2. Clip display polygons to municipal boundaries and subtract TIGER 2020 area water; snap coordinates to 0.000001 degrees. Display geometry is not used to calculate density.',
    'interpretation':'Census tract averages, not building-level occupancy. Jobs include covered secondary jobs and do not represent all employment. NJ units are census tracts; municipality names come from official county subdivisions, not inferred neighborhoods or wards.',
    'attribution':'U.S. Census Bureau: Census 2020 TIGERweb, TIGER/Line area water and LEHD LODES.'}
(out/'hudson-analysis-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(f'Prepared {len(features)} Hudson tracts across {len(cities)} municipalities; population {total_population:,}; {sum(counts.values()):,} covered jobs; {len(seen)} workplace blocks')
