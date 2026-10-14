"""Build offline NYC analysis layers from downloaded primary-source data.
Usage: python3 scripts/prepare-demographics.py TRACTS CENSUS BOROUGHS
Downloads and source URLs are documented in public/data/nyc-analysis-metadata.json.
"""
import json,sys,collections
from pathlib import Path
tract_file,census_file,borough_file=map(Path,sys.argv[1:])
tracts=json.loads(tract_file.read_text())['features']
census_data=json.loads(census_file.read_text())
assert not census_data.get('exceededTransferLimit'),'Census response was truncated'
census={f['attributes']['GEOID']:f['attributes'] for f in census_data['features']}
boroughs=json.loads(borough_file.read_text())['features']
assert len(tracts)==2325 and len(boroughs)==5
assert len(census)==2327
seen=set();totals=collections.Counter()
def coordinates(value):
 if isinstance(value[0],(float,int)):return [round(float(n),6) for n in value]
 return [coordinates(v) for v in value]
def geometry(value):return {'type':value['type'],'coordinates':coordinates(value['coordinates'])}
features=[]
for f in tracts:
 p=f['properties'];geoid=p['geoid'];assert geoid not in seen;seen.add(geoid)
 a=census[geoid];pop=int(a['POP100']);land=int(a['AREALAND']);assert pop>=0 and land>=0
 totals[p['boroname']]+=pop
 features.append({'type':'Feature','id':geoid,'geometry':geometry(f['geometry']),'properties':{'geoid':geoid,'tract':p['ctlabel'],'borough':p['boroname'],'neighborhood':p['ntaname'],'population':pop,'land_km2':round(land/1000000,6),'density':round(pop/(land/1000000),2) if land>0 else None,'year':2020}})
assert sum(totals.values())==8804190
assert all(census[k]['POP100']==0 and census[k]['AREALAND']==0 for k in census.keys()-seen)
expected={'Manhattan':1694251,'Bronx':1472654,'Brooklyn':2736074,'Queens':2405464,'Staten Island':495747}
assert dict(totals)==expected
out=Path('public/data');out.mkdir(parents=True,exist_ok=True)
def save(name,features): (out/name).write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n')
save('nyc-population-2020.geojson',features)
bfeatures=[]
for f in boroughs:
 p=f['properties'];name=p['boro_name'] if 'boro_name' in p else p['boroname'];bfeatures.append({'type':'Feature','id':name,'geometry':geometry(f['geometry']),'properties':{'name':name,'population':totals[name]}})
save('nyc-boroughs.geojson',bfeatures)
labels={'Manhattan':[-73.97,40.78],'Bronx':[-73.86,40.85],'Brooklyn':[-73.95,40.65],'Queens':[-73.81,40.72],'Staten Island':[-74.15,40.58]}
save('nyc-borough-labels.geojson',[{'type':'Feature','geometry':{'type':'Point','coordinates':point},'properties':{'name':name}} for name,point in labels.items()])
metadata={'population_year':2020,'coverage':'The five boroughs of New York City. Surrounding counties are not covered.','tracts':len(features),'population':sum(totals.values()),'borough_population':dict(totals),'downloaded':'2026-10-14','method':'Join shoreline-clipped NYC DCP 2020 tract polygons to Census 2020 TIGERweb GEOID. Density = POP100 / (AREALAND / 1,000,000), in residents per km² of land. Coordinates rounded to 6 decimal places; no geometry-based area calculation. Two offshore-only tracts with zero population and land area are omitted. Any included tract with zero official land area has no density value.','sources':{'tract_geometry':'https://data.cityofnewyork.us/City-Government/2020-Census-Tracts/63ge-mke6','population_and_land_area':'https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/6','borough_geometry':'https://data.cityofnewyork.us/d/gthc-hcne','population_cross_check':'https://www.census.gov/about/history/stories/monthly/2023/january-2023.html'},'boundary_vintages':{'tracts':'2020 census geography, NYC DCP current shoreline representation','boroughs':'NYC DCP release 26b, 2026-05-26'},'attribution':'Population and land area: U.S. Census Bureau. Shoreline polygons and borough boundaries: NYC Department of City Planning / NYC Open Data.','interpretation':'Residential density averaged across each census tract; not daytime occupancy, ridership demand or a building-level count.'}
(out/'nyc-analysis-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(f'Prepared {len(features)} tracts, {len(bfeatures)} boroughs; population {sum(totals.values()):,}')
