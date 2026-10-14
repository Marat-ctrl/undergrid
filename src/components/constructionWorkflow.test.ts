import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera,Vector3 } from 'three';
import { MercatorCoordinate } from 'maplibre-gl';
import { DEFAULT_CONSTRUCTION,stationLength } from './stationPlacement';
import { connectedStation,stationConnector,stationConnectionPorts } from './stationConnection';
import { trackGeometry,checkTrack,isTrackList,networkPorts,trackPort,trackForward,type PlacedTrack } from './trackPlacement';
import { NetworkHistory } from './networkHistory';
import { depthPosition,depthProject,depthUnproject } from './depthProjection';
const track:PlacedTrack={id:'parent',stage:'blueprint',curve:'straight',mode:'parallel',start:{position:[-74.01,40.71],depth:-40},end:{position:[-74.005,40.71],depth:-40}};
test('stations attach to either free end of a blueprint or constructed pair, preserving depth, tangent and rail spacing',()=>{
 for(const stage of ['blueprint','constructed'] as const)for(const end of ['start','end'] as const){
   const parent={...track,stage},network=[parent],port=trackPort(parent,end,'pair',[],network)!;
   const cursor=MercatorCoordinate.fromLngLat(port.position),scale=cursor.meterInMercatorCoordinateUnits();const p=new MercatorCoordinate(cursor.x+port.outward[0]*212*scale,cursor.y+port.outward[1]*212*scale).toLngLat();
   const draft=connectedStation(port,[p.lng,p.lat],DEFAULT_CONSTRUCTION,network)!;
   assert.equal(draft.station.depth,-40);assert.ok(Math.abs(stationLength(draft.station.start,draft.station.end)-200)<.02);
   const station={...draft.station,id:'joined'},connector={...stationConnector(station,draft.attachment),id:'connector'},tracks=[parent,connector];
   assert.ok(checkTrack(connector,[station],tracks).valid);assert.ok(isTrackList(tracks,[station]));assert.equal(stationConnectionPorts([station],tracks).filter(p=>'trackId' in p.ref&&p.ref.trackId==='parent'&&'end' in p.ref&&p.ref.end===end).length,0);
   const g=trackGeometry(connector,[station],tracks)!;assert.equal(g.startDepth,g.endDepth);assert.ok(Math.abs(g.length-12)<.02);
   assert.ok(Math.abs(stationLength(g.lanes[0].at(-1)!,g.lanes[1].at(-1)!)-4)<.01);
   assert.equal(networkPorts([station],tracks,'parallel').filter(p=>'stationId' in p.ref&&p.ref.end==='start').length,1);
 }
});
test('single-track attachments choose the station lane that preserves right-hand travel',()=>{
 const parent={...track,mode:'single' as const},tracks=[parent];
 for(const end of ['start','end'] as const){const port=trackPort(parent,end,'single',[],tracks)!,draft=connectedStation(port,port.position,DEFAULT_CONSTRUCTION,tracks)!;
   const station={...draft.station,id:'single-station'},connector=stationConnector(station,draft.attachment);
   assert.equal(draft.attachment.lane,end==='end'?'right':'left');assert.ok(checkTrack(connector,[station],tracks).valid);assert.equal(trackForward(connector,tracks),end==='end');
 }
});
test('Undo restores a whole network transaction, including nested references, while bounded history isolates snapshots',()=>{
 const history=new NetworkHistory(2);history.push({stations:[],tracks:[track]});const copy={...track,start:{position:[-74.01,40.71] as [number,number],depth:-40}};history.push({stations:[],tracks:[copy]});copy.start.depth=-50;
 assert.equal((history.pop()!.tracks[0].start as {depth:number}).depth,-40);assert.equal(history.pop()!.tracks[0].id,'parent');assert.equal(history.pop(),null);
 for(let i=0;i<4;i++)history.push({stations:[],tracks:[{...track,id:String(i)}]});assert.equal(history.size,2);assert.equal(history.pop()!.tracks[0].id,'3');assert.equal(history.pop()!.tracks[0].id,'2');history.clear();assert.equal(history.size,0);
});
test('depth rendering uses physical altitude and pointer projection round-trips at different depths and camera tilts',()=>{
 const width=1200,height=800,point:[number,number]=[-74.005,40.7126];
 for(const tilt of [0,40,65]){
   const camera=new PerspectiveCamera(45,width/height,.1,10000);const angle=tilt*Math.PI/180;camera.position.set(0,-500*Math.sin(angle),500*Math.cos(angle));camera.up.set(0,1,0);camera.lookAt(new Vector3(0,0,0));camera.updateMatrixWorld();
   const matrix=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
   for(const depth of [-100,-25,0,50]){assert.ok(Math.abs(depthPosition(point,depth).z-depth)<1e-9);const screen=depthProject(matrix,point,depth,width,height)!;const restored=depthUnproject(matrix,screen,depth,width,height)!;assert.ok(stationLength(point,restored)<.0001);}
   if(tilt>0){const ground=depthProject(matrix,point,0,width,height)!,deep=depthProject(matrix,point,-100,width,height)!;assert.ok(Math.hypot(ground.x-deep.x,ground.y-deep.y)>20);}
 }
});

test('station and crossing-track picking follows physical depth rather than construction order',async()=>{
 const {pickMetro,projectMetroPicks}=await import('./metroPicking');const {stationFeatures}=await import('./stationPlacement');
 const {depthPosition}=await import('./depthProjection');
 const origin=MercatorCoordinate.fromLngLat([-74.005,40.7126]),scale=origin.meterInMercatorCoordinateUnits();
 const coordinate=(x:number,y:number):[number,number]=>{const p=new MercatorCoordinate(origin.x+x*scale,origin.y+y*scale).toLngLat();return [p.lng,p.lat];};
 const station=(id:string,depth:number,vertical=false)=>({id,name:id,depth,layout:'side' as const,stage:'constructed' as const,start:coordinate(vertical?0:-100,vertical?-100:0),end:coordinate(vertical?0:100,vertical?100:0)});
 const upper=station('upper',-10),lower=station('lower',-20,true);
 const picks=[upper,lower].map(s=>{const f=stationFeatures([s]).features.find(f=>f.properties!.kind==='envelope')!;if(f.geometry.type!=='Polygon')throw new Error('Expected a station envelope');const ring=f.geometry.coordinates[0] as [number,number][];return {id:s.id,kind:'station' as const,points:ring,depths:ring.map(()=>s.depth),polygon:true};});
 for(const tilt of [0,40,65]){const camera=new PerspectiveCamera(45,1.5,.1,10000),angle=tilt*Math.PI/180;camera.position.set(0,-500*Math.sin(angle),500*Math.cos(angle));camera.lookAt(new Vector3(0,0,0));camera.updateMatrixWorld();const matrix=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
   const point=depthProject(matrix,coordinate(0,0),-10,1200,800)!;
   for(const order of [picks,[...picks].reverse()])assert.equal(pickMetro(matrix,point,order,1200,800)?.id,'upper');
   const trackPick={id:'crossing',kind:'track' as const,points:[coordinate(-30,0),coordinate(30,0)],depths:[-5,-5],polygon:false};
   const crossing=depthProject(matrix,coordinate(0,0),-5,1200,800)!;assert.equal(pickMetro(matrix,crossing,[...picks,trackPick],1200,800)?.id,'crossing');
   const outside={...trackPick,id:'outside',points:[coordinate(10000,0),coordinate(11000,0)]};
   const spanning={...trackPick,id:'spanning',points:[coordinate(-2000,0),coordinate(2000,0)]};
   assert.equal(projectMetroPicks(matrix,[outside],1200,800).length,0);
   assert.equal(pickMetro(matrix,crossing,[outside,spanning],1200,800)?.id,'spanning');
   assert.ok(depthPosition(coordinate(0,0),-20).z<depthPosition(coordinate(0,0),-10).z);
 }
});
test('station and track labels follow hover or the shared saved preference, while drawing previews stay readable',async()=>{
 const {stationLabelVisible}=await import('./metroPicking');
 assert.equal(stationLabelVisible(false,null,'station'),false);assert.equal(stationLabelVisible(false,'other','station'),false);
 assert.equal(stationLabelVisible(false,'station','station'),true);assert.equal(stationLabelVisible(true,null,'station'),true);assert.equal(stationLabelVisible(false,null,'cursor',true),true);assert.equal(stationLabelVisible(false,'track','track'),true);assert.equal(stationLabelVisible(false,null,'track'),false);assert.equal(stationLabelVisible(true,null,'track'),true);
});


test('raised platforms form closed 1.5-metre prisms without changing rail geometry or ground footprints',async()=>{
 const {platformGeometry,platformEdgePositions,PLATFORM_HEIGHT_METRES}=await import('./platformGeometry');const {stationFeatures,stretchedStation,stretchedDepot}=await import('./stationPlacement');
 const stations=[...(['side','island'] as const).map(layout=>stretchedStation([-74.007,40.712],[-74.005,40.712],{...DEFAULT_CONSTRUCTION,platforms:layout,depth:-25})!),stretchedDepot([-74.007,40.712],[-74.005,40.712],{...DEFAULT_CONSTRUCTION,capacity:5,depth:-25})!];
 for(const station of stations){
   const original=stationFeatures([station]);
   for(const feature of original.features.filter(f=>f.properties?.kind==='platform')){assert.equal(feature.geometry.type,'Polygon');if(feature.geometry.type!=='Polygon')continue;const ring=feature.geometry.coordinates[0] as [number,number][],geometry=platformGeometry(ring,station.depth),vertices=geometry.getAttribute('position'),n=ring.length-1;
     assert.equal(vertices.count,2*n);assert.equal(PLATFORM_HEIGHT_METRES,1.5);assert.equal(geometry.groups.length,2);
     for(let i=0;i<n;i++){const base=depthPosition(ring[i],-25),top=depthPosition(ring[i],-23.5);assert.ok(Math.abs(vertices.getZ(i)-base.z)<.00001);assert.ok(Math.abs(vertices.getZ(i+n)-top.z)<.00001);assert.equal(vertices.getX(i),vertices.getX(i+n));assert.equal(vertices.getY(i),vertices.getY(i+n));}
     const edges=new Map<string,number>(),index=geometry.getIndex()!;for(let i=0;i<index.count;i+=3){const face=[index.getX(i),index.getX(i+1),index.getX(i+2)];for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(key,(edges.get(key)??0)+1);}}
     assert.ok([...edges.values()].every(count=>count===2));
     const outline=platformEdgePositions(geometry),degrees=Array(2*n).fill(0),counts={bottom:0,top:0,vertical:0};
     assert.equal(outline.length,3*n*6);
     const vertex=(offset:number)=>{for(let i=0;i<vertices.count;i++)if(vertices.getX(i)===outline[offset]&&vertices.getY(i)===outline[offset+1]&&vertices.getZ(i)===outline[offset+2])return i;return -1;};
     for(let i=0;i<outline.length;i+=6){const a=vertex(i),b=vertex(i+3);assert.ok(a>=0&&b>=0);degrees[a]++;degrees[b]++;
       if((a<n)===(b<n)){assert.ok((a%n+1)%n===b%n||(b%n+1)%n===a%n);counts[a<n?'bottom':'top']++;}
       else{assert.equal(a%n,b%n);counts.vertical++;}
     }
     assert.deepEqual(counts,{bottom:n,top:n,vertical:n});assert.ok(degrees.every(degree=>degree===3));geometry.dispose();
   }
   assert.equal(station.depth,-25);assert.deepEqual(stationFeatures([station]),original);
 }
});


test('track depth transitions hide until hover or shared labels, while draft length remains visible',async()=>{
 const {trackLabelText}=await import('./metroPicking');
 assert.equal(trackLabelText(undefined,'−20 → −40 m',false),'');assert.equal(trackLabelText(undefined,'−20 → −40 m',true),'−20 → −40 m');
 assert.equal(trackLabelText(101.6,'−20 → −40 m',false),'102 m');assert.equal(trackLabelText(101.6,'−20 → −40 m',true),'102 m\n−20 → −40 m');assert.equal(trackLabelText(undefined,'',true),'');
});

test('two independent track ends snap with exact lanes, inherited elevations and opposing tangents',async()=>{
 const {draftTrack}=await import('./trackPlacement');
 const origin=MercatorCoordinate.fromLngLat([-74.005,40.7126]),scale=origin.meterInMercatorCoordinateUnits();
 const position=(x:number):[number,number]=>{const p=new MercatorCoordinate(origin.x+x*scale,origin.y).toLngLat();return [p.lng,p.lat];};
 for(const mode of ['parallel','single'] as const)for(const reverseA of [false,true])for(const reverseB of [false,true]){
   const endpoint=(x:number)=>({position:position(x),depth:25});
   const a:PlacedTrack={id:'a',mode,stage:'constructed',curve:'straight',start:endpoint(reverseA?-100:-300),end:endpoint(reverseA?-300:-100)};
   const b:PlacedTrack={id:'b',mode,stage:'constructed',curve:'straight',start:endpoint(reverseB?300:100),end:endpoint(reverseB?100:300)};
   const network=[a,b],lane=mode==='parallel'?'pair':'single',ap=trackPort(a,reverseA?'start':'end',lane,[],network)!,bp=trackPort(b,reverseB?'end':'start',lane,[],network)!;
   const link={...draftTrack(ap.ref,bp.ref,mode,[],network)!,id:'link',stage:'constructed' as const},joined=[a,b,link];
   assert.ok(checkTrack(link,[],joined).valid);assert.ok(isTrackList(joined,[]));const g=trackGeometry(link,[],joined)!;
   assert.equal(g.startDepth,25);assert.equal(g.endDepth,25);assert.ok(g.startTangent[0]>.99999&&g.endTangent[0]>.99999);
   for(const [parent,end,index] of [[a,reverseA?'start':'end',0],[b,reverseB?'end':'start',g.centre.length-1]] as const){const geometry=trackGeometry(parent,[],joined)!,at=end==='start'?0:geometry.centre.length-1;for(const path of g.lanes)assert.ok(geometry.lanes.some(target=>stationLength(path[index],target[at])<.002));}
   assert.equal(networkPorts([],joined,mode).length,2);
 }
});

test('station mouths remain reusable after pair and single branch connections',async()=>{
 const {stretchedStation}=await import('./stationPlacement'),{draftTrack}=await import('./trackPlacement');
 const station={...stretchedStation([-74.01,40.71],[-74.008,40.71],DEFAULT_CONSTRUCTION)!,id:'station'};
 const pair={...draftTrack({stationId:station.id,end:'end',lane:'pair'},{position:[-74.005,40.71],depth:-25},'parallel',[station])!,id:'pair'};
 const single={...draftTrack({stationId:station.id,end:'end',lane:'right'},{position:[-74.005,40.711],depth:-25},'single',[station],[pair])!,id:'single'};
 const branches=[pair,single];assert.ok(isTrackList(branches,[station]));
 assert.equal(networkPorts([station],branches,'parallel').filter(p=>'stationId' in p.ref).length,2);
 assert.equal(networkPorts([station],branches,'single').filter(p=>'stationId' in p.ref).length,4);
});

test('physical station metres match geographic map scale for all layouts and elevations',async()=>{
 const {LngLat}=await import('maplibre-gl'),{stationFeatures,stretchedStation,isStationList}=await import('./stationPlacement');
 const {elevationText}=await import('./constructionDimensions');
 for(const elevation of [-100,-25,0,50])for(const layout of ['side','island'] as const){
   const s=stretchedStation([-74.007,40.712],[-74.00699,40.712],{...DEFAULT_CONSTRUCTION,platforms:layout,depth:elevation})!;
   assert.ok(isStationList([s]));assert.ok(Math.abs(new LngLat(...s.start).distanceTo(new LngLat(...s.end))-50)<.1);
   for(const f of stationFeatures([s]).features.filter(f=>f.properties?.kind==='platform')){if(f.geometry.type!=='Polygon')throw new Error('Expected platform');const r=f.geometry.coordinates[0] as [number,number][];
     assert.ok(Math.abs(new LngLat(...r[1]).distanceTo(new LngLat(...r[2]))-4)<.01);
     const a=MercatorCoordinate.fromLngLat(r[0],elevation),b=MercatorCoordinate.fromLngLat(r[0],elevation+1);assert.ok(Math.abs((b.z-a.z)/a.meterInMercatorCoordinateUnits()-1)<1e-9);
   }
   assert.ok(stationFeatures([s]).features.find(f=>f.properties?.kind==='label')!.properties!.label.includes(`${elevationText(elevation)} m`));
   for(const bad of [-101,51,25.5])assert.equal(isStationList([{...s,depth:bad}]),false);
 }
 assert.equal(elevationText(0),'0');assert.equal(elevationText(25),'+25');assert.equal(elevationText(-25),'−25');
});

test('depot decks serve every storage track, including an odd last track',async()=>{
 const {stationFeatures,stretchedDepot}=await import('./stationPlacement');
 for(const capacity of [5,6,29,30]){
   const depot=stretchedDepot([-74.01,40.71],[-74.008,40.71],{...DEFAULT_CONSTRUCTION,capacity})!;
   const features=stationFeatures([depot]).features,platforms=features.filter(f=>f.properties?.kind==='platform');assert.equal(platforms.length,Math.ceil(capacity/2));
   for(const f of features.filter(f=>f.properties?.kind==='track')){if(f.geometry.type!=='LineString')throw new Error('Expected track');const end=f.geometry.coordinates.at(-1) as [number,number];
     assert.ok(platforms.some(p=>{if(p.geometry.type!=='Polygon')return false;const ring=p.geometry.coordinates[0];return [ring[1],ring[2]].some(edge=>Math.abs(stationLength([end[0],edge[1]],end)-2)<.03);}));
   }
 }
});

test('building occlusion compares physical roofs and walls against elevated and underground geometry',async()=>{
 const {buildingDistance,buildingHides}=await import('./buildingOcclusion'),{clipDistance}=await import('./metroPicking');
 const origin=MercatorCoordinate.fromLngLat([-74.005,40.7126]),scale=origin.meterInMercatorCoordinateUnits();
 const coordinate=(x:number,y:number):[number,number]=>{const p=new MercatorCoordinate(origin.x+x*scale,origin.y+y*scale).toLngLat();return [p.lng,p.lat];};
 const ring=[coordinate(-20,-20),coordinate(20,-20),coordinate(20,20),coordinate(-20,20),coordinate(-20,-20)];
 const camera=new PerspectiveCamera(45,1.5,.1,10000);camera.position.set(0,0,500);camera.lookAt(0,0,0);camera.updateMatrixWorld();const matrix=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse),point=depthProject(matrix,coordinate(0,0),0,1200,800)!;
 const distance=buildingDistance(matrix,point,1200,800,{type:'Polygon',coordinates:[ring]},0,30);
 assert.ok(buildingHides(distance,clipDistance(matrix,coordinate(0,0),-25)));
 assert.ok(buildingHides(distance,clipDistance(matrix,coordinate(0,0),20)));
 assert.equal(buildingHides(distance,clipDistance(matrix,coordinate(0,0),50)),false);
 assert.equal(buildingHides(Infinity,500),false);
});

test('right-button tap cancels drawing, while drag and interrupted gestures preserve camera behavior',async()=>{
 const {attachCameraGesture}=await import('./camera');
 const handlers=new Map<string,Set<(event:any)=>void>>(),windowHandlers=new Map<string,Set<(event:any)=>void>>();let captured=false,cancelled=0,moved=0;
 const add=(store:typeof handlers,key:string,fn:(event:any)=>void)=>{if(!store.has(key))store.set(key,new Set());store.get(key)!.add(fn);};
 const canvas={style:{cursor:''},addEventListener:(name:string,fn:(event:any)=>void)=>add(handlers,name,fn),removeEventListener:(name:string,fn:(event:any)=>void)=>handlers.get(name)?.delete(fn),setPointerCapture:()=>{captured=true;},hasPointerCapture:()=>captured,releasePointerCapture:()=>{captured=false;}};
 const oldWindow=globalThis.window,oldRaf=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
 Object.assign(globalThis,{window:{addEventListener:(name:string,fn:(event:any)=>void)=>add(windowHandlers,name,fn),removeEventListener:(name:string,fn:(event:any)=>void)=>windowHandlers.get(name)?.delete(fn)},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
 const event=(type:string,x=0,y=0,button=2)=>{const e={type,pointerType:'mouse',pointerId:1,clientX:x,clientY:y,button,preventDefault(){},stopPropagation(){}};for(const fn of handlers.get(type)??[])fn(e);};
 try{
   const map={getCanvas:()=>canvas,stop(){},getPitch:()=>30,getBearing:()=>0,jumpTo(next:{pitch:number;bearing:number}){moved++;assert.notEqual(next.bearing,0);assert.notEqual(next.pitch,30);}};
   const dispose=attachCameraGesture(map as unknown as import('maplibre-gl').Map,()=>cancelled++);
   event('pointerdown');event('pointerup');assert.equal(cancelled,1);assert.equal(moved,0);
   event('pointerdown');event('pointermove',10,10);event('pointerup',10,10);assert.equal(cancelled,1);assert.equal(moved,1);
   event('pointerdown');event('pointercancel');assert.equal(cancelled,1);
   event('pointerdown',0,0,0);event('pointerup',0,0,0);assert.equal(cancelled,1);
   dispose();assert.ok([...handlers.values(),...windowHandlers.values()].every(set=>set.size===0));
 }finally{Object.assign(globalThis,{window:oldWindow,requestAnimationFrame:oldRaf,cancelAnimationFrame:oldCancel});}
});

test('intermediate junctions attach to sloped rails and survive saved references, deletion and Undo',async()=>{
 const {draftTrack,trackPointPort,resolveEndpoint,orientTrackPoint,tracksToRemove,isTrackPointRef}=await import('./trackPlacement');
 const stationOrigin=MercatorCoordinate.fromLngLat([-74.005,40.7126]),scale=stationOrigin.meterInMercatorCoordinateUnits();
 const coordinate=(x:number,y:number):[number,number]=>{const p=new MercatorCoordinate(stationOrigin.x+x*scale,stationOrigin.y+y*scale).toLngLat();return [p.lng,p.lat];};
 const parent={...draftTrack({position:coordinate(-300,0),depth:-25},{position:coordinate(300,0),depth:-65},'parallel',[])!,id:'parent',stage:'constructed' as const};
 const point={trackId:parent.id,at:.37,lane:'right' as const,direction:1 as const},port=trackPointPort(parent,point,[],[parent])!;
 assert.ok(port.depth< -25&&port.depth> -65);assert.ok(!Number.isInteger(port.depth));
 const branch={...draftTrack(point,{position:coordinate(100,70),depth:-45},'single',[],[parent])!,id:'branch',stage:'constructed' as const},network=[parent,branch];
 const geometry=trackGeometry(branch,[],network)!;assert.ok(stationLength(geometry.centre[0],port.position)<.001);assert.equal(geometry.startDepth,port.depth);
 assert.ok(networkPorts([],network,'single').some(p=>isTrackPointRef(p.ref)&&Math.abs(p.ref.at-.37)<1e-9));
 assert.ok(isTrackList(JSON.parse(JSON.stringify(network)),[]));
 for(const patch of [{at:-.01},{at:1.01},{at:NaN},{direction:0},{lane:'pair'},{trackId:'missing'}])assert.equal(isTrackList([parent,{...branch,start:{...point,...patch}}],[]),false);
 assert.equal(isTrackList([{...parent,stage:'blueprint'},branch],[]),false);
 const cycle={...parent,start:{trackId:'branch',at:.5,lane:'single',direction:1}};assert.equal(isTrackList([cycle,branch],[]),false);
 assert.deepEqual([...tracksToRemove(network,['parent'])],['parent','branch']);
 assert.equal(orientTrackPoint(point,coordinate(-500,0),[],network).direction,-1);
 assert.equal(orientTrackPoint(point,coordinate(500,0),[],network).direction,1);
 const history=new NetworkHistory();history.push({stations:[],tracks:network});assert.deepEqual(history.pop()!.tracks,network);
 assert.deepEqual(resolveEndpoint(point,[],network)?.position,port.position);
});

test('single crossovers connect selected lanes at arbitrary positions with smooth tangents and right-hand arrows',async()=>{
 const {draftTrack,trackPointPort,trackForward}=await import('./trackPlacement');
 const parent={...track,id:'main',start:{position:[-74.01,40.71] as [number,number],depth:-25},end:{position:[-74.002,40.71] as [number,number],depth:-25},stage:'constructed' as const};
 const a={trackId:parent.id,at:.3,lane:'right' as const,direction:1 as const},b={trackId:parent.id,at:.6,lane:'left' as const,direction:-1 as const};
 const crossover={...draftTrack(a,b,'single',[],[parent])!,id:'crossover',stage:'constructed' as const},network=[parent,crossover];
 assert.ok(checkTrack(crossover,[],network).valid);assert.ok(isTrackList(network,[]));
 const g=trackGeometry(crossover,[],network)!;
 assert.ok(stationLength(g.centre[0],trackPointPort(parent,a,[],network)!.position)<.001);
 assert.ok(stationLength(g.centre.at(-1)!,trackPointPort(parent,b,[],network)!.position)<.001);
 assert.ok(g.startTangent[0]>.99999&&g.endTangent[0]>.99999);assert.equal(trackForward(crossover,network),true);
});

test('pointer magnetism follows continuous rail geometry and recovers physical positions under perspective',async()=>{
 const {projectTrackSnapPaths,nearestTrackPoint}=await import('./trackSnap'),{trackPointPort,draftTrack}=await import('./trackPlacement');
 const stations=[{id:'anchor',name:'Anchor',start:[-74.009,40.71] as [number,number],end:[-74.008,40.71] as [number,number],depth:-25,layout:'side' as const,stage:'constructed' as const}];
 const parent={...track,id:'curved',curve:'arc' as const,start:{stationId:'anchor',end:'end' as const,lane:'pair' as const},end:{position:[-74.002,40.714] as [number,number],depth:-45}},network=[parent];
 const ref={trackId:parent.id,at:.374,lane:'pair' as const,direction:1 as const},port=trackPointPort(parent,ref,stations,network)!;
 for(const tilt of [0,40,65])for(const distance of [80,500]){
   const center=depthPosition(port.position,port.depth),camera=new PerspectiveCamera(45,1.5,.1,10000),angle=tilt*Math.PI/180;camera.position.copy(center).add(new Vector3(0,-distance*Math.sin(angle),distance*Math.cos(angle)));camera.lookAt(center);camera.updateMatrixWorld();const matrix=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
   const paths=projectTrackSnapPaths(matrix,stations,network,1200,800),screen=depthProject(matrix,port.position,port.depth,1200,800)!;
   const snap=nearestTrackPoint(screen,paths,'parallel',stations,network)!;assert.ok(snap);assert.ok(stationLength(snap.position,port.position)<.001);assert.ok(Math.abs(snap.depth-port.depth)<.0001);
   const lanePort=trackPointPort(parent,{...ref,lane:'left'},stations,network)!,laneScreen=depthProject(matrix,lanePort.position,lanePort.depth,1200,800)!,paired=nearestTrackPoint(laneScreen,paths,'parallel',stations,network)!;assert.ok(paired);assert.ok(stationLength(paired.position,port.position)<.001);
   assert.equal(nearestTrackPoint(screen,paths,'parallel',stations,network,port.position),null);
   assert.equal(nearestTrackPoint(screen,paths,'parallel',stations,network,null,()=>false),null);
 }
 const single={...draftTrack({position:[-74.01,40.71],depth:-25},{position:[-74.003,40.71],depth:-25},'single',[])!,id:'single'};
 const center=trackGeometry(single,[],[single])!.centre[32],camera=new PerspectiveCamera(45,1.5,.1,10000);camera.position.copy(depthPosition(center,-25)).add(new Vector3(0,0,500));camera.lookAt(depthPosition(center,-25));camera.updateMatrixWorld();const matrix=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse),paths=projectTrackSnapPaths(matrix,[],[single],1200,800),screen=depthProject(matrix,center,-25,1200,800)!;
 assert.ok(nearestTrackPoint(screen,paths,'single',[],[single]));assert.equal(nearestTrackPoint(screen,paths,'parallel',[],[single]),null);
});

test('compact station layouts and four-metre depot decks preserve clearance at every capacity',async()=>{
 const {stationFeatures,stretchedStation,stretchedDepot}=await import('./stationPlacement');
 for(const layout of ['side','island'] as const){const station=stretchedStation([-74.01,40.71],[-74.008,40.71],{...DEFAULT_CONSTRUCTION,platforms:layout})!,features=stationFeatures([station]).features,rails=features.filter(f=>f.properties?.kind==='track');
   const points=rails.map(f=>f.geometry.type==='LineString'?f.geometry.coordinates[0] as [number,number]:station.start);assert.ok(Math.abs(stationLength(points[0],points[1])-(layout==='side'?4:8))<.01);
   for(const f of features.filter(f=>f.properties?.kind==='platform')){if(f.geometry.type!=='Polygon')throw new Error('Expected platform');const ring=f.geometry.coordinates[0] as [number,number][];assert.ok(Math.abs(stationLength(ring[1],ring[2])-4)<.01);}
 }
 for(let capacity=5;capacity<=30;capacity++){const depot=stretchedDepot([-74.01,40.71],[-74.008,40.71],{...DEFAULT_CONSTRUCTION,capacity})!,features=stationFeatures([depot]).features;
   const platforms=features.filter(f=>f.properties?.kind==='platform');assert.equal(platforms.length,Math.ceil(capacity/2));
   for(const p of platforms){if(p.geometry.type!=='Polygon')throw new Error('Expected deck');const ring=p.geometry.coordinates[0] as [number,number][];assert.ok(Math.abs(stationLength(ring[1],ring[2])-4)<.01);}
 }
});
