import { MIN_ELEVATION as MIN_DEPTH,MAX_ELEVATION as MAX_DEPTH } from './constructionDimensions';
import type { ConstructionSettings } from './stationPlacement';
import { useEffect, useRef, useState } from 'react';
import { Hammer, LockKeyhole, Minus, Plus, TrainTrack, Warehouse, Undo2, Trash2, MousePointer2, X } from 'lucide-react';

function boundedDepth(value:number){return Math.max(MIN_DEPTH,Math.min(MAX_DEPTH,Math.trunc(value)));}

export default function ConstructionPanel({open,onOpenChange,settings,onSettingsChange,selectionName,blueprints,drawing,selected,onBuild,onClear,onDelete,constructedSelected,onDemolish,trackBlueprints,trackHint,connectedCount,validationMessage,depotBlueprints,onUndo,canUndo}:{open:boolean;onOpenChange:(open:boolean)=>void;settings:ConstructionSettings;selectionName?:string;onSettingsChange:(patch:Partial<ConstructionSettings>)=>void;blueprints:number;drawing:boolean;selected:boolean;onBuild:()=>void;onClear:()=>void;onDelete:()=>void;constructedSelected:boolean;onDemolish:()=>void;trackBlueprints:number;trackHint:string;connectedCount:number;validationMessage:string;depotBlueprints:number;onUndo:()=>void;canUndo:boolean}){
 const {tool,platforms,tracks,depth,capacity=10}=settings;
 const [capacityDraft,setCapacityDraft]=useState(String(capacity));
 useEffect(()=>setCapacityDraft(String(capacity)),[capacity]);
 useEffect(()=>setDraft(String(depth)),[depth]);
 const [draft,setDraft]=useState(String(depth));
 const trigger=useRef<HTMLButtonElement>(null);
 const firstTool=useRef<HTMLButtonElement>(null);
 const wasOpen=useRef(false);
 useEffect(()=>{if(open)firstTool.current?.focus();else if(wasOpen.current){commit();trigger.current?.focus();}wasOpen.current=open;},[open]);
 function commit(value=draft){const parsed=value.trim()===''?NaN:Number(value);const next=Number.isFinite(parsed)?boundedDepth(parsed):depth;onSettingsChange({depth:next});setDraft(String(next));return next;}
 function step(delta:number){const parsed=Number(draft);const next=boundedDepth((draft.trim()&&Number.isFinite(parsed)?boundedDepth(parsed):depth)+delta);onSettingsChange({depth:next});setDraft(String(next));}
 function commitCapacity(){const value=Number(capacityDraft);const next=capacityDraft.trim()&&Number.isFinite(value)?Math.max(5,Math.min(30,Math.trunc(value))):capacity;setCapacityDraft(String(next));onSettingsChange({capacity:next});}
 return <div className="construction-controls">
   {open&&<section className="construction-panel" aria-labelledby="construction-title" id="construction-panel">
     <header><h2 id="construction-title">Construction</h2><div className="construction-header-actions"><button className={tool==='select'?'active':''} aria-label="Select object" aria-pressed={tool==='select'} title="Select an object to delete or demolish" onClick={()=>onSettingsChange({tool:'select'})}><MousePointer2 size={13}/><span>Select</span></button><button onClick={()=>onOpenChange(false)} aria-label="Close construction"><X size={15}/></button></div></header>
     {tool==='select'?<div className="construction-selection" role="status"><strong>{selectionName||'Choose an object'}</strong><p>{constructedSelected?'Built · ready to demolish':selected?'Blueprint · ready to delete':'Click a station, track or depot on the map.'}</p><small>Undo restores a removed object and its connected sections.</small></div>:<>
     <div className="construction-segmented" aria-label="Construction tool">
       <button ref={firstTool} className={tool==='station'?'selected':''} aria-pressed={tool==='station'} onClick={()=>onSettingsChange({tool:'station'})}>Station</button>
       <button className={tool==='track'?'selected':''} aria-pressed={tool==='track'} onClick={()=>onSettingsChange({tool:'track'})}><TrainTrack size={13}/> Track</button>
       <button className={tool==='depot'?'selected':''} aria-pressed={tool==='depot'} onClick={()=>onSettingsChange({tool:'depot'})}><Warehouse size={13}/> Depot</button>
     </div>
     <div className="construction-section">
       {tool==='depot'?<>
         <label className="construction-label" htmlFor="depot-capacity">Parking capacity</label>
         <div className="depot-capacity"><input id="depot-capacity" type="number" aria-label="Depot capacity in train sets" min="5" max="30" step="1" value={capacityDraft} onChange={event=>{const value=event.target.value;setCapacityDraft(value);const parsed=Number(value);if(value.trim()&&Number.isInteger(parsed)&&parsed>=5&&parsed<=30)onSettingsChange({capacity:parsed});}} onBlur={commitCapacity} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><span>train sets</span></div>
         <p className="construction-description">5–30 parking spaces · 200 m storage · adaptive switch throat</p>
       </>:<>
         <span className="construction-label">{tool==='station'?'Platform layout':'Number of tracks'}</span>
         {tool==='station'?<div className="construction-segmented" aria-label="Platform layout">{(['side','island'] as const).map(value=><button key={value} aria-pressed={platforms===value} className={platforms===value?'selected':''} onClick={()=>onSettingsChange({platforms:value})}>{value==='side'?'Side':'Island'}</button>)}</div>:<div className="construction-segmented" aria-label="Number of tracks">{(['single','parallel'] as const).map(value=><button key={value} aria-pressed={tracks===value} className={tracks===value?'selected':''} onClick={()=>onSettingsChange({tracks:value})}>{value==='single'?'Single':'Parallel'}</button>)}<button disabled title="Four-track construction is not available yet"><LockKeyhole size={10}/> Quad</button></div>}
         <p className="construction-description">{tool==='station'?(platforms==='side'?'Two tracks · platforms on both sides':'Two tracks · one central platform'):(tracks==='single'?'One track along the planned path':'Two tracks along the planned path')}</p>
       </>}
     </div>
     <div className="construction-section">
       <label className="construction-label" htmlFor="construction-depth">{tool==='track'?'End elevation':'Elevation'}</label>
       <div className="construction-depth">
         <button aria-label="Lower construction elevation" disabled={depth===MIN_DEPTH} onClick={()=>step(-1)}><Minus size={14}/></button>
         <div><input id="construction-depth" aria-label="Construction elevation in metres" type="number" min={MIN_DEPTH} max={MAX_DEPTH} step="1" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={()=>commit()} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><span>m</span></div>
         <button aria-label="Raise construction elevation" disabled={depth===MAX_DEPTH} onClick={()=>step(1)}><Plus size={14}/></button>
       </div>
       <p className="construction-description">Rail level · −100 to +50 m · ground at 0 m</p>
     </div>
     {tool!=='depot'&&<div className="construction-locked"><span><LockKeyhole size={11}/> Automatic crossovers</span><span>Coming later</span></div>}
     <p className="construction-placement-hint" role="status">{tool==='track'?(trackHint||'Click a track or connection point · hold Shift for straight'):tool==='depot'?(drawing?'Move to set direction · click to finish · right-click cancels':'Click to place the depot entrance'):drawing?'Move to set length · click to finish · right-click cancels':'Click the map or a free track end · stretch 50–300 m'}</p></>}{selected&&<button className="construction-delete" onClick={onDelete}><Trash2 size={12}/> Delete selected blueprint</button>}{constructedSelected&&<button className="construction-delete" onClick={onDemolish}><Trash2 size={12}/> Demolish selected object</button>}{connectedCount>0&&(selected||constructedSelected)&&<p className="construction-description">Also removes {connectedCount} connected section{connectedCount===1?'':'s'}.</p>}<footer><div className="construction-cost"><span>Track blueprints</span><span>{trackBlueprints}</span></div><div className="construction-cost"><span>Station blueprints</span><span>{blueprints}</span></div><div className="construction-cost"><span>Depot blueprints</span><span>{depotBlueprints}</span></div><div className="construction-cost"><span>Estimated cost</span><span>—</span></div>{validationMessage&&<p className="construction-error" role="alert">{validationMessage}</p>}<button className="construction-build" disabled={!(blueprints+trackBlueprints+depotBlueprints)||drawing||!!validationMessage} onClick={onBuild}>Build</button><button className="construction-clear" disabled={!canUndo&&!drawing} onClick={onUndo} title="Ctrl / Cmd + Z"><Undo2 size={12}/> Undo</button><button className="construction-clear" disabled={!(blueprints+trackBlueprints+depotBlueprints)&&!drawing} onClick={onClear}><Trash2 size={12}/> Clear</button><p>Heavy Metro · R ≥ 20 m · grade ≤ 16%
No cost or clearance checks yet.</p></footer>
   </section>}
   <button ref={trigger} className={`construction-toggle ${open?'active':''}`} onClick={()=>onOpenChange(!open)} aria-label="Construction" title="Construction" aria-expanded={open} aria-controls="construction-panel"><Hammer size={18}/></button>
 </div>;
}
