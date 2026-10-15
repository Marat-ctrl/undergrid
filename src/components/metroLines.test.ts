import test from 'node:test';
import assert from 'node:assert/strict';
import { MercatorCoordinate } from 'maplibre-gl';
import { buildLineNetwork,routeMetroLine,isMetroLineList,lineStopAdditionIssue,MAX_LINE_STOPS,type MetroLine } from './metroLines';
import { stationLength,type PlacedStation } from './stationPlacement';
import { type PlacedTrack } from './trackPlacement';
import { isQuickSave,DEFAULT_CAMERA } from '../gameSave';
import { normalizeSave } from '../../server/saveData';
import { NetworkHistory } from './networkHistory';
import { automaticScissors } from './automaticScissors';
import { platformSideAt } from './platformStops';
import { platformAnchors,platformChoicePositions } from './platformChoices';
import { routeStrokeSegments } from './routeStrokeSegments';
import { depthPosition } from './depthProjection';
import { nearbyStationName,uniqueStationName } from './stationNames';
import { draftTrack,trackGeometry } from './trackPlacement';
import type { Feature } from 'geojson';
const origin=MercatorCoordinate.fromLngLat([-74.01,40.71]),scale=origin.meterInMercatorCoordinateUnits();
function point(x:number,y=0):[number,number]{const p=new MercatorCoordinate(origin.x+x*scale,origin.y+y*scale).toLngLat();return [p.lng,p.lat];}
const station=(id:string,x:number,y=0):PlacedStation=>({id,name:id,start:point(x,y),end:point(x+100,y),layout:'side',depth:-10,stage:'constructed'});
const a=station('A',0),b=station('B',500),c=station('C',1000),stations=[a,b,c];
const connection=(id:string,from:string,to:string):PlacedTrack=>({id,mode:'parallel',stage:'constructed',curve:'straight',start:{stationId:from,end:'end',lane:'pair'},end:{stationId:to,end:'start',lane:'pair'}});
test('directed routes follow parallel lanes through ordered stops and never turn around by teleporting across a platform',()=>{
 const network=buildLineNetwork(stations,[connection('AB','A','B'),connection('BC','B','C')]);
 for(const ids of [['A','B','C'],['C','B','A']]){const route=routeMetroLine(network,ids);assert.ok(route.ready);assert.ok(Math.abs(route.metres-1000)<.1);assert.ok(route.paths.length>0);assert.ok(route.paths.flatMap(p=>p.depths).every(depth=>depth===-10));}
 assert.equal(routeMetroLine(network,['A','B','A']).ready,false);
 const reversed:PlacedTrack={...connection('reverse','A','B'),start:{stationId:'B',end:'start',lane:'pair'},end:{stationId:'A',end:'end',lane:'pair'}};
 assert.ok(routeMetroLine(buildLineNetwork([a,b],[reversed]),['A','B']).ready);
});
test('single tracks respect arrows while unsnapped overlaps, level crossings and blueprints remain disconnected',()=>{
 const single:PlacedTrack={id:'single',mode:'single',curve:'straight',stage:'constructed',start:{stationId:'A',end:'end',lane:'right'},end:{stationId:'B',end:'start',lane:'right'}};
 const network=buildLineNetwork([a,b],[single]);assert.ok(routeMetroLine(network,['A','B']).ready);assert.equal(routeMetroLine(network,['B','A']).ready,false);
 for(const track of [{...connection('draft','A','B'),stage:'blueprint' as const},{...connection('unsnapped','A','B'),end:{position:b.start,depth:-10}}]){const route=routeMetroLine(buildLineNetwork([a,b],[track]),['A','B']);assert.equal(route.ready,false);assert.equal(route.gaps.length,1);}
 const deep={...b,depth:-30};assert.equal(routeMetroLine(buildLineNetwork([a,deep],[{...single,end:{position:b.start,depth:-10}}]),['A','B']).ready,false);
 const parent=connection('BC','B','C'),crossover:PlacedTrack={...single,id:'cross',curve:'arc',end:{trackId:'BC',at:.5,lane:'right',direction:1}};
 assert.equal(routeMetroLine(buildLineNetwork(stations,[parent,crossover]),['A','C']).ready,false);
 assert.ok(routeMetroLine(buildLineNetwork(stations,[parent,{...crossover,end:{...crossover.end,direction:-1}} as PlacedTrack]),['A','C']).ready);
});
test('interior branches and continuation endpoints join only their referenced lanes and survive parent removal as broken routes',()=>{
 const branchStop={...station('Branch',300,300),end:point(300,400)},base=connection('AB','A','B');
 const branch:PlacedTrack={id:'branch',mode:'parallel',stage:'constructed',curve:'arc',start:{trackId:'AB',at:.5,lane:'pair',direction:1},end:{stationId:branchStop.id,end:'start',lane:'pair'}};
 const network=buildLineNetwork([a,b,branchStop],[base,branch]);assert.ok(routeMetroLine(network,['A','Branch']).ready);assert.ok(routeMetroLine(network,['Branch','A']).ready);
 assert.equal(routeMetroLine(network,['Branch','B']).ready,false);
 const free={...base,end:{position:point(300),depth:-10}},extension:PlacedTrack={...base,id:'extension',start:{trackId:'AB',end:'end',lane:'pair'}};
 assert.ok(routeMetroLine(buildLineNetwork([a,b],[free,extension]),['A','B']).ready);
 assert.equal(routeMetroLine(buildLineNetwork([a,b],[]),['A','B']).ready,false);
});
test('line metadata round-trips through saves and history, including broken lines and old worlds without lines',()=>{
 const lines=[{id:'line',name:'Harbor',color:'#568674',stationIds:['A','B']}],save={version:1 as const,city:'new-york' as const,active:true,updatedAt:100,camera:DEFAULT_CAMERA,preset:'clean' as const,stations:[a,b],tracks:[connection('AB','A','B')],lines};
 assert.ok(isQuickSave(save));assert.deepEqual(normalizeSave(save).lines,lines);assert.ok(isQuickSave({...save,stations:[],tracks:[]}));
 const legacy={...save};delete (legacy as Partial<typeof save>).lines;assert.ok(isQuickSave(legacy));assert.equal(normalizeSave(legacy).lines,undefined);
 for(const patch of [{color:'red'},{name:''},{stationIds:['A']},{stationIds:['A','A']},{stationIds:['A','B','B']}])assert.equal(isMetroLineList([{...lines[0],...patch}]),false);
 assert.ok(isMetroLineList([{...lines[0],stationIds:['A','B','A']}]));assert.equal(isMetroLineList([...lines,...lines]),false);
 const history=new NetworkHistory();history.push(save);lines[0].name='Changed';assert.equal(history.pop()!.lines![0].name,'Harbor');
});
test('chosen platform faces constrain routes, including island picking and saved platform order',()=>{
 const network=buildLineNetwork([a,b],[connection('AB','A','B')]);
 assert.ok(routeMetroLine(network,['A','B'],['right','right']).ready);
 assert.equal(routeMetroLine(network,['A','B'],['left','right']).ready,false);
 assert.equal(routeMetroLine(network,['A','B'],['right','left']).ready,false);
 assert.deepEqual(routeMetroLine(network,['B','A']).platforms,['left','left']);
 for(const [y,side] of [[-6,'left'],[6,'right']] as const)assert.equal(platformSideAt(a,point(50,y)),side);
 assert.equal(platformSideAt(a,point(50,0)),null);assert.equal(platformSideAt(a,point(2,6)),null);
 const island={...a,layout:'island' as const};assert.equal(platformSideAt(island,point(50,-2)),'left');assert.equal(platformSideAt(island,point(50,2)),'right');assert.equal(platformSideAt(island,point(50,0)),null);
 const rotated={...a,end:point(0,100)};assert.equal(platformSideAt(rotated,point(6,50)),'left');
 const lines=[{id:'line',name:'Harbor',color:'#568674',stationIds:['A','B'],platforms:['right','right'] as const}].map(l=>({...l,platforms:[...l.platforms]}));
 const save={version:1 as const,city:'new-york' as const,active:true,updatedAt:100,camera:DEFAULT_CAMERA,preset:'clean' as const,stations:[a,b],tracks:[connection('AB','A','B')],lines};
 assert.ok(isQuickSave(save));assert.deepEqual(normalizeSave(save).lines,lines);
 assert.equal(isMetroLineList([{...lines[0],platforms:['right']}]),false);assert.equal(isMetroLineList([{...lines[0],platforms:['pair','right']}]),false);
});
test('automatic scissors have physical crossing paths and enable platform access without connecting their centre crossing',()=>{
 const base=connection('AB','A','B'),track={...base,scissors:true},network=[track];
 assert.equal(draftTrack(base.start,base.end,'parallel',[a,b],[],'straight')?.scissors,true);
 const switches=automaticScissors(track,[a,b],network);assert.equal(switches.length,2);
 assert.equal(automaticScissors({...track,scissors:false},[a,b],network).length,0);
 const g=trackGeometry(track,[a,b],network)!;
 for(const scissors of switches){assert.equal(scissors.paths.length,2);assert.ok(scissors.near<scissors.far);assert.ok(scissors.near*g.length>=21.9);
  for(const path of scissors.paths){assert.equal(path.points.length,33);assert.ok(path.depths.every(d=>d===-10));assert.notEqual(path.from,path.to);}
 }
 const graph=buildLineNetwork([a,b],network);
 assert.ok(routeMetroLine(graph,['A','B'],['left','left']).ready);
 const loop=routeMetroLine(graph,['A','B','A'],['right','right','right']);assert.ok(loop.ready);assert.ok(loop.metres>1000);
 assert.ok(loop.paths.some(path=>path.points.length===33));
 assert.equal(routeMetroLine(buildLineNetwork([a,b],[{...track,stage:'blueprint'}]),['A','B'],['left','left']).ready,false);
 assert.equal(routeMetroLine(buildLineNetwork([a,b],[]),['A','B']).ready,false);
 const short={...track,start:{stationId:'A',end:'end',lane:'pair'} as const,end:{position:point(140),depth:-10}};assert.equal(automaticScissors(short,[a], [short]).length,0);
 const save={version:1 as const,city:'new-york' as const,active:true,updatedAt:100,camera:DEFAULT_CAMERA,preset:'clean' as const,stations:[a,b],tracks:network};assert.ok(isQuickSave(save));assert.equal(normalizeSave(save).tracks![0].scissors,true);
});
test('return trips revisit stations and terminal platforms through real scissors and survive save reload',()=>{
 const tracks=[{...connection('AB','A','B'),scissors:true},{...connection('BC','B','C'),scissors:true}],network=buildLineNetwork(stations,tracks);
 let line:MetroLine={id:'return-line',name:'Out and back',color:'#b5615b',stationIds:[],platforms:[]};
 for(const [id,side] of [['A','right'],['B','right'],['C','right'],['B','left'],['A','left']] as const){
   assert.equal(lineStopAdditionIssue(line,id,side),'');
   line={...line,stationIds:[...line.stationIds,id],platforms:[...line.platforms!,side]};
 }
 assert.ok(isMetroLineList([line]));
 const route=routeMetroLine(network,line.stationIds,line.platforms);assert.ok(route.ready);assert.deepEqual(route.platforms,line.platforms);assert.ok(route.metres>2000);assert.ok(route.paths.some(p=>p.points.length===33));
 assert.match(lineStopAdditionIssue(line,'A','left'),/already the last stop/);
 assert.equal(lineStopAdditionIssue(line,'A','right'),'');
 const closed={...line,platforms:[...line.platforms!.slice(0,-1),'right' as const]};
 assert.ok(routeMetroLine(network,closed.stationIds,closed.platforms).ready);
 assert.equal(lineStopAdditionIssue(closed,'B','right'),'','Closing a loop must not block further return stops');
 assert.match(lineStopAdditionIssue({...line,stationIds:Array(MAX_LINE_STOPS).fill('A')},'B','right'),/up to 32 stops/);
 const duplicate={...line,stationIds:[...line.stationIds,'A'],platforms:[...line.platforms!,'left' as const]};
 assert.equal(isMetroLineList([duplicate]),false);assert.equal(routeMetroLine(network,duplicate.stationIds,duplicate.platforms).ready,false);
 const noSwitches=buildLineNetwork(stations,tracks.map(t=>({...t,scissors:false})));
 const broken=routeMetroLine(noSwitches,line.stationIds,line.platforms);assert.equal(broken.ready,false);assert.match(broken.issue,/No directed path/);assert.deepEqual([broken.gaps[0].from,broken.gaps[0].to],['C','B']);
 // Two faces at the same terminus remain valid stop metadata, but scissors alone
 // cannot visit both without reversing outside a requested platform stop.
 const bothFaces={...line,stationIds:[...line.stationIds,'A'],platforms:[...line.platforms!,'right' as const]};
 assert.ok(isMetroLineList([bothFaces]));assert.equal(routeMetroLine(network,bothFaces.stationIds,bothFaces.platforms).ready,false);
 const save={version:1 as const,city:'new-york' as const,active:true,updatedAt:100,camera:DEFAULT_CAMERA,preset:'clean' as const,stations,tracks,lines:[line]};
 const restored=normalizeSave(JSON.parse(JSON.stringify(save)));assert.ok(isQuickSave(restored));assert.deepEqual(restored.lines,[line]);
 const loaded=restored.lines![0],loadedRoute=routeMetroLine(buildLineNetwork(restored.stations!,restored.tracks!),loaded.stationIds,loaded.platforms);
 assert.ok(loadedRoute.ready);assert.deepEqual(loadedRoute.platforms,line.platforms);assert.ok(Math.abs(loadedRoute.metres-route.metres)<.001);
});
test('scissors routes preserve heading away from stops regardless of station and track drawing orientation',()=>{
 for(const reverseA of [false,true])for(const reverseB of [false,true])for(const reverseTrack of [false,true]){
   const first=reverseA?{...a,start:a.end,end:a.start}:a,last=reverseB?{...b,start:b.end,end:b.start}:b;
   const base={...connection('AB','A','B'),scissors:true,start:{stationId:'A',end:reverseA?'start' as const:'end' as const,lane:'pair' as const},end:{stationId:'B',end:reverseB?'end' as const:'start' as const,lane:'pair' as const}};
   const track=reverseTrack?{...base,start:base.end,end:base.start}:base,network=buildLineNetwork([first,last],[track]);
   for(const edges of network.edges.values())for(const edge of edges)assert.ok(network.nodes.has(edge.to),'Crossover lane metadata must not overwrite its graph destination');
   for(const from of ['left','right'] as const)for(const middle of ['left','right'] as const)for(const to of ['left','right'] as const){
     const route=routeMetroLine(network,['A','B','A'],[from,middle,to]);assert.ok(route.ready);
     const stops=[network.nodes.get(`s:A:${from}:0.5`)!,network.nodes.get(`s:B:${middle}:0.5`)!,network.nodes.get(`s:A:${to}:0.5`)!];
     const segments=route.paths.flatMap(path=>path.points.slice(1).map((end,i)=>({start:path.points[i],end}))).filter(s=>stationLength(s.start,s.end)>.001);
     for(let i=1;i<segments.length;i++){
       const previous=segments[i-1],next=segments[i],p=MercatorCoordinate.fromLngLat(previous.start),q=MercatorCoordinate.fromLngLat(previous.end),r=MercatorCoordinate.fromLngLat(next.start),s=MercatorCoordinate.fromLngLat(next.end);
       const dot=((q.x-p.x)*(s.x-r.x)+(q.y-p.y)*(s.y-r.y))/(Math.hypot(q.x-p.x,q.y-p.y)*Math.hypot(s.x-r.x,s.y-r.y));
       if(dot<0)assert.ok(stops.some(stop=>stationLength(stop.position,next.start)<.01),`Unexpected reversal near scissors: ${JSON.stringify({reverseA,reverseB,reverseTrack,from,middle,to,point:next.start})}`);
     }
   }
 }
});
test('batched route strokes retain disconnected paths, physical elevations and platform outlines',()=>{
 const paths=[{points:[point(0),point(50),point(50),point(100)],depths:[-10,-20,-20,10]},{points:[point(1000,100),point(1100,100)],depths:[-50,-30]},{points:[] ,depths:[]}];
 const segments=routeStrokeSegments(paths,.04);
 const vertex=(p:[number,number],depth:number)=>depthPosition(p,depth+.04).toArray();
 assert.deepEqual(segments,[...vertex(point(0),-10),...vertex(point(50),-20),...vertex(point(50),-20),...vertex(point(100),10),...vertex(point(1000,100),-50),...vertex(point(1100,100),-30)]);
 const ring=[point(0),point(100),point(100,4),point(0,4),point(0)];
 assert.equal(routeStrokeSegments([{points:ring,depths:ring.map(()=>-8.5)}]).length,4*6);
 assert.deepEqual(routeStrokeSegments([]),[]);
});
test('station names use the nearest OSM street geometry, fall back to a nearby name, and number duplicates',()=>{
 const road=(name:string,x:number,y:number):Feature=>({type:'Feature',properties:{name},geometry:{type:'LineString',coordinates:[point(x,y),point(x+100,y)]}});
 const place=(name:string,x:number,y:number):Feature=>({type:'Feature',properties:{name},geometry:{type:'Point',coordinates:point(x,y)}});
 assert.equal(nearbyStationName(point(50),[road('Wall Street',0,10),road('Broadway',0,40)],[]),'Wall Street');
 assert.equal(nearbyStationName(point(50),[road('Distant Road',0,500)],[place('City Hall Park',50,20)]),'City Hall Park');
 assert.equal(nearbyStationName(point(50),[],[place('Brooklyn',50,30)]),'Brooklyn');assert.equal(nearbyStationName(point(50),[],[]),'New York');
 assert.equal(uniqueStationName('Wall Street',[{...a,name:'Wall Street'},{...b,name:'Wall Street 2'}]),'Wall Street 3');
});
test('platform plus controls keep their boarding sides and stay separate when zoomed out or near viewport edges',()=>{
 const [left,right]=platformAnchors(a);assert.equal(platformSideAt(a,left),'left');assert.equal(platformSideAt(a,right),'right');
 const island={...a,layout:'island' as const},anchors=platformAnchors(island);assert.ok(MercatorCoordinate.fromLngLat(anchors[0]).y<MercatorCoordinate.fromLngLat(anchors[1]).y);
 for(const [first,last] of [[{x:150,y:150},{x:150.01,y:150}],[{x:2,y:2},{x:3,y:3}],[{x:298,y:298},{x:299,y:299}],[{x:150,y:130},{x:150,y:170}]] as const){
  const [a,b]=platformChoicePositions(first,last,300,300);assert.ok(Math.hypot(b.x-a.x,b.y-a.y)>=47.99);assert.ok((b.x-a.x)*(last.x-first.x)+(b.y-a.y)*(last.y-first.y)>0);
  for(const p of [a,b]){assert.ok(p.x>=14.99&&p.x<=285.01);assert.ok(p.y>=14.99&&p.y<=285.01);}
 }
});

test('new stations on one avenue prefer distinct crossing streets and leave existing names untouched',()=>{
 const road=(name:string,points:[number,number][]):Feature=>({type:'Feature',properties:{name},geometry:{type:'LineString',coordinates:points.map(([x,y])=>point(x,y))}});
 const roads=[road('Broadway',[[-100,0],[1200,0]]),...[50,350,650,950].map((x,i)=>road(`${i+1}th Street`,[[x,-100],[x,100]]))];
 const existing=[{...a,name:'Broadway'},{...b,name:'Broadway 2'}],before=structuredClone(existing),names=existing.map(s=>s.name);
 for(let i=0;i<4;i++){const x=i*300,name=nearbyStationName(point(x+50),roads,[],station(`new${i}`,x),names);assert.equal(name,`${i+1}th Street`);names.push(name);}
 assert.equal(new Set(names).size,names.length);assert.deepEqual(existing,before);
 const nearby=[road('Broadway',[[-100,0],[300,0]]),road('Wall Street',[[40,-50],[40,50]]),road('Broad Street',[[60,-50],[60,50]])];
 assert.equal(nearbyStationName(point(50),nearby,[],a,['Wall Street']),'Broad Street');
});
