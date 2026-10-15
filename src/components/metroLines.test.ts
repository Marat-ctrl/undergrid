import test from 'node:test';
import assert from 'node:assert/strict';
import { MercatorCoordinate } from 'maplibre-gl';
import { buildLineNetwork,routeMetroLine,isMetroLineList } from './metroLines';
import { type PlacedStation } from './stationPlacement';
import { type PlacedTrack } from './trackPlacement';
import { isQuickSave,DEFAULT_CAMERA } from '../gameSave';
import { normalizeSave } from '../../server/saveData';
import { NetworkHistory } from './networkHistory';
import { automaticScissors } from './automaticScissors';
import { platformSideAt } from './platformStops';
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
 for(const scissors of switches){assert.equal(scissors.paths.length,2);assert.ok(scissors.near<scissors.far);assert.ok(scissors.near*g.length>=11.9);
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
test('station names use the nearest OSM street geometry, fall back to a nearby name, and number duplicates',()=>{
 const road=(name:string,x:number,y:number):Feature=>({type:'Feature',properties:{name},geometry:{type:'LineString',coordinates:[point(x,y),point(x+100,y)]}});
 const place=(name:string,x:number,y:number):Feature=>({type:'Feature',properties:{name},geometry:{type:'Point',coordinates:point(x,y)}});
 assert.equal(nearbyStationName(point(50),[road('Wall Street',0,10),road('Broadway',0,40)],[]),'Wall Street');
 assert.equal(nearbyStationName(point(50),[road('Distant Road',0,500)],[place('City Hall Park',50,20)]),'City Hall Park');
 assert.equal(nearbyStationName(point(50),[],[place('Brooklyn',50,30)]),'Brooklyn');assert.equal(nearbyStationName(point(50),[],[]),'New York');
 assert.equal(uniqueStationName('Wall Street',[{...a,name:'Wall Street'},{...b,name:'Wall Street 2'}]),'Wall Street 3');
});
