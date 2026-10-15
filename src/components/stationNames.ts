import { MercatorCoordinate } from 'maplibre-gl';
import type { Feature,Geometry,Position } from 'geojson';
import type { Coordinate,PlacedStation } from './stationPlacement';

function distanceToGeometry(point:Coordinate,geometry:Geometry):number{
 const origin=MercatorCoordinate.fromLngLat(point),scale=origin.meterInMercatorCoordinateUnits();
 const xy=(p:Position)=>{const q=MercatorCoordinate.fromLngLat([p[0],p[1]]);return [(q.x-origin.x)/scale,(q.y-origin.y)/scale];};
 const path=(points:Position[])=>{let best=Infinity;const projected=points.map(xy);for(let i=0;i<projected.length;i++){const a=projected[i],b=projected[Math.min(i+1,projected.length-1)],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(a[0]+dx*t,a[1]+dy*t));}return best;};
 switch(geometry.type){
  case 'Point':return path([geometry.coordinates]);
  case 'MultiPoint':return Math.min(...geometry.coordinates.map(p=>path([p])));
  case 'LineString':return path(geometry.coordinates);
  case 'MultiLineString':case 'Polygon':return Math.min(...geometry.coordinates.map(path));
  case 'MultiPolygon':return Math.min(...geometry.coordinates.flatMap(p=>p.map(path)));
  case 'GeometryCollection':return Math.min(...geometry.geometries.map(g=>distanceToGeometry(point,g)));
 }
}
function crossStreetDistance(station:Pick<PlacedStation,'start'|'end'>,geometry:Geometry):number{
 const a=MercatorCoordinate.fromLngLat(station.start),b=MercatorCoordinate.fromLngLat(station.end),scale=a.meterInMercatorCoordinateUnits(),sx=(b.x-a.x)/scale,sy=(b.y-a.y)/scale,length=Math.hypot(sx,sy);
 const paths=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
 let best=Infinity;
 for(const path of paths)for(let i=1;i<path.length;i++){
  const p=MercatorCoordinate.fromLngLat([path[i-1][0],path[i-1][1]]),q=MercatorCoordinate.fromLngLat([path[i][0],path[i][1]]),rx=(q.x-p.x)/scale,ry=(q.y-p.y)/scale,roadLength=Math.hypot(rx,ry);
  if(!roadLength||Math.abs((sx*rx+sy*ry)/(length*roadLength))>.85)continue;
  const dx=(p.x-a.x)/scale,dy=(p.y-a.y)/scale,denominator=sx*ry-sy*rx,t=(dx*ry-dy*rx)/denominator,u=(dx*sy-dy*sx)/denominator;
  if(t>=-20/length&&t<=1+20/length&&u>=-1e-6&&u<=1+1e-6)best=Math.min(best,Math.abs(t-.5)*length);
 }
 return best;
}
// Source tiles include names hidden by Clean mode; existing station names are never rewritten.
export function nearbyStationName(position:Coordinate,roads:Feature[],places:Feature[],station?:Pick<PlacedStation,'start'|'end'>,usedNames:string[]=[]):string{
 const candidates=(features:Feature[])=>features.flatMap(feature=>{const name=[feature.properties?.['name:en'],feature.properties?.name_en,feature.properties?.['name:latin'],feature.properties?.name].find(value=>typeof value==='string'&&value.trim());if(typeof name!=='string'||!name.trim())return [];return [{name:name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,70),distance:distanceToGeometry(position,feature.geometry),feature}];}).sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name));
 const streets=candidates(roads),landmarks=candidates(places),used=new Set(usedNames.map(name=>name.toLocaleLowerCase())),unused=(name:string)=>!used.has(name.toLocaleLowerCase());
 if(station){
  const crossing=streets.map(road=>({...road,crossing:crossStreetDistance(station,road.feature.geometry)})).filter(road=>Number.isFinite(road.crossing)).sort((a,b)=>a.crossing-b.crossing||a.name.localeCompare(b.name));
  const namedCrossing=crossing.find(road=>unused(road.name));if(namedCrossing)return namedCrossing.name;
  const nearby=[...streets.filter(road=>road.distance<=200&&road.name!==streets[0]?.name),...landmarks.filter(place=>place.distance<=500)].find(candidate=>unused(candidate.name));if(nearby)return nearby.name;
  // A junction name is preferable to numbering the same avenue when its cross street is reused.
  for(const crossingRoad of crossing){const avenue=streets.find(road=>road.name!==crossingRoad.name);if(avenue){const name=`${avenue.name} / ${crossingRoad.name}`.slice(0,70);if(unused(name))return name;}}
 }
 const nearStreet=streets.find(road=>unused(road.name));if(nearStreet&&nearStreet.distance<=200)return nearStreet.name;
 return [...streets,...landmarks].sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name)).find(candidate=>unused(candidate.name))?.name??'New York';
}
export function uniqueStationName(name:string,stations:PlacedStation[]):string{
 const used=new Set(stations.map(station=>station.name.toLocaleLowerCase()));let result=name,index=2;
 while(used.has(result.toLocaleLowerCase()))result=`${name} ${index++}`;
 return result;
}
