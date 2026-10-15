import { MercatorCoordinate } from 'maplibre-gl';
import { stationHalfSpacing,PLATFORM_TRACK_OFFSET_METRES,PLATFORM_WIDTH_METRES,ISLAND_PLATFORM_WIDTH_METRES } from './constructionDimensions';
import type { Coordinate,PlacedStation } from './stationPlacement';
import type { PlatformSide } from './metroLines';

// World-space picking remains correct after tilt, rotation and elevation unprojection.
export function platformSideAt(station:PlacedStation,position:Coordinate):PlatformSide|null{
 if(station.kind==='depot'||station.stage!=='constructed')return null;
 const a=MercatorCoordinate.fromLngLat(station.start),b=MercatorCoordinate.fromLngLat(station.end),p=MercatorCoordinate.fromLngLat(position),scale=a.meterInMercatorCoordinateUnits(),length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
 const along=((p.x-a.x)*ux+(p.y-a.y)*uy)/scale,lateral=(-(p.x-a.x)*uy+(p.y-a.y)*ux)/scale;
 if(along<5||along>length/scale-5)return null;
 if(station.layout==='island'){if(Math.abs(lateral)<.1||Math.abs(lateral)>ISLAND_PLATFORM_WIDTH_METRES/2)return null;}
 else {const inner=stationHalfSpacing(station.layout)+PLATFORM_TRACK_OFFSET_METRES;if(Math.abs(lateral)<inner||Math.abs(lateral)>inner+PLATFORM_WIDTH_METRES)return null;}
 return lateral<0?'left':'right';
}
