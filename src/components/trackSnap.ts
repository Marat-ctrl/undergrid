import type { Matrix4 } from 'three';
import { depthProject } from './depthProjection';
import { clipDistance } from './metroPicking';
import { trackGeometry,trackPointPort,type PlacedTrack,type TrackMode,type TrackPortRef,type StationPort } from './trackPlacement';
import { stationLength,type PlacedStation,type Coordinate } from './stationPlacement';

interface SnapPath {track:PlacedTrack;lane:TrackPortRef['lane'];screen:({x:number;y:number}|null)[];distances:number[];lengths:number[];length:number;bounds:[number,number,number,number];}
// Build only when camera or network changes, rather than projecting every rail on every mouse move.
export function projectTrackSnapPaths(matrix:Matrix4,stations:PlacedStation[],tracks:PlacedTrack[],width:number,height:number):SnapPath[]{
 return tracks.flatMap(track=>{const geometry=trackGeometry(track,stations,tracks);if(!geometry)return [];
   const paths=track.mode==='parallel'?[{lane:'pair' as const,points:geometry.centre},{lane:'left' as const,points:geometry.lanes[0]},{lane:'right' as const,points:geometry.lanes[1]}]:[{lane:'single' as const,points:geometry.lanes[0]}];
   return paths.map(({lane,points})=>{const screen=points.map((p,i)=>depthProject(matrix,p,geometry.depths[i],width,height)),bounds:[number,number,number,number]=[Infinity,Infinity,-Infinity,-Infinity];
     for(const p of screen)if(p){bounds[0]=Math.min(bounds[0],p.x);bounds[1]=Math.min(bounds[1],p.y);bounds[2]=Math.max(bounds[2],p.x);bounds[3]=Math.max(bounds[3],p.y);}
     return {track,lane,screen,bounds,distances:points.map((p,i)=>clipDistance(matrix,p,geometry.depths[i])),lengths:geometry.lengths,length:geometry.length};
   });
 });
}
export function nearestTrackPoint(point:{x:number;y:number},paths:SnapPath[],mode:TrackMode,stations:PlacedStation[],tracks:PlacedTrack[],origin:Coordinate|null=null,visible:(port:StationPort)=>boolean=()=>true):StationPort|null{
 const candidates:{path:SnapPath;at:number;pixels:number;cameraDistance:number}[]=[];
 for(const path of paths){
   // A paired connection may be picked on either visible rail, even when zoomed so
   // close that its centreline is more than the snap tolerance away from the rail.
   if(mode==='parallel'?path.track.mode!=='parallel':path.lane==='pair')continue;
   const {bounds,screen}=path;if(point.x<bounds[0]-12||point.x>bounds[2]+12||point.y<bounds[1]-12||point.y>bounds[3]+12)continue;
   let best:{at:number;pixels:number;cameraDistance:number}|null=null;
   for(let i=1;i<screen.length;i++){
     const a=screen[i-1],b=screen[i];if(!a||!b)continue;
     const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1))),pixels=Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
     if(pixels>12||best&&pixels>best.pixels)continue;
     // Screen interpolation is perspective nonlinear; recover the physical fraction using clip W.
     const denominator=(1-t)/path.distances[i-1]+t/path.distances[i],fraction=(t/path.distances[i])/denominator;
     const at=(path.lengths[i-1]+(path.lengths[i]-path.lengths[i-1])*fraction)/path.length;
     best={at,pixels,cameraDistance:1/denominator};
   }
   if(best)candidates.push({path,...best});
 }
 candidates.sort((a,b)=>Math.abs(a.pixels-b.pixels)>.5?a.pixels-b.pixels:a.cameraDistance-b.cameraDistance);
 for(const candidate of candidates){const {path,at}=candidate,port=trackPointPort(path.track,{trackId:path.track.id,at,lane:mode==='parallel'?'pair':path.lane,direction:1},stations,tracks);
   if(port&&(!origin||stationLength(origin,port.position)>=10)&&visible(port))return port;
 }
 return null;
}
