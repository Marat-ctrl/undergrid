import type { ExpressionSpecification, Map } from 'maplibre-gl';
export interface PlanningLayers { existingRail:boolean; foundations:boolean; plannedDepth:number; }
export const DEFAULT_PLANNING:PlanningLayers={existingRail:false,foundations:false,plannedDepth:25};
export const FOUNDATION_COLORS={overlap:'#ac6555',uncertain:'#c5a16b',lower:'#6c8d9c',unknown:'#969b90'};
export function isPlanningLayers(value:unknown):value is PlanningLayers {
 if(!value||typeof value!=='object')return false;const v=value as PlanningLayers;
 return typeof v.existingRail==='boolean'&&typeof v.foundations==='boolean'&&Number.isInteger(v.plannedDepth)&&v.plannedDepth>=5&&v.plannedDepth<=100;
}
// Explicit gameplay proxy, not a geotechnical estimate. Heights may themselves be inferred.
export function foundationRange(height:number|null):[number,number]|null {
 if(height===null||!Number.isFinite(height)||height<=0)return null;
 return [Math.max(3,height*.06),Math.max(6,4+height*.12)];
}
export function foundationRisk(height:number|null,depth:number):keyof typeof FOUNDATION_COLORS {
 const range=foundationRange(height);if(!range)return 'unknown';
 const tunnelRoof=depth-3; // illustrative six-metre tunnel envelope
 if(tunnelRoof<=range[0]+2)return 'overlap';
 if(tunnelRoof<=range[1]+2)return 'uncertain';
 return 'lower'; // never means permission to build
}
export function foundationExpression(depth:number):ExpressionSpecification {
 const h:ExpressionSpecification=['coalesce',['get','render_height'],0];
 const roof=depth-3;
 return ['case',['<=',h,0],FOUNDATION_COLORS.unknown,['<=',roof,['+',2,['max',3,['*',h,.06]]]],FOUNDATION_COLORS.overlap,['<=',roof,['+',2,['max',6,['+',4,['*',h,.12]]]]],FOUNDATION_COLORS.uncertain,FOUNDATION_COLORS.lower];
}
export function applyPlanningLayers(map:Map,options:PlanningLayers){
 for(const [id,enabled] of [['rail-surface',options.existingRail],['rail-bridge',options.existingRail],['rail-tunnel',options.existingRail],['foundation-risk',options.foundations]] as const)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',enabled?'visible':'none');
 if(map.getLayer('foundation-risk'))map.setPaintProperty('foundation-risk','fill-color',foundationExpression(options.plannedDepth));
}
