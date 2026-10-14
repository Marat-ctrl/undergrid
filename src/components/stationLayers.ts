import type { Map, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl';
import { stationFeatures, type PlacedStation } from './stationPlacement';
import { metroLineWidth } from './metroPreview';
export const STATION_SOURCE='player-stations',GHOST_SOURCE='station-cursor';
export const STATION_HIT_LAYERS=['player-station-fill','player-station-platform-fill','player-station-outline','player-station-platform-edge','player-station-tracks','player-station-dot','player-station-label'];
export function installStationLayers(map:Map){
 for(const [source,prefix] of [[STATION_SOURCE,'player-station'],[GHOST_SOURCE,'cursor-station']] as const){
   map.addSource(source,{type:'geojson',data:stationFeatures([])});
   const match=(kind:string)=>['==',['get','kind'],kind] as ExpressionSpecification;
   const color:ExpressionSpecification=['case',['get','selected'],'#a56037',['==',['get','stage'],'constructed'],'#436e61','#be8c48'];
   map.addLayer({id:`${prefix}-fill`,type:'fill',source,filter:match('envelope'),paint:{'fill-color':color,'fill-opacity':prefix==='cursor-station'?.2:.14}},'building-supports-3d');
   map.addLayer({id:`${prefix}-platform-fill`,type:'fill',source,filter:match('platform'),paint:{'fill-color':'#faf7e5','fill-opacity':.8}},'building-supports-3d');
   map.addLayer({id:`${prefix}-outline`,type:'line',source,filter:match('envelope'),paint:{'line-color':color,'line-width':['case',['get','selected'],2.2,1.2],'line-opacity':['case',['==',['get','stage'],'constructed'],1,0]}});
   map.addLayer({id:`${prefix}-blueprint-outline`,type:'line',source,filter:['all',match('envelope'),['!=',['get','stage'],'constructed']],paint:{'line-color':color,'line-width':['case',['get','selected'],2.2,1.2],'line-dasharray':[3,2]}});
   map.addLayer({id:`${prefix}-platform-edge`,type:'line',source,filter:match('platform'),paint:{'line-color':color,'line-width':1.2}});
   map.addLayer({id:`${prefix}-tracks`,type:'line',source,filter:match('track'),layout:{'line-cap':'round'},paint:{'line-color':color,'line-width':metroLineWidth(1.4,1.2)}});
   map.addLayer({id:`${prefix}-dot`,type:'circle',source,filter:match('label'),paint:{'circle-radius':3,'circle-color':'#fafbf3','circle-stroke-color':color,'circle-stroke-width':1.4}});
   map.addLayer({id:`${prefix}-label`,type:'symbol',source,filter:match('label'),layout:{'text-field':['concat',['get','name'],'\n',['get','depth']],'text-font':['Noto Sans Regular'],'text-size':11,'text-anchor':'bottom','text-offset':[0,-.8],'text-allow-overlap':true,'text-pitch-alignment':'viewport'},paint:{'text-color':color,'text-halo-color':'#fafbf3','text-halo-width':2}});
 }
}
export function updateStations(map:Map,stations:PlacedStation[],selected:string|null){(map.getSource(STATION_SOURCE) as GeoJSONSource|undefined)?.setData(stationFeatures(stations,selected));}
export function updateStationGhost(map:Map,station:PlacedStation|null){(map.getSource(GHOST_SOURCE) as GeoJSONSource|undefined)?.setData(stationFeatures(station?[station]:[],null,true));}
