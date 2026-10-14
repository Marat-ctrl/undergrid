import type { PlacedStation } from './stationPlacement';
import type { PlacedTrack } from './trackPlacement';
export interface NetworkSnapshot { stations:PlacedStation[]; tracks:PlacedTrack[]; }
export class NetworkHistory {
 private snapshots:NetworkSnapshot[]=[];
 constructor(private limit=50){}
 get size(){return this.snapshots.length;}
 push(snapshot:NetworkSnapshot){this.snapshots.push(structuredClone(snapshot));if(this.snapshots.length>this.limit)this.snapshots.shift();}
 pop(){return this.snapshots.pop()??null;}
 clear(){this.snapshots=[];}
}
