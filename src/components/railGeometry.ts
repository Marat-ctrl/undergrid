import { ROUTE_TRACK_CENTRES_METRES } from './constructionDimensions';
import { MercatorCoordinate } from 'maplibre-gl';
import type { Coordinate } from './stationPlacement';
export const HEAVY_METRO_LIMITS={minRadius:20,maxGrade:.16,maxGradeRate:.03};
export const STATION_APPROACH_METRES=10;
type XY=[number,number];
export interface RailEnd {position:Coordinate;depth:number;outward:XY|null;halfSpacing?:number;}
export interface RailGeometry {lanes:Coordinate[][];length:number;centre:Coordinate[];depths:number[];startDepth:number;endDepth:number;controls:[XY,XY,XY,XY];lengths:number[];startTangent:XY;endTangent:XY;}
const dot=(a:XY,b:XY)=>a[0]*b[0]+a[1]*b[1];
const cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0];
const unit=(x:number,y:number):XY=>{const d=Math.hypot(x,y);return d?[x/d,y/d]:[0,0];};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
const toCoord=(p:XY):Coordinate=>{const c=new MercatorCoordinate(...p).toLngLat();return [c.lng,c.lat];};

// Fit a circle to a departure tangent and an endpoint. The terminal tangent is
// the rotated departure tangent, never the chord between the two endpoints.
function circle(a:XY,b:XY,tangent:XY,scale:number){
 const delta:XY=[b[0]-a[0],b[1]-a[1]],normal:XY=[-tangent[1],tangent[0]],lateral=dot(delta,normal);
 if(Math.abs(lateral)/scale<.001){if(dot(delta,tangent)<=0)return null;return {length:Math.hypot(...delta)/scale,at:(t:number):XY=>[a[0]+delta[0]*t,a[1]+delta[1]*t],tangent:(_:number)=>tangent};}
 const radius=dot(delta,delta)/(2*lateral),centre:XY=[a[0]+normal[0]*radius,a[1]+normal[1]*radius],r:XY=[a[0]-centre[0],a[1]-centre[1]],end:XY=[b[0]-centre[0],b[1]-centre[1]];
 let sweep=Math.atan2(cross(r,end),dot(r,end));if(radius>0&&sweep<0)sweep+=2*Math.PI;if(radius<0&&sweep>0)sweep-=2*Math.PI;
 return {length:Math.abs(radius*sweep)/scale,at:(t:number):XY=>{const angle=sweep*t,c=Math.cos(angle),s=Math.sin(angle);return [centre[0]+r[0]*c-r[1]*s,centre[1]+r[0]*s+r[1]*c];},tangent:(t:number):XY=>{const angle=sweep*t,c=Math.cos(angle),s=Math.sin(angle);return [tangent[0]*c-tangent[1]*s,tangent[0]*s+tangent[1]*c];}};
}
export function railGeometry(start:RailEnd,end:RailEnd,parallel:boolean,arc:boolean,straight=false):RailGeometry|null{
 const pa=MercatorCoordinate.fromLngLat(start.position),pb=MercatorCoordinate.fromLngLat(end.position),a:XY=[pa.x,pa.y],b:XY=[pb.x,pb.y];
 const scale=MercatorCoordinate.fromLngLat([(start.position[0]+end.position[0])/2,(start.position[1]+end.position[1])/2]).meterInMercatorCoordinateUnits();
 const dx=b[0]-a[0],dy=b[1]-a[1],distance=Math.hypot(dx,dy),metres=distance/scale;if(metres<10||metres>10000)return null;
 const chord=unit(dx,dy),handle=Math.min(distance/3,500*scale);let first:XY=start.outward??chord,last:XY=end.outward?[-end.outward[0],-end.outward[1]]:chord;
 let controls:[XY,XY,XY,XY]=[a,[a[0]+first[0]*handle,a[1]+first[1]*handle],[b[0]-last[0]*handle,b[1]-last[1]*handle],b];
 let at:(t:number)=>XY,tangent:(t:number)=>XY,lengthHint:number;
 if(straight){
   if((start.outward&&dot(start.outward,chord)<.999999)||(end.outward&&dot(end.outward,chord)>-.999999))return null;
   first=chord;last=chord;controls=[a,[a[0]+dx/3,a[1]+dy/3],[b[0]-dx/3,b[1]-dy/3],b];
   at=t=>[a[0]+dx*t,a[1]+dy*t];tangent=()=>chord;lengthHint=metres;
 }else if(arc&&!!start.outward!==!!end.outward){
   const reverse=!start.outward,curve=circle(reverse?b:a,reverse?a:b,(reverse?end.outward:start.outward)!,scale);if(!curve||curve.length>20000)return null;
   at=t=>curve.at(reverse?1-t:t);tangent=t=>{const v=curve.tangent(reverse?1-t:t);return reverse?[-v[0],-v[1]]:v;};lengthHint=curve.length;
   first=tangent(0);last=tangent(1);controls=[a,[a[0]+first[0]*handle,a[1]+first[1]*handle],[b[0]-last[0]*handle,b[1]-last[1]*handle],b];
 }else{
   at=t=>{const u=1-t;return [u*u*u*a[0]+3*u*u*t*controls[1][0]+3*u*t*t*controls[2][0]+t*t*t*b[0],u*u*u*a[1]+3*u*u*t*controls[1][1]+3*u*t*t*controls[2][1]+t*t*t*b[1]];};
   tangent=t=>{const u=1-t;return unit(3*u*u*(controls[1][0]-a[0])+6*u*t*(controls[2][0]-controls[1][0])+3*t*t*(b[0]-controls[2][0]),3*u*u*(controls[1][1]-a[1])+6*u*t*(controls[2][1]-controls[1][1])+3*t*t*(b[1]-controls[2][1]));};
   lengthHint=controls.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-controls[i][0],p[1]-controls[i][1])/scale,0);
 }
 const samples=Math.min(10000,Math.max(64,Math.ceil(lengthHint/2))),points=Array.from({length:samples+1},(_,i)=>at(i/samples));points[0]=a;points[samples]=b;
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])/scale);const total=lengths.at(-1)!;
 const centre=points.map(toCoord);
 const approach=STATION_APPROACH_METRES;
 const normalSpacing=ROUTE_TRACK_CENTRES_METRES/2,sg=start.halfSpacing??normalSpacing,eg=end.halfSpacing??normalSpacing,startFixed=!!start.outward,endFixed=!!end.outward;
 const spacing=(s:number)=>{
   if(!arc){const ease=(d:number)=>1-(3*(Math.min(1,d/approach)**2)-2*(Math.min(1,d/approach)**3));return normalSpacing+Math.max((sg-normalSpacing)*ease(s),(eg-normalSpacing)*ease(total-s));}
   // Short sections retain endpoint spacing when two approaches overlap.
   // The taper is schematic and is excluded from the turn-radius check. Zero spacing derivatives at each endpoint keep continuations smooth.
   if(startFixed&&!endFixed){const finish=sg-(sg-normalSpacing)*Math.min(1,total/approach)**2;return sg+(finish-sg)*smooth(s/Math.min(approach,total));}
   if(!startFixed&&endFixed){const begin=eg-(eg-normalSpacing)*Math.min(1,total/approach)**2;return begin+(eg-begin)*smooth((s-Math.max(0,total-approach))/Math.min(approach,total));}
   if(startFixed&&endFixed){const span=Math.min(approach,total/2),middle=Math.max(normalSpacing,Math.min(sg,eg)-normalSpacing*Math.min(1,total/(2*approach))**2);return s<=total/2?sg+(middle-sg)*smooth(s/span):middle+(eg-middle)*smooth((s-(total-span))/span);}
   return normalSpacing;
 };
 const lanes=(parallel?[-1,1]:[0]).map(side=>points.map(([x,y],i)=>{const v=tangent(i/samples),offset=spacing(lengths[i])*side*scale;return toCoord([x-v[1]*offset,y+v[0]*offset]);}));
 const profile=verticalProfile(total,end.depth-start.depth);
 const depths=lengths.map(s=>start.depth+profile.at(s));
 return {lanes,length:total,centre,depths,startDepth:start.depth,endDepth:end.depth,controls,lengths,startTangent:first,endTangent:last};
}
export function verticalProfile(length:number,delta:number){
 const ramp=Math.min(10,length/2),grade=delta/(length-ramp);
 const integral=(t:number)=>t*t*t-.5*t*t*t*t;
 return {maxGrade:Math.abs(grade),maxGradeRate:1.5*Math.abs(grade)/ramp,at:(distance:number)=>{
   const s=Math.max(0,Math.min(length,distance));
   if(s<ramp)return grade*ramp*integral(s/ramp);
   if(s>length-ramp)return delta-grade*ramp*integral((length-s)/ramp);
   return grade*(s-ramp/2);
 }};
}
export function minimumRadius(lanes:Coordinate[][]){
 let radius=Infinity;
 for(const lane of lanes){const points=lane.map(p=>MercatorCoordinate.fromLngLat(p));for(let i=1;i<points.length-1;i++){
   const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ac=Math.hypot(c.x-a.x,c.y-a.y),area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
   if(ab<1e-14||bc<1e-14){radius=0;continue;}
   if(area>ab*bc*1e-8)radius=Math.min(radius,ab*bc*ac/(2*area)/b.meterInMercatorCoordinateUnits());
 }}return radius;
}
export interface TrackCheck {valid:boolean;issues:string[];minRadius:number;maxGrade:number;maxGradeRate:number;}
export function checkRailGeometry(geometry:RailGeometry|null,_arc:boolean):TrackCheck{
 if(!geometry)return {valid:false,issues:['Choose a forward endpoint inside the city, 10 m–10 km away.'],minRadius:0,maxGrade:0,maxGradeRate:0};
 // Check the main alignment; the compact station taper is a visual transition.
 const minRadius=minimumRadius([geometry.centre]),delta=Math.abs(geometry.endDepth-geometry.startDepth);
 // Analytical extrema of the vertical profile, combined with per-lane grades.
 const profile=verticalProfile(geometry.length,delta);
 let maxGrade=profile.maxGrade,maxGradeRate=profile.maxGradeRate;
 for(const lane of geometry.lanes){const points=lane.map(p=>MercatorCoordinate.fromLngLat(p));let previous:number|undefined,previousLength=0;
   for(let i=1;i<points.length;i++){const ds=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)/points[i].meterInMercatorCoordinateUnits();if(ds<1e-6){maxGrade=Infinity;continue;}
     const grade=(geometry.depths[i]-geometry.depths[i-1])/ds;maxGrade=Math.max(maxGrade,Math.abs(grade));
     if(previous!==undefined)maxGradeRate=Math.max(maxGradeRate,Math.abs(grade-previous)/((ds+previousLength)/2));previous=grade;previousLength=ds;
   }
 }
 const issues:string[]=[];
 if(minRadius<HEAVY_METRO_LIMITS.minRadius-.05)issues.push(`Turn too sharp: R ${Math.floor(minRadius)} m · minimum ${HEAVY_METRO_LIMITS.minRadius} m`);
 if(maxGrade>HEAVY_METRO_LIMITS.maxGrade+1e-6)issues.push(`Grade too steep: ${(maxGrade*100).toFixed(1)}% · maximum ${(HEAVY_METRO_LIMITS.maxGrade*100).toFixed(0)}%`);
 if(maxGradeRate>HEAVY_METRO_LIMITS.maxGradeRate+1e-7)issues.push('Vertical transition too abrupt · lengthen the section');
 return {valid:issues.length===0,issues,minRadius,maxGrade,maxGradeRate};
}
