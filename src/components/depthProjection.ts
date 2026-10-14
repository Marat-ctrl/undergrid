import { MercatorCoordinate } from 'maplibre-gl';
import { Matrix4, Vector3 } from 'three';
import type { Coordinate } from './stationPlacement';
const origin=MercatorCoordinate.fromLngLat([-74.005,40.7126]);
const scale=origin.meterInMercatorCoordinateUnits();
export const depthTransform=new Matrix4().makeTranslation(origin.x,origin.y,0).multiply(new Matrix4().makeScale(scale,-scale,scale));
export function depthPosition(position:Coordinate,depth:number):Vector3{
 const p=MercatorCoordinate.fromLngLat(position,depth);
 return new Vector3((p.x-origin.x)/scale,-(p.y-origin.y)/scale,p.z/scale);
}
export function depthProject(matrix:Matrix4,position:Coordinate,depth:number,width:number,height:number){
 const p=depthPosition(position,depth),e=matrix.elements,w=e[3]*p.x+e[7]*p.y+e[11]*p.z+e[15];
 if(w<=0)return null;
 p.applyMatrix4(matrix);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};
}
export function depthUnproject(matrix:Matrix4,point:{x:number;y:number},depth:number,width:number,height:number):Coordinate|null{
 const inverse=matrix.clone().invert(),x=point.x/width*2-1,y=1-point.y/height*2;
 const a=new Vector3(x,y,-1).applyMatrix4(inverse),b=new Vector3(x,y,1).applyMatrix4(inverse),dz=b.z-a.z;
 if(Math.abs(dz)<1e-10)return null;
 let plane=depth,position:Coordinate=[-74.005,40.7126];
 for(let i=0;i<3;i++){
   const t=(plane-a.z)/dz;if(!Number.isFinite(t))return null;
   const p=new MercatorCoordinate(origin.x+(a.x+(b.x-a.x)*t)*scale,origin.y-(a.y+(b.y-a.y)*t)*scale).toLngLat();position=[p.lng,p.lat];
   plane=depthPosition(position,depth).z;
 }
 return position.every(Number.isFinite)?position:null;
}
