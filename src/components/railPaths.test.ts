import test from 'node:test';
import assert from 'node:assert/strict';
import { MercatorCoordinate } from 'maplibre-gl';
import { railPaths,railDetailForZoom,RAIL_GAUGE_METRES } from './railPaths';
import { stationLength,type Coordinate } from './stationPlacement';

test('rail pairs keep physical gauge, smooth shared endpoints and finite depot corners',()=>{
 const origin=MercatorCoordinate.fromLngLat([-74.005,40.7126]),scale=origin.meterInMercatorCoordinateUnits();
 const coordinate=(x:number,y:number):Coordinate=>{const p=new MercatorCoordinate(origin.x+x*scale,origin.y+y*scale).toLngLat();return [p.lng,p.lat];};
 for(const end of [[100,0],[0,100],[100,100]]){
   const centre=[coordinate(0,0),coordinate(end[0]/2,end[1]/2),coordinate(...end as [number,number])],paths=railPaths(centre);
   assert.equal(paths.length,2);
   for(let i=0;i<centre.length;i++)assert.ok(Math.abs(stationLength(paths[0][i],paths[1][i])-RAIL_GAUGE_METRES)<.005);
 }
 const angle=.5,radius=40,tangent:[number,number]=[-Math.sin(angle),Math.cos(angle)];
 const arc=Array.from({length:21},(_,i)=>coordinate(radius*Math.cos(i*.05),radius*Math.sin(i*.05)));
 const before=railPaths(arc.slice(0,11),[0,1],tangent),after=railPaths(arc.slice(10),tangent,[-Math.sin(1),Math.cos(1)]);
 for(let side=0;side<2;side++)assert.ok(stationLength(before[side].at(-1)!,after[side][0])<.0001);
 const fan=railPaths([coordinate(0,0),coordinate(0,0),coordinate(20,0),coordinate(80,32),coordinate(100,32)]);
 assert.ok(fan.flat(2).every(Number.isFinite));assert.deepEqual(railPaths([]),[]);
});

test('rail detail blends monotonically between distant centres and close physical rails',()=>{
 assert.equal(railDetailForZoom(12),0);assert.equal(railDetailForZoom(16),0);
 assert.equal(railDetailForZoom(17.5),1);assert.equal(railDetailForZoom(20),1);
 let previous=0;for(let zoom=16;zoom<=17.5;zoom+=.01){const detail=railDetailForZoom(zoom);assert.ok(detail>=previous&&detail<=1);assert.ok(detail-previous<.02);previous=detail;}
 assert.equal(railDetailForZoom(16.75),.5);
});
