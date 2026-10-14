import { foundationExpression, type PlanningLayers } from './underground';
import type { AnalysisMode } from './analysisLayers';
import type { ExpressionSpecification, LineLayerSpecification, StyleSpecification } from 'maplibre-gl';
export type DisplayPreset = 'clean' | 'detailed';
export interface DisplayOptions extends PlanningLayers { preset: DisplayPreset; buildings: boolean; mode:AnalysisMode; }
const source = 'openmaptiles';
const tileUrl=import.meta.env.VITE_VECTOR_TILEJSON || 'https://tiles.openfreemap.org/planet';
const text:ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { openmaptiles: { type: 'vector', url:tileUrl, bounds: [-74.32,40.47,-73.65,40.98] }, 'rail-tiles':{type:'vector',url:tileUrl,bounds:[-74.32,40.47,-73.65,40.98]}, 'building-tiles':{type:'vector',url:tileUrl,bounds:[-74.32,40.47,-73.65,40.98]} },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f0f0e8' } },
      { id: 'wood', type: 'fill', source, 'source-layer': 'landcover', filter: ['==',['get','class'],'wood'], paint: { 'fill-color': '#dce4d1', 'fill-opacity': .7 } },
      { id: 'parks', type: 'fill', source, 'source-layer': 'park', paint: { 'fill-color': '#d6e1c9', 'fill-opacity': .8 } },
      { id: 'water', type: 'fill', source, 'source-layer': 'water', paint: { 'fill-color': '#b9ced1' } },
      { id: 'waterways', type: 'line', source, 'source-layer': 'waterway', paint: { 'line-color': '#b9ced1', 'line-width': 2 } },
      { id: 'roads-minor', type: 'line', source, 'source-layer': 'transportation', minzoom: 11, filter: ['match',['get','class'],['minor','service','residential','tertiary'],true,false], layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#d6d9cd','line-width':['interpolate',['linear'],['zoom'],11,.5,14,1.5,18,8]} },
      { id: 'roads-major', type: 'line', source, 'source-layer': 'transportation', filter: ['match',['get','class'],['motorway','trunk','primary','secondary'],true,false], layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#c0c8b8','line-width':['interpolate',['linear'],['zoom'],10,1,14,2.5,18,12]} },
      { id: 'paths', type: 'line', source, 'source-layer': 'transportation', minzoom: 14, filter:['match',['get','class'],['path','track'],true,false], layout:{visibility:'none'},paint:{'line-color':'#c8d0bb','line-width':1,'line-dasharray':[2,2]} },

      { id:'building-footprints',type:'fill',source:'building-tiles','source-layer':'building',minzoom:13,paint:{'fill-color':'#d9dfd1','fill-outline-color':'#b3c0a7','fill-opacity':.8} },
      {id:'foundation-risk',type:'fill',source:'building-tiles','source-layer':'building',minzoom:13,filter:['<=',['coalesce',['get','render_min_height'],0],0],layout:{visibility:'none'},paint:{'fill-color':foundationExpression(25),'fill-opacity':.85,'fill-outline-color':'#697061'}},
      { id: 'buildings-3d', type: 'fill-extrusion', source:'building-tiles', 'source-layer': 'building', minzoom: 14, filter:['!=',['get','hide_3d'],true],layout:{visibility:'none'},paint:{'fill-extrusion-color':'#d0d7c9','fill-extrusion-height':['coalesce',['get','render_height'],10],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.85} },
      ...(['surface','bridge','tunnel'] as const).map((kind):LineLayerSpecification=>({id:`rail-${kind}`,type:'line' as const,source:'rail-tiles','source-layer':'transportation',filter:['all',['match',['get','class'],['rail','transit'],true,false],kind==='surface'?['!',['in',['coalesce',['get','brunnel'],''],['literal',['bridge','tunnel']]]]:['==',['get','brunnel'],kind]],layout:{visibility:'none' as const,'line-cap':'round' as const},paint:{'line-color':kind==='tunnel'?'#8e729e':kind==='bridge'?'#577894':'#536759','line-width':['interpolate',['linear'],['zoom'],10,.325,15,.6,18,1],'line-opacity':.9,...(kind==='tunnel'?{'line-dasharray':[3,2]}:{})}})),
      { id:'labels-places',type:'symbol',source,'source-layer':'place',minzoom:9,maxzoom:15.5,filter:['match',['get','class'],['city','town','suburb','quarter','borough'],true,false],layout:{visibility:'none','text-field':text,'text-font':['Noto Sans Regular'],'text-size':12,'text-padding':35,'text-letter-spacing':.08,'text-transform':'uppercase','text-max-width':9},paint:{'text-color':'#7b8b74','text-halo-color':'#f0f0e8','text-halo-width':2} },
      { id:'labels-neighborhoods',type:'symbol',source,'source-layer':'place',minzoom:12.5,maxzoom:17,filter:['match',['get','class'],['neighbourhood','village','hamlet'],true,false],layout:{visibility:'none','text-field':text,'text-font':['Noto Sans Regular'],'text-size':11,'text-padding':40,'text-pitch-alignment':'viewport'},paint:{'text-color':'#89927e','text-halo-color':'#f0f0e8','text-halo-width':1.5} },
      { id:'labels-roads-major',type:'symbol',source,'source-layer':'transportation_name',minzoom:13,filter:['match',['get','class'],['primary','secondary','trunk'],true,false],layout:{visibility:'none','symbol-placement':'line','symbol-spacing':700,'text-padding':12,'text-pitch-alignment':'viewport','text-field':text,'text-font':['Noto Sans Regular'],'text-size':10},paint:{'text-color':'#8a9581','text-halo-color':'#f0f0e8','text-halo-width':1} },
      { id:'labels-poi',type:'symbol',source,'source-layer':'poi',minzoom:15,filter:['all',['any',['match',['get','class'],['park','stadium','castle'],true,false],['match',['get','subclass'],['museum','monument','memorial'],true,false]],['<=',['coalesce',['get','rank'],99],5],['!=',['coalesce',['get','indoor'],0],1]],layout:{visibility:'none','text-field':text,'text-font':['Noto Sans Regular'],'text-size':10,'text-max-width':12,'text-padding':48,'symbol-sort-key':['coalesce',['get','rank'],99],'text-pitch-alignment':'viewport'},paint:{'text-color':'#7b8b73','text-halo-color':'#f0f0e8','text-halo-width':1} }
    ]
  };
}
