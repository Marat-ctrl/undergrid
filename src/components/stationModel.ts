import { DEMO_LOCATION } from './undergroundView';

export type BuildStage='preview'|'blueprint'|'constructed';
export interface StationEntrance {
 id:string;
 stationId:string;
 position:[number,number]; // local east/north metres, relative to the station axis
 rotation:number; // radians about local up; the unrotated stair opening faces west
 platformId:string;
}
export interface StationModel {
 id:string;
 name:string;
 coords:[number,number];
 bearing:number;
 buildType:BuildStage;
 length:number;
 width:number;
 trackGroup:{id:string;lanes:'parallel';trackIds:[string,string];centerLine:[[number,number],[number,number]]};
 platforms:{id:string;trackId:string;offset:number}[];
 entrances:StationEntrance[];
}
// The station/track relationship follows the documented Subway Builder model.
// Entrance orientation and 3D access geometry are Undergrid extensions, not reverse-engineered game internals.
const stationId='demo-station';
export const DEMO_STATION:StationModel={
 id:stationId,name:'Demo station',coords:DEMO_LOCATION,bearing:0,buildType:'preview',length:150,width:30,
 trackGroup:{id:'demo-parallel',lanes:'parallel',trackIds:['demo-eastbound','demo-westbound'],centerLine:[[-390,0],[390,0]]},
 platforms:[{id:'demo-south-platform',trackId:'demo-eastbound',offset:-11},{id:'demo-north-platform',trackId:'demo-westbound',offset:11}],
 entrances:([-25,25] as const).flatMap((x,end)=>([-1,1] as const).map(side=>({
   id:`demo-entrance-${end}-${side<0?'south':'north'}`,stationId,position:[x,side*20] as [number,number],rotation:x<0?0:Math.PI,
   platformId:side<0?'demo-south-platform':'demo-north-platform'
 })))
};
export function entranceOpening(entrance:StationEntrance):[number,number]{return [-Math.cos(entrance.rotation),-Math.sin(entrance.rotation)];}
