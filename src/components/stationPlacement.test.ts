import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONSTRUCTION, stretchedStation, stationLength, isStationList, stationFeatures } from './stationPlacement';
import { isQuickSave,DEFAULT_CAMERA } from '../gameSave';
const start:[number,number]=[-74.007,40.712];
test('two-click placement clamps length while preserving depth, layout and direction',()=>{
 for(const cursor of [[-74.00695,40.712],[-74,40.712],[-74.007,40.714]] as [number,number][]){
   const station=stretchedStation(start,cursor,{...DEFAULT_CONSTRUCTION,platforms:'island',depth:-40})!;
   assert.ok(stationLength(station.start,station.end)>=99.8&&stationLength(station.start,station.end)<=300.2);
   assert.equal(station.layout,'island');assert.equal(station.depth,-40);
   assert.equal(station.start[0],start[0]);assert.equal(station.start[1],start[1]);
 }
 const north=stretchedStation(start,[-74.007,40.713],DEFAULT_CONSTRUCTION)!;assert.ok(Math.abs(north.end[0]-start[0])<1e-9);assert.ok(north.end[1]>start[1]);
 const short=stretchedStation(start,[-74.00695,40.712],DEFAULT_CONSTRUCTION)!;assert.ok(Math.abs(stationLength(start,short.end)-100)<.01);
 const long=stretchedStation(start,[-74,40.712],DEFAULT_CONSTRUCTION)!;assert.ok(Math.abs(stationLength(start,long.end)-300)<.01);
 assert.equal(stretchedStation([-73.6501,40.712],[-73.649,40.712],DEFAULT_CONSTRUCTION),null);
});
test('saved stations validate stages, depth, geography, identity and length',()=>{
 const station=stretchedStation(start,[-74.006,40.712],DEFAULT_CONSTRUCTION)!;
 const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean'};
 assert.ok(isQuickSave(save));assert.ok(isQuickSave({...save,stations:[station]}));
 for(const patch of [{depth:-101},{layout:'quad'},{stage:'preview'},{end:start},{start:[0,0]},{name:''}])assert.equal(isStationList([{...station,...patch}]),false);
 assert.equal(isStationList([station,station]),false);
 assert.equal(isStationList(Array.from({length:201},(_,i)=>({...station,id:String(i)}))),false);
});
test('station polygons support side and island layouts and preserve two track connectors',()=>{
 const station=stretchedStation(start,[-74.006,40.712],DEFAULT_CONSTRUCTION)!;
 const side=stationFeatures([station]),island=stationFeatures([{...station,layout:'island'}]);
 assert.equal(side.features.filter(f=>f.properties?.kind==='platform').length,2);
 assert.equal(island.features.filter(f=>f.properties?.kind==='platform').length,1);
 assert.equal(island.features.filter(f=>f.properties?.kind==='track').length,2);
 for(const feature of side.features)if(feature.geometry.type==='Polygon')assert.deepEqual(feature.geometry.coordinates[0][0],feature.geometry.coordinates[0].at(-1));
});
