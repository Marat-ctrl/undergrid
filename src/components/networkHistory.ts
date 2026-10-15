import type { PlacedStation } from './stationPlacement';
import { trackUsesStation,tracksToRemove,type PlacedTrack } from './trackPlacement';
import type { MetroLine } from './metroLines';
export interface NetworkSnapshot { stations:PlacedStation[]; tracks:PlacedTrack[]; lines?:MetroLine[]; }
export function removeNetworkAsset(snapshot:NetworkSnapshot,stationId:string|null,trackId:string|null,stage:PlacedStation['stage']):NetworkSnapshot{
 const station=snapshot.stations.find(asset=>asset.id===stationId&&asset.stage===stage);
 const track=snapshot.tracks.find(asset=>asset.id===trackId&&asset.stage===stage);
 if(!station&&!track)return snapshot;
 const roots=station?snapshot.tracks.filter(asset=>trackUsesStation(asset,station.id)).map(asset=>asset.id):[track!.id];
 const removed=tracksToRemove(snapshot.tracks,roots);
 return {stations:station?snapshot.stations.filter(asset=>asset.id!==station.id):snapshot.stations,tracks:snapshot.tracks.filter(asset=>!removed.has(asset.id)),...(snapshot.lines?{lines:snapshot.lines}:{})};
}
export class NetworkHistory {
 private snapshots:NetworkSnapshot[]=[];
 constructor(private limit=50){}
 get size(){return this.snapshots.length;}
 push(snapshot:NetworkSnapshot){this.snapshots.push(structuredClone(snapshot));if(this.snapshots.length>this.limit)this.snapshots.shift();}
 pop(){return this.snapshots.pop()??null;}
 clear(){this.snapshots=[];}
}
