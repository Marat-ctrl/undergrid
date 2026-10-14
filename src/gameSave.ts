import { isPlanningLayers, type PlanningLayers } from './components/underground';
import { isSavedAnalysis, type SavedAnalysis } from './components/analysisLayers';
export interface SavedCamera { lng:number; lat:number; zoom:number; pitch:number; bearing:number; }
export interface QuickSave { version:1; city:'new-york'; active:boolean; updatedAt:number; camera:SavedCamera; preset:'clean'|'detailed'; analysis?:SavedAnalysis; planning?:PlanningLayers; }
export const DEFAULT_CAMERA:SavedCamera={lng:-73.99,lat:40.735,zoom:10.7,pitch:0,bearing:0};
export function isQuickSave(value:unknown):value is QuickSave {
  if(!value||typeof value!=='object')return false;
  const s=value as QuickSave,c=s.camera;
  return (s.planning===undefined||isPlanningLayers(s.planning))&&(s.analysis===undefined||isSavedAnalysis(s.analysis))&&Number.isFinite(s.updatedAt)&&s.updatedAt>=0&&s.version===1&&s.city==='new-york'&&typeof s.active==='boolean'&&(s.preset==='clean'||s.preset==='detailed')&&!!c&&[c.lng,c.lat,c.zoom,c.pitch,c.bearing].every(Number.isFinite)&&c.lng>=-74.32&&c.lng<=-73.65&&c.lat>=40.47&&c.lat<=40.98&&c.zoom>=10&&c.zoom<=22&&c.pitch>=0&&c.pitch<=70&&Math.abs(c.bearing)<=360;
}
