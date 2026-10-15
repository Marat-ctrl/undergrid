import { isTrackList,type PlacedTrack } from './components/trackPlacement';
import { isStationList, type PlacedStation } from './components/stationPlacement';
import { isUndergroundView, type UndergroundView } from './components/undergroundView';
import { isPlanningLayers, type PlanningLayers } from './components/planningLayers';
import { isSavedAnalysis, type SavedAnalysis } from './components/analysisLayers';
import { isMetroLineList,type MetroLine } from './components/metroLines';
export interface SavedCamera { lng:number; lat:number; zoom:number; pitch:number; bearing:number; }
export interface QuickSave { version:1; city:'new-york'; active:boolean; updatedAt:number; camera:SavedCamera; preset:'clean'|'detailed'; analysis?:SavedAnalysis; planning?:PlanningLayers; underground?:UndergroundView; stationLabels?:boolean; stations?:PlacedStation[]; tracks?:PlacedTrack[]; lines?:MetroLine[]; }
export const DEFAULT_CAMERA:SavedCamera={lng:-73.99,lat:40.735,zoom:10.7,pitch:0,bearing:0};
export function isQuickSave(value:unknown):value is QuickSave {
  if(!value||typeof value!=='object')return false;
  const s=value as QuickSave,c=s.camera;
  return (s.lines===undefined||isMetroLineList(s.lines))&&(s.stationLabels===undefined||typeof s.stationLabels==='boolean')&&(s.stations===undefined||isStationList(s.stations))&&(s.tracks===undefined||isTrackList(s.tracks,s.stations??[]))&&((s.stations?.length??0)+(s.tracks?.length??0)<=200)&&(s.underground===undefined||isUndergroundView(s.underground))&&(s.planning===undefined||isPlanningLayers(s.planning))&&(s.analysis===undefined||isSavedAnalysis(s.analysis))&&Number.isFinite(s.updatedAt)&&s.updatedAt>=0&&s.version===1&&s.city==='new-york'&&typeof s.active==='boolean'&&(s.preset==='clean'||s.preset==='detailed')&&!!c&&[c.lng,c.lat,c.zoom,c.pitch,c.bearing].every(Number.isFinite)&&c.lng>=-74.32&&c.lng<=-73.65&&c.lat>=40.47&&c.lat<=40.98&&c.zoom>=10&&c.zoom<=22&&c.pitch>=0&&c.pitch<=70&&Math.abs(c.bearing)<=360;
}
