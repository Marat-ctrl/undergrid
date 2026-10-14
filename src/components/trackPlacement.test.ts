import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONSTRUCTION,stretchedStation,stationLength,type Coordinate,type PlacedStation} from './stationPlacement';
import {stationPorts,stationPort,trackGeometry,draftTrack,isTrackList,trackUsesStation,type PlacedTrack} from './trackPlacement';
import {isQuickSave,DEFAULT_CAMERA} from '../gameSave';
const first:PlacedStation={...stretchedStation([-74.007,40.712],[-74.0055,40.712],DEFAULT_CONSTRUCTION)!,id:'first',name:'First',stage:'constructed'};
const second:PlacedStation={...stretchedStation([-74.0025,40.713],[-74.001,40.713],{...DEFAULT_CONSTRUCTION,depth:-40})!,id:'second',name:'Second',stage:'constructed'};
const stations=[first,second];
const pair:PlacedTrack={id:'pair',mode:'parallel',stage:'constructed',start:{stationId:'first',end:'end',lane:'pair'},end:{stationId:'second',end:'start',lane:'pair'}};
test('station ports expose parallel centres or individual track ends with station depth',()=>{
 assert.equal(stationPorts(stations,'parallel').length,4);assert.equal(stationPorts(stations,'single').length,8);
 const port=stationPort(first,'end','pair');assert.ok(stationLength(port.position,first.end)<.00001);assert.equal(port.depth,-25);
 const left=stationPort(first,'end','left'),right=stationPort(first,'end','right');assert.ok(Math.abs(stationLength(left.position,right.position)-10)<.01);
});
test('parallel curves join both physical lanes exactly and obey outgoing/incoming station tangents',()=>{
 const geometry=trackGeometry(pair,stations)!;assert.equal(geometry.lanes.length,2);
 const [a,b,c,d]=geometry.controls;
 const start=stationPort(first,'end','pair'),end=stationPort(second,'start','pair');
 const cross=(x:number,y:number,u:number,v:number)=>x*v-y*u;
 assert.ok(Math.abs(cross(b[0]-a[0],b[1]-a[1],...start.outward))<1e-12);
 assert.ok((b[0]-a[0])*start.outward[0]+(b[1]-a[1])*start.outward[1]>0);
 assert.ok(Math.abs(cross(d[0]-c[0],d[1]-c[1],...end.outward))<1e-12);
 assert.ok((d[0]-c[0])*end.outward[0]+(d[1]-c[1])*end.outward[1]<0);
 for(const [index,station,side] of [[0,first,'end'],[64,second,'start']] as const){
   const targets=['left','right'].map(lane=>stationPort(station,side,lane as 'left'|'right').position);
   for(const lane of geometry.lanes)assert.ok(targets.some(target=>stationLength(target,lane[index])<.001));
 }
 assert.equal(geometry.depths[0],-25);assert.equal(geometry.depths.at(-1),-40);
 assert.ok(geometry.depths.every((depth,i,all)=>depth>=-40&&depth<=-25&&(i===0||depth<=all[i-1])));
});
test('single-track curves join the chosen lane and free ends use explicit depth',()=>{
 const track=draftTrack({stationId:'first',end:'end',lane:'left'},{position:[-74.003,40.714],depth:-60},'single',stations)!;
 const geometry=trackGeometry(track,stations)!;assert.equal(geometry.lanes.length,1);
 assert.ok(stationLength(geometry.lanes[0][0],stationPort(first,'end','left').position)<.001);
 assert.equal(geometry.endDepth,-60);assert.equal(trackUsesStation(track,'first'),true);assert.equal(trackUsesStation(track,'second'),false);
 assert.equal(draftTrack({position:first.start,depth:-25},{position:first.start,depth:-30},'single',stations),null);
});
test('network saves reject dangling ports, mismatched lane types and built connections to blueprints',()=>{
 const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean',stations};
 assert.ok(isQuickSave({...save,tracks:[pair]}));assert.ok(isQuickSave(save));
 assert.equal(isTrackList([pair],[first]),false);
 assert.equal(isTrackList([{...pair,mode:'single'}],stations),false);
 assert.equal(isTrackList([pair],[first,{...second,stage:'blueprint'}]),false);
 assert.equal(isTrackList([pair,pair],stations),false);
 assert.equal(isQuickSave({...save,stations:null,tracks:[pair]}),false);
 const bad={...pair,end:{position:[-74.003,40.714] as Coordinate,depth:-999}};assert.equal(isTrackList([bad],stations),false);
});
