import { Vector3 } from 'three';
import { depthPosition } from './depthProjection';
import type { Coordinate } from './stationPlacement';

export interface StrokeStyle {tint:string;width:number;opacity:number;}
interface StrokeBatch extends StrokeStyle {segments:number[];}

// Asset IDs and pick geometry remain separate; only equally styled GPU strokes are joined.
export class NetworkStrokeBatches {
 private batches=new Map<string,StrokeBatch>();
 add(style:StrokeStyle,segments:number[]){
   if(!segments.length)return;
   const key=JSON.stringify([style.tint,style.width,style.opacity]);
   let batch=this.batches.get(key);if(!batch){batch={...style,segments:[]};this.batches.set(key,batch);}
   for(const value of segments)batch.segments.push(value);
 }
 drain(){const batches=[...this.batches.values()];this.clear();return batches;}
 clear(){this.batches.clear();}
}

export function directionArrowSegments(points:Coordinate[],depths:number[],reverse=false){
 if(points.length<2)return [];
 if(points.length===2){const [a,b]=points;points=[a,[(a[0]+b[0])/2,(a[1]+b[1])/2],b];depths=[depths[0],(depths[0]+depths[1])/2,depths[1]];}
 const segments:number[]=[],step=Math.max(1,Math.floor(points.length/4));
 for(let i=step;i<points.length-1;i+=step){
   const p=depthPosition(points[i],depths[i]??depths[0]),a=depthPosition(points[i-1],depths[i-1]??depths[0]),b=depthPosition(points[i+1],depths[i+1]??depths[0]);
   const u=b.sub(a).normalize().multiplyScalar(reverse?-1:1),n=new Vector3(-u.y,u.x,0);
   const left=p.clone().addScaledVector(u,-2).addScaledVector(n,1.3),right=p.clone().addScaledVector(u,-2).addScaledVector(n,-1.3);
   segments.push(left.x,left.y,left.z,p.x,p.y,p.z,p.x,p.y,p.z,right.x,right.y,right.z);
 }
 return segments;
}
