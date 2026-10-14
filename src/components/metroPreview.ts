import { MercatorCoordinate, type Map, type ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { DEMO_STATION } from './stationModel';

export const METRO_PREVIEW_CENTER=DEMO_STATION.coords;
const SOURCE='metro-preview';
export const METRO_PREVIEW_LAYERS=['metro-preview-envelope','metro-preview-border','metro-preview-platforms','metro-preview-platform-edges','metro-preview-track-halo','metro-preview-tracks','metro-preview-route','metro-preview-dot','metro-preview-label','metro-preview-depth'];
type Point=[number,number];
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
function curve(points:[Point,Point,Point,Point]):Point[]{
 return Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return [u*u*u*points[0][0]+3*u*u*t*points[1][0]+3*u*t*t*points[2][0]+t*t*t*points[3][0],u*u*u*points[0][1]+3*u*u*t*points[1][1]+3*u*t*t*points[2][1]+t*t*t*points[3][1]];});
}
export function previewCentreline():Point[]{
 return [...curve([[-520,-210],[-310,-150],[-205,0],[-75,0]]),...Array.from({length:30},(_,i)=>[lerp(-75,75,(i+1)/30),0] as Point),...curve([[75,0],[205,0],[350,170],[550,240]]).slice(1)];
}
export function previewTrack(points:Point[],side:number):Point[]{
 return points.map(([x,y],i)=>{
   const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy);
   const t=Math.min(1,Math.max(0,(Math.abs(x)-75)/100)),offset=side*(5-2.5*t*t*(3-2*t));
   return [x-dy/length*offset,y+dx/length*offset];
 });
}
export function createMetroPreviewData():FeatureCollection {
 const origin=MercatorCoordinate.fromLngLat(METRO_PREVIEW_CENTER),scale=origin.meterInMercatorCoordinateUnits();
 const position=([x,y]:Point):Position=>{const point=new MercatorCoordinate(origin.x+x*scale,origin.y-y*scale,0).toLngLat();return [point.lng,point.lat];};
 const features:Feature<Geometry>[]=[];
 const polygon=(kind:string,west:number,east:number,south:number,north:number)=>features.push({type:'Feature',properties:{kind},geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]].map(p=>position(p as Point))]}});
 polygon('envelope',-80,80,-17,17);
 for(const platform of DEMO_STATION.platforms)polygon('platform',-70,70,platform.offset-3,platform.offset+3);
 const centre=previewCentreline();
 for(const side of [-1,1])features.push({type:'Feature',properties:{kind:'track',startDepth:-20,stationDepth:-25,endDepth:-35,stage:'preview'},geometry:{type:'LineString',coordinates:previewTrack(centre,side).map(position)}});
 features.push({type:'Feature',properties:{kind:'route',color:'#c88155'},geometry:{type:'LineString',coordinates:centre.map(position)}});
 features.push({type:'Feature',properties:{kind:'station',name:'City Hall · demo',depth:'−25 m'},geometry:{type:'Point',coordinates:position([0,0])}});
 for(const [x,y,depth] of [[...centre[0],-20],[...centre[126],-30],[...centre[centre.length-1],-35]])features.push({type:'Feature',properties:{kind:'depth',depth:`−${Math.abs(depth)} m`},geometry:{type:'Point',coordinates:position([x,y])}});
 return {type:'FeatureCollection',features};
}
export function metroWidthPixels(metres:number,zoom:number){const scale=MercatorCoordinate.fromLngLat(METRO_PREVIEW_CENTER).meterInMercatorCoordinateUnits();return metres*scale*512*2**zoom;}
export function metroLineWidth(metres:number,minimum:number):ExpressionSpecification{
 const stops:(number)[]=[];for(let zoom=10;zoom<=22;zoom++)stops.push(zoom,Math.max(minimum,metroWidthPixels(metres,zoom)));
 return ['interpolate',['exponential',2],['zoom'],...stops] as ExpressionSpecification;
}
export function installMetroPreview(map:Map){
 map.addSource(SOURCE,{type:'geojson',data:createMetroPreviewData()});
 const match=(kind:string)=>['==',['get','kind'],kind] as ['==',['get',string],string];
 map.addLayer({id:METRO_PREVIEW_LAYERS[0],type:'fill',source:SOURCE,filter:match('envelope'),minzoom:14,paint:{'fill-color':'#76989c','fill-opacity':.17}},'building-supports-3d');
 map.addLayer({id:METRO_PREVIEW_LAYERS[1],type:'line',source:SOURCE,filter:match('envelope'),minzoom:14,paint:{'line-color':'#6f8e96','line-width':1,'line-opacity':.65}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[2],type:'fill',source:SOURCE,filter:match('platform'),minzoom:14,paint:{'fill-color':'#f7f5e6','fill-opacity':.95}},'building-supports-3d');
 map.addLayer({id:METRO_PREVIEW_LAYERS[3],type:'line',source:SOURCE,filter:match('platform'),minzoom:14,paint:{'line-color':'#668790','line-width':1.1}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[4],type:'line',source:SOURCE,filter:match('track'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f9faf1','line-width':metroLineWidth(2.8,2.4),'line-opacity':.85}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[5],type:'line',source:SOURCE,filter:match('track'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#52756c','line-width':metroLineWidth(1.4,1)}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[6],type:'line',source:SOURCE,filter:match('route'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':metroLineWidth(2,1.5),'line-opacity':.95}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[7],type:'circle',source:SOURCE,filter:match('station'),paint:{'circle-radius':3.2,'circle-color':'#fafbf3','circle-stroke-color':'#436c63','circle-stroke-width':1.4}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[8],type:'symbol',source:SOURCE,filter:match('station'),layout:{'text-field':['concat',['get','name'],'\n',['get','depth']],'text-font':['Noto Sans Regular'],'text-size':11,'text-anchor':'bottom','text-offset':[0,-.8],'text-padding':15,'text-allow-overlap':true,'text-pitch-alignment':'viewport'},paint:{'text-color':'#34594e','text-halo-color':'#fafbf3','text-halo-width':2}});
 map.addLayer({id:METRO_PREVIEW_LAYERS[9],type:'symbol',source:SOURCE,filter:match('depth'),minzoom:14,layout:{'text-field':['get','depth'],'text-font':['Noto Sans Regular'],'text-size':10,'text-padding':20,'text-offset':[0,-1],'text-pitch-alignment':'viewport'},paint:{'text-color':'#87694d','text-halo-color':'#fafbf3','text-halo-width':2}});
}
export function setMetroPreviewVisible(map:Map,visible:boolean){for(const id of METRO_PREVIEW_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');}
