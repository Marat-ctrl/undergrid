export interface UndergroundView { enabled:boolean; depth:number; }
export const DEFAULT_UNDERGROUND:UndergroundView={enabled:false,depth:25};
export const DEMO_LOCATION:[number,number]=[-74.0071,40.7126];
export function isUndergroundView(value:unknown):value is UndergroundView {
 if(!value||typeof value!=='object')return false;
 const view=value as UndergroundView;
 return typeof view.enabled==='boolean'&&Number.isInteger(view.depth)&&view.depth>=5&&view.depth<=100;
}

// A 100 m eased approach joins the wide station tracks to a shared bore.
export function stationApproach(x:number){const t=Math.min(1,Math.max(0,(Math.abs(x)-75)/100));return t*t*(3-2*t);}
export function demoTrackOffset(x:number){return 5-2.5*stationApproach(x);}
export function demoTunnelHalfWidth(x:number){return 15-8.8*stationApproach(x);}

// Existing procedural geometry places the rail-head datum at local Z = -2.5 m.
export const DEMO_RAIL_LOCAL_Z=-2.5;
export const DEMO_RAIL_RADIUS=.075;
export function railwayOffsetForDepth(depth:number){return -depth-DEMO_RAIL_LOCAL_Z;}
export function demoElevation(depth:number,localZ:number){return railwayOffsetForDepth(depth)+localZ;}
