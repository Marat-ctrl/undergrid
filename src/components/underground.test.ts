import test from 'node:test';
import assert from 'node:assert/strict';
import {foundationRange,foundationRisk,isPlanningLayers} from './underground';
import {isQuickSave,DEFAULT_CAMERA} from '../gameSave';
test('unknown heights never produce a clearance estimate',()=>{for(const h of [null,0,-10,NaN,Infinity]){assert.equal(foundationRange(h),null);assert.equal(foundationRisk(h,100),'unknown');}});
test('tunnel envelope and buffer change risk with depth and height',()=>{assert.deepEqual(foundationRange(100),[6,16]);assert.equal(foundationRisk(100,11),'overlap');assert.equal(foundationRisk(100,12),'uncertain');assert.equal(foundationRisk(100,21),'uncertain');assert.equal(foundationRisk(100,22),'lower');assert.equal(foundationRisk(400,25),'overlap');});
test('old saves remain valid and planning settings are validated',()=>{const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean'};assert.ok(isQuickSave(save));const planning={existingRail:true,foundations:true,plannedDepth:25};assert.ok(isQuickSave({...save,planning}));for(const plannedDepth of [0,101,25.5,NaN])assert.equal(isPlanningLayers({...planning,plannedDepth}),false);assert.equal(isQuickSave({...save,planning:{...planning,existingRail:'yes'}}),false);});

test('underground views validate independently and preserve legacy saves',async()=>{
 const {isUndergroundView}=await import('./undergroundView');
 const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean'};
 assert.ok(isQuickSave(save));
 assert.ok(isQuickSave({...save,underground:{enabled:true,depth:50}}));
 for(const depth of [4,101,25.5,NaN])assert.equal(isUndergroundView({enabled:true,depth}),false);
 assert.equal(isQuickSave({...save,underground:{enabled:'yes',depth:25}}),false);
});

test('shared bore keeps two separate tracks inside a smooth station approach',async()=>{
 const {demoTrackOffset,demoTunnelHalfWidth}=await import('./undergroundView');
 assert.equal(demoTrackOffset(75),5);assert.equal(demoTrackOffset(175),2.5);
 assert.equal(demoTunnelHalfWidth(75),15);assert.ok(Math.abs(demoTunnelHalfWidth(175)-6.2)<1e-9);
 for(let x=-390;x<=390;x++){
   assert.equal(demoTrackOffset(x),demoTrackOffset(-x));
   assert.ok(demoTrackOffset(x)>.72); // opposing tracks never become a single track
   assert.ok(demoTrackOffset(x)+.72+.075<demoTunnelHalfWidth(x));
   assert.ok(Math.abs(demoTrackOffset(x+1)-demoTrackOffset(x))<.04);
 }
});

test('station entrances face both ends and retain valid station/platform connections',async()=>{
 const {DEMO_STATION,entranceOpening}=await import('./stationModel');
 const entrances=DEMO_STATION.entrances;
 assert.equal(new Set(entrances.map(entrance=>entrance.id)).size,4);
 for(const entrance of entrances){
   assert.equal(entrance.stationId,DEMO_STATION.id);
   const platform=DEMO_STATION.platforms.find(platform=>platform.id===entrance.platformId);
   assert.ok(platform);assert.ok(DEMO_STATION.trackGroup.trackIds.includes(platform.trackId));
   assert.equal(Math.sign(platform.offset),Math.sign(entrance.position[1]));
   const [x,y]=entranceOpening(entrance);
   assert.ok(x*entrance.position[0]>0); // opening faces away from the station centre at both ends
   assert.ok(Math.abs(y)<1e-9);
 }
 assert.equal(entrances.filter(entrance=>entranceOpening(entrance)[0]<0).length,2);
 assert.equal(entrances.filter(entrance=>entranceOpening(entrance)[0]>0).length,2);
});

test('displayed depth refers exactly to rail level, with no extra mesh-origin offset',async()=>{
 const {demoElevation,DEMO_RAIL_LOCAL_Z,DEMO_RAIL_RADIUS}=await import('./undergroundView');
 for(const depth of [5,25,50,100]){
   assert.equal(demoElevation(depth,DEMO_RAIL_LOCAL_Z),-depth);
   const tubeCentre=demoElevation(depth,DEMO_RAIL_LOCAL_Z-DEMO_RAIL_RADIUS);
   assert.ok(Math.abs(tubeCentre+DEMO_RAIL_RADIUS+depth)<1e-9);
   assert.ok(Math.abs(demoElevation(depth,-1.8)-(-depth+.7))<1e-9);
   assert.ok(Math.abs(demoElevation(depth,-3.1)-(-depth-.6))<1e-9);
 }
});

test('Mercator vertical metres agree with the metre scale used by all model axes',async()=>{
 const maplibre=await import('maplibre-gl');
 const {DEMO_LOCATION}=await import('./undergroundView');
 const ground=maplibre.MercatorCoordinate.fromLngLat(DEMO_LOCATION,0);
 for(const depth of [5,25,50,100]){
   const below=maplibre.MercatorCoordinate.fromLngLat(DEMO_LOCATION,-depth);
   assert.ok(Math.abs(below.z/ground.meterInMercatorCoordinateUnits()+depth)<1e-8);
   assert.ok(Math.abs(below.toAltitude()+depth)<1e-8);
 }
});

test('2D preview joins station tracks to finite smooth paths and closed platform polygons',async()=>{
 const {previewCentreline,previewTrack,createMetroPreviewData}=await import('./metroPreview');
 const centre=previewCentreline();assert.deepEqual(centre[64],[-75,0]);assert.deepEqual(centre[94],[75,0]);
 for(const side of [-1,1]){
   const track=previewTrack(centre,side);assert.equal(track.length,centre.length);
   assert.deepEqual(track[80],[centre[80][0],side*5]);
   assert.ok(track.every(point=>point.every(Number.isFinite)));
 }
 const features=createMetroPreviewData().features;
 assert.equal(features.filter(feature=>feature.properties?.kind==='platform').length,2);
 assert.equal(features.filter(feature=>feature.properties?.kind==='track').length,2);
 for(const feature of features)if(feature.geometry.type==='Polygon'){
   const ring=feature.geometry.coordinates[0];assert.deepEqual(ring[0],ring[ring.length-1]);
 }
});

test('metro line scale doubles for each zoom level while retaining a distant minimum',async()=>{
 const {metroWidthPixels,metroLineWidth}=await import('./metroPreview');
 assert.ok(Math.abs(metroWidthPixels(1.4,18)/metroWidthPixels(1.4,16)-4)<1e-9);
 const width=metroLineWidth(1.4,1);assert.equal(width[4],1);
 assert.ok(metroWidthPixels(1.4,18)>1);
});

test('missing lower building masses are restored only for hidden outlines with unsupported elevated parts',async()=>{
 const {missingBuildingSupports}=await import('./buildingSupports');
 const make=(height:number,base:number,hidden=false)=>({type:'Feature' as const,properties:{render_height:height,render_min_height:base,hide_3d:hidden},geometry:{type:'Polygon' as const,coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}});
 const outline=make(120,0,true),top=make(170,120);
 const supported=missingBuildingSupports([outline,outline,top]);assert.equal(supported.features.length,1);assert.equal(supported.features[0].properties?.supportHeight,120);
 assert.equal(missingBuildingSupports([outline,top,make(120,0)]).features.length,0);
 assert.equal(missingBuildingSupports([top]).features.length,0);
 assert.equal(missingBuildingSupports([outline]).features.length,0);
});
