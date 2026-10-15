import { MercatorCoordinate } from 'maplibre-gl';
import { ISLAND_PLATFORM_WIDTH_METRES,PLATFORM_TRACK_OFFSET_METRES,PLATFORM_WIDTH_METRES,stationHalfSpacing } from './constructionDimensions';
import type { Coordinate,PlacedStation } from './stationPlacement';

export interface ScreenPoint {x:number;y:number;}
export function platformAnchors(station:PlacedStation):[Coordinate,Coordinate]{
 const a=MercatorCoordinate.fromLngLat(station.start),b=MercatorCoordinate.fromLngLat(station.end),length=Math.hypot(b.x-a.x,b.y-a.y),scale=a.meterInMercatorCoordinateUnits();
 const offset=station.layout==='island'?ISLAND_PLATFORM_WIDTH_METRES/2:stationHalfSpacing(station.layout)+PLATFORM_TRACK_OFFSET_METRES+PLATFORM_WIDTH_METRES/2;
 return [-1,1].map(side=>{const p=new MercatorCoordinate((a.x+b.x)/2-(b.y-a.y)/length*offset*side*scale,(a.y+b.y)/2+(b.x-a.x)/length*offset*side*scale).toLngLat();return [p.lng,p.lat] as Coordinate;}) as [Coordinate,Coordinate];
}
// Keep 22 px buttons separate at distant zooms and move the pair together at viewport edges.
export function platformChoicePositions(a:ScreenPoint,b:ScreenPoint,width:number,height:number):[ScreenPoint,ScreenPoint]{
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),ux=d>.001?dx/d:1,uy=d>.001?dy/d:0,half=Math.max(24,d/2+14),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
 const points:[ScreenPoint,ScreenPoint]=[{x:cx-ux*half,y:cy-uy*half},{x:cx+ux*half,y:cy+uy*half}];
 const shift=(values:number[],size:number)=>{const min=Math.min(...values),max=Math.max(...values);return min<15?15-min:max>size-15?size-15-max:0;};
 const x=shift(points.map(p=>p.x),width),y=shift(points.map(p=>p.y),height);
 return points.map(p=>({x:p.x+x,y:p.y+y})) as [ScreenPoint,ScreenPoint];
}
