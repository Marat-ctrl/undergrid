import { DEMO_STATION } from './stationModel';
import * as THREE from 'three';
import { MercatorCoordinate, type CustomLayerInterface, type Map } from 'maplibre-gl';
import { demoTrackOffset, demoTunnelHalfWidth, DEMO_RAIL_LOCAL_Z, DEMO_RAIL_RADIUS, railwayOffsetForDepth, type UndergroundView } from './undergroundView';

// A fictional, metre-scale cutaway. Nothing here is an existing NYC tunnel or a constructed asset.
export function createUndergroundScene(initial:UndergroundView) {
 let view=initial;
 let map:Map;
 let renderer:THREE.WebGLRenderer;
 const camera=new THREE.Camera();
 const scene=new THREE.Scene();
 const railway=new THREE.Group();
 const reference=new THREE.Group();
 const entrances=new THREE.Group();
 const origin=MercatorCoordinate.fromLngLat(DEMO_STATION.coords,0);
 const scale=origin.meterInMercatorCoordinateUnits();
 const transform=new THREE.Matrix4().makeTranslation(origin.x,origin.y,origin.z)
   .multiply(new THREE.Matrix4().makeScale(scale,-scale,scale));
 const materials:THREE.Material[]=[];
 const solid=(color:number,opacity=1)=>{
   const material=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthTest:false});
   materials.push(material);return material;
 };
 const concrete=solid(0x789a9c,.65),floor=solid(0x4a646c),platform=solid(0xe5d9ac),rail=solid(0xb0d7d3),accent=solid(0xe6b678);
 const box=(w:number,l:number,h:number,x:number,y:number,z:number,material:THREE.Material,parent=railway)=>{
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,l,h),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 };
 // Station floor, two side platforms, wall sections and columns. The roof is deliberately open.
 box(DEMO_STATION.length,DEMO_STATION.width,1.2,0,0,-3.7,floor);
 for(const stationPlatform of DEMO_STATION.platforms) {
   const side=Math.sign(stationPlatform.offset);
   box(DEMO_STATION.length-10,6,1,0,stationPlatform.offset,-2.3,platform);
   box(145,.5,6,0,side*15,-.5,concrete);
   box(140,.25,.15,0,side*8,-1.72,accent);
   for(let x=-60;x<=60;x+=20)box(.6,.6,5,x,side*12,.3,concrete);
 }
 // One shared two-track bore on each side, widening smoothly into the station.
 const shell=(start:number,end:number)=>{
   const positions:number[]=[],indices:number[]=[];const segments=64,arcSegments=24;
   for(let i=0;i<=segments;i++){
     const x=start+(end-start)*i/segments,w=demoTunnelHalfWidth(x);
     for(const outer of [0,1])for(let j=0;j<=arcSegments;j++){
       const theta=Math.PI+Math.PI*j/arcSegments;
       positions.push(x,(w+outer*.6)*Math.cos(theta),(3.6+outer*.6)*Math.sin(theta));
     }
   }
   const ring=(arcSegments+1)*2;
   const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,a,c,d);
   for(let i=0;i<segments;i++)for(let side=0;side<2;side++)for(let j=0;j<arcSegments;j++){
     const a=i*ring+side*(arcSegments+1)+j;quad(a,a+1,a+ring+1,a+ring);
   }
   for(let i=0;i<segments;i++)for(const j of [0,arcSegments]){
     const a=i*ring+j;quad(a,a+arcSegments+1,a+ring+arcSegments+1,a+ring);
   }
   for(const i of [0,segments])for(let j=0;j<arcSegments;j++){
     const a=i*ring+j;quad(a,a+1,a+arcSegments+2,a+arcSegments+1);
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();railway.add(new THREE.Mesh(geometry,concrete));
 };
 shell(-390,-75);shell(75,390);
 for(const side of [-1,1]){
   for(const offset of [-.72,.72]){
     const points=[];for(let x=-390;x<=390;x+=2)points.push(new THREE.Vector3(x,side*demoTrackOffset(x)+offset,DEMO_RAIL_LOCAL_Z-DEMO_RAIL_RADIUS));
     railway.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),390,DEMO_RAIL_RADIUS,6,false),rail));
   }
   for(let x=-380;x<=380;x+=8){
     const sleeper=box(.28,2.1,.14,x,side*demoTrackOffset(x),-2.65,floor);
     const slope=side*(demoTrackOffset(x+.1)-demoTrackOffset(x-.1))/.2;sleeper.rotation.z=Math.atan(slope);
   }
 }
 // Each entrance is one reusable local model with its own station-relative transform.
 for(const entrance of DEMO_STATION.entrances){
   const group=new THREE.Group();group.name=entrance.id;group.userData={stationId:entrance.stationId,platformId:entrance.platformId};
   group.position.set(...entrance.position,0);group.rotation.z=entrance.rotation;entrances.add(group);
   box(10,5,.25,0,0,.15,floor,group);
   box(10.5,5.5,.4,0,0,3.2,platform,group);
   for(const dx of [-4,4])for(const dy of [-1.8,1.8])box(.2,.2,3,dx,dy,1.6,rail,group);
   for(let step=0;step<6;step++)box(1,3,.3,-2.5+step,0,-step*.3,floor,group);
   box(.25,2,.9,-5.5,0,2.4,accent,group);
 }
 // Surface entrances respect building depth; the cutaway itself intentionally renders through ground.
 entrances.traverse(object=>{if(object instanceof THREE.Mesh){const material=(object.material as THREE.Material).clone();material.depthTest=true;materials.push(material);object.material=material;}});
 const groundMaterial=new THREE.LineDashedMaterial({color:0x446f60,dashSize:4,gapSize:3,transparent:true,opacity:.9,depthTest:false});materials.push(groundMaterial);
 const boundary=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
   new THREE.Vector3(-405,-28,0),new THREE.Vector3(405,-28,0),new THREE.Vector3(405,28,0),new THREE.Vector3(-405,28,0),new THREE.Vector3(-405,-28,0)
 ]),groundMaterial);boundary.computeLineDistances();reference.add(boundary);
 const depthMaterial=new THREE.LineBasicMaterial({color:0xbd8754,depthTest:false});materials.push(depthMaterial);
 const marker=new THREE.Mesh(new THREE.SphereGeometry(2,12,8),accent);marker.position.set(-85,-25,0);reference.add(marker);
 const depthLine=new THREE.Line(new THREE.BufferGeometry(),depthMaterial);reference.add(depthLine);
 const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(-200,-400,600);scene.add(light,new THREE.AmbientLight(0xffffff,2),railway,reference,entrances);
 const sync=()=>{
   railway.position.z=railwayOffsetForDepth(view.depth);
   railway.rotation.z=DEMO_STATION.bearing;entrances.rotation.z=DEMO_STATION.bearing;reference.rotation.z=DEMO_STATION.bearing;
   depthLine.geometry.dispose();depthLine.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-85,-25,0),new THREE.Vector3(-85,-25,-view.depth)]);depthLine.computeLineDistances();
   railway.visible=view.enabled;reference.visible=view.enabled;
 };
 sync();
 const layer:CustomLayerInterface={
   id:'underground-demo',type:'custom',renderingMode:'3d',
   onAdd(activeMap,gl){map=activeMap;renderer=new THREE.WebGLRenderer({canvas:activeMap.getCanvas(),context:gl,antialias:true});renderer.autoClear=false;},
   render(_gl,input){
     camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(transform);
     renderer.resetState();renderer.render(scene,camera);renderer.resetState();
   },
   onRemove(){scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line)object.geometry.dispose();});materials.forEach(material=>material.dispose());renderer?.dispose();}
 };
 return {layer,update(next:UndergroundView){view=next;sync();map?.triggerRepaint();}};
}
