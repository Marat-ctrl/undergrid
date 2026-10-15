import { automaticScissors } from './automaticScissors';
import { MercatorCoordinate } from 'maplibre-gl';
import { stationLength,type Coordinate,type PlacedStation } from './stationPlacement';
import { isPortRef,isTrackPointRef,isTrackReference,resolveEndpoint,stationPort,trackForward,trackGeometry,type PlacedTrack } from './trackPlacement';
import type { RailGeometry } from './railGeometry';

export type PlatformSide='left'|'right';
export interface MetroLine {id:string;name:string;color:string;stationIds:string[];platforms?:PlatformSide[];}
export function platformName(side:PlatformSide){return side==='right'?'Platform 2 · start → end':'Platform 1 · end → start';}
export const MAX_LINES=16,MAX_LINE_STOPS=32;
export const LINE_COLORS=['#568674','#bc8158','#6b8ba5','#9b789d','#bd9d4c','#b5615b'];
export interface LinePath {points:Coordinate[];depths:number[];}
export interface LineGap {from:string;to:string;path:LinePath;}
export interface LineRoute {ready:boolean;metres:number;paths:LinePath[];gaps:LineGap[];issue:string;platforms?:PlatformSide[];}
export interface LineOverlay {color:string;paths:LinePath[];gaps:LinePath[];stationIds:string[];platforms?:PlatformSide[];}
type Lane='left'|'right'|'single';
interface Node {position:Coordinate;depth:number;stationId?:string;}
interface Edge extends LinePath {to:string;metres:number;}
export interface LineNetwork {nodes:Map<string,Node>;edges:Map<string,Edge[]>;stops:Map<string,string[]>;stations:PlacedStation[];}
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=80;
export function validLineStops(ids:unknown):ids is string[]{
 if(!Array.isArray(ids)||ids.length<2||ids.length>MAX_LINE_STOPS||!ids.every(validId))return false;
 const open=ids.length>2&&ids[0]===ids.at(-1)?ids.slice(0,-1):ids;
 return new Set(open).size===open.length;
}
// Missing stations are retained as broken lines after demolition, rather than invalidating a save.
export function isMetroLineList(value:unknown):value is MetroLine[]{return Array.isArray(value)&&value.length<=MAX_LINES&&value.every(line=>line&&typeof line==='object'&&validId(line.id)&&typeof line.name==='string'&&line.name.trim().length>0&&line.name.length<=40&&!/[\u0000-\u001f\u007f]/.test(line.name)&&typeof line.color==='string'&&/^#[0-9a-f]{6}$/i.test(line.color)&&validLineStops(line.stationIds)&&(line.platforms===undefined||Array.isArray(line.platforms)&&line.platforms.length===line.stationIds.length&&line.platforms.every((side:unknown)=>side==='left'||side==='right')))&&new Set(value.map(line=>line.id)).size===value.length;}
const trackNode=(id:string,lane:Lane,at:number)=>`t:${id}:${lane}:${at}`;
const stopNode=(id:string,lane:Lane,at:number)=>`s:${id}:${lane}:${at}`;
const lerpPoint=(a:Coordinate,b:Coordinate,t:number):Coordinate=>{const p=MercatorCoordinate.fromLngLat(a),q=MercatorCoordinate.fromLngLat(b),c=new MercatorCoordinate(p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t).toLngLat();return [c.lng,c.lat];};
function sample(g:RailGeometry,path:Coordinate[],at:number){const distance=at*g.length;let i=1;while(i<g.lengths.length-1&&g.lengths[i]<distance)i++;const t=(distance-g.lengths[i-1])/(g.lengths[i]-g.lengths[i-1]);return {position:lerpPoint(path[i-1],path[i],t),depth:g.depths[i-1]+(g.depths[i]-g.depths[i-1])*t};}
function slice(g:RailGeometry,path:Coordinate[],from:number,to:number):LinePath{
 const a=sample(g,path,from),b=sample(g,path,to),points:Coordinate[]=[a.position],depths=[a.depth];
 for(let i=1;i<g.lengths.length-1;i++)if(g.lengths[i]>from*g.length&&g.lengths[i]<to*g.length){points.push(path[i]);depths.push(g.depths[i]);}
 points.push(b.position);depths.push(b.depth);return {points,depths};
}
export function buildLineNetwork(stations:PlacedStation[],tracks:PlacedTrack[]):LineNetwork{
 const nodes=new Map<string,Node>(),edges=new Map<string,Edge[]>(),stops=new Map<string,string[]>();
 const built=tracks.filter(t=>t.stage==='constructed'),geometries=new Map(built.flatMap(track=>{const g=trackGeometry(track,stations,tracks);return g?[[track.id,g] as const]:[];}));
 const switches=new Map(built.map(track=>[track.id,automaticScissors(track,stations,tracks)]));
 const reversibleStations=new Set([...switches.values()].flat().map(s=>s.stationId));
 const cuts=new Map(built.map(track=>[track.id,new Set([0,1])]));
 for(const [id,list] of switches)for(const s of list){cuts.get(id)!.add(s.near);cuts.get(id)!.add(s.far);}
 for(const track of built)for(const end of [track.start,track.end])if(isTrackPointRef(end))cuts.get(end.trackId)?.add(end.at);
 const connect=(from:string,to:string,metres:number,path:LinePath)=>{if(nodes.has(from)&&nodes.has(to)){const list=edges.get(from)??[];list.push({to,metres,...path});edges.set(from,list);}};
 const passage=(from:string,to:string,metres:number,path:LinePath,forward:boolean)=>{if(forward)connect(from,to,metres,path);else connect(to,from,metres,{points:[...path.points].reverse(),depths:[...path.depths].reverse()});};
 for(const station of stations.filter(s=>s.stage==='constructed'&&s.kind!=='depot')){
   const midpointNodes:string[]=[];
   for(const lane of ['left','right'] as const){const a=stationPort(station,'start',lane),b=stationPort(station,'end',lane),positions=[a.position,lerpPoint(a.position,b.position,.5),b.position];
     for(const [i,at] of [0,.5,1].entries()){const key=stopNode(station.id,lane,at);nodes.set(key,{position:positions[i],depth:station.depth,...(at===.5?{stationId:station.id}:{})});if(at===.5)midpointNodes.push(key);}
     for(let i=0;i<2;i++){const path={points:positions.slice(i,i+2),depths:[station.depth,station.depth]};if(reversibleStations.has(station.id))passage(stopNode(station.id,lane,i/2),stopNode(station.id,lane,(i+1)/2),stationLength(station.start,station.end)/2,path,lane!=='right');passage(stopNode(station.id,lane,i/2),stopNode(station.id,lane,(i+1)/2),stationLength(station.start,station.end)/2,{points:positions.slice(i,i+2),depths:[station.depth,station.depth]},lane==='right');}
   }stops.set(station.id,midpointNodes);
 }
 for(const track of built){const g=geometries.get(track.id);if(!g)continue;const locations=[...cuts.get(track.id)!].sort((a,b)=>a-b);
   for(const [i,path] of g.lanes.entries()){const lane:Lane=track.mode==='single'?'single':i===0?'left':'right';
     for(const at of locations)nodes.set(trackNode(track.id,lane,at),sample(g,path,at));
     for(let j=1;j<locations.length;j++){
       const from=locations[j-1],to=locations[j],forward=lane==='single'?trackForward(track,tracks):lane==='right',part=slice(g,path,from,to),metres=g.length*(to-from);
       passage(trackNode(track.id,lane,from),trackNode(track.id,lane,to),metres,part,forward);
       // A platform approach is reversible only as far as its scissors; main tracks keep their arrows.
       if(switches.get(track.id)!.some(s=>s.mouth===0?to<=s.far:from>=s.near))passage(trackNode(track.id,lane,from),trackNode(track.id,lane,to),metres,part,!forward);
     }
   }
 }
 for(const track of built)for(const s of switches.get(track.id)??[])for(const path of s.paths){
   const from=trackNode(track.id,path.from,s.near),to=trackNode(track.id,path.to,s.far),metres=path.points.slice(1).reduce((sum,p,i)=>sum+stationLength(path.points[i],p),0);
   connect(from,to,metres,path);connect(to,from,metres,{points:[...path.points].reverse(),depths:[...path.depths].reverse()});
 }
 // Only explicit saved connections join nodes. Geographic crossings and coincident free ends do not.
 for(const track of built){const g=geometries.get(track.id);if(!g)continue;
   for(const endName of ['start','end'] as const){const ref=track[endName],at=endName==='start'?0:1,flows=new Map<string,boolean>();let targets:string[]=[];
     if(isPortRef(ref)){const station=stations.find(s=>s.id===ref.stationId&&s.stage==='constructed'&&s.kind!=='depot');if(station)targets=(ref.lane==='pair'?['left','right'] as const:[ref.lane]).map(lane=>{const key=stopNode(station.id,lane,ref.end==='start'?0:1);flows.set(key,lane==='right');return key;});}
     else if(isTrackReference(ref)){const parent=built.find(t=>t.id===ref.trackId),location=isTrackPointRef(ref)?ref.at:ref.end==='start'?0:1;if(parent)targets=(ref.lane==='pair'?['left','right'] as const:[ref.lane]).map(lane=>{const key=trackNode(parent.id,lane,location);flows.set(key,lane==='single'?trackForward(parent,tracks):lane==='right');return key;});}
     if(!targets.length)continue;
     const resolved=resolveEndpoint(ref,stations,tracks),outward=resolved?.outward;if(!outward)continue;
     const outwardToForward=isTrackPointRef(ref)?ref.direction:(isPortRef(ref)||isTrackReference(ref))&&ref.end==='start'?-1:1;
     for(const [i] of g.lanes.entries()){const key=trackNode(track.id,track.mode==='single'?'single':i===0?'left':'right',at),source=nodes.get(key);if(!source)continue;
       const target=targets.filter(id=>nodes.has(id)).sort((a,b)=>stationLength(source.position,nodes.get(a)!.position)-stationLength(source.position,nodes.get(b)!.position))[0];
       if(target){const tangent=at===0?g.startTangent:g.endTangent,forward=track.mode==='single'?trackForward(track,tracks):i===1;
         const aligned=(tangent[0]*outward[0]+tangent[1]*outward[1])*(forward?1:-1)*(flows.get(target)?1:-1)*outwardToForward>0;
         if(aligned){connect(key,target,0,{points:[],depths:[]});connect(target,key,0,{points:[],depths:[]});}
       }
     }
   }
 }
 return {nodes,edges,stops,stations};
}
interface SearchState {node:string;stop:number;cost:number;key:string;}
// A small binary heap keeps graph search independent of map rendering and camera frames.
class Queue {
 items:SearchState[]=[];
 push(value:SearchState){let i=this.items.length;this.items.push(value);while(i>0){const parent=(i-1)>>1;if(this.items[parent].cost<=value.cost)break;this.items[i]=this.items[parent];i=parent;}this.items[i]=value;}
 pop(){const first=this.items[0],last=this.items.pop();if(!this.items.length)return first;let i=0;while(i*2+1<this.items.length){let next=i*2+1;if(next+1<this.items.length&&this.items[next+1].cost<this.items[next].cost)next++;if(this.items[next].cost>=last!.cost)break;this.items[i]=this.items[next];i=next;}this.items[i]=last!;return first;}
}
export function routeMetroLine(network:LineNetwork,stationIds:string[],platforms?:PlatformSide[]):LineRoute{
 const empty={ready:false,metres:0,paths:[],gaps:[]};
 if(stationIds.length<2)return {...empty,issue:'Choose at least two built stations.'};
 if(platforms&&(platforms.length!==stationIds.length||platforms.some(side=>side!=='left'&&side!=='right')))return {...empty,issue:'Choose a platform for each stop.'};
 if(!validLineStops(stationIds))return {...empty,issue:'Use distinct stations, or repeat the first station once to close a loop.'};
 const missing=stationIds.find(id=>!network.stops.has(id));if(missing)return {...empty,issue:'A stop is missing or unbuilt. Edit the stop list to repair this line.'};
 const queue=new Queue(),costs=new Map<string,number>(),previous=new Map<string,{key:string;edge:Edge}>();
 const enqueue=(node:string,stop:number,cost:number,from?:{key:string;edge:Edge})=>{const key=JSON.stringify([node,stop]);if(cost>=(costs.get(key)??Infinity))return;costs.set(key,cost);if(from)previous.set(key,from);queue.push({node,stop,cost,key});};
 const stopNodes=(index:number)=>platforms?[stopNode(stationIds[index],platforms[index],.5)]:network.stops.get(stationIds[index])!;
 for(const node of stopNodes(0))enqueue(node,0,0);
 let best:SearchState|undefined,complete:SearchState|undefined;
 while(queue.items.length){const state=queue.pop()!;if(state.cost!==costs.get(state.key))continue;
   if(!best||state.stop>best.stop)best=state;
   if(state.stop===stationIds.length-1){complete=state;break;}
   for(const edge of network.edges.get(state.node)??[]){const nextStop=stopNodes(state.stop+1).includes(edge.to)?state.stop+1:state.stop;enqueue(edge.to,nextStop,state.cost+edge.metres,{key:state.key,edge});}
 }
 const result=complete??best,paths:LinePath[]=[],chosen:PlatformSide[]=[];let cursor=result?.key;while(cursor&&previous.has(cursor)){const step=previous.get(cursor)!;const [node,index]=JSON.parse(cursor) as [string,number],previousIndex=(JSON.parse(step.key) as [string,number])[1];if(index!==previousIndex)chosen[index]=node===stopNode(stationIds[index],'left',.5)?'left':'right';if(step.edge.points.length)paths.push({points:step.edge.points,depths:step.edge.depths});cursor=step.key;}paths.reverse();if(cursor){const [node]=JSON.parse(cursor) as [string,number];chosen[0]=node===stopNode(stationIds[0],'left',.5)?'left':'right';}
 if(complete)return {ready:true,metres:complete.cost,paths,gaps:[],issue:'',platforms:chosen};
 const index=best?.stop??0,from=network.stations.find(s=>s.id===stationIds[index])!,to=network.stations.find(s=>s.id===stationIds[index+1])!;
 const midpoint=(s:PlacedStation)=>lerpPoint(s.start,s.end,.5);
 return {ready:false,metres:result?.cost??0,paths,gaps:[{from:from.id,to:to.id,path:{points:[midpoint(from),midpoint(to)],depths:[from.depth,to.depth]}}],issue:`No directed path: ${from.name} → ${to.name}. Check the selected platforms, connections and direction arrows.`};
}
