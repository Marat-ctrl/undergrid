import { Matrix4,Ray,Vector2,Vector3,ShapeUtils } from 'three';
import type { Polygon,MultiPolygon } from 'geojson';
import type { Coordinate } from './stationPlacement';
import { depthPosition } from './depthProjection';

// Native map picking supplies only buildings under the pointer. Intersect their roofs and
// walls to compare physical camera distance with an elevated rail, marker or platform.
export function buildingDistance(matrix:Matrix4,point:{x:number;y:number},width:number,height:number,geometry:Polygon|MultiPolygon,base:number,top:number){
 const inverse=matrix.clone().invert(),x=2*point.x/width-1,y=1-2*point.y/height;
 const origin=new Vector3(x,y,-1).applyMatrix4(inverse),far=new Vector3(x,y,1).applyMatrix4(inverse);
 const ray=new Ray(origin,far.sub(origin).normalize()),intersection=new Vector3();let nearest=Infinity;
 const triangle=(a:Vector3,b:Vector3,c:Vector3)=>{if(ray.intersectTriangle(a,b,c,false,intersection)){const e=matrix.elements,w=e[3]*intersection.x+e[7]*intersection.y+e[11]*intersection.z+e[15];if(w>0)nearest=Math.min(nearest,w);}};
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 for(const polygon of polygons){
   const rings=polygon.map(ring=>ring.slice(0,-1).map(p=>p as Coordinate));
   if(!rings[0]?.length)continue;
   const roof=rings.map(ring=>ring.map(p=>depthPosition(p,top))),flat=roof.flat();
   for(const face of ShapeUtils.triangulateShape(roof[0].map(p=>new Vector2(p.x,p.y)),roof.slice(1).map(r=>r.map(p=>new Vector2(p.x,p.y)))))triangle(flat[face[0]],flat[face[1]],flat[face[2]]);
   for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],ab=depthPosition(a,base),bb=depthPosition(b,base),at=depthPosition(a,top),bt=depthPosition(b,top);triangle(ab,bb,bt);triangle(ab,bt,at);}
 }
 return nearest;
}
export function buildingHides(distance:number,networkDistance:number){return Number.isFinite(distance)&&distance<networkDistance*(1-1e-5);}
