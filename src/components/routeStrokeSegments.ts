import { depthPosition } from './depthProjection';
import type { LinePath } from './metroLines';

// Disconnected paths share one stroke without joining their endpoints together.
// Keep each vertex's rail elevation for the existing underground/building depth passes.
export function routeStrokeSegments(paths:LinePath[],elevationOffset=0){
 const segments:number[]=[];
 for(const path of paths){
   let previous=path.points.length?depthPosition(path.points[0],(path.depths[0]??0)+elevationOffset):undefined;
   for(let i=1;i<path.points.length;i++){
     const next=depthPosition(path.points[i],(path.depths[i]??path.depths[0]??0)+elevationOffset);
     if(previous!.distanceToSquared(next)>=1e-16)segments.push(previous!.x,previous!.y,previous!.z,next.x,next.y,next.z);
     previous=next;
   }
 }
 return segments;
}
