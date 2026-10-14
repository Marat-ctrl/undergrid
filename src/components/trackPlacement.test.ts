import test from 'node:test';
import {MercatorCoordinate} from 'maplibre-gl';
import {minimumRadius} from './railGeometry';
import {stationFeatures} from './stationPlacement';
import assert from 'node:assert/strict';
import {DEFAULT_CONSTRUCTION,stretchedStation,stretchedDepot,stationLength,type Coordinate,type PlacedStation} from './stationPlacement';
import {stationPorts,stationPort,networkPorts,trackPort,trackFeatures,trackForward,tracksToRemove,trackGeometry,checkTrack,blueprintErrors,draftTrack,straightHeading,straightPosition,isTrackList,trackUsesStation,type PlacedTrack} from './trackPlacement';
import {isQuickSave,DEFAULT_CAMERA} from '../gameSave';
const first:PlacedStation={...stretchedStation([-74.007,40.712],[-74.0055,40.712],DEFAULT_CONSTRUCTION)!,id:'first',name:'First',stage:'constructed'};
const second:PlacedStation={...stretchedStation([-74.0025,40.713],[-74.001,40.713],{...DEFAULT_CONSTRUCTION,depth:-40})!,id:'second',name:'Second',stage:'constructed'};
const stations=[first,second];
const pair:PlacedTrack={id:'pair',mode:'parallel',stage:'constructed',start:{stationId:'first',end:'end',lane:'pair'},end:{stationId:'second',end:'start',lane:'pair'}};
test('station ports expose parallel centres or individual track ends with station depth',()=>{
 assert.equal(stationPorts(stations,'parallel').length,4);assert.equal(stationPorts(stations,'single').length,8);
 const port=stationPort(first,'end','pair');assert.ok(stationLength(port.position,first.end)<.00001);assert.equal(port.depth,-25);
 const left=stationPort(first,'end','left'),right=stationPort(first,'end','right');assert.ok(Math.abs(stationLength(left.position,right.position)-4)<.01);
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
 for(const [index,station,side] of [[0,first,'end'],[geometry.centre.length-1,second,'start']] as const){
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

test('station taper ends within 10 m even on long sections',()=>{
 const islandStations=stations.map(s=>s.id==='first'?{...s,layout:'island' as const}:s);
 const track:PlacedTrack={...pair,id:'long',end:{position:[-73.98,40.712],depth:-25}};
 const geometry=trackGeometry(track,islandStations)!;
 assert.ok(Math.abs(stationLength(geometry.lanes[0][0],geometry.lanes[1][0] )-8)<.02);
 const after=geometry.lengths.findIndex(d=>d>=10);
 assert.ok(geometry.lengths[after]<13);
 for(const i of [after,Math.floor(geometry.centre.length/2),geometry.centre.length-1])assert.ok(Math.abs(stationLength(geometry.lanes[0][i],geometry.lanes[1][i])-4)<.02);
 const short={...track,end:{position:[first.end[0]+.00018,first.end[1]] as Coordinate,depth:-25}};
 assert.ok(trackGeometry(short,islandStations));
});
test('built free ends expose ports and continuations keep both lane positions, tangent and depth',()=>{
 const base:PlacedTrack={...pair,id:'base',end:{position:[-74.003,40.712],depth:-50}};
 const ports=networkPorts(stations,[base],'parallel').filter(p=>'trackId' in p.ref);
 assert.equal(ports.length,1);assert.equal(ports[0].depth,-50);
 const continuation:PlacedTrack={...base,id:'next',start:ports[0].ref,end:{position:[-74.001,40.714],depth:-60}};
 const network=[base,continuation],a=trackGeometry(base,stations,network)!,b=trackGeometry(continuation,stations,network)!;
 for(const lane of a.lanes)assert.ok(b.lanes.some(next=>stationLength(lane.at(-1)!,next[0])<.001));
 const tangent=ports[0].outward,handle=b.controls[1],origin=b.controls[0];
 assert.ok(Math.abs((handle[0]-origin[0])*tangent[1]-(handle[1]-origin[1])*tangent[0])<1e-12);
 assert.equal(b.startDepth,-50);assert.equal(b.endDepth,-60);
 assert.equal(networkPorts(stations,network,'parallel').filter(p=>'trackId' in p.ref).length,1);
 assert.ok(isTrackList(network,stations));
 assert.equal(isTrackList([continuation],stations),false);
 assert.equal(isTrackList([{...base,stage:'blueprint'},continuation],stations),false);
 const cyclic={...base,start:{trackId:'next',end:'end',lane:'pair'}};
 assert.equal(isTrackList([cyclic,continuation],stations),false);
 assert.equal(isTrackList([continuation,{...base,end:null}],stations),false);
 assert.deepEqual([...tracksToRemove(network,['base'])],['base','next']);
});
test('single continuations attach to an individual parallel lane and arrows face opposite directions',()=>{
 const base:PlacedTrack={...pair,id:'base',end:{position:[-74.003,40.712],depth:-50}};
 assert.equal(networkPorts(stations,[base],'single').filter(p=>'trackId' in p.ref).length,2);
 const port=trackPort(base,'end','left',stations,[base])!;
 const next=draftTrack(port.ref,{position:[-74.001,40.713],depth:-40},'single',stations,[base])!;
 assert.ok(stationLength(trackGeometry(next,stations,[base])!.lanes[0][0],port.position)<.001);
 const single={...next,id:'single',stage:'constructed' as const};
 assert.equal(networkPorts(stations,[single,base],'single').filter(p=>'trackId' in p.ref).length,2);
 const arrows=trackFeatures([base],stations).features.filter(f=>f.properties?.kind==='direction');
 const geometry=trackGeometry(base,stations)!;
 assert.deepEqual(arrows.map(f=>f.geometry.type==='LineString'?f.geometry.coordinates:[]),[[...geometry.lanes[0]].reverse(),geometry.lanes[1]]);
 assert.equal(trackForward({...single,start:{trackId:'base',end:'end',lane:'right'}},[base,single]),true);
 const singleArrows=trackFeatures([single],stations,null,false,[base,single]).features.filter(f=>f.properties?.kind==='direction');assert.equal(singleArrows.length,1);
});

const shifted=(origin:Coordinate,x:number,y:number):Coordinate=>{const p=MercatorCoordinate.fromLngLat(origin),scale=p.meterInMercatorCoordinateUnits(),q=new MercatorCoordinate(p.x+x*scale,p.y+y*scale).toLngLat();return [q.lng,q.lat];};
test('new free-end arcs terminate perpendicular to the circle radius and continue from blueprint ports',()=>{
 const arc=draftTrack({stationId:'first',end:'end',lane:'pair'},{position:shifted(first.end,500,500),depth:-25},'parallel',stations)!;arc.id='arc';
 const geometry=trackGeometry(arc,stations)!;
 assert.ok(Math.abs(geometry.endTangent[0])<1e-5);assert.ok(geometry.endTangent[1]>.99999);
 assert.ok(checkTrack(arc,stations).valid);
 const port=networkPorts(stations,[arc],'parallel').find(p=>'trackId' in p.ref)!;assert.ok(port);
 assert.ok(port.outward[1]>.99999);assert.ok(Math.abs(port.outward[0])<1e-5);
 const continuation=draftTrack(port.ref,{position:shifted(port.position,0,500),depth:-25},'parallel',stations,[arc])!;continuation.id='continuation';
 const joined=trackGeometry(continuation,stations,[arc])!;
 for(const lane of geometry.lanes)assert.ok(joined.lanes.some(next=>stationLength(lane.at(-1)!,next[0])<.002));
 assert.ok(joined.startTangent[1]>.99999);assert.ok(isTrackList([arc,continuation],stations));
 assert.deepEqual(blueprintErrors([arc,continuation],stations),[]);
 assert.equal(networkPorts(stations,[arc,continuation],'parallel').filter(p=>'trackId' in p.ref).length,1);
 const reverse=draftTrack({position:shifted(first.end,500,500),depth:-25},{stationId:'first',end:'end',lane:'pair'},'parallel',stations)!;
 const reversed=trackGeometry(reverse,stations)!;
 assert.ok(stationLength(reversed.centre[0],geometry.centre.at(-1)!)<.002);
 assert.ok(reversed.endTangent[0]<-.99999);
});
test('radius checks exclude schematic taper but reject sharp main arcs while preserving their blueprint',()=>{
 const straight=draftTrack({stationId:'first',end:'end',lane:'pair'},{position:shifted(first.end,500,0),depth:-25},'parallel',stations)!;
 const geometry=trackGeometry(straight,stations)!,check=checkTrack(straight,stations);assert.ok(check.valid,check.issues.join(', '));assert.ok(check.minRadius>=20);assert.ok(minimumRadius(geometry.lanes)>=20);
 const after=geometry.lengths.findIndex(d=>d>=10);assert.ok(Math.abs(stationLength(geometry.lanes[0][after],geometry.lanes[1][after])-4)<.02);
 const tighter=draftTrack({stationId:'first',end:'end',lane:'pair'},{position:shifted(first.end,50,50),depth:-25},'parallel',stations)!;assert.ok(checkTrack(tighter,stations).valid);
 const sharp=draftTrack({stationId:'first',end:'end',lane:'pair'},{position:shifted(first.end,10,10),depth:-25},'parallel',stations)!;sharp.id='sharp';
 assert.ok(checkTrack(sharp,stations).issues.some(issue=>issue.includes('Turn too sharp')));
 assert.ok(isTrackList([sharp],stations));assert.ok(blueprintErrors([sharp],stations).length);
 assert.ok(trackFeatures([sharp],stations).features.every(f=>f.properties?.invalid));
});
test('vertical checks inspect peak grade and transition rate rather than endpoint depth difference alone',()=>{
 const start={position:first.end,depth:-25};
 const section=(length:number,depth:number)=>draftTrack(start,{position:shifted(first.end,length,0),depth},'single',stations)!;
 const allowed=section(1000,-45);assert.ok(checkTrack(allowed,stations).valid);
 assert.ok(checkTrack(section(500,-45),stations).valid);
 assert.ok(checkTrack(section(900,-65),stations).valid);
 const highSection=(length:number)=>draftTrack({position:first.end,depth:-5},{position:shifted(first.end,length,0),depth:-100},'single',stations)!;
 const boundary=checkTrack(highSection(603.75),stations);assert.ok(boundary.valid,boundary.issues.join(', '));assert.ok(Math.abs(boundary.maxGrade-.16)<.00001);
 const steep=checkTrack(highSection(600),stations);assert.ok(steep.maxGrade>.16);assert.ok(steep.issues.some(i=>i.includes('Grade too steep')));
 const sudden=checkTrack(section(13,-26),stations);assert.ok(sudden.maxGrade<.16);assert.ok(sudden.issues.some(i=>i.includes('Vertical transition too abrupt')));
 const geometry=trackGeometry(allowed,stations)!;assert.equal(geometry.depths[0],-25);assert.equal(geometry.depths.at(-1),-45);
 const firstGrade=(geometry.depths[1]-geometry.depths[0])/geometry.lengths[1];assert.ok(Math.abs(firstGrade)<.001);
});
test('right-hand arrows follow the right lane at stations and at either continuation end',()=>{
 const directions=stationFeatures([first]).features.filter(f=>f.properties?.kind==='direction');
 assert.ok(directions[0].geometry.type==='LineString'&&directions[0].geometry.coordinates[0][0]>directions[0].geometry.coordinates.at(-1)![0]);
 assert.ok(directions[1].geometry.type==='LineString'&&directions[1].geometry.coordinates[0][0]<directions[1].geometry.coordinates.at(-1)![0]);
 for(const end of ['start','end'] as const){const outward=end==='end';
   assert.equal(trackForward({...pair,mode:'single',start:{stationId:'first',end,lane:'right'}},[pair]),outward);
   assert.equal(trackForward({...pair,mode:'single',start:{stationId:'first',end,lane:'left'}},[pair]),!outward);
 }
});

test('straight locking projects onto a connected departure and preserves a captured free heading',()=>{
 const anchor={stationId:'first',end:'end' as const,lane:'pair' as const},cursor=shifted(first.end,150,80);
 const heading=straightHeading(anchor,cursor,stations)!;assert.ok(heading[0]>.99999);assert.ok(Math.abs(heading[1])<1e-6);
 const end=straightPosition(anchor,cursor,heading,stations)!;assert.ok(stationLength(end,shifted(first.end,150,0))<.001);
 const free={position:first.end,depth:-25},captured=straightHeading(free,shifted(first.end,100,100),stations)!;
 const projected=straightPosition(free,shifted(first.end,200,0),captured,stations)!;assert.ok(stationLength(projected,shifted(first.end,100,100))<.001);
 assert.equal(straightPosition(anchor,shifted(first.end,-100,80),heading,stations),null);
 assert.equal(straightHeading(free,first.end,stations),null);
});
test('straight sections persist their geometry and releasing the lock restores a curved draft',()=>{
 const anchor={stationId:'first',end:'end' as const,lane:'pair' as const},cursor=shifted(first.end,150,80),heading=straightHeading(anchor,cursor,stations)!;
 const end=straightPosition(anchor,cursor,heading,stations)!;
 const line=draftTrack(anchor,{position:end,depth:-25},'parallel',stations,[],'straight')!;line.id='straight';
 const geometry=trackGeometry(line,stations)!;assert.ok(geometry.centre.every(p=>stationLength(p,[p[0],first.end[1]])<.001));
 assert.equal(checkTrack(line,stations).minRadius,Infinity);assert.ok(isTrackList(JSON.parse(JSON.stringify([line])),stations));
 const port=networkPorts(stations,[line],'parallel').find(p=>'trackId' in p.ref)!;assert.ok(port.outward[0]>.99999);
 const curved=draftTrack(anchor,{position:cursor,depth:-25},'parallel',stations)!;assert.ok(trackGeometry(curved,stations)!.endTangent[1]>.1);
 assert.equal(draftTrack(anchor,{position:cursor,depth:-25},'parallel',stations,[],'straight'),null);
});

test('a 10 m depth change over a 102 m section uses a steady grade with short endpoint ramps',()=>{
 const track=draftTrack({stationId:'first',end:'end',lane:'pair'},{position:shifted(first.end,102,0),depth:-35},'parallel',stations)!;
 const check=checkTrack(track,stations);assert.ok(check.valid,check.issues.join(', '));assert.ok(check.maxGrade>.10&&check.maxGrade<.11);
 const geometry=trackGeometry(track,stations)!;assert.equal(geometry.depths[0],-25);assert.equal(geometry.depths.at(-1),-35);
});
test('constant-depth track labels disappear while ghost lengths and changing-depth labels remain',()=>{
 const level={...pair,end:{position:shifted(first.end,102,0),depth:-25}};
 assert.equal(trackFeatures([level],stations).features.filter(f=>f.properties?.kind==='label').length,0);
 const ghost=trackFeatures([level],stations,null,true).features.find(f=>f.properties?.kind==='label')!;assert.equal(ghost.properties?.depth,'');assert.ok(ghost.properties?.name);
 const varying={...level,end:{...level.end,depth:-35}};assert.equal(trackFeatures([varying],stations).features.filter(f=>f.properties?.kind==='label').length,1);
});
test('depot entrances expose matching pair and single ports with saved depth and capacity',()=>{
 const depot={...stretchedDepot([-74.009,40.712],[-74.008,40.712],{...DEFAULT_CONSTRUCTION,capacity:30,depth:-35})!,id:'depot',name:'Depot 1',stage:'constructed' as const};
 assert.equal(stationPorts([depot],'parallel').length,1);assert.equal(stationPorts([depot],'single').length,2);
 const port=stationPort(depot,'start','pair');assert.equal(port.depth,-35);assert.equal(port.halfSpacing,2);
 const link=draftTrack(port.ref,{position:shifted(depot.start,-200,0),depth:-25},'parallel',[depot])!;
 assert.ok(isTrackList([link],[depot]));assert.ok(checkTrack(link,[depot]).valid);
 const geometry=trackGeometry(link,[depot])!;for(const lane of geometry.lanes)assert.ok(['left','right'].some(side=>stationLength(lane[0],stationPort(depot,'start',side as 'left'|'right').position)<.001));
 assert.equal(isTrackList([{...link,start:{stationId:'depot',end:'end',lane:'pair'}}],[depot]),false);
});
