import type { Map } from 'maplibre-gl';
export interface PlanningLayers {existingRail:boolean;}
export const DEFAULT_PLANNING:PlanningLayers={existingRail:false};
// Obsolete foundation fields in older saves are ignored and dropped on the next write.
export function isPlanningLayers(value:unknown):value is PlanningLayers{return !!value&&typeof value==='object'&&typeof (value as PlanningLayers).existingRail==='boolean';}
export function normalizePlanning(value:PlanningLayers|undefined):PlanningLayers{return {existingRail:value?.existingRail??false};}
export function applyPlanningLayers(map:Map,options:PlanningLayers){
 for(const id of ['rail-surface','rail-bridge','rail-tunnel'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',options.existingRail?'visible':'none');
}
