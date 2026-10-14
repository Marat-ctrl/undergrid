import { MIN_STATION_LENGTH,MAX_STATION_LENGTH,stationHalfSpacing } from './constructionDimensions';
import { MercatorCoordinate } from 'maplibre-gl';
import { inCity, type Coordinate, type ConstructionSettings, type PlacedStation } from './stationPlacement';
import { networkPorts, isTrackPortRef, trackForward, type PlacedTrack, type StationPort, type TrackPortRef } from './trackPlacement';
export interface StationAttachment { port:TrackPortRef; lane:'pair'|'left'|'right'; }
// Leave room for the existing 10 m spacing transition before the platform rails.
export const STATION_CONNECTION_LENGTH=12;
export function stationConnectionPorts(stations:PlacedStation[],tracks:PlacedTrack[]):StationPort[]{
 const pairs=networkPorts(stations,tracks,'parallel').filter(p=>isTrackPortRef(p.ref));
 const singles=networkPorts(stations,tracks,'single').filter(p=>isTrackPortRef(p.ref)&&p.ref.lane==='single');
 return [...pairs,...singles];
}
export function connectedStation(port:StationPort,cursor:Coordinate,settings:ConstructionSettings,tracks:PlacedTrack[]):{station:PlacedStation;attachment:StationAttachment}|null{
 if(!isTrackPortRef(port.ref))return null;
 const ref=port.ref;
 const a=MercatorCoordinate.fromLngLat(port.position),b=MercatorCoordinate.fromLngLat(cursor),scale=a.meterInMercatorCoordinateUnits(),[ux,uy]=port.outward;
 const parent=tracks.find(t=>t.id===ref.trackId);if(!parent)return null;
 const forward=trackForward(parent,tracks)===(port.ref.end==='end');
 const lane=port.ref.lane==='pair'?'pair':forward?'right':'left';
 const offset=lane==='pair'?0:lane==='right'?stationHalfSpacing(settings.platforms):-stationHalfSpacing(settings.platforms);
 const length=Math.max(MIN_STATION_LENGTH,Math.min(MAX_STATION_LENGTH,((b.x-a.x)*ux+(b.y-a.y)*uy)/scale-STATION_CONNECTION_LENGTH));
 const position=(distance:number):Coordinate=>{const point=new MercatorCoordinate(a.x+(ux*distance+uy*offset)*scale,a.y+(uy*distance-ux*offset)*scale).toLngLat();return [point.lng,point.lat];};
 const start=position(STATION_CONNECTION_LENGTH),end=position(STATION_CONNECTION_LENGTH+length);
 if(!inCity(start)||!inCity(end))return null;
 return {station:{id:'cursor',name:'Preview',start,end,depth:port.depth,layout:settings.platforms,stage:'blueprint'},attachment:{port:{...port.ref},lane}};
}
export function stationConnector(station:PlacedStation,attachment:StationAttachment):PlacedTrack{
 return {id:'station-connector-cursor',mode:attachment.lane==='pair'?'parallel':'single',stage:'blueprint',curve:'straight',start:{...attachment.port},end:{stationId:station.id,end:'start',lane:attachment.lane}};
}
