import { DENSITY_PALETTE } from './theme';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification, Map } from 'maplibre-gl';
export type AnalysisMode='off'|'population'|'jobs';
export interface AnalysisLayers { mode:AnalysisMode; }
export interface LegacyAnalysisLayers { population:boolean; districts:boolean; }
export type SavedAnalysis=AnalysisLayers|LegacyAnalysisLayers;
export type AnalysisStatus='idle'|'loading'|'ready'|'error';
export const DEFAULT_ANALYSIS:AnalysisLayers={mode:'off'};
export const DENSITY_STOPS=[{value:0,color:DENSITY_PALETTE[0]},{value:2500,color:DENSITY_PALETTE[1]},{value:7500,color:DENSITY_PALETTE[2]},{value:15000,color:DENSITY_PALETTE[3]},{value:30000,color:DENSITY_PALETTE[4]},{value:60000,color:DENSITY_PALETTE[5]}] as const;
export const JOB_DENSITY_STOPS=[{value:0,color:DENSITY_PALETTE[0]},{value:1000,color:DENSITY_PALETTE[1]},{value:5000,color:DENSITY_PALETTE[2]},{value:15000,color:DENSITY_PALETTE[3]},{value:50000,color:DENSITY_PALETTE[4]},{value:150000,color:DENSITY_PALETTE[5]}] as const;
export const JOBS_YEAR=2023;
export const ANALYSIS_SOURCE_IDS=['nyc-tracts','nyc-boroughs','nyc-borough-labels'];
export function isAnalysisLayers(value:unknown):value is AnalysisLayers {
 if(!value||typeof value!=='object')return false;const v=value as AnalysisLayers;
 return v.mode==='off'||v.mode==='population'||v.mode==='jobs';
}
export function isSavedAnalysis(value:unknown):value is SavedAnalysis {
 if(!value||typeof value!=='object')return false;
 if('mode' in value)return isAnalysisLayers(value);
 const v=value as LegacyAnalysisLayers;return typeof v.population==='boolean'&&typeof v.districts==='boolean';
}
export function normalizeAnalysis(value:SavedAnalysis|undefined):AnalysisLayers {
 if(!value)return {...DEFAULT_ANALYSIS};
 if('mode' in value)return {mode:value.mode};
 return {mode:value.population||value.districts?'population':'off'};
}
export function attachJobs(data:FeatureCollection,jobs:{year:number;tracts:Record<string,{jobs:number;density:number|null}>}):FeatureCollection {
 if(jobs.year!==JOBS_YEAR||!jobs.tracts)throw new Error('Jobs data is incompatible.');
 for(const feature of data.features){const p=feature.properties;if(!p)throw new Error('Missing tract properties.');const record=jobs.tracts[p.geoid];if(!record||!Number.isSafeInteger(record.jobs)||record.jobs<0||(record.density!==null&&(!Number.isFinite(record.density)||record.density<0)))throw new Error('Missing or invalid jobs data.');p.jobs=record.jobs;p.jobs_density=record.density;p.jobs_year=jobs.year;}
 return data;
}
export function populationDensity(population:number,landSquareMeters:number):number|null {
 if(!Number.isFinite(population)||population<0||!Number.isFinite(landSquareMeters)||landSquareMeters<=0)return null;
 return population/(landSquareMeters/1000000);
}
export function densityColor(value:number|null):string {
 if(value===null||!Number.isFinite(value)||value<0)return '#dedede';
 let color:string=DENSITY_STOPS[0].color;for(const stop of DENSITY_STOPS)if(value>=stop.value)color=stop.color;
 return color;
}
export async function loadAnalysisData(signal:AbortSignal){
 const files=['nyc-population-2020.geojson','nyc-boroughs.geojson','nyc-borough-labels.geojson',`nyc-jobs-${JOBS_YEAR}.json`];
 const values=await Promise.all(files.map(async name=>{const response=await fetch(`${import.meta.env.BASE_URL}data/${name}`,{signal});if(!response.ok)throw new Error('Analysis data could not be loaded.');return response.json();}));
 const data=values.slice(0,3) as FeatureCollection[];
 for(const d of data)if(d.type!=='FeatureCollection'||!Array.isArray(d.features))throw new Error('Analysis data is incompatible.');
 attachJobs(data[0],values[3]);return data;
}
export function installAnalysisLayers(map:Map,data:FeatureCollection[]){
 for(let i=0;i<ANALYSIS_SOURCE_IDS.length;i++)map.addSource(ANALYSIS_SOURCE_IDS[i],{type:'geojson',data:data[i],maxzoom:16,tolerance:.5});
 // Place density below roads and buildings, while district lines remain legible above them.
 map.addLayer({id:'population-density',type:'fill',source:'nyc-tracts',layout:{visibility:'none'},paint:{'fill-color':densityExpression('population'),'fill-opacity':.82}},'roads-minor');
 map.addLayer({id:'tract-hit-area',type:'fill',source:'nyc-tracts',layout:{visibility:'none'},paint:{'fill-opacity':0}});
 map.addLayer({id:'tract-boundaries',type:'line',source:'nyc-tracts',minzoom:12.5,layout:{visibility:'none'},paint:{'line-color':'#777777','line-width':['interpolate',['linear'],['zoom'],12.5,.4,16,1],'line-opacity':.5}},'labels-places');
 map.addLayer({id:'borough-boundaries',type:'line',source:'nyc-boroughs',layout:{visibility:'none'},paint:{'line-color':'#444444','line-width':1.6,'line-opacity':.85}},'labels-places');
 map.addLayer({id:'borough-labels',type:'symbol',source:'nyc-borough-labels',minzoom:10,maxzoom:13.5,layout:{visibility:'none','text-field':['get','name'],'text-transform':'uppercase','text-font':['Noto Sans Regular'],'text-size':13,'text-letter-spacing':.12,'text-allow-overlap':false},paint:{'text-color':'#303030','text-halo-color':'#fafafa','text-halo-width':2}});
}
export function densityExpression(mode:AnalysisMode):ExpressionSpecification {
 const property=mode==='jobs'?'jobs_density':'density';const stops=mode==='jobs'?JOB_DENSITY_STOPS:DENSITY_STOPS;
 const step:ExpressionSpecification=['step',['to-number',['get',property]],stops[0].color,...stops.slice(1).flatMap(s=>[s.value,s.color])];
 return ['case',['==',['get',property],null],'#dedede',step];
}
export function applyAnalysisLayers(map:Map,layers:AnalysisLayers){
 const enabled=layers.mode!=='off';
 for(const id of ['tract-hit-area','population-density','tract-boundaries','borough-boundaries','borough-labels'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',enabled?'visible':'none');
 if(map.getLayer('population-density'))map.setPaintProperty('population-density','fill-color',densityExpression(layers.mode));
 if(map.getLayer('building-supports-3d'))map.setPaintProperty('building-supports-3d','fill-extrusion-opacity',enabled ? .18 : 1);
 if(map.getLayer('buildings-3d'))map.setPaintProperty('buildings-3d','fill-extrusion-opacity',enabled ? .18 : 1);
 if(map.getLayer('building-footprints'))map.setPaintProperty('building-footprints','fill-opacity',enabled ? .18 : .8);
}
