import { METRO_PALETTE as palette } from './theme';
import { automaticScissors } from './automaticScissors';
import { platformSideAt } from './platformStops';
import { projectTrackSnapPaths,nearestTrackPoint } from './trackSnap';
import { railPaths,railDetailForZoom } from './railPaths';
import type { LineOverlay } from './metroLines';
import { elevationText } from './constructionDimensions';
import { buildingDistance,buildingHides } from './buildingOcclusion';
import { platformGeometry,platformEdgePositions,PLATFORM_HEIGHT_METRES } from './platformGeometry';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Map,CustomLayerInterface } from 'maplibre-gl';
import { stationFeatures,type Coordinate,type PlacedStation } from './stationPlacement';
import { checkTrack,trackGeometry,trackForward,type PlacedTrack,type StationPort,type TrackMode } from './trackPlacement';
import { clipDistance,projectMetroPicks,pickProjectedMetro,stationLabelVisible,trackLabelText,type MetroPick,type ProjectedMetroPick } from './metroPicking';
import { depthPosition,depthProject,depthUnproject,depthTransform } from './depthProjection';
interface View {lineOverlay:LineOverlay[];stationLabels:boolean;stations:PlacedStation[];tracks:PlacedTrack[];selectedStation:string|null;selectedTrack:string|null;ghostStation:PlacedStation|null;ghostTrack:PlacedTrack|null;ports:StationPort[];hot:string|null;}
interface Label {position:Coordinate;depth:number;text:string;kind:'station'|'track'|'port'|'marker';key?:string;preview?:boolean;length?:number;color:string;node?:HTMLDivElement;}
// Track and station floor elevation is the saved rail depth; platforms have a 1.5-metre deck.
export function createFlatMetroScene(){
 let view:View={lineOverlay:[],stationLabels:false,stations:[],tracks:[],selectedStation:null,selectedTrack:null,ghostStation:null,ghostTrack:null,ports:[],hot:null};
 let map:Map,renderer:THREE.WebGLRenderer,overlay:HTMLDivElement;
 const route=new THREE.Group();
 const camera=new THREE.Camera(),scene=new THREE.Scene(),base=new THREE.Group(),ghost=new THREE.Group(),reference=new THREE.Group(),referenceScene=new THREE.Scene();scene.add(base,ghost,route);referenceScene.add(reference);
 let baseLabels:Label[]=[],ghostLabels:Label[]=[],picks:MetroPick[]=[];let hovered:{id:string;kind:'station'|'track'}|null=null;let pointer:{x:number;y:number}|null=null;let projected:ProjectedMetroPick[]=[];let labels:Label[]=[];const buildingHits=new globalThis.Map<string,number>();
 const lines=new Set<LineMaterial>();let snapPaths:ReturnType<typeof projectTrackSnapPaths>=[],snapMatrix=new THREE.Matrix4(),snapStations:PlacedStation[]|null=null,snapTracks:PlacedTrack[]|null=null,snapWidth=0,snapHeight=0;
 let pickMatrix=new THREE.Matrix4(),pickSource:MetroPick[]|null=null,pickWidth=0,pickHeight=0;
 const dispose=(group:THREE.Group)=>{group.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.Line){obj.geometry.dispose();for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){if(material instanceof LineMaterial)lines.delete(material);material.dispose();}}});group.clear();};
 // Underground geometry has its own infinite-far depth pass before buildings. Above-ground
 // geometry uses the map's native depth buffer after buildings, including tracks crossing zero.
 const nearDistance={value:1},depthBias={value:0},elevationPass={value:-1},railDetail={value:1};
 const xray=(material:THREE.Material)=>{material.depthTest=true;material.depthWrite=false;material.depthFunc=THREE.LessEqualDepth;material.onBeforeCompile=shader=>{
   shader.uniforms.metroNearDistance=nearDistance;shader.uniforms.metroDepthBias=depthBias;shader.uniforms.metroPass=elevationPass;
   const line=material instanceof LineMaterial;
   shader.vertexShader='uniform float metroNearDistance;\nuniform float metroDepthBias;\nuniform float metroPass;\nvarying float vMetroElevation;\n'+shader.vertexShader.replace(/}\s*$/,`${line?'vMetroElevation = position.y < 0.5 ? instanceStart.z : instanceEnd.z;':'vMetroElevation = position.z;'}
     if (metroPass < 0.0) gl_Position.z = gl_Position.w - 2.0 * metroNearDistance;
     gl_Position.z -= metroDepthBias * gl_Position.w;\n}`);
   shader.fragmentShader='uniform float metroPass;\nvarying float vMetroElevation;\n'+shader.fragmentShader.replace('void main() {','void main() {\n if ((metroPass < 0.0 && vMetroElevation >= 0.0) || (metroPass > 0.0 && vMetroElevation < 0.0)) discard;');
   if(material.userData.railLines){
     shader.uniforms.metroRailDetail=railDetail;
     const main=shader.vertexShader.indexOf('void main() {');
     shader.vertexShader='uniform float metroRailDetail;\nattribute vec3 instanceCentreStart;\nattribute vec3 instanceCentreEnd;\nattribute float instanceSecondRail;\nvarying float vMetroSecondRail;\n'+shader.vertexShader.slice(0,main)+shader.vertexShader.slice(main).replace(/\binstanceStart\b/g,'metroStart').replace(/\binstanceEnd\b/g,'metroEnd').replace('void main() {',`void main() {
       vec3 metroStart = mix(instanceCentreStart, instanceStart, metroRailDetail);
       vec3 metroEnd = mix(instanceCentreEnd, instanceEnd, metroRailDetail);
       vMetroSecondRail = instanceSecondRail;`);
     // Keep cores opaque during the merge so a faint nearer rail cannot mask its partner.
     // Suppress the duplicate once both rails occupy the same distant centreline.
     shader.fragmentShader='uniform float metroRailDetail;\nvarying float vMetroSecondRail;\n'+shader.fragmentShader.replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );','if (vMetroSecondRail > 0.5 && metroRailDetail == 0.0) discard;\n gl_FragColor = vec4( diffuseColor.rgb, alpha );');
   }
 };return material;};
 const color=(asset:PlacedStation|PlacedTrack,selected:string|null,invalid=false)=>invalid?palette.invalid:asset.id===selected?palette.selected:asset.stage==='constructed'?palette.built:palette.blueprint;
 const RAIL_HALO_PIXELS=3.2,RAIL_PIXELS=1.2;
 const stroke=(group:THREE.Group,segments:number[],tint:string,width:number,opacity=1,rail?:{centres:number[];sides:number[]})=>{
   const geometry=new LineSegmentsGeometry().setPositions(segments);
   if(rail){const centres=new THREE.InstancedInterleavedBuffer(new Float32Array(rail.centres),6,1);geometry.setAttribute('instanceCentreStart',new THREE.InterleavedBufferAttribute(centres,3,0));geometry.setAttribute('instanceCentreEnd',new THREE.InterleavedBufferAttribute(centres,3,3));geometry.setAttribute('instanceSecondRail',new THREE.InstancedBufferAttribute(new Float32Array(rail.sides),1));}
   const material=new LineMaterial({color:tint,linewidth:width,transparent:true,opacity});xray(material);material.userData.depthMask=width!==RAIL_HALO_PIXELS;if(group===reference){material.onBeforeCompile=()=>{};material.depthTest=false;material.depthWrite=false;}lines.add(material);
   material.userData.railLines=!!rail;
   material.customProgramCacheKey=()=>group===reference?'metro-reference':rail?'metro-rails-lod':'metro-line';
   const object=new LineSegments2(geometry,material);object.onBeforeRender=()=>{const canvas=map.getCanvas();material.resolution.set(canvas.clientWidth,canvas.clientHeight);};object.frustumCulled=false;object.renderOrder=width===RAIL_HALO_PIXELS?30:40;group.add(object);
 };
 const linePaths=(group:THREE.Group,paths:Coordinate[][],depths:number[],tint:string,width:number,dashed=false,opacity=1,centre?:Coordinate[])=>{
   const segments:number[]=[];
   const rail=centre?{centres:[] as number[],sides:[] as number[]}:undefined,centres=centre?.map((point,i)=>depthPosition(point,depths[i]??depths[0]));
   for(const [side,points] of paths.entries()){const vertices=points.map((point,i)=>depthPosition(point,depths[i]??depths[0]));
   let distance=0;
   for(let i=1;i<vertices.length;i++){
     const a=vertices[i-1],b=vertices[i],length=a.distanceTo(b);if(length<1e-8)continue;
     const append=(from:number,to:number)=>{segments.push(...a.clone().lerp(b,from).toArray(),...a.clone().lerp(b,to).toArray());if(rail&&centres){rail.centres.push(...centres[i-1].clone().lerp(centres[i],from).toArray(),...centres[i-1].clone().lerp(centres[i],to).toArray());rail.sides.push(side===0?0:1);}};
     if(!dashed)append(0,1);
     else{let along=0;while(along<length-1e-8){const phase=(distance+along)%6,remaining=Math.min(length-along,6-phase);if(phase<4){const end=Math.min(along+remaining,along+4-phase);if(end>along)append(along/length,end/length);}along+=Math.max(remaining,1e-6);}}
     distance+=length;
   }
   }stroke(group,segments,tint,width,opacity,rail);
 };
 const line=(group:THREE.Group,points:Coordinate[],depths:number[],tint:string,width:number,dashed=false,opacity=1)=>linePaths(group,[points],depths,tint,width,dashed,opacity);
 const rails=(group:THREE.Group,paths:Coordinate[][],centre:Coordinate[],depths:number[],tint:string,blueprint:boolean)=>{
   // Both rails share each draw call; splitting a track adds no extra line materials.
   linePaths(group,paths,depths,palette.halo,RAIL_HALO_PIXELS,false,.9,centre);
   linePaths(group,paths,depths,tint,RAIL_PIXELS,blueprint,1,centre);
 };
 const fill=(group:THREE.Group,points:Coordinate[],depth:number,tint:string,opacity:number)=>{
   const positions=points.slice(0,-1).map(p=>depthPosition(p,depth)),shape=positions.map(p=>new THREE.Vector2(p.x,p.y));
   const indices=THREE.ShapeUtils.triangulateShape(shape,[]).flat();
   const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions.flatMap(p=>p.toArray()),3));geometry.setIndex(indices);
   const material=new THREE.MeshBasicMaterial({color:tint,opacity,transparent:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});xray(material);
   const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=10;group.add(mesh);
 };
 const platform=(group:THREE.Group,ring:Coordinate[],depth:number,tint:string)=>{
   const materials=[palette.platformTop,palette.platformSide].map(color=>{const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true});xray(material);return material;});
   const geometry=platformGeometry(ring,depth),mesh=new THREE.Mesh(geometry,materials);mesh.frustumCulled=false;mesh.renderOrder=20;group.add(mesh);
   stroke(group,platformEdgePositions(geometry),tint,1.2);
 };
 const arrow=(group:THREE.Group,points:Coordinate[],depths:number[],reverse=false)=>{
   if(points.length<2)return;
   if(points.length===2){const a=points[0],b=points[1];points=[a,[(a[0]+b[0])/2,(a[1]+b[1])/2],b];depths=[depths[0],(depths[0]+depths[1])/2,depths[1]];}
   const step=Math.max(1,Math.floor(points.length/4));
   for(let i=step;i<points.length-1;i+=step){const p=depthPosition(points[i],depths[i]??depths[0]),a=depthPosition(points[i-1],depths[i-1]??depths[0]),b=depthPosition(points[i+1],depths[i+1]??depths[0]);const u=b.sub(a).normalize().multiplyScalar(reverse?-1:1),n=new THREE.Vector3(-u.y,u.x,0);
     const geometry=new THREE.BufferGeometry().setFromPoints([p.clone().addScaledVector(u,-2).addScaledVector(n,1.3),p,p.clone().addScaledVector(u,-2).addScaledVector(n,-1.3)]);
     const material=new THREE.LineBasicMaterial({color:palette.built,transparent:true});xray(material);const object=new THREE.Line(geometry,material);object.frustumCulled=false;object.renderOrder=50;group.add(object);
   }
 };
 const station=(group:THREE.Group,asset:PlacedStation,preview:boolean,out:Label[],pick?:MetroPick[])=>{
   const tint=color(asset,view.selectedStation),features=stationFeatures([asset],view.selectedStation,preview).features;
   for(const feature of features){const kind=feature.properties!.kind,g=feature.geometry;
     if(g.type==='Polygon'){const ring=g.coordinates[0] as Coordinate[];if(kind==='platform'){platform(group,ring,asset.depth,tint);pick?.push({id:asset.id,kind:'station',points:ring,depths:ring.map(()=>asset.depth+PLATFORM_HEIGHT_METRES),polygon:true});}else{fill(group,ring,asset.depth,tint,.16);line(group,ring,ring.map(()=>asset.depth),tint,1.2,asset.stage==='blueprint');}if(kind==='envelope')pick?.push({id:asset.id,kind:'station',points:ring,depths:ring.map(()=>asset.depth),polygon:true});
       if(kind==='envelope')line(reference,ring,ring.map(()=>0),tint,1.2,true,.7);
     }else if(g.type==='LineString'){const points=g.coordinates as Coordinate[];if(kind==='track'){const paths=railPaths(points);rails(group,paths,points,points.map(()=>asset.depth),tint,asset.stage==='blueprint');for(const path of [points,...paths])pick?.push({id:asset.id,kind:'station',points:path,depths:path.map(()=>asset.depth),polygon:false});}else if(kind==='direction')arrow(group,points,points.map(()=>asset.depth));}
     else if(g.type==='Point'&&kind==='label'){out.push({position:g.coordinates as Coordinate,depth:asset.layout==='island'?asset.depth+PLATFORM_HEIGHT_METRES:asset.depth,text:'',kind:'marker',key:asset.id,preview,color:tint});out.push({position:g.coordinates as Coordinate,depth:asset.layout==='island'?asset.depth+PLATFORM_HEIGHT_METRES:asset.depth,text:feature.properties!.label,kind:'station',key:asset.id,preview,color:tint});}
   }
 };
 const track=(group:THREE.Group,asset:PlacedTrack,preview:boolean,out:Label[],pick?:MetroPick[])=>{
   const stations=view.ghostStation?[...view.stations,view.ghostStation]:view.stations,g=trackGeometry(asset,stations,view.tracks);if(!g)return;
   const tint=color(asset,view.selectedTrack,asset.stage==='blueprint'&&!checkTrack(asset,stations,view.tracks).valid);
   for(const [i,lane] of g.lanes.entries()){
     const paths=railPaths(lane,asset.curve?g.startTangent:undefined,asset.curve?g.endTangent:undefined);
     rails(group,paths,lane,g.depths,tint,asset.stage==='blueprint');arrow(group,lane,g.depths,asset.mode==='parallel'?i===0:!trackForward(asset,view.tracks));
     for(const points of [lane,...paths])pick?.push({id:asset.id,kind:'track',points,depths:g.depths,polygon:false});
   }
   for(const scissors of automaticScissors(asset,stations,view.tracks))for(const path of scissors.paths){rails(group,railPaths(path.points),path.points,path.depths,tint,asset.stage==='blueprint');for(const points of [path.points])pick?.push({id:asset.id,kind:'track',points,depths:path.depths,polygon:false});}
   if(preview||g.startDepth!==g.endDepth){const i=Math.floor(g.centre.length/2);out.push({position:g.centre[i],depth:g.depths[i],text:g.startDepth!==g.endDepth?`${elevationText(g.startDepth)} → ${elevationText(g.endDepth)} m`:'',kind:'track',key:asset.id,length:preview?g.length:undefined,color:tint});}

 };
 const syncLabels=()=>{
   overlay?.replaceChildren();labels=[...baseLabels,...ghostLabels,...view.ports.map(port=>({position:port.position,depth:port.depth,text:'',kind:'port' as const,key:port.key,color:port.key===view.hot?palette.hotPort:('trackId' in port.ref?view.tracks.find(t=>t.id===('trackId' in port.ref?port.ref.trackId:''))?.stage:view.stations.find(s=>s.id===('stationId' in port.ref?port.ref.stationId:''))?.stage)==='blueprint'?palette.blueprint:palette.built}))];
   if(!overlay)return;overlay.hidden=false;
   for(const label of labels){const node=document.createElement('div');node.className=`depth-label depth-${label.kind}`;node.textContent=label.text;node.style.color=label.color;if(label.kind==='port'){node.style.borderColor=label.color;node.classList.toggle('hot',label.key===view.hot);}overlay.append(node);label.node=node;}
 };
 const onScreen=(point:{x:number;y:number},padding=0)=>{const canvas=map.getCanvas();return point.x>=-padding&&point.x<=canvas.clientWidth+padding&&point.y>=-padding&&point.y<=canvas.clientHeight+padding;};
 const hitAt=(point:{x:number;y:number})=>{if(!onScreen(point))return null;const canvas=map.getCanvas();return pickProjectedMetro(camera.projectionMatrix,point,projected,canvas.clientWidth,canvas.clientHeight);};
 const buildingCovered=(point:{x:number;y:number},networkDistance:number)=>{
   if(!map||!onScreen(point)||map.getZoom()<14)return false;const key=`${point.x.toFixed(1)}:${point.y.toFixed(1)}`;let distance=buildingHits.get(key);
   if(distance===undefined){
     const layers=['building-supports-3d','buildings-3d'].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none');
     const canvas=map.getCanvas();distance=Infinity;
     for(const feature of layers.length?map.queryRenderedFeatures([point.x,point.y],{layers}):[]){if(feature.geometry.type!=='Polygon'&&feature.geometry.type!=='MultiPolygon')continue;
       const properties=feature.properties,base=Number(properties.render_min_height??0),top=Number(properties.supportHeight??properties.render_height??10);
       if(Number.isFinite(base)&&Number.isFinite(top))distance=Math.min(distance,buildingDistance(camera.projectionMatrix,point,canvas.clientWidth,canvas.clientHeight,feature.geometry,base,top));
     }
     buildingHits.set(key,distance);
   }
   return buildingHides(distance,networkDistance);
 };
 const occluded=(point:{x:number;y:number},position:Coordinate,depth:number)=>{const distance=clipDistance(camera.projectionMatrix,position,depth);if(buildingCovered(point,distance))return true;const nearest=hitAt(point);return !!nearest&&nearest.distance<distance-distance*1e-5;};
 const project=(position:Coordinate,depth:number)=>map?depthProject(camera.projectionMatrix,position,depth,map.getCanvas().clientWidth,map.getCanvas().clientHeight):null;
 const prepare=(input:Parameters<NonNullable<CustomLayerInterface['render']>>[1])=>{
   camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(depthTransform);buildingHits.clear();
   const canvas=map.getCanvas();railDetail.value=railDetailForZoom(map.getZoom());
   for(const material of lines){material.resolution.set(canvas.clientWidth,canvas.clientHeight);if(material.userData.railLines){const detail=railDetail.value,halo=material.userData.depthMask===false;material.linewidth=halo?1.6+1.6*detail:1+.2*detail;material.opacity=halo ? .15+.75*detail : 1;}}
   if(!camera.projectionMatrix.equals(pickMatrix)||pickSource!==picks||pickWidth!==canvas.clientWidth||pickHeight!==canvas.clientHeight){projected=projectMetroPicks(camera.projectionMatrix,picks,canvas.clientWidth,canvas.clientHeight);pickMatrix.copy(camera.projectionMatrix);pickSource=picks;pickWidth=canvas.clientWidth;pickHeight=canvas.clientHeight;}
 };
 // Snapping is needed only while drawing, not on every map render or camera movement.
 const prepareSnap=()=>{
   const canvas=map.getCanvas();
   if(!camera.projectionMatrix.equals(snapMatrix)||snapStations!==view.stations||snapTracks!==view.tracks||snapWidth!==canvas.clientWidth||snapHeight!==canvas.clientHeight){snapPaths=projectTrackSnapPaths(camera.projectionMatrix,view.stations,view.tracks,canvas.clientWidth,canvas.clientHeight);snapMatrix.copy(camera.projectionMatrix);snapStations=view.stations;snapTracks=view.tracks;snapWidth=canvas.clientWidth;snapHeight=canvas.clientHeight;}
 };
 const drawNetwork=(underground:boolean)=>{
   elevationPass.value=underground?-1:1;renderer.resetState();if(underground)renderer.clearDepth();depthBias.value=0;
   const materials:THREE.Material[]=[];scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line){for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.push(material);material.colorWrite=false;material.depthWrite=material.userData.depthMask!==false;}}});
   renderer.render(scene,camera);
   for(const material of materials){material.colorWrite=true;material.depthWrite=false;}
   depthBias.value=0.0000002;renderer.resetState();renderer.render(scene,camera);
   if(underground){renderer.render(referenceScene,camera);renderer.clearDepth();}renderer.resetState();
 };
 const updateLabels=()=>{
   const hoveredHit=pointer?hitAt(pointer):null;hovered=hoveredHit&&pointer&&!buildingCovered(pointer,hoveredHit.distance)?{id:hoveredHit.id,kind:hoveredHit.kind}:null;
   for(const label of labels){
     const node=label.node;if(!node)continue;
     const visible=(label.kind!=='station'&&label.kind!=='track')||stationLabelVisible(view.stationLabels,hovered?.kind===label.kind?hovered.id:null,label.key!,label.preview);
     if(!visible&&label.length===undefined){node.hidden=true;continue;}
     const p=project(label.position,label.depth);
     // Reject off-screen anchors before querying building silhouettes or other network objects.
     if(!p||!onScreen(p,label.kind==='port'||label.kind==='marker'?8:200)){node.hidden=true;continue;}
     node.hidden=buildingCovered(p,clipDistance(camera.projectionMatrix,label.position,label.depth))||(label.kind==='marker'&&occluded(p,label.position,label.depth));
     if(node.hidden)continue;
     if(label.kind==='track'){const text=trackLabelText(label.length,label.text,visible);if(node.textContent!==text)node.textContent=text;}
     const transform=`translate(${p.x}px,${p.y}px) translate(-50%,${label.kind==='port'||label.kind==='marker'?'-50%':'-110%'})`;if(node.style.transform!==transform)node.style.transform=transform;
   }
 };
 const layer:CustomLayerInterface={id:'flat-metro-depth',type:'custom',renderingMode:'3d',onAdd(activeMap,gl){map=activeMap;renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl});renderer.autoClear=false;overlay=document.createElement('div');overlay.className='depth-overlay';map.getContainer().append(overlay);syncLabels();},render(_gl,input){
   prepare(input);const center=map.getCenter();nearDistance.value=Math.max(1e-6,clipDistance(camera.projectionMatrix,[center.lng,center.lat],0)*.05);drawNetwork(true);
 },onRemove(){dispose(base);dispose(ghost);dispose(reference);dispose(route);overlay?.remove();renderer?.dispose();}};
 const elevatedLayer:CustomLayerInterface={id:'flat-metro-elevated',type:'custom',renderingMode:'3d',render(_gl,input){prepare(input);drawNetwork(false);updateLabels();}};
 return {layer,elevatedLayer,project,platformHit(point:{x:number;y:number}){
   if(!map||!onScreen(point))return null;const canvas=map.getCanvas();let result:{id:string;side:'left'|'right';distance:number}|null=null;
   for(const station of view.stations){const depth=station.depth+PLATFORM_HEIGHT_METRES,position=depthUnproject(camera.projectionMatrix,point,depth,canvas.clientWidth,canvas.clientHeight);if(!position)continue;
     const side=platformSideAt(station,position),distance=clipDistance(camera.projectionMatrix,position,depth);if(!side||distance<=0||buildingCovered(point,distance))continue;
     const nearest=hitAt(point);if(nearest&&nearest.id!==station.id&&nearest.distance<distance*(1-1e-5))continue;
     if(!result||distance<result.distance)result={id:station.id,side,distance};
   }return result;
 },snap(point:{x:number;y:number},mode:TrackMode,origin:Coordinate|null=null){if(!map||!onScreen(point))return null;prepareSnap();return nearestTrackPoint(point,snapPaths,mode,view.stations,view.tracks,origin,port=>{const p=project(port.position,port.depth);if(!p||!onScreen(p))return false;const distance=clipDistance(camera.projectionMatrix,port.position,port.depth),hit=hitAt(p);return !buildingCovered(p,distance)&&(!hit||('trackId' in port.ref&&hit.id===port.ref.trackId)||hit.distance>=distance*(1-1e-5));});},unproject(point:{x:number;y:number},depth:number){return map?depthUnproject(camera.projectionMatrix,point,depth,map.getCanvas().clientWidth,map.getCanvas().clientHeight):null;},hit(point:{x:number;y:number},kind:'station'|'track'){
   if(!map)return null;const hit=hitAt(point);return hit?.kind===kind&&!buildingCovered(point,hit.distance)?hit.id:null;
 },hover(point:{x:number;y:number}|null){pointer=point;const hit=map&&point?hitAt(point):null;const next=hit&&point&&!buildingCovered(point,hit.distance)?hit:null;if(next?.id!==hovered?.id||next?.kind!==hovered?.kind)map?.triggerRepaint();},portVisible(port:StationPort){const point=project(port.position,port.depth);return !!point&&onScreen(point,8)&&!buildingCovered(point,clipDistance(camera.projectionMatrix,port.position,port.depth));}
 ,update(next:View){const rebuild=next.stations!==view.stations||next.tracks!==view.tracks||next.selectedStation!==view.selectedStation||next.selectedTrack!==view.selectedTrack;const ghostChange=rebuild||next.ghostStation!==view.ghostStation||next.ghostTrack!==view.ghostTrack;const routeChange=rebuild||next.lineOverlay!==view.lineOverlay;view=next;
   if(rebuild){dispose(reference);dispose(base);baseLabels=[];picks=[];for(const s of view.stations)station(base,s,false,baseLabels,picks);for(const t of view.tracks)track(base,t,false,baseLabels,picks);}
   if(ghostChange){if(!rebuild){dispose(reference);for(const asset of view.stations){const ring=stationFeatures([asset]).features.find(f=>f.properties?.kind==='envelope');if(ring?.geometry.type==='Polygon')line(reference,ring.geometry.coordinates[0] as Coordinate[],ring.geometry.coordinates[0].map(()=>0),color(asset,view.selectedStation),1.2,true,.7);}}dispose(ghost);ghostLabels=[];if(view.ghostStation)station(ghost,view.ghostStation,true,ghostLabels);if(view.ghostTrack)track(ghost,view.ghostTrack,true,ghostLabels);}
   if(routeChange){dispose(route);for(const overlay of view.lineOverlay){
     for(const path of overlay.paths)line(route,path.points,path.depths.map(depth=>depth+.04),overlay.color,4,false,.95);
     for(const gap of overlay.gaps)line(route,gap.points,gap.depths.map(depth=>depth+.04),palette.gap,1.6,true,.85);
     for(const [index,id] of overlay.stationIds.entries()){const station=view.stations.find(s=>s.id===id);if(!station)continue;const side=overlay.platforms?.[index],features=stationFeatures([station]).features;
       const platforms=features.filter(f=>f.properties?.kind==='platform');const feature=side?(station.layout==='side'?platforms[side==='left'?0:1]:platforms[0]):features.find(f=>f.properties?.kind==='envelope');
       if(feature?.geometry.type==='Polygon'){let ring=feature.geometry.coordinates[0] as Coordinate[];if(side&&station.layout==='island')ring=side==='left'?[ring[0],ring[1]]:[ring[3],ring[2]];line(route,ring,ring.map(()=>station.depth+(side?PLATFORM_HEIGHT_METRES:0)+.04),overlay.color,2,false,.95);}
     }
     for(const object of route.children)object.renderOrder=60;
   }}
   syncLabels();map?.triggerRepaint();
 }};
}
