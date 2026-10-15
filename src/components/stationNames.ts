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
// Read source tiles, including labels hidden by Clean mode. No geocoding request per click.
export function nearbyStationName(position:Coordinate,roads:Feature[],places:Feature[]):string{
 const candidates=(features:Feature[])=>features.flatMap(feature=>{const name=[feature.properties?.['name:en'],feature.properties?.name_en,feature.properties?.['name:latin'],feature.properties?.name].find(value=>typeof value==='string'&&value.trim());if(typeof name!=='string'||!name.trim())return [];return [{name:name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,70),distance:distanceToGeometry(position,feature.geometry)}];}).sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name));
 const streets=candidates(roads),nearStreet=streets[0];
 if(nearStreet&&nearStreet.distance<=200)return nearStreet.name;
 // New York is also the OSM city name, and remains available before named tiles load.
 return [...streets,...candidates(places)].sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name))[0]?.name??'New York';
}
export function uniqueStationName(name:string,stations:PlacedStation[]):string{
 const used=new Set(stations.map(station=>station.name.toLocaleLowerCase()));let result=name,index=2;
 while(used.has(result.toLocaleLowerCase()))result=`${name} ${index++}`;
 return result;
}
