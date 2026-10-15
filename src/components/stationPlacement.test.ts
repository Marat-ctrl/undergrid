import test from 'node:test';
import assert from 'node:assert/strict';
import { MercatorCoordinate } from 'maplibre-gl';
import { DEFAULT_CONSTRUCTION, stretchedStation, stretchedDepot, stationLength, isStationList, stationFeatures } from './stationPlacement';
import { isQuickSave,DEFAULT_CAMERA } from '../gameSave';
import { depotGeometry, DEPOT_STORAGE_LENGTH, DEPOT_TURN_RADIUS } from './depotGeometry';
const start:[number,number]=[-74.007,40.712];
test('two-click placement clamps length while preserving depth, layout and direction',()=>{
 for(const cursor of [[-74.00695,40.712],[-74,40.712],[-74.007,40.714]] as [number,number][]){
   const station=stretchedStation(start,cursor,{...DEFAULT_CONSTRUCTION,platforms:'island',depth:-40})!;
   assert.ok(stationLength(station.start,station.end)>=49.8&&stationLength(station.start,station.end)<=300.2);
   assert.equal(station.layout,'island');assert.equal(station.depth,-40);
   assert.equal(station.start[0],start[0]);assert.equal(station.start[1],start[1]);
 }
 const north=stretchedStation(start,[-74.007,40.713],DEFAULT_CONSTRUCTION)!;assert.ok(Math.abs(north.end[0]-start[0])<1e-9);assert.ok(north.end[1]>start[1]);
 const short=stretchedStation(start,[-74.00695,40.712],DEFAULT_CONSTRUCTION)!;assert.ok(Math.abs(stationLength(start,short.end)-50)<.01);
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

test('depot placement retains saved heading anchors and validates capacity, depth and expanded footprint',()=>{
 for(const capacity of [5,30]){
   const depot=stretchedDepot(start,[-74.006,40.713],{...DEFAULT_CONSTRUCTION,capacity,depth:-35})!;assert.ok(depot);assert.equal(depot.kind,'depot');assert.equal(depot.capacity,capacity);assert.equal(depot.depth,-35);assert.ok(Math.abs(stationLength(depot.start,depot.end)-300)<.1);
   const features=stationFeatures([depot]);assert.equal(features.features.filter(f=>f.properties?.depotPart==='siding').length,capacity);
   const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean',stations:[depot]};assert.ok(isQuickSave(JSON.parse(JSON.stringify(save))));
   for(const bad of [4,31,5.5,undefined])assert.equal(isStationList([{...depot,capacity:bad}]),false);
 }
 assert.equal(stretchedDepot([-73.6501,40.712],[-73.649,40.712],{...DEFAULT_CONSTRUCTION,capacity:30}),null);
 // A valid old 300 m yard near the eastern boundary can still load, but new expanded yards cannot be placed there.
 const anchor=MercatorCoordinate.fromLngLat([-73.6542,40.712]),end=new MercatorCoordinate(anchor.x+300*anchor.meterInMercatorCoordinateUnits(),anchor.y).toLngLat();
 const legacy={id:'legacy-depot',name:'Depot',start:[-73.6542,40.712] as [number,number],end:[end.lng,end.lat] as [number,number],depth:-10,layout:'side' as const,stage:'constructed' as const,kind:'depot' as const,capacity:30};
 assert.ok(isStationList([legacy]));
 assert.equal(stretchedDepot(legacy.start,legacy.end,{...DEFAULT_CONSTRUCTION,capacity:30}),null);
});

test('depot ladders retain entrance ports, metre-scaled storage and shared turnout joins',async()=>{
 const {stationPort}=await import('./trackPlacement');
 for(const capacity of [5,10,30])for(const cursor of [[-74.005,40.712],[-74.006,40.714]] as [number,number][]){
   const depot=stretchedDepot(start,cursor,{...DEFAULT_CONSTRUCTION,capacity})!,features=stationFeatures([depot]).features;
   assert.ok(isStationList([depot]));
   const tracks=features.filter(f=>f.properties?.kind==='track');assert.equal(tracks.length,capacity+2);
   const leads=tracks.filter(f=>f.properties?.depotPart==='lead');
   for(const lead of leads){assert.ok(lead.geometry.type==='LineString');const entrance=lead.geometry.coordinates[0] as [number,number];assert.ok(['left','right'].some(lane=>stationLength(entrance,stationPort(depot,'start',lane as 'left'|'right').position)<.001));}
   for(const feature of tracks){
     if(feature.geometry.type!=='LineString')throw new Error('Expected a depot rail');
     const path=feature.geometry.coordinates as [number,number][],points=path.map(p=>MercatorCoordinate.fromLngLat(p));
     assert.ok(path.length>=2);
     if(feature.properties?.depotPart==='siding')assert.ok(leads.some(lead=>lead.geometry.type==='LineString'&&lead.geometry.coordinates.some(p=>stationLength(path[0],p as [number,number])<.001)));
     let maxAngle=0;for(let i=1;i<points.length-1;i++){
       const a=points[i-1],b=points[i],c=points[i+1],dx=b.x-a.x,dy=b.y-a.y,ex=c.x-b.x,ey=c.y-b.y;
       const cosine=(dx*ex+dy*ey)/(Math.hypot(dx,dy)*Math.hypot(ex,ey));
       maxAngle=Math.max(maxAngle,Math.acos(Math.max(-1,Math.min(1,cosine))));
     }
     assert.ok(maxAngle<.25,`Fan should have no sharp corners: ${maxAngle}`);
   }
   for(const deck of features.filter(f=>f.properties?.kind==='platform')){assert.ok(deck.geometry.type==='Polygon');const corners=deck.geometry.coordinates[0] as [number,number][];assert.ok(Math.abs(stationLength(corners[0],corners[1])-DEPOT_STORAGE_LENGTH)<.02);assert.ok(Math.abs(stationLength(corners[1],corners[2])-4)<.01);}
 }
});

test('depot turnouts bound curvature and extend large throats instead of shortening storage',()=>{
 let previousLength=0;
 for(let capacity=5;capacity<=30;capacity++){
   const yard=depotGeometry(capacity),leads=yard.tracks.filter(t=>t.role==='lead');
   assert.equal(yard.platformEnd-yard.platformStart,200);
   assert.ok(yard.trackEnd>=previousLength);previousLength=yard.trackEnd;
   const junctions=new Set<string>();
   for(const track of yard.tracks){
     if(track.role==='siding'){
       const join=track.points[0];junctions.add(join.map(v=>v.toFixed(6)).join(','));
       assert.ok(leads.some(lead=>lead.points.some(p=>Math.hypot(p[0]-join[0],p[1]-join[1])<1e-6)));
       assert.deepEqual(track.points.at(-1),[yard.trackEnd,yard.rows[track.row!]]);
       assert.ok(track.points.at(-2)![0]<yard.platformStart);
     }
     for(let i=1;i<track.points.length-1;i++){
       const [a,b,c]=track.points.slice(i-1,i+2),ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),ac=Math.hypot(c[0]-a[0],c[1]-a[1]);
       assert.ok(ab>1e-8&&bc>1e-8,'No duplicate samples at switch joins');
       const cross=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
       if(cross>1e-7)assert.ok(ab*bc*ac/(2*cross)>=DEPOT_TURN_RADIUS-.02,'Every sampled bend retains the minimum yard radius');
       assert.ok(c[0]>=b[0],'Yard tracks must not fold backwards');
     }
   }
   assert.ok(junctions.size>=capacity-1,'Turnouts branch successively rather than from one fan point');
 }
 assert.ok(depotGeometry(30).storageStart>depotGeometry(5).storageStart+100);
});
