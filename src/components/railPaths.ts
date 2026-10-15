import { MercatorCoordinate } from 'maplibre-gl';
import type { Coordinate } from './stationPlacement';

export const RAIL_GAUGE_METRES=1.5;
// Blend a distant track centre into its two physical rails over a continuous zoom range.
export function railDetailForZoom(zoom:number){const t=Math.max(0,Math.min(1,(zoom-16)/1.5));return t*t*(3-2*t);}
type Direction=[number,number];
const unit=(x:number,y:number):Direction=>{const length=Math.hypot(x,y);return length>1e-14?[x/length,y/length]:[1,0];};

// Display geometry only: connections, directions and gradients still use track centres.
export function railPaths(centre:Coordinate[],startTangent?:Direction,endTangent?:Direction):Coordinate[][]{
 if(centre.length<2)return [];
 const points=centre.map(point=>MercatorCoordinate.fromLngLat(point));
 const offsets=points.map((point,i)=>{
   let before=i-1,after=i+1;
   while(before>=0&&Math.hypot(point.x-points[before].x,point.y-points[before].y)<1e-14)before--;
   while(after<points.length&&Math.hypot(points[after].x-point.x,points[after].y-point.y)<1e-14)after++;
   const incoming=before>=0?unit(point.x-points[before].x,point.y-points[before].y):null;
   const outgoing=after<points.length?unit(points[after].x-point.x,points[after].y-point.y):null;
   const endpoint=i===0?startTangent:i===points.length-1?endTangent:undefined;
   const a=endpoint?unit(...endpoint):incoming??outgoing??[1,0];
   const b=endpoint?unit(...endpoint):outgoing??incoming??[1,0];
   const tangent=unit(a[0]+b[0],a[1]+b[1]),normal:Direction=[-tangent[1],tangent[0]];
   // Miter consecutive segments without spikes at sharp depot fan corners.
   const miter=Math.min(4,1/Math.max(.25,tangent[0]*a[0]+tangent[1]*a[1]));
   const halfGauge=RAIL_GAUGE_METRES/2*point.meterInMercatorCoordinateUnits()*miter;
   return [normal[0]*halfGauge,normal[1]*halfGauge];
 });
 return [-1,1].map(side=>points.map((point,i)=>{const p=new MercatorCoordinate(point.x+side*offsets[i][0],point.y+side*offsets[i][1]).toLngLat();return [p.lng,p.lat] as Coordinate;}));
}
