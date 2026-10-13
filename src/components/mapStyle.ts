import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
export type DisplayPreset = 'clean' | 'standard' | 'detailed';
export interface DisplayOptions { preset: DisplayPreset; buildings: boolean; }
const source = 'openmaptiles';
const tileUrl=import.meta.env.VITE_VECTOR_TILEJSON || 'https://tiles.openfreemap.org/planet';
const text:ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { openmaptiles: { type: 'vector', url:tileUrl, bounds: [-74.32,40.47,-73.65,40.98] }, 'building-tiles':{type:'vector',url:tileUrl,bounds:[-74.32,40.47,-73.65,40.98]} },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f0f0e8' } },
      { id: 'wood', type: 'fill', source, 'source-layer': 'landcover', filter: ['==',['get','class'],'wood'], paint: { 'fill-color': '#dce4d1', 'fill-opacity': .7 } },
      { id: 'parks', type: 'fill', source, 'source-layer': 'park', paint: { 'fill-color': '#d6e1c9', 'fill-opacity': .8 } },
      { id: 'water', type: 'fill', source, 'source-layer': 'water', paint: { 'fill-color': '#b9ced1' } },
      { id: 'waterways', type: 'line', source, 'source-layer': 'waterway', paint: { 'line-color': '#b9ced1', 'line-width': 2 } },
      { id: 'roads-minor', type: 'line', source, 'source-layer': 'transportation', minzoom: 11, filter: ['match',['get','class'],['minor','service','residential','tertiary'],true,false], layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#d6d9cd','line-width':['interpolate',['linear'],['zoom'],11,.5,14,1.5,18,8]} },
      { id: 'roads-major', type: 'line', source, 'source-layer': 'transportation', filter: ['match',['get','class'],['motorway','trunk','primary','secondary'],true,false], layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#c0c8b8','line-width':['interpolate',['linear'],['zoom'],10,1,14,2.5,18,12]} },
      { id: 'paths', type: 'line', source, 'source-layer': 'transportation', minzoom: 14, filter:['match',['get','class'],['path','track'],true,false], layout:{visibility:'none'},paint:{'line-color':'#c8d0bb','line-width':1,'line-dasharray':[2,2]} },
      { id: 'existing-rail', type: 'line', source, 'source-layer': 'transportation', filter:['match',['get','class'],['rail','transit'],true,false],layout:{visibility:'none'},paint:{'line-color':'#b1b8ae','line-width':1,'line-dasharray':[3,3]} },
      { id: 'buildings-3d', type: 'fill-extrusion', source:'building-tiles', 'source-layer': 'building', minzoom: 14, filter:['!=',['get','hide_3d'],true],layout:{visibility:'none'},paint:{'fill-extrusion-color':'#d0d7c9','fill-extrusion-height':['coalesce',['get','render_height'],10],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.85} },
      { id:'labels-places',type:'symbol',source,'source-layer':'place',minzoom:9,filter:['match',['get','class'],['city','town','suburb','quarter','borough'],true,false],layout:{visibility:'none','text-field':text,'text-font':['Noto Sans Regular'],'text-size':12,'text-letter-spacing':.08,'text-transform':'uppercase','text-max-width':9},paint:{'text-color':'#7b8b74','text-halo-color':'#f0f0e8','text-halo-width':2} },
      { id:'labels-neighborhoods',type:'symbol',source,'source-layer':'place',minzoom:12,filter:['match',['get','class'],['neighbourhood','village','hamlet'],true,false],layout:{visibility:'none','text-field':text,'text-font':['Noto Sans Regular'],'text-size':10},paint:{'text-color':'#89927e','text-halo-color':'#f0f0e8','text-halo-width':1.5} },
      { id:'labels-roads-major',type:'symbol',source,'source-layer':'transportation_name',minzoom:13,filter:['match',['get','class'],['primary','secondary','trunk'],true,false],layout:{visibility:'none','symbol-placement':'line','text-field':text,'text-font':['Noto Sans Regular'],'text-size':10},paint:{'text-color':'#8a9581','text-halo-color':'#f0f0e8','text-halo-width':1.5} },
      { id:'labels-roads-minor',type:'symbol',source,'source-layer':'transportation_name',minzoom:15,filter:['match',['get','class'],['minor','tertiary','residential'],true,false],layout:{visibility:'none','symbol-placement':'line','text-field':text,'text-font':['Noto Sans Regular'],'text-size':9},paint:{'text-color':'#8a9581','text-halo-color':'#f0f0e8','text-halo-width':1.5} },
      { id:'labels-poi',type:'symbol',source,'source-layer':'poi',minzoom:16,layout:{visibility:'none','text-field':text,'text-font':['Noto Sans Regular'],'text-size':9,'text-max-width':8},paint:{'text-color':'#929782','text-halo-color':'#f0f0e8','text-halo-width':1.5} }
    ]
  };
}
