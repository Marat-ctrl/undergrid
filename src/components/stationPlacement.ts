import { MIN_ELEVATION,MAX_ELEVATION,MIN_STATION_LENGTH,MAX_STATION_LENGTH,PLATFORM_WIDTH_METRES,ISLAND_PLATFORM_WIDTH_METRES,stationHalfSpacing,ROUTE_TRACK_CENTRES_METRES,PLATFORM_TRACK_OFFSET_METRES,DEPOT_PLATFORM_WIDTH_METRES,depotRowOffsets,elevationText } from './constructionDimensions';
import { MercatorCoordinate } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
export type Coordinate=[number,number];
export type StationLayout='side'|'island';
export interface ConstructionSettings { tool:'station'|'track'|'depot'|'select'; platforms:StationLayout; tracks:'single'|'parallel'; depth:number;capacity:number; }
export const DEFAULT_CONSTRUCTION:ConstructionSettings={tool:'station',platforms:'side',tracks:'parallel',depth:-10,capacity:10};
export interface PlacedStation { id:string; name:string; start:Coordinate; end:Coordinate; depth:number; layout:StationLayout; stage:'blueprint'|'constructed';kind?:'depot';capacity?:number; }
export const MAX_STATIONS=200;
export function inCity(point:unknown):point is Coordinate{return Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=-74.32&&point[0]<=-73.65&&point[1]>=40.47&&point[1]<=40.98;}
export function stationLength(start:Coordinate,end:Coordinate){const a=MercatorCoordinate.fromLngLat(start),b=MercatorCoordinate.fromLngLat(end);return Math.hypot(b.x-a.x,b.y-a.y)/MercatorCoordinate.fromLngLat([(start[0]+end[0])/2,(start[1]+end[1])/2]).meterInMercatorCoordinateUnits();}
export function stretchedStation(start:Coordinate,cursor:Coordinate,settings:ConstructionSettings):PlacedStation|null {
 const a=MercatorCoordinate.fromLngLat(start),b=MercatorCoordinate.fromLngLat(cursor),scale=a.meterInMercatorCoordinateUnits();const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);const length=Math.max(MIN_STATION_LENGTH,Math.min(MAX_STATION_LENGTH,distance/scale));
 const point=new MercatorCoordinate(a.x+(distance?dx/distance:1)*length*scale,a.y+(distance?dy/distance:0)*length*scale).toLngLat();const end:Coordinate=[point.lng,point.lat];
 if(!inCity(start)||!inCity(end))return null;
 return {id:'cursor',name:'Preview',start:[...start],end,depth:settings.depth,layout:settings.platforms,stage:'blueprint'};
}
export function stretchedDepot(start:Coordinate,cursor:Coordinate,settings:ConstructionSettings):PlacedStation|null{
 const a=MercatorCoordinate.fromLngLat(start),b=MercatorCoordinate.fromLngLat(cursor),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),scale=a.meterInMercatorCoordinateUnits();
 const point=new MercatorCoordinate(a.x+(d?dx/d:1)*300*scale,a.y+(d?dy/d:0)*300*scale).toLngLat();
 const depot:PlacedStation={id:'cursor',name:'Depot',start:[...start],end:[point.lng,point.lat],depth:settings.depth,layout:'side',stage:'blueprint',kind:'depot',capacity:settings.capacity??10};
 return inCity(start)&&isStation(depot)?depot:null;
}
export function isStation(value:unknown):value is PlacedStation {
 if(!value||typeof value!=='object')return false;const station=value as PlacedStation;
 if(typeof station.id!=='string'||!station.id.length||station.id.length>80||typeof station.name!=='string'||!station.name.trim()||station.name.length>80||!inCity(station.start)||!inCity(station.end)||!Number.isInteger(station.depth)||station.depth < MIN_ELEVATION||station.depth > MAX_ELEVATION||!['side','island'].includes(station.layout)||!['blueprint','constructed'].includes(station.stage))return false;
 if(station.kind!==undefined&&station.kind!=='depot')return false;
 const length=stationLength(station.start,station.end);
 if(station.kind==='depot'){
   if(!Number.isInteger(station.capacity)||station.capacity!<5||station.capacity!>30||station.layout!=='side'||length<299.8||length>300.2)return false;
   return stationFeatures([station]).features.every(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.every(ring=>ring.every(inCity)):f.geometry.type==='LineString'?f.geometry.coordinates.every(inCity):f.geometry.type==='Point'&&inCity(f.geometry.coordinates));
 }
 return station.capacity===undefined&&length>=MIN_STATION_LENGTH-.2&&length<=MAX_STATION_LENGTH+.2;
}
export function isStationList(value:unknown):value is PlacedStation[]{return Array.isArray(value)&&value.length<=MAX_STATIONS&&value.every(isStation)&&new Set(value.map(station=>station.id)).size===value.length;}
export function stationFeatures(stations:PlacedStation[],selected:string|null=null,ghost=false):FeatureCollection {
 const features:Feature<Geometry>[]=[];
 for(const station of stations){
   const a=MercatorCoordinate.fromLngLat(station.start),b=MercatorCoordinate.fromLngLat(station.end),origin=new MercatorCoordinate((a.x+b.x)/2,(a.y+b.y)/2);const scale=origin.meterInMercatorCoordinateUnits();const distance=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/distance,uy=(b.y-a.y)/distance,length=distance/scale;
   const position=(x:number,y:number):Position=>{const p=new MercatorCoordinate(origin.x+(x*ux-y*uy)*scale,origin.y+(x*uy+y*ux)*scale).toLngLat();return [p.lng,p.lat];};
   const props={stationId:station.id,stage:ghost?'preview':station.stage,selected:station.id===selected,name:station.name,depth:`${elevationText(station.depth)} m`,length:Math.round(length)};
   const polygon=(kind:string,x1:number,x2:number,y1:number,y2:number)=>features.push({type:'Feature',properties:{...props,kind},geometry:{type:'Polygon',coordinates:[[position(x1,y1),position(x2,y1),position(x2,y2),position(x1,y2),position(x1,y1)]]}});
   if(station.kind==='depot'){
     const capacity=station.capacity!,rows=depotRowOffsets(capacity),inletSpacing=ROUTE_TRACK_CENTRES_METRES/2,throat=-length/2;
     polygon('envelope',throat+40,length/2+5,rows[0]-2,rows.at(-1)!+(capacity%2?PLATFORM_TRACK_OFFSET_METRES+DEPOT_PLATFORM_WIDTH_METRES+2:2));
     for(let i=0;i<capacity;i++){
       const offset=rows[i],inlet=offset<0?-inletSpacing:inletSpacing;
       // Zero first/second lateral derivatives make both joins tangent to the straight rails.
       const fan=Array.from({length:33},(_,j)=>{const t=j/32,s=t*t*t*(10+t*(-15+6*t));return position(throat+20+60*t,inlet+(offset-inlet)*s);});
       features.push({type:'Feature',properties:{...props,kind:'track'},geometry:{type:'LineString',coordinates:[position(throat,inlet),...fan,position(length/2-10,offset)]}});
     }
     // A service deck between each pair serves both tracks; an odd last track has its own deck.
     for(let i=0;i<capacity;i+=2){const inner=rows[i]+PLATFORM_TRACK_OFFSET_METRES;polygon('platform',throat+85,length/2-15,inner,inner+DEPOT_PLATFORM_WIDTH_METRES);}
     for(const offset of [-inletSpacing,inletSpacing]){const coordinates=[position(throat,offset),position(throat+20,offset)];features.push({type:'Feature',properties:{...props,kind:'direction'},geometry:{type:'LineString',coordinates:offset<0?[...coordinates].reverse():coordinates}});}
     const label=`${ghost?'Depot':station.name}\n${capacity} train sets\n${elevationText(station.depth)} m`;
     features.push({type:'Feature',properties:{...props,kind:'label',label},geometry:{type:'Point',coordinates:position(30,0)}});
     continue;
   }

   if(station.layout==='side'){
     const platformInner=stationHalfSpacing(station.layout)+PLATFORM_TRACK_OFFSET_METRES,platformOuter=platformInner+PLATFORM_WIDTH_METRES,margin=2,platformStart=-length/2+5,platformEnd=length/2-5;
     polygon('envelope',platformStart-margin,platformEnd+margin,-platformOuter-margin,platformOuter+margin);
     for(const side of [-1,1])polygon('platform',platformStart,platformEnd,side<0?-platformOuter:platformInner,side<0?-platformInner:platformOuter);
   }else{
     const margin=3,platformHalfWidth=ISLAND_PLATFORM_WIDTH_METRES/2;
     polygon('envelope',-length/2+5-margin,length/2-5+margin,-platformHalfWidth-margin,platformHalfWidth+margin);
     polygon('platform',-length/2+5,length/2-5,-platformHalfWidth,platformHalfWidth);
   }
   for(const offset of [-stationHalfSpacing(station.layout),stationHalfSpacing(station.layout)]){
     const coordinates=[position(-length/2,offset),position(length/2,offset)];
     features.push({type:'Feature',properties:{...props,kind:'track'},geometry:{type:'LineString',coordinates}});
     features.push({type:'Feature',properties:{...props,kind:'direction'},geometry:{type:'LineString',coordinates:offset<0?[...coordinates].reverse():coordinates}});
   }
   features.push({type:'Feature',properties:{...props,kind:'label',label:`${ghost?`${Math.round(length)} m`:station.name}\n${props.depth}`,name:ghost?`${Math.round(length)} m`:station.name},geometry:{type:'Point',coordinates:position(0,0)}});
 }
 return {type:'FeatureCollection',features};
}
