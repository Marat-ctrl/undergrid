import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyAnalysisLayers,attachJobs,densityColor,normalizeAnalysis,populationDensity} from './analysisLayers';
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
 applyAnalysisLayers(map as never,{mode:'off'});assert.equal(visibility['tract-hit-area'],'none');assert.equal(visibility['borough-boundaries'],'none');assert.equal(paint['buildings-3d.fill-extrusion-opacity'],.85);
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
