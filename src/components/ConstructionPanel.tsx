import type { ConstructionSettings } from './stationPlacement';
import { useEffect, useRef, useState } from 'react';
import { Hammer, LockKeyhole, Minus, Plus, TrainTrack, Trash2, X } from 'lucide-react';

const MIN_DEPTH=-100,MAX_DEPTH=-5;
function boundedDepth(value:number){return Math.max(MIN_DEPTH,Math.min(MAX_DEPTH,-Math.abs(Math.trunc(value))));}

export default function ConstructionPanel({open,onOpenChange,settings,onSettingsChange,blueprints,drawing,selected,onBuild,onClear,onDelete,constructedSelected,onDemolish,trackBlueprints,trackHint,connectedCount}:{open:boolean;onOpenChange:(open:boolean)=>void;settings:ConstructionSettings;onSettingsChange:(patch:Partial<ConstructionSettings>)=>void;blueprints:number;drawing:boolean;selected:boolean;onBuild:()=>void;onClear:()=>void;onDelete:()=>void;constructedSelected:boolean;onDemolish:()=>void;trackBlueprints:number;trackHint:string;connectedCount:number}){
 const {tool,platforms,tracks,depth}=settings;
 const [draft,setDraft]=useState('-25');
 const trigger=useRef<HTMLButtonElement>(null);
 const firstTool=useRef<HTMLButtonElement>(null);
 const wasOpen=useRef(false);
 useEffect(()=>{if(open)firstTool.current?.focus();else if(wasOpen.current){commit();trigger.current?.focus();}wasOpen.current=open;},[open]);
 function commit(value=draft){const parsed=value.trim()===''?NaN:Number(value);const next=Number.isFinite(parsed)?boundedDepth(parsed):depth;onSettingsChange({depth:next});setDraft(String(next));return next;}
 function step(delta:number){const parsed=Number(draft);const next=boundedDepth((draft.trim()&&Number.isFinite(parsed)?boundedDepth(parsed):depth)+delta);onSettingsChange({depth:next});setDraft(String(next));}
 return <div className="construction-controls">
   {open&&<section className="construction-panel" aria-labelledby="construction-title" id="construction-panel">
     <header><h2 id="construction-title">Construction</h2><button onClick={()=>onOpenChange(false)} aria-label="Close construction"><X size={15}/></button></header>
     <div className="construction-segmented" aria-label="Construction tool">
       <button ref={firstTool} className={tool==='station'?'selected':''} aria-pressed={tool==='station'} onClick={()=>onSettingsChange({tool:'station'})}>Station</button>
       <button className={tool==='track'?'selected':''} aria-pressed={tool==='track'} onClick={()=>onSettingsChange({tool:'track'})}><TrainTrack size={13}/> Track</button>
     </div>
     <div className="construction-section">
       <span className="construction-label">{tool==='station'?'Platform layout':'Number of tracks'}</span>
       {tool==='station'?<div className="construction-segmented" aria-label="Platform layout">{(['side','island'] as const).map(value=><button key={value} aria-pressed={platforms===value} className={platforms===value?'selected':''} onClick={()=>onSettingsChange({platforms:value})}>{value==='side'?'Side':'Island'}</button>)}</div>:<div className="construction-segmented" aria-label="Number of tracks">{(['single','parallel'] as const).map(value=><button key={value} aria-pressed={tracks===value} className={tracks===value?'selected':''} onClick={()=>onSettingsChange({tracks:value})}>{value==='single'?'Single':'Parallel'}</button>)}<button disabled title="Four-track construction is not available yet"><LockKeyhole size={10}/> Quad</button></div>}
       <p className="construction-description">{tool==='station'?(platforms==='side'?'Two tracks · platforms on both sides':'Two tracks · one central platform'):(tracks==='single'?'One track along the planned path':'Two tracks along the planned path')}</p>
     </div>
     <div className="construction-section">
       <label className="construction-label" htmlFor="construction-depth">{tool==='track'?'End depth':'Depth'}</label>
       <div className="construction-depth">
         <button aria-label="Increase construction depth" disabled={depth===MIN_DEPTH} onClick={()=>step(-1)}><Minus size={14}/></button>
         <div><input id="construction-depth" aria-label="Construction depth in metres" type="number" min={MIN_DEPTH} max={MAX_DEPTH} step="1" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={()=>commit()} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><span>m</span></div>
         <button aria-label="Decrease construction depth" disabled={depth===MAX_DEPTH} onClick={()=>step(1)}><Plus size={14}/></button>
       </div>
       <p className="construction-description">Below ground · rail level · 5–100 m</p>
     </div>
     <div className="construction-locked"><span><LockKeyhole size={11}/> Crossovers</span><span>Coming later</span></div>
     <p className="construction-placement-hint" role="status">{tool==='track'?(trackHint||'Click a station port or the map to start'):drawing?'Move to set length · click to finish · Esc cancels':'Click the map to start · stretch 100–300 m'}</p>{selected&&<button className="construction-delete" onClick={onDelete}><Trash2 size={12}/> Delete selected blueprint</button>}{constructedSelected&&<button className="construction-delete" onClick={onDemolish}><Trash2 size={12}/> Demolish</button>}{connectedCount>0&&(selected||constructedSelected)&&<p className="construction-description">Also removes {connectedCount} connected section{connectedCount===1?'':'s'}.</p>}<footer><div className="construction-cost"><span>Track blueprints</span><span>{trackBlueprints}</span></div><div className="construction-cost"><span>Station blueprints</span><span>{blueprints}</span></div><div className="construction-cost"><span>Estimated cost</span><span>—</span></div><button className="construction-build" disabled={!(blueprints+trackBlueprints)||drawing} onClick={onBuild}>Build</button><button className="construction-clear" disabled={!(blueprints+trackBlueprints)&&!drawing} onClick={onClear}><Trash2 size={12}/> Clear</button><p>No cost, slope or clearance checks yet.</p></footer>
   </section>}
   <button ref={trigger} className={`construction-toggle ${open?'active':''}`} onClick={()=>onOpenChange(!open)} aria-label="Construction" title="Construction" aria-expanded={open} aria-controls="construction-panel"><Hammer size={18}/></button>
 </div>;
}
