"""Aggregate official LODES8 S000/JT00 WAC jobs to packaged NYC 2020 tracts.
Usage: python3 scripts/prepare-jobs.py WAC_CSV_GZ YEAR
"""
import collections,csv,gzip,hashlib,json,sys
from pathlib import Path
source=Path(sys.argv[1]);year=int(sys.argv[2]);assert 2002<=year<=2023
root=Path('public/data');tracts=json.loads((root/'nyc-population-2020.geojson').read_text())['features']
ids={f['properties']['geoid'] for f in tracts};counties={'36005','36047','36061','36081','36085'}
counts=collections.Counter();seen=set();blocks=0;dates=set()
with gzip.open(source,'rt',newline='') as stream:
 for row in csv.DictReader(stream):
  code=row['w_geocode'];assert len(code)==15 and code.isdigit();jobs=int(row['C000']);assert jobs>=0
  if code[:5] not in counties:continue
  assert code not in seen,'Duplicate workplace block';seen.add(code)
  tract=code[:11];assert tract in ids,'Unmapped NYC workplace tract'
  counts[tract]+=jobs;blocks+=1;dates.add(row['createdate'])
assert blocks>0
records={};boroughs=collections.Counter()
for f in tracts:
 p=f['properties'];jobs=counts[p['geoid']];land=p['land_km2'];density=round(jobs/land,2) if land>0 else None
 if land==0:assert jobs==0
 records[p['geoid']]={'jobs':jobs,'density':density};boroughs[p['borough']]+=jobs
assert sum(r['jobs'] for r in records.values())==sum(counts.values())
source_url=f'https://lehd.ces.census.gov/data/lodes/LODES8/ny/wac/ny_wac_S000_JT00_{year}.csv.gz'
result={'year':year,'job_type':'JT00','workforce_segment':'S000','characteristic':'C000','jobs':sum(counts.values()),'workplace_blocks':blocks,'borough_jobs':dict(boroughs),'tracts':records}
(root/f'nyc-jobs-{year}.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
metadata=json.loads((root/'nyc-analysis-metadata.json').read_text());metadata['jobs']={'year':year,'count':result['jobs'],'workplace_blocks':blocks,'borough_jobs':dict(boroughs),'source':source_url,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_creation_dates':sorted(dates),'method':'Sum C000 from S000/JT00 Workplace Area Characteristics by first 11 digits of w_geocode (2020 census tract GEOID), then divide by 2020 Census land area in km². All NYC workplace records match shoreline tracts. Tracts without a WAC record have zero covered jobs.','interpretation':'Covered jobs at workplaces, not employed residents or unique workers. All jobs (JT00), including secondary jobs; LEHD coverage does not include all employment. Tract average, not individual office locations.'}
(root/'nyc-analysis-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(f'Prepared {blocks:,} workplace blocks; {result["jobs"]:,} covered jobs ({year})')
print(dict(boroughs))
