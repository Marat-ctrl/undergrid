import { MercatorCoordinate } from 'maplibre-gl';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { inCity, type Coordinate, type PlacedStation } from './stationPlacement';
export type TrackMode='single'|'parallel';
export interface PortRef { stationId:string; end:'start'|'end'; lane:'pair'|'left'|'right'; }
export type TrackEndpoint=PortRef|{position:Coordinate;depth:number};
export interface PlacedTrack {id:string;mode:TrackMode;stage:'blueprint'|'constructed';start:TrackEndpoint;end:TrackEndpoint;}
export interface StationPort {key:string;ref:PortRef;position:Coordinate;depth:number;outward:[number,number];name:string;}
export const MAX_TRACKS=200;
export function isPortRef(endpoint:TrackEndpoint):endpoint is PortRef{return 'stationId' in endpoint;}
const project=(point:Coordinate)=>MercatorCoordinate.fromLngLat(point);
const coord=(x:number,y:number):Coordinate=>{const p=new MercatorCoordinate(x,y).toLngLat();return [p.lng,p.lat];};
export function stationPort(station:PlacedStation,end:PortRef['end'],lane:PortRef['lane']):StationPort {
 const a=project(station.start),b=project(station.end),d=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/d,uy=(b.y-a.y)/d;
 const base=end==='start'?a:b,scale=project([(station.start[0]+station.end[0])/2,(station.start[1]+station.end[1])/2]).meterInMercatorCoordinateUnits(),offset=lane==='pair'?0:lane==='left'?-5:5;
 const ref:PortRef={stationId:station.id,end,lane};
 return {key:`${station.id}:${end}:${lane}`,ref,position:coord(base.x-uy*offset*scale,base.y+ux*offset*scale),depth:station.depth,outward:[ux*(end==='start'?-1:1),uy*(end==='start'?-1:1)],name:station.name};
}
export function stationPorts(stations:PlacedStation[],mode:TrackMode){return stations.flatMap(station=>(['start','end'] as const).flatMap(end=>(mode==='parallel'?['pair'] as const:['left','right'] as const).map(lane=>stationPort(station,end,lane))));}
export function resolveEndpoint(endpoint:TrackEndpoint,stations:PlacedStation[]){
 if(isPortRef(endpoint)){const station=stations.find(s=>s.id===endpoint.stationId);return station?stationPort(station,endpoint.end,endpoint.lane):null;}
 return {...endpoint,outward:null,name:'Free endpoint',key:'free'};
}
export function trackGeometry(track:PlacedTrack,stations:PlacedStation[]){
 const start=resolveEndpoint(track.start,stations),end=resolveEndpoint(track.end,stations);if(!start||!end)return null;
 const a=project(start.position),b=project(end.position),scale=project([(start.position[0]+end.position[0])/2,(start.position[1]+end.position[1])/2]).meterInMercatorCoordinateUnits();const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),metres=distance/scale;
 if(metres<10||metres>10000)return null;
 const handle=Math.min(distance/3,500*scale),unit:[number,number]=[dx/distance,dy/distance];
 const first=start.outward??unit,last=end.outward??[-unit[0],-unit[1]];
 const controls:[[number,number],[number,number],[number,number],[number,number]]=[[a.x,a.y],[a.x+first[0]*handle,a.y+first[1]*handle],[b.x+last[0]*handle,b.y+last[1]*handle],[b.x,b.y]];
 const points=Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return [u*u*u*controls[0][0]+3*u*u*t*controls[1][0]+3*u*t*t*controls[2][0]+t*t*t*controls[3][0],u*u*u*controls[0][1]+3*u*u*t*controls[1][1]+3*u*t*t*controls[2][1]+t*t*t*controls[3][1]] as [number,number];});
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])/scale);
 const total=lengths.at(-1)!;
 const ease=(d:number)=>{const t=Math.min(1,d/100);return 1-t*t*(3-2*t);};
 const lanes=(track.mode==='single'?[0]:[-1,1]).map(side=>points.map(([x,y],i)=>{
   const before=points[Math.max(0,i-1)],after=points[Math.min(64,i+1)];let vx=after[0]-before[0],vy=after[1]-before[1];
   if(i===0){vx=first[0];vy=first[1];}else if(i===64){vx=-last[0];vy=-last[1];}
   const norm=Math.hypot(vx,vy)||1,offset=side*(2.5+2.5*Math.max(isPortRef(track.start)?ease(lengths[i]):0,isPortRef(track.end)?ease(total-lengths[i]):0))*scale;
   return coord(x-vy/norm*offset,y+vx/norm*offset);
 }));
 if(!lanes.every(lane=>lane.every(inCity)))return null;
 return {lanes,length:total,centre:points.map(([x,y])=>coord(x,y)),depths:lengths.map(d=>{const t=d/total;return start.depth+(end.depth-start.depth)*t*t*(3-2*t);}),startDepth:start.depth,endDepth:end.depth,controls};
}
export function draftTrack(start:TrackEndpoint,end:TrackEndpoint,mode:TrackMode,stations:PlacedStation[]):PlacedTrack|null{
 const track:PlacedTrack={id:'track-cursor',start,end,mode,stage:'blueprint'};return trackGeometry(track,stations)?track:null;
}
function validEndpoint(value:unknown,mode:TrackMode,stations:PlacedStation[]):value is TrackEndpoint{
 if(!value||typeof value!=='object')return false;
 const endpoint=value as TrackEndpoint;
 if(isPortRef(endpoint))return typeof endpoint.stationId==='string'&&['start','end'].includes(endpoint.end)&&(mode==='parallel'?endpoint.lane==='pair':['left','right'].includes(endpoint.lane))&&stations.some(s=>s.id===endpoint.stationId);
 return inCity(endpoint.position)&&Number.isInteger(endpoint.depth)&&endpoint.depth>=-100&&endpoint.depth<=-5;
}
export function isTrackList(value:unknown,stations:PlacedStation[]):value is PlacedTrack[]{
 return Array.isArray(value)&&value.length<=MAX_TRACKS&&value.every((track:PlacedTrack)=>track&&typeof track.id==='string'&&track.id.length>0&&track.id.length<=80&&['single','parallel'].includes(track.mode)&&['blueprint','constructed'].includes(track.stage)&&validEndpoint(track.start,track.mode,stations)&&validEndpoint(track.end,track.mode,stations)&&!!trackGeometry(track,stations)&&[track.start,track.end].every(endpoint=>!isPortRef(endpoint)||track.stage!=='constructed'||stations.find(s=>s.id===endpoint.stationId)?.stage==='constructed'))&&new Set(value.map(track=>track.id)).size===value.length;
}
export function trackUsesStation(track:PlacedTrack,id:string){return [track.start,track.end].some(endpoint=>isPortRef(endpoint)&&endpoint.stationId===id);}
export function trackFeatures(tracks:PlacedTrack[],stations:PlacedStation[],selected:string|null=null,ghost=false):FeatureCollection{
 const features:Feature<Geometry>[]=[];
 for(const track of tracks){const geometry=trackGeometry(track,stations);if(!geometry)continue;const properties={trackId:track.id,stage:ghost?'preview':track.stage,selected:track.id===selected,depth:`−${Math.abs(geometry.startDepth)} → −${Math.abs(geometry.endDepth)} m`};
   for(const lane of geometry.lanes)features.push({type:'Feature',properties:{...properties,kind:'track'},geometry:{type:'LineString',coordinates:lane}});
   features.push({type:'Feature',properties:{...properties,kind:'label',name:ghost?`${Math.round(geometry.length)} m`:''},geometry:{type:'Point',coordinates:geometry.centre[32]}});
 }
 return {type:'FeatureCollection',features};
}
