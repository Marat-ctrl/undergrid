export interface Station { id: string; name: string; x: number; z: number; depth: number; waiting: number; }
export interface Train { id: string; position: number; direction: 1 | -1; speed: number; passengers: number; dwell: number; lastStop: string | null; distance: number; }
export interface LedgerEntry { time: number; label: string; amount: number; }
export interface State { version: 1; time: number; money: number; stations: Station[]; built: boolean; trains: Train[]; delivered: number; revenue: number; operatingCosts: number; capitalCosts: number; fare: number; orders: number[]; ledger: LedgerEntry[]; }
export type Command = { type:'stationDepth'; id:string; depth:number } | { type: 'addStation'; x: number; z: number; depth: number; name: string } | { type: 'build' } | { type: 'orderTrain' } | { type: 'fare'; value: number };
export const TRAIN_COST = 6_200_000;
export const DELIVERY_SECONDS = 120;
export const CAPACITY = 480;
export function initialState(): State { return {version:1,time:6*3600,money:85_000_000,stations:[{id:'s1',name:'North Quarter',x:-900,z:-350,depth:18,waiting:0},{id:'s2',name:'Civic Square',x:0,z:0,depth:32,waiting:0},{id:'s3',name:'Riverside',x:950,z:350,depth:45,waiting:0}],built:false,trains:[],delivered:0,revenue:0,operatingCosts:0,capitalCosts:0,fare:2.8,orders:[],ledger:[]}; }
export function segmentLength(a: Station,b: Station) { return Math.hypot(b.x-a.x,b.z-a.z,b.depth-a.depth); }
export function routeLength(s: State) { return s.stations.slice(1).reduce((sum,b,i)=>sum+segmentLength(s.stations[i],b),0); }
export function stationOffsets(s: State) { let d=0; return s.stations.map((station,i)=>{if(i)d+=segmentLength(s.stations[i-1],station); return d;}); }
export function constructionCost(s: State) { return Math.round(routeLength(s)*11_000+s.stations.reduce((sum,p)=>sum+6_000_000+p.depth*85_000,0)); }
export function pointOnRoute(s: State, distance: number) { const offsets=stationOffsets(s); for(let i=1;i<s.stations.length;i++){if(distance<=offsets[i]||i===s.stations.length-1){const a=s.stations[i-1],b=s.stations[i],t=Math.max(0,Math.min(1,(distance-offsets[i-1])/segmentLength(a,b))); return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,depth:a.depth+(b.depth-a.depth)*t,heading:Math.atan2(b.x-a.x,b.z-a.z)};}} return {...s.stations[0],heading:0}; }
function transaction(s:State,label:string,amount:number) { s.money+=amount;s.ledger.unshift({time:s.time,label,amount});s.ledger=s.ledger.slice(0,40); }
export function applyCommand(s:State,c:Command): string | null {
 if(c.type==='stationDepth'){if(s.built)return 'Station depth is locked after construction.';const station=s.stations.find(p=>p.id===c.id);if(!station||!Number.isFinite(c.depth)||c.depth<8||c.depth>80)return 'Station depth must be between 8 and 80 metres.';station.depth=c.depth;}
 if(c.type==='addStation'){if(s.built)return 'The line is already built. Start a new scenario to change its alignment.';if(s.stations.length>=8)return 'This prototype supports up to eight stations.';if(!Number.isFinite(c.x)||!Number.isFinite(c.z)||!Number.isFinite(c.depth)||c.depth<8||c.depth>80)return 'Invalid station location or depth.';if(s.stations.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<150))return 'Stations must be at least 150 m apart.';s.stations.push({id:`s${s.stations.length+1}`,name:c.name.trim().slice(0,40)||`Station ${s.stations.length+1}`,x:c.x,z:c.z,depth:c.depth,waiting:0});}
 if(c.type==='build'){if(s.built)return 'The line is already commissioned.';if(s.stations.length<2)return 'At least two stations are required.';for(let i=1;i<s.stations.length;i++){const a=s.stations[i-1],b=s.stations[i];if(Math.abs(b.depth-a.depth)/Math.hypot(b.x-a.x,b.z-a.z)>0.04)return 'Track gradient exceeds 4%. Increase the distance between stations.';}const cost=constructionCost(s);if(s.money<cost)return 'Insufficient construction budget.';transaction(s,'Line construction',-cost);s.capitalCosts+=cost;s.built=true;}
 if(c.type==='orderTrain'){if(!s.built)return 'Commission the line before ordering rolling stock.';if(s.trains.length+s.orders.length>=4)return 'The prototype depot holds four trains.';if(s.money<TRAIN_COST)return 'Insufficient funds for this train.';transaction(s,'UG-480 train order',-TRAIN_COST);s.capitalCosts+=TRAIN_COST;s.orders.push(s.time+DELIVERY_SECONDS);}
 if(c.type==='fare'){if(!Number.isFinite(c.value)||c.value<0||c.value>10)return 'Fare must be between $0 and $10.';s.fare=c.value;}
 return null;
}
export function tick(s:State,dt:number) {
 s.time+=dt;
 while(s.orders.length&&s.orders[0]<=s.time){s.orders.shift();const number=s.trains.length;s.trains.push({id:`UG-${String(number+1).padStart(3,'0')}`,position:number%2?routeLength(s):0,direction:number%2?-1:1,speed:0,passengers:0,dwell:15+Math.floor(number/2)*60,lastStop:null,distance:0});}
 if(!s.built)return;
 const rush=1+0.65*Math.sin((s.time/3600-6)/12*Math.PI);const demand=Math.max(0.2,1-(s.fare-2.8)*0.1);
 for(const station of s.stations)station.waiting=Math.min(5000,station.waiting+dt*(0.12+Math.max(0,rush)*0.11)*demand);
 const offsets=stationOffsets(s),length=routeLength(s);
 for(const t of s.trains){
 if(t.dwell>0){t.dwell=Math.max(0,t.dwell-dt);continue;}
 const next=s.stations.map((p,i)=>({p,d:offsets[i]})).filter(p=>t.direction===1?p.d>=t.position-0.01:p.d<=t.position+0.01).filter(p=>p.p.id!==t.lastStop).sort((a,b)=>t.direction*(a.d-b.d))[0];
 if(!next){t.direction=t.direction===1?-1:1;t.lastStop=null;continue;}
 const remaining=Math.abs(next.d-t.position);const target=Math.min(19.4,Math.sqrt(2*0.95*remaining)); t.speed=Math.max(0,Math.min(target,t.speed+0.85*dt));const move=Math.min(remaining,Math.max(0.2,t.speed)*dt);t.position=Math.max(0,Math.min(length,t.position+t.direction*move));t.distance+=move;
 if(remaining<=move+0.001){t.position=next.d;t.speed=0;t.lastStop=next.p.id;t.dwell=22;const terminal=next.d===0||next.d===length;const exits=terminal?t.passengers:Math.floor(t.passengers*0.55);t.passengers-=exits;s.delivered+=exits;const board=Math.min(CAPACITY-t.passengers,Math.floor(next.p.waiting));next.p.waiting-=board;t.passengers+=board;const revenue=board*s.fare;if(revenue){transaction(s,'Passenger fares',revenue);s.revenue+=revenue;}if(terminal)t.direction=next.d===0?1:-1;}
 }
 // Prototype assumptions: station overhead, crew and energy. Values are illustrative, not sourced estimates.
 const expense=dt*(s.stations.length*0.18+s.trains.reduce((sum,t)=>sum+0.24+t.speed*0.035,0));s.money-=expense;s.operatingCosts+=expense;
}
export function validateSave(value:unknown):value is State { if(!value||typeof value!=='object')return false;const s=value as State;return s.version===1&&Number.isFinite(s.money)&&Number.isFinite(s.time)&&Array.isArray(s.stations)&&s.stations.length>=2&&s.stations.length<=8&&s.stations.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&[p.x,p.z,p.depth,p.waiting].every(Number.isFinite)&&p.depth>=8&&p.depth<=80&&Math.abs(p.x)<=10000&&Math.abs(p.z)<=10000)&&typeof s.built==='boolean'&&Array.isArray(s.trains)&&s.trains.length<=4&&s.trains.every(t=>typeof t.id==='string'&&[t.position,t.speed,t.passengers,t.dwell,t.distance].every(Number.isFinite)&&(t.direction===1||t.direction===-1)&&t.position>=0&&t.position<=routeLength(s)&&t.passengers>=0&&t.passengers<=CAPACITY)&&Array.isArray(s.orders)&&s.orders.length+s.trains.length<=4&&s.orders.every(Number.isFinite)&&Array.isArray(s.ledger)&&s.ledger.every(e=>typeof e.label==='string'&&Number.isFinite(e.time)&&Number.isFinite(e.amount))&&[s.delivered,s.revenue,s.operatingCosts,s.capitalCosts,s.fare].every(Number.isFinite)&&s.fare>=0&&s.fare<=10; }
