import test from 'node:test';
import assert from 'node:assert/strict';
import { MercatorCoordinate } from 'maplibre-gl';
import { NetworkStrokeBatches,directionArrowSegments } from './networkStrokes';
import { depthPosition } from './depthProjection';
import type { Coordinate } from './stationPlacement';

test('new network sections share style batches and rebuilding releases old segments',()=>{
 const batches=new NetworkStrokeBatches(),built={tint:'#333333',width:1.2,opacity:1},halo={tint:'#ffffff',width:2.4,opacity:.65},blueprint={...built,tint:'#bd9d4c'};
 const section=[0,0,-10,100,0,-20];
 for(let revision=0;revision<3;revision++){
   for(let i=0;i<1000+revision;i++){batches.add(built,section);batches.add(halo,section);}
   batches.add(blueprint,[200,0,5,300,0,10]);
   const result=batches.drain();assert.equal(result.length,3,'Rendering object count follows styles, not asset count');
   assert.equal(result[0].segments.length,(1000+revision)*6);assert.deepEqual(result[0].segments.slice(0,6),section);
   assert.deepEqual(result[2].segments,[200,0,5,300,0,10]);assert.deepEqual(batches.drain(),[]);
 }
 batches.add(built,section);batches.clear();assert.deepEqual(batches.drain(),[]);
});

test('batched arrows preserve right-hand direction and physical rail height',()=>{
 const origin=MercatorCoordinate.fromLngLat([-74.01,40.71]),scale=origin.meterInMercatorCoordinateUnits();
 const point=(x:number):Coordinate=>{const p=new MercatorCoordinate(origin.x+x*scale,origin.y).toLngLat();return [p.lng,p.lat];};
 const points=[point(0),point(100)],forward=directionArrowSegments(points,[-10,-10]),reverse=directionArrowSegments(points,[-10,-10],true),tip=depthPosition(point(50),-10);
 assert.equal(forward.length,12);assert.equal(reverse.length,12);
 assert.ok(forward[0]<tip.x&&forward[9]<tip.x);assert.ok(reverse[0]>tip.x&&reverse[9]>tip.x);
 for(const segments of [forward,reverse]){assert.deepEqual(segments.slice(3,6),tip.toArray());assert.deepEqual(segments.slice(6,9),tip.toArray());for(let i=2;i<segments.length;i+=3)assert.ok(Math.abs(segments[i]-tip.z)<1e-8);}
 assert.deepEqual(directionArrowSegments([],[]),[]);
});
