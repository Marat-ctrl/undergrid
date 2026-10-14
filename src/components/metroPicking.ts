import type { Matrix4 } from 'three';
import type { Coordinate } from './stationPlacement';
import { depthPosition,depthProject,depthUnproject } from './depthProjection';
export interface MetroPick {id:string;kind:'station'|'track';points:Coordinate[];depths:number[];polygon:boolean;}
export interface ProjectedMetroPick {pick:MetroPick;points:{x:number;y:number}[];distances:number[];bounds:[number,number,number,number];}
export function clipDistance(matrix:Matrix4,position:Coordinate,depth:number){const p=depthPosition(position,depth),e=matrix.elements;return e[3]*p.x+e[7]*p.y+e[11]*p.z+e[15];}
export function insidePolygon(point:{x:number;y:number},points:{x:number;y:number}[]){
 let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;
}
// Projection is cached once per frame, shared by hover, clicks and port visibility.
export function projectMetroPicks(matrix:Matrix4,picks:MetroPick[],width:number,height:number):ProjectedMetroPick[]{
 return picks.flatMap(pick=>{const projected=pick.points.map((p,i)=>depthProject(matrix,p,pick.depths[i],width,height));if(projected.some(p=>!p))return [];
   const points=projected as {x:number;y:number}[],bounds:[number,number,number,number]=[Infinity,Infinity,-Infinity,-Infinity];
   for(const p of points){bounds[0]=Math.min(bounds[0],p.x);bounds[1]=Math.min(bounds[1],p.y);bounds[2]=Math.max(bounds[2],p.x);bounds[3]=Math.max(bounds[3],p.y);}
   if(bounds[2]<-3||bounds[0]>width+3||bounds[3]<-3||bounds[1]>height+3)return [];
   return [{pick,points,bounds,distances:pick.points.map((p,i)=>clipDistance(matrix,p,pick.depths[i]))}];
 });
}
// The same camera-distance order as the network depth buffer, independent of creation order.
export function pickProjectedMetro(matrix:Matrix4,point:{x:number;y:number},projected:ProjectedMetroPick[],width:number,height:number){
 let closest:{id:string;kind:MetroPick['kind'];distance:number}|null=null;
 const consider=(pick:MetroPick,distance:number)=>{if(distance<=0)return;const tolerance=distance*1e-6;if(!closest||distance<closest.distance-tolerance||(Math.abs(distance-closest.distance)<=tolerance&&pick.kind==='station'&&closest.kind==='track'))closest={id:pick.id,kind:pick.kind,distance};};
 for(const {pick,points,bounds,distances} of projected){
   if(point.x<bounds[0]-3||point.x>bounds[2]+3||point.y<bounds[1]-3||point.y>bounds[3]+3)continue;
   if(pick.polygon){if(insidePolygon(point,points)){const position=depthUnproject(matrix,point,pick.depths[0],width,height);if(position)consider(pick,clipDistance(matrix,position,pick.depths[0]));}}
   else for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy)<=3)consider(pick,1/((1-t)/distances[i-1]+t/distances[i]));}
 }
 return closest as {id:string;kind:MetroPick['kind'];distance:number}|null;
}
export function pickMetro(matrix:Matrix4,point:{x:number;y:number},picks:MetroPick[],width:number,height:number){return pickProjectedMetro(matrix,point,projectMetroPicks(matrix,picks,width,height),width,height);}
export function stationLabelVisible(always:boolean,hovered:string|null,id:string,preview=false){return preview||always||hovered===id;}

export function trackLabelText(length:number|undefined,transition:string,visible:boolean){return [length===undefined?'':`${Math.round(length)} m`,visible?transition:''].filter(Boolean).join('\n');}
