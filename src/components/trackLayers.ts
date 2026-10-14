import type { Map,GeoJSONSource,ExpressionSpecification } from 'maplibre-gl';
import { trackFeatures,networkPorts,type PlacedTrack,type StationPort,type TrackMode } from './trackPlacement';
import type { PlacedStation } from './stationPlacement';
import { metroLineWidth } from './metroStyle';
export const TRACK_HIT_LAYERS=['player-track-line','player-track-blueprint','player-track-label'];
export function installTrackLayers(map:Map){
 const size=16,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){if(Math.abs(x-(11-Math.abs(y-7.5)))<1.5&&Math.abs(y-7.5)<6){const i=(y*size+x)*4;data[i]=67;data[i+1]=110;data[i+2]=97;data[i+3]=255;}}
 if(!map.hasImage('track-direction'))map.addImage('track-direction',{width:size,height:size,data});
 for(const [source,prefix] of [['player-tracks','player-track'],['track-cursor','cursor-track']]){
   map.addSource(source,{type:'geojson',data:trackFeatures([],[])});
   const color:ExpressionSpecification=['case',['get','invalid'],'#b54e43',['get','selected'],'#a56037',['==',['get','stage'],'constructed'],'#436e61','#be8c48'];
   map.addLayer({id:`${prefix}-halo`,type:'line',source,filter:['==',['get','kind'],'track'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fafbf3','line-width':metroLineWidth(2.8,4),'line-opacity':.75}});
   map.addLayer({id:`${prefix}-line`,type:'line',source,filter:['all',['==',['get','kind'],'track'],['==',['get','stage'],'constructed']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':metroLineWidth(1.4,1.4)}});
   map.addLayer({id:`${prefix}-blueprint`,type:'line',source,filter:['all',['==',['get','kind'],'track'],['!=',['get','stage'],'constructed']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':metroLineWidth(1.4,1.4),'line-dasharray':[3,1.5]}});
   map.addLayer({id:`${prefix}-direction`,type:'symbol',source,minzoom:15,filter:['==',['get','kind'],'direction'],layout:{'symbol-placement':'line','symbol-spacing':100,'icon-image':'track-direction','icon-size':.7,'icon-rotation-alignment':'map','icon-pitch-alignment':'map','icon-keep-upright':false,'icon-padding':1},paint:{'icon-opacity':.9}});
   map.addLayer({id:`${prefix}-label`,type:'symbol',source,filter:['==',['get','kind'],'label'],layout:{'text-field':['case',['==',['get','depth'],''],['get','name'],['concat',['get','name'],'\n',['get','depth']]],'text-font':['Noto Sans Regular'],'text-size':10,'text-offset':[0,-1],'text-allow-overlap':prefix==='cursor-track','text-pitch-alignment':'viewport'},paint:{'text-color':color,'text-halo-color':'#fafbf3','text-halo-width':2}});
 }
 map.addSource('station-ports',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'station-ports',type:'circle',source:'station-ports',paint:{'circle-radius':['case',['get','hot'],6,4],'circle-color':['case',['get','hot'],'#d99a4b','#fafbf3'],'circle-stroke-color':['case',['get','hot'],'#a66d30',['get','blueprint'],'#be8c48','#4e7b68'],'circle-stroke-width':2}});
}
export function updateTracks(map:Map,tracks:PlacedTrack[],stations:PlacedStation[],selected:string|null){(map.getSource('player-tracks') as GeoJSONSource|undefined)?.setData(trackFeatures(tracks,stations,selected));}
export function updateTrackGhost(map:Map,track:PlacedTrack|null,stations:PlacedStation[],tracks:PlacedTrack[]=[]){(map.getSource('track-cursor') as GeoJSONSource|undefined)?.setData(trackFeatures(track?[track]:[],stations,null,true,tracks));}
export function updatePorts(map:Map,stations:PlacedStation[],mode:TrackMode,visible:boolean,hot:string|null,tracks:PlacedTrack[]=[]){(map.getSource('station-ports') as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features:visible?networkPorts(stations,tracks,mode).map(port=>{const ref=port.ref,blueprint='trackId' in ref?tracks.find(t=>t.id===ref.trackId)?.stage==='blueprint':stations.find(s=>s.id===ref.stationId)?.stage==='blueprint';return {type:'Feature',properties:{hot:port.key===hot,blueprint},geometry:{type:'Point',coordinates:port.position}};}):[]});}
export function nearestPort(map:Map,stations:PlacedStation[],mode:TrackMode,point:{x:number;y:number},exclude:string|null=null,tracks:PlacedTrack[]=[],project?:(port:StationPort)=>{x:number;y:number}):StationPort|null{
 let closest:StationPort|null=null,distance=18;
 for(const port of networkPorts(stations,tracks,mode)){if(port.key===exclude)continue;const screen=project?project(port):map.project(port.position),d=Math.hypot(screen.x-point.x,screen.y-point.y);if(d<distance){closest=port;distance=d;}}
 return closest;
}
