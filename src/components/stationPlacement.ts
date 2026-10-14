import { MercatorCoordinate } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
export type Coordinate=[number,number];
export type StationLayout='side'|'island';
export interface ConstructionSettings { tool:'station'|'track'; platforms:StationLayout; tracks:'single'|'parallel'; depth:number; }
export const DEFAULT_CONSTRUCTION:ConstructionSettings={tool:'station',platforms:'side',tracks:'parallel',depth:-25};
export interface PlacedStation { id:string; name:string; start:Coordinate; end:Coordinate; depth:number; layout:StationLayout; stage:'blueprint'|'constructed'; }
export const MAX_STATIONS=200;
export function inCity(point:unknown):point is Coordinate{return Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=-74.32&&point[0]<=-73.65&&point[1]>=40.47&&point[1]<=40.98;}
export function stationLength(start:Coordinate,end:Coordinate){const a=MercatorCoordinate.fromLngLat(start),b=MercatorCoordinate.fromLngLat(end);return Math.hypot(b.x-a.x,b.y-a.y)/MercatorCoordinate.fromLngLat([(start[0]+end[0])/2,(start[1]+end[1])/2]).meterInMercatorCoordinateUnits();}
export function stretchedStation(start:Coordinate,cursor:Coordinate,settings:ConstructionSettings):PlacedStation|null {
 const a=MercatorCoordinate.fromLngLat(start),b=MercatorCoordinate.fromLngLat(cursor),scale=a.meterInMercatorCoordinateUnits();const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);const length=Math.max(100,Math.min(300,distance/scale));
 const point=new MercatorCoordinate(a.x+(distance?dx/distance:1)*length*scale,a.y+(distance?dy/distance:0)*length*scale).toLngLat();const end:Coordinate=[point.lng,point.lat];
 if(!inCity(start)||!inCity(end))return null;
 return {id:'cursor',name:'Preview',start:[...start],end,depth:settings.depth,layout:settings.platforms,stage:'blueprint'};
}
export function isStation(value:unknown):value is PlacedStation {
 if(!value||typeof value!=='object')return false;const station=value as PlacedStation;
 if(typeof station.id!=='string'||!station.id.length||station.id.length>80||typeof station.name!=='string'||!station.name.trim()||station.name.length>80||!inCity(station.start)||!inCity(station.end)||!Number.isInteger(station.depth)||station.depth < -100||station.depth > -5||!['side','island'].includes(station.layout)||!['blueprint','constructed'].includes(station.stage))return false;
 const length=stationLength(station.start,station.end);return length>=99.8&&length<=300.2;
}
export function isStationList(value:unknown):value is PlacedStation[]{return Array.isArray(value)&&value.length<=MAX_STATIONS&&value.every(isStation)&&new Set(value.map(station=>station.id)).size===value.length;}
export function stationFeatures(stations:PlacedStation[],selected:string|null=null,ghost=false):FeatureCollection {
 const features:Feature<Geometry>[]=[];
 for(const station of stations){
   const a=MercatorCoordinate.fromLngLat(station.start),b=MercatorCoordinate.fromLngLat(station.end),origin=new MercatorCoordinate((a.x+b.x)/2,(a.y+b.y)/2);const scale=origin.meterInMercatorCoordinateUnits();const distance=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/distance,uy=(b.y-a.y)/distance,length=distance/scale;
   const position=(x:number,y:number):Position=>{const p=new MercatorCoordinate(origin.x+(x*ux-y*uy)*scale,origin.y+(x*uy+y*ux)*scale).toLngLat();return [p.lng,p.lat];};
   const props={stationId:station.id,stage:ghost?'preview':station.stage,selected:station.id===selected,name:station.name,depth:`−${Math.abs(station.depth)} m`,length:Math.round(length)};
   const polygon=(kind:string,x1:number,x2:number,y1:number,y2:number)=>features.push({type:'Feature',properties:{...props,kind},geometry:{type:'Polygon',coordinates:[[position(x1,y1),position(x2,y1),position(x2,y2),position(x1,y2),position(x1,y1)]]}});
   polygon('envelope',-length/2,length/2,station.layout==='side'?-15:-9,station.layout==='side'?15:9);
   if(station.layout==='island')polygon('platform',-length/2+5,length/2-5,-3.3,3.3);else for(const side of [-1,1])polygon('platform',-length/2+5,length/2-5,side<0?-14.5:6.7,side<0?-6.7:14.5);
   for(const offset of [-5,5])features.push({type:'Feature',properties:{...props,kind:'track'},geometry:{type:'LineString',coordinates:[position(-length/2,offset),position(length/2,offset)]}});
   features.push({type:'Feature',properties:{...props,kind:'label',name:ghost?`${Math.round(length)} m`:station.name},geometry:{type:'Point',coordinates:position(0,0)}});
 }
 return {type:'FeatureCollection',features};
}
