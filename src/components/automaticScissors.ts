import { MercatorCoordinate } from 'maplibre-gl';
import { isPortRef,trackGeometry,type PlacedTrack } from './trackPlacement';
import type { Coordinate,PlacedStation } from './stationPlacement';
import { STATION_APPROACH_METRES } from './railGeometry';
import type { RailGeometry } from './railGeometry';

export const SCISSORS_OFFSET_METRES=STATION_APPROACH_METRES+2;
export const MIN_SCISSORS_SECTION_METRES=2*SCISSORS_OFFSET_METRES+31;
export interface Scissors {stationId:string;mouth:0|1;near:number;far:number;paths:{points:Coordinate[];depths:number[];from:'left'|'right';to:'left'|'right'}[];}
export function sampleRail(g:RailGeometry,path:Coordinate[],at:number){
 const distance=at*g.length;let i=1;while(i<g.lengths.length-1&&g.lengths[i]<distance)i++;
 const t=(distance-g.lengths[i-1])/(g.lengths[i]-g.lengths[i-1]),a=MercatorCoordinate.fromLngLat(path[i-1]),b=MercatorCoordinate.fromLngLat(path[i]),p=new MercatorCoordinate(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t).toLngLat();
 return {position:[p.lng,p.lat] as Coordinate,depth:g.depths[i-1]+(g.depths[i]-g.depths[i-1])*t};
}
// Derived from the parent section: saves, Undo and demolition keep the switch with its rails.
export function automaticScissors(track:PlacedTrack,stations:PlacedStation[],tracks:PlacedTrack[]):Scissors[]{
 if(!track.scissors||track.mode!=='parallel')return [];
 const g=trackGeometry(track,stations,tracks);if(!g||g.length<MIN_SCISSORS_SECTION_METRES)return [];
 return (['start','end'] as const).flatMap(end=>{
  const ref=track[end];if(!isPortRef(ref)||ref.lane!=='pair'||!stations.some(s=>s.id===ref.stationId&&s.kind!=='depot'))return [];
  const offset=SCISSORS_OFFSET_METRES,mouth=end==='start'?0:1,span=Math.min(30,(g.length-(2*offset+1))/2),near=end==='start'?offset/g.length:1-(offset+span)/g.length,far=end==='start'?(offset+span)/g.length:1-offset/g.length;
  const paths=(['left','right'] as const).map(from=>{
   const points:Coordinate[]=[],depths:number[]=[];for(let i=0;i<=32;i++){const t=i/32,ease=t*t*t*(10+t*(-15+6*t)),at=near+(far-near)*t,a=sampleRail(g,g.lanes[from==='left'?0:1],at),b=sampleRail(g,g.lanes[from==='left'?1:0],at),p=MercatorCoordinate.fromLngLat(a.position),q=MercatorCoordinate.fromLngLat(b.position),r=new MercatorCoordinate(p.x+(q.x-p.x)*ease,p.y+(q.y-p.y)*ease).toLngLat();points.push([r.lng,r.lat]);depths.push(a.depth);}return {points,depths,from,to:from==='left'?'right' as const:'left' as const};
  });return [{stationId:ref.stationId,mouth:mouth as 0|1,near,far,paths}];
 });
}
