import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyAnalysisLayers,attachJobs,densityColor,loadAnalysisData,normalizeAnalysis,populationDensity} from './analysisLayers';
import {DEFAULT_CAMERA,isQuickSave} from '../gameSave';
test('density uses square kilometres of land and distinguishes missing area from zero residents',()=>{
 assert.equal(populationDensity(10000,500000),20000);
 assert.equal(populationDensity(0,500000),0);
 for(const [pop,land] of [[10,0],[10,-1],[-1,100],[NaN,100],[10,Infinity]])assert.equal(populationDensity(pop,land),null);
 assert.notEqual(densityColor(null),densityColor(0));assert.notEqual(densityColor(2499),densityColor(2500));assert.equal(densityColor(60000),densityColor(100000));
});
test('packaged tracts preserve the complete official 2020 population and correct density joins',()=>{
 const data=JSON.parse(readFileSync(new URL('../../public/data/nyc-population-2020.geojson',import.meta.url),'utf8'));
 const boroughs=JSON.parse(readFileSync(new URL('../../public/data/nyc-boroughs.geojson',import.meta.url),'utf8'));
 const totals:Record<string,number>={};const ids=new Set<string>();
 assert.equal(data.features.length,2325);assert.equal(boroughs.features.length,5);
 for(const f of data.features){const p=f.properties;assert.ok(!ids.has(p.geoid));ids.add(p.geoid);assert.equal(p.year,2020);assert.ok(Number.isInteger(p.population)&&p.population>=0);totals[p.borough]=(totals[p.borough]??0)+p.population;const expected=populationDensity(p.population,p.land_km2*1000000);if(expected===null)assert.equal(p.density,null);else assert.ok(Math.abs(expected-p.density)<.011);}
 assert.deepEqual(totals,{Manhattan:1694251,Bronx:1472654,Brooklyn:2736074,Queens:2405464,'Staten Island':495747});
 for(const f of boroughs.features)assert.equal(f.properties.population,totals[f.properties.name as keyof typeof totals]);
});
test('legacy quick saves remain valid while malformed analysis switches are rejected',()=>{
 const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean'};
 assert.ok(isQuickSave(save));assert.ok(isQuickSave({...save,analysis:{population:true,districts:false}}));assert.ok(isQuickSave({...save,analysis:{mode:'jobs'}}));assert.deepEqual(normalizeAnalysis({population:false,districts:true}),{mode:'population'});assert.deepEqual(normalizeAnalysis(undefined),{mode:'off'});
 for(const analysis of [null,{},true,{population:'true',districts:false},{population:true},{mode:'unknown'},{mode:'bad',population:true,districts:true}])assert.ok(!isQuickSave({...save,analysis}));
});
test('analysis modes include boundaries and switch between population and job density',()=>{
 const visibility:Record<string,string>={};const paint:Record<string,unknown>={};
 const map={getLayer:()=>true,setLayoutProperty:(id:string,_key:string,value:string)=>{visibility[id]=value;},setPaintProperty:(id:string,key:string,value:unknown)=>{paint[`${id}.${key}`]=value;}};
 applyAnalysisLayers(map as never,{mode:'population'});assert.equal(visibility['population-density'],'visible');assert.equal(visibility['borough-boundaries'],'visible');assert.equal(paint['buildings-3d.fill-extrusion-opacity'],.18);const populationPaint=paint['population-density.fill-color'];
 applyAnalysisLayers(map as never,{mode:'jobs'});assert.equal(visibility['borough-boundaries'],'visible');assert.notDeepEqual(paint['population-density.fill-color'],populationPaint);
 applyAnalysisLayers(map as never,{mode:'off'});assert.equal(visibility['tract-hit-area'],'none');assert.equal(visibility['borough-boundaries'],'none');assert.equal(paint['buildings-3d.fill-extrusion-opacity'],1);
});
test('packaged workplace counts join every tract and preserve LODES job totals and densities',()=>{
 const data=JSON.parse(readFileSync(new URL('../../public/data/nyc-population-2020.geojson',import.meta.url),'utf8'));
 const jobs=JSON.parse(readFileSync(new URL('../../public/data/nyc-jobs-2023.json',import.meta.url),'utf8'));
 const merged=attachJobs(data,jobs);let total=0;const totals:Record<string,number>={};
 assert.equal(Object.keys(jobs.tracts).length,2325);assert.equal(jobs.year,2023);assert.equal(jobs.workplace_blocks,25445);
 for(const f of merged.features){const p=f.properties!;total+=p.jobs;totals[p.borough]=(totals[p.borough]??0)+p.jobs;const expected=populationDensity(p.jobs,p.land_km2*1000000);if(expected===null)assert.equal(p.jobs_density,null);else assert.ok(Math.abs(expected-p.jobs_density)<.011);}
 assert.equal(total,4585129);assert.equal(total,jobs.jobs);assert.deepEqual(totals,jobs.borough_jobs);assert.ok(totals.Manhattan>totals.Brooklyn);
 const missing={...jobs,tracts:{...jobs.tracts}};delete missing.tracts[data.features[0].properties.geoid];assert.throws(()=>attachJobs(data,missing));assert.throws(()=>attachJobs(data,{...jobs,year:2022}));
});
test('Hudson County tracts preserve official population, land and covered jobs without overlapping NYC IDs',()=>{
 const data=JSON.parse(readFileSync(new URL('../../public/data/hudson-population-2020.geojson',import.meta.url),'utf8'));
 const jobs=JSON.parse(readFileSync(new URL('../../public/data/hudson-jobs-2023.json',import.meta.url),'utf8'));
 const metadata=JSON.parse(readFileSync(new URL('../../public/data/hudson-analysis-metadata.json',import.meta.url),'utf8'));
 const merged=attachJobs(data,jobs),ids=new Set();let population=0,workplaces=0,land=0;
 assert.equal(data.features.length,183);assert.equal(Object.keys(jobs.tracts).length,183);assert.equal(jobs.workplace_blocks,2829);assert.equal(jobs.workplace_blocks,metadata.workplace_blocks);
 for(const feature of merged.features){const p=feature.properties!;assert.match(p.geoid,/^34017\d{6}$/);assert.ok(!ids.has(p.geoid));ids.add(p.geoid);assert.ok(typeof p.city==='string'&&p.city.length>0);assert.equal(p.year,2020);assert.equal(p.jobs_year,2023);
   population+=p.population;workplaces+=p.jobs;land+=p.land_km2;
   assert.ok(Math.abs(populationDensity(p.population,p.land_km2*1e6)!-p.density)<.011);assert.ok(Math.abs(populationDensity(p.jobs,p.land_km2*1e6)!-p.jobs_density)<.011);
 }
 assert.equal(merged.features.filter(f=>f.properties?.city==='Jersey City').reduce((sum,f)=>sum+f.properties!.population,0),292449);
 assert.equal(new Set(merged.features.map(f=>f.properties!.city)).size,12);
 assert.equal(population,724854);assert.equal(population,metadata.population);assert.equal(workplaces,293100);assert.equal(workplaces,jobs.jobs);assert.equal(workplaces,metadata.jobs);assert.ok(Math.abs(land-119.640822)<1e-6);
});
test('shared analysis loader joins NYC and all Hudson municipalities into the same three map sources',async()=>{
 const original=globalThis.fetch;
 try{
   globalThis.fetch=(async input=>new Response(readFileSync(new URL(`../../public/data/${String(input).split('/').at(-1)}`,import.meta.url),'utf8'))) as typeof fetch;
   const [tracts,regions,labels]=await loadAnalysisData(new AbortController().signal);
   assert.equal(tracts.features.length,2508);assert.equal(regions.features.length,17);assert.equal(labels.features.length,17);
   assert.ok(regions.features.some(f=>f.properties?.name==='Jersey City'));assert.ok(tracts.features.every(f=>Number.isSafeInteger(f.properties?.jobs)&&f.properties?.jobs_year===2023));
   assert.equal(new Set(tracts.features.map(f=>f.properties?.geoid)).size,2508);
 }finally{globalThis.fetch=original;}
});
