import { MIN_ELEVATION,MAX_ELEVATION,stationHalfSpacing,ROUTE_TRACK_CENTRES_METRES,elevationText } from './constructionDimensions';
import { MercatorCoordinate } from 'maplibre-gl';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { railGeometry,checkRailGeometry,type RailGeometry } from './railGeometry';
export { STATION_APPROACH_METRES,HEAVY_METRO_LIMITS } from './railGeometry';
import { inCity, type Coordinate, type PlacedStation } from './stationPlacement';
export type TrackMode='single'|'parallel';
export type TrackCurve='arc'|'straight';
export interface PortRef { stationId:string; end:'start'|'end'; lane:'pair'|'left'|'right'; }
export interface TrackPortRef { trackId:string; end:'start'|'end'; lane:'pair'|'left'|'right'|'single'; }
// A junction stores its distance fraction along the parent centreline, not a frozen coordinate.
// This keeps it attached through spacing/layout edits without cutting existing track references.
export interface TrackPointRef {trackId:string;at:number;lane:TrackPortRef['lane'];direction:1|-1;}
export type TrackReference=TrackPortRef|TrackPointRef;
export type TrackEndpoint=PortRef|TrackReference|{position:Coordinate;depth:number};
export interface PlacedTrack {id:string;mode:TrackMode;stage:'blueprint'|'constructed';start:TrackEndpoint;end:TrackEndpoint;curve?:TrackCurve;}
export interface StationPort {key:string;ref:PortRef|TrackReference;position:Coordinate;depth:number;outward:[number,number];name:string;halfSpacing?:number;}
export const MAX_TRACKS=200;
export function isPortRef(endpoint:TrackEndpoint):endpoint is PortRef{return 'stationId' in endpoint;}
export function isTrackReference(endpoint:TrackEndpoint):endpoint is TrackReference{return 'trackId' in endpoint;}
export function isTrackPointRef(endpoint:TrackEndpoint):endpoint is TrackPointRef{return isTrackReference(endpoint)&&'at' in endpoint;}
export function isTrackPortRef(endpoint:TrackEndpoint):endpoint is TrackPortRef{return isTrackReference(endpoint)&&!isTrackPointRef(endpoint);}
const project=(point:Coordinate)=>MercatorCoordinate.fromLngLat(point);
const coord=(x:number,y:number):Coordinate=>{const p=new MercatorCoordinate(x,y).toLngLat();return [p.lng,p.lat];};
export function stationPort(station:PlacedStation,end:PortRef['end'],lane:PortRef['lane']):StationPort {
 const a=project(station.start),b=project(station.end),d=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/d,uy=(b.y-a.y)/d;
 const base=end==='start'?a:b,scale=project([(station.start[0]+station.end[0])/2,(station.start[1]+station.end[1])/2]).meterInMercatorCoordinateUnits(),spacing=station.kind==='depot'?ROUTE_TRACK_CENTRES_METRES/2:stationHalfSpacing(station.layout),offset=lane==='pair'?0:lane==='left'?-spacing:spacing;
 const ref:PortRef={stationId:station.id,end,lane};
 return {key:`${station.id}:${end}:${lane}`,ref,position:coord(base.x-uy*offset*scale,base.y+ux*offset*scale),depth:station.depth,halfSpacing:lane==='pair'?spacing:0,outward:[ux*(end==='start'?-1:1),uy*(end==='start'?-1:1)],name:station.name};
}
export function stationPorts(stations:PlacedStation[],mode:TrackMode){return stations.flatMap(station=>(station.kind==='depot'?['start'] as const:['start','end'] as const).flatMap(end=>(mode==='parallel'?['pair'] as const:['left','right'] as const).map(lane=>stationPort(station,end,lane))));}
export function resolveEndpoint(endpoint:TrackEndpoint,stations:PlacedStation[],tracks:PlacedTrack[]=[],visited=new Set<string>()):ResolvedEndpoint|null{
 if(isPortRef(endpoint)){const station=stations.find(s=>s.id===endpoint.stationId);return station?stationPort(station,endpoint.end,endpoint.lane):null;}
 if(isTrackPointRef(endpoint)){const track=tracks.find(t=>t.id===endpoint.trackId);return track?trackPointPort(track,endpoint,stations,tracks,visited):null;}
 if(isTrackPortRef(endpoint)){const track=tracks.find(t=>t.id===endpoint.trackId);return track?trackPort(track,endpoint.end,endpoint.lane,stations,tracks,visited):null;}
 return {...endpoint,outward:null,name:'Free endpoint',key:'free',halfSpacing:ROUTE_TRACK_CENTRES_METRES/2};
}
const geometryCache=new WeakMap<PlacedTrack[],{stations:PlacedStation[];values:Map<PlacedTrack,RailGeometry|null>}>();
interface ResolvedEndpoint {position:Coordinate;depth:number;outward:[number,number]|null;name:string;key:string;halfSpacing?:number;}
export function trackGeometry(track:PlacedTrack,stations:PlacedStation[],tracks:PlacedTrack[]=[],visited=new Set<string>()):RailGeometry|null{
 if(visited.has(track.id))return null;
 let cache=geometryCache.get(tracks);if(!cache||cache.stations!==stations){cache={stations,values:new Map()};geometryCache.set(tracks,cache);}
 const cached=tracks.includes(track);if(cached&&cache.values.has(track))return cache.values.get(track)!;
 const next=new Set(visited);next.add(track.id);
 const start=resolveEndpoint(track.start,stations,tracks,next),end=resolveEndpoint(track.end,stations,tracks,next);if(!start||!end)return null;
 const geometry=railGeometry(start,end,track.mode==='parallel',track.curve!==undefined,track.curve==='straight');
 const result=geometry&&geometry.lanes.every(lane=>lane.every(inCity))?geometry:null;if(cached)cache.values.set(track,result);return result;
}
export function checkTrack(track:PlacedTrack,stations:PlacedStation[],tracks:PlacedTrack[]=[]) {return checkRailGeometry(trackGeometry(track,stations,tracks),track.curve!==undefined);}
export function blueprintErrors(tracks:PlacedTrack[],stations:PlacedStation[]) {return tracks.filter(t=>t.stage==='blueprint').flatMap((track,i)=>checkTrack(track,stations,tracks).issues.map(issue=>`Track ${i+1}: ${issue}`));}
export function draftTrack(start:TrackEndpoint,end:TrackEndpoint,mode:TrackMode,stations:PlacedStation[],tracks:PlacedTrack[]=[],curve:TrackCurve='arc'):PlacedTrack|null{
 const track:PlacedTrack={id:'track-cursor',start,end,mode,stage:'blueprint',curve};return trackGeometry(track,stations,tracks)?track:null;
}
export function straightHeading(start:TrackEndpoint,cursor:Coordinate,stations:PlacedStation[],tracks:PlacedTrack[]=[]):[number,number]|null{
 const origin=resolveEndpoint(start,stations,tracks);if(!origin)return null;if(origin.outward)return origin.outward;
 const a=project(origin.position),b=project(cursor),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);return d>1e-12?[dx/d,dy/d]:null;
}
export function straightPosition(start:TrackEndpoint,cursor:Coordinate,heading:[number,number],stations:PlacedStation[],tracks:PlacedTrack[]=[]):Coordinate|null{
 const origin=resolveEndpoint(start,stations,tracks);if(!origin)return null;
 const a=project(origin.position),b=project(cursor),along=(b.x-a.x)*heading[0]+(b.y-a.y)*heading[1];
 return along>0?coord(a.x+along*heading[0],a.y+along*heading[1]):null;
}
function validEndpoint(value:unknown,mode:TrackMode,stations:PlacedStation[],tracks:PlacedTrack[]):value is TrackEndpoint{
 if(!value||typeof value!=='object')return false;
 const endpoint=value as TrackEndpoint;
 if(isPortRef(endpoint))return typeof endpoint.stationId==='string'&&['start','end'].includes(endpoint.end)&&(mode==='parallel'?endpoint.lane==='pair':['left','right'].includes(endpoint.lane))&&stations.some(s=>s.id===endpoint.stationId&&(s.kind!=='depot'||endpoint.end==='start'));
 if(isTrackReference(endpoint)){const target=tracks.find(t=>t.id===endpoint.trackId),location=isTrackPointRef(endpoint)?Number.isFinite(endpoint.at)&&endpoint.at>=0&&endpoint.at<=1&&[1,-1].includes(endpoint.direction):['start','end'].includes(endpoint.end);return !!target&&location&&(mode==='parallel'?target.mode==='parallel'&&endpoint.lane==='pair':target.mode==='single'?endpoint.lane==='single':['left','right'].includes(endpoint.lane));}
 return inCity(endpoint.position)&&Number.isInteger(endpoint.depth)&&endpoint.depth>=MIN_ELEVATION&&endpoint.depth<=MAX_ELEVATION;
}
export function isTrackList(value:unknown,stations:PlacedStation[]):value is PlacedTrack[]{
 if(!Array.isArray(value)||value.length>MAX_TRACKS||!value.every(t=>t&&typeof t==='object'&&typeof t.id==='string'&&t.id.length>0&&t.id.length<=80&&['single','parallel'].includes(t.mode)&&['blueprint','constructed'].includes(t.stage)&&(t.curve===undefined||t.curve==='arc'||t.curve==='straight')))return false;
 if(new Set(value.map(t=>t.id)).size!==value.length)return false;
 if(!value.every(track=>validEndpoint(track.start,track.mode,stations,value)&&validEndpoint(track.end,track.mode,stations,value)))return false;
 return value.every(track=>!!trackGeometry(track,stations,value)&&[track.start,track.end].every(endpoint=>track.stage!=='constructed'||(isPortRef(endpoint)?stations.find(s=>s.id===endpoint.stationId)?.stage==='constructed':isTrackReference(endpoint)?value.find(t=>t.id===endpoint.trackId)?.stage==='constructed':true)));
}
export function trackUsesStation(track:PlacedTrack,id:string){return [track.start,track.end].some(endpoint=>isPortRef(endpoint)&&endpoint.stationId===id);}
export function trackForward(track:PlacedTrack,network:PlacedTrack[],visited=new Set<string>()):boolean{
 if(visited.has(track.id))return true;const next=new Set(visited);next.add(track.id);
 const outwardFlow=(endpoint:TrackEndpoint):boolean|null=>{
   if(isPortRef(endpoint)){if(endpoint.lane==='pair')return null;return (endpoint.lane==='right')===(endpoint.end==='end');}
   if(isTrackReference(endpoint)){if(endpoint.lane==='pair')return null;const parent=network.find(t=>t.id===endpoint.trackId);if(!parent)return null;
     const forward=parent.mode==='single'?trackForward(parent,network,next):endpoint.lane==='right';return forward===(isTrackPointRef(endpoint)?endpoint.direction===1:endpoint.end==='end');}
   return null;
 };
 const start=outwardFlow(track.start),end=outwardFlow(track.end);
 return start??(end===null?true:!end);
}
export function trackFeatures(tracks:PlacedTrack[],stations:PlacedStation[],selected:string|null=null,ghost=false,network:PlacedTrack[]=tracks):FeatureCollection{
 const features:Feature<Geometry>[]=[];
 for(const track of tracks){const geometry=trackGeometry(track,stations,network);if(!geometry)continue;const check=checkRailGeometry(geometry,track.curve!==undefined);const properties={invalid:(ghost||track.stage==='blueprint')&&!check.valid,trackId:track.id,stage:ghost?'preview':track.stage,selected:track.id===selected,depth:geometry.startDepth===geometry.endDepth?'':`${elevationText(geometry.startDepth)} → ${elevationText(geometry.endDepth)} m`};
   for(const [index,lane] of geometry.lanes.entries()){
     features.push({type:'Feature',properties:{...properties,kind:'track'},geometry:{type:'LineString',coordinates:lane}});
     features.push({type:'Feature',properties:{...properties,kind:'direction'},geometry:{type:'LineString',coordinates:(track.mode==='single'?!trackForward(track,network):index===0)?[...lane].reverse():lane}});
   }
   if(ghost||properties.depth)features.push({type:'Feature',properties:{...properties,kind:'label',name:ghost?`${Math.round(geometry.length)} m`:''},geometry:{type:'Point',coordinates:geometry.centre[Math.floor(geometry.centre.length/2)]}});
 }
 return {type:'FeatureCollection',features};
}

export function trackPort(track:PlacedTrack,end:TrackPortRef['end'],lane:TrackPortRef['lane'],stations:PlacedStation[],tracks:PlacedTrack[],visited=new Set<string>()):StationPort|null{
 const geometry=trackGeometry(track,stations,tracks,visited);if(!geometry)return null;
 const index=end==='start'?0:geometry.centre.length-1;
 const centre=project(geometry.centre[index]),tangent=end==='start'?geometry.startTangent:geometry.endTangent;
 let dx=tangent[0]*(end==='start'?-1:1),dy=tangent[1]*(end==='start'?-1:1);
 if(lane!=='pair'&&track.mode==='parallel'&&track.curve===undefined){const path=geometry.lanes[lane==='right'?1:0];if(!path)return null;const other=project(path[end==='start'?1:index-1]),tip=project(path[index]);dx=tip.x-other.x;dy=tip.y-other.y;}
 const d=Math.hypot(dx,dy);if(!d)return null;
 const position=lane==='pair'?geometry.centre[index]:geometry.lanes[lane==='right'?1:0]?.[index];if(!position)return null;
 const ref:TrackPortRef={trackId:track.id,end,lane};
 const halfSpacing=track.mode==='parallel'?Math.hypot(project(geometry.lanes[0][index]).x-centre.x,project(geometry.lanes[0][index]).y-centre.y)/centre.meterInMercatorCoordinateUnits():0;
 return {key:`track:${track.id}:${end}:${lane}`,ref,position,depth:end==='start'?geometry.startDepth:geometry.endDepth,outward:[dx/d,dy/d],name:'Track endpoint',halfSpacing};
}
export function trackPointPort(track:PlacedTrack,ref:TrackPointRef,stations:PlacedStation[],tracks:PlacedTrack[],visited=new Set<string>()):StationPort|null{
 const g=trackGeometry(track,stations,tracks,visited);if(!g||!Number.isFinite(ref.at)||ref.at<0||ref.at>1)return null;
 const distance=ref.at*g.length;let i=1;while(i<g.lengths.length-1&&g.lengths[i]<distance)i++;
 const fraction=(distance-g.lengths[i-1])/(g.lengths[i]-g.lengths[i-1]);
 const point=(path:Coordinate[])=>{const a=project(path[i-1]),b=project(path[i]);return coord(a.x+(b.x-a.x)*fraction,a.y+(b.y-a.y)*fraction);};
 const path=ref.lane==='pair'?g.centre:g.lanes[ref.lane==='right'?1:0];if(!path)return null;
 const position=point(path),a=project(path[i-1]),b=project(path[i]),d=Math.hypot(b.x-a.x,b.y-a.y);if(!d)return null;
 const halfSpacing=track.mode==='parallel'?stationDistance(point(g.lanes[0]),point(g.centre)):0;
 return {key:`track-point:${track.id}:${ref.at.toFixed(6)}:${ref.lane}`,ref,position,depth:g.depths[i-1]+(g.depths[i]-g.depths[i-1])*fraction,outward:[(b.x-a.x)/d*ref.direction,(b.y-a.y)/d*ref.direction],halfSpacing,name:'Track junction'};
}
function stationDistance(a:Coordinate,b:Coordinate){const p=project(a),q=project(b);return Math.hypot(p.x-q.x,p.y-q.y)/project([(a[0]+b[0])/2,(a[1]+b[1])/2]).meterInMercatorCoordinateUnits();}
export function orientTrackPoint(ref:TrackPointRef,toward:Coordinate,stations:PlacedStation[],tracks:PlacedTrack[]):TrackPointRef{
 const port=resolveEndpoint({...ref,direction:1},stations,tracks);if(!port?.outward)return ref;
 const a=project(port.position),b=project(toward);return {...ref,direction:(b.x-a.x)*port.outward[0]+(b.y-a.y)*port.outward[1]>=0?1:-1};
}
export function networkPorts(stations:PlacedStation[],tracks:PlacedTrack[],mode:TrackMode):StationPort[]{
 const used=new Set(tracks.flatMap(track=>[track.start,track.end].flatMap(endpoint=>isTrackPortRef(endpoint)?[`track:${endpoint.trackId}:${endpoint.end}:${endpoint.lane}`]:[])));
 const ports=tracks.flatMap(track=>(['start','end'] as const).flatMap(end=>{
   const endpoint=track[end];if(isPortRef(endpoint)||isTrackReference(endpoint))return [];
   const lanes=mode==='parallel'?(track.mode==='parallel'?['pair'] as const:[]):track.mode==='single'?['single'] as const:['left','right'] as const;
   return lanes.flatMap(lane=>{const key=`track:${track.id}:${end}:${lane}`,base=`track:${track.id}:${end}:`;
     if(used.has(key)||used.has(base+'pair')||(lane==='pair'&&(used.has(base+'left')||used.has(base+'right'))))return [];
     const port=trackPort(track,end,lane,stations,tracks);return port?[port]:[];
   });
 }));
 const junctions=new Map<string,StationPort>();
 for(const track of tracks)for(const endpoint of [track.start,track.end])if(isTrackPointRef(endpoint)){
   const parent=tracks.find(t=>t.id===endpoint.trackId);if(!parent)continue;
   const lanes=mode==='parallel'?(parent.mode==='parallel'?['pair'] as const:[]):parent.mode==='single'?['single'] as const:['left','right'] as const;
   for(const lane of lanes){const port=trackPointPort(parent,{...endpoint,lane},stations,tracks);if(port)junctions.set(port.key,port);}
 }
 // Station mouths and intermediate junctions remain reusable for further branches.
 return [...stationPorts(stations,mode),...ports,...junctions.values()];
}
export function tracksToRemove(tracks:PlacedTrack[],roots:string[]):Set<string>{
 const removed=new Set(roots);let changed=true;
 while(changed){changed=false;for(const track of tracks)if(!removed.has(track.id)&&[track.start,track.end].some(e=>isTrackReference(e)&&removed.has(e.trackId))){removed.add(track.id);changed=true;}}
 return removed;
}
