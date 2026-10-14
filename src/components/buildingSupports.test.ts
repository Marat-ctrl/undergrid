import test from 'node:test';
import assert from 'node:assert/strict';
import type { Feature,Polygon,MultiPolygon } from 'geojson';
import { missingBuildingSupports } from './buildingSupports';
function rectangle(x:number,y:number,size:number,height:number,base:number,hidden=false):Feature<Polygon>{return {type:'Feature',properties:{render_height:height,render_min_height:base,hide_3d:hidden},geometry:{type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]}};}
test('nearby building search retains support, grounding, deduplication and cached geometry',()=>{
 const outline=rectangle(-74,40.7,.001,200,0,true),top=rectangle(-73.9998,40.7002,.0001,200,120),cache=new Map<string,Feature<Polygon|MultiPolygon>>();
 const distant=Array.from({length:2000},(_,i)=>rectangle(-73.9+(i%50)*.002,40.75+Math.floor(i/50)*.002,.0001,10,0));
 const first=missingBuildingSupports([outline,outline,top,...distant],cache);assert.equal(first.features.length,1);assert.equal(first.features[0].properties!.supportHeight,120);
 const second=missingBuildingSupports([...distant,top,outline],cache);assert.equal(second.features[0],first.features[0]);
 assert.equal(missingBuildingSupports([outline,top,rectangle(-73.9997,40.7003,.0001,10,0)],cache).features.length,0);
 assert.equal(missingBuildingSupports([outline],cache).features.length,0);
});
test('spatial support candidates respect holes and separate polygons',()=>{
 const outline=rectangle(-74,40.7,.004,200,0,true);outline.geometry.coordinates.push(rectangle(-73.999,40.701,.001,1,0).geometry.coordinates[0]);
 const inHole=rectangle(-73.9988,40.7012,.0001,200,0),raised=rectangle(-73.9998,40.7002,.0001,200,80);
 assert.equal(missingBuildingSupports([outline,inHole,raised]).features[0].properties!.supportHeight,80);
 const multi:Feature<MultiPolygon>={...outline,geometry:{type:'MultiPolygon',coordinates:[outline.geometry.coordinates,rectangle(-73.99,40.7,.001,200,0,true).geometry.coordinates]}};
 const lower=rectangle(-73.9898,40.7002,.0001,200,40);assert.equal(missingBuildingSupports([multi,inHole,raised,lower]).features[0].properties!.supportHeight,40);
});
