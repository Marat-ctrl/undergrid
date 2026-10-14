import { useEffect,useRef,useState } from 'react';
import { ArrowRight,LoaderCircle,Save,X } from 'lucide-react';
import { listNamedSaves,validSaveName,type SaveSummary } from '../namedSaves';
export default function SaveDialog({mode,onClose,onSave,onLoad}:{mode:'save'|'load';onClose:()=>void;onSave:(name:string)=>Promise<void>;onLoad:(id:string)=>Promise<void>}){
 const [name,setName]=useState('New York'),[entries,setEntries]=useState<SaveSummary[]>([]),[loading,setLoading]=useState(mode==='load'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const input=useRef<HTMLInputElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(mode==='save'){input.current?.focus();input.current?.select();}else close.current?.focus();},[mode]);
 useEffect(()=>{if(mode!=='load')return;let alive=true;setLoading(true);setError('');void listNamedSaves().then(data=>{if(alive)setEntries(data);}).catch(()=>{if(alive)setError('Saved games could not be loaded.');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[mode,retry]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await action();onClose();}catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}
 return <div className="dialog-shade" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(!busy)onClose();}}}><section className="dialog save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-dialog-title">
   <button ref={close} className="close-dialog" disabled={busy} onClick={onClose} aria-label="Close saved games"><X size={19}/></button>
   <span className="dialog-eyebrow">UNDERGRID</span><h2 id="save-dialog-title">{mode==='save'?'Save game':'Load game'}</h2>
   {mode==='save'?<form onSubmit={event=>{event.preventDefault();if(!validSaveName(name)){setError('Enter a name with 1–60 characters.');return;}void run(()=>onSave(name.trim()));}}>
     <label htmlFor="save-name">Save name</label><input ref={input} id="save-name" maxLength={60} value={name} disabled={busy} onChange={event=>setName(event.target.value)} autoComplete="off"/>
     <button className="menu-primary save-submit" disabled={busy||!name.trim()} type="submit">{busy?<><span>Saving…</span><LoaderCircle size={17} className="spinner"/></>:<><span>Save</span><Save size={17}/></>}</button>
   </form>:loading?<p className="save-loading" role="status"><LoaderCircle size={17} className="spinner"/> Loading saved games…</p>:<>
     {entries.length>0?<div className="save-list" aria-label="Saved games">{entries.map(entry=><button key={entry.id} disabled={busy} onClick={()=>void run(()=>onLoad(entry.id))} aria-label={`Load ${entry.name}`}><span><strong>{entry.name}</strong><small>New York · {new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(entry.createdAt)}</small><small>{entry.stations} stations / depots · {entry.tracks} track sections</small></span><ArrowRight size={17}/></button>)}</div>:!error&&<p>No saved games yet. Use Save in the game menu to create one.</p>}
     {busy&&<p role="status">Loading your world…</p>}
   </>}
   {error&&<p className="save-dialog-error" role="alert">{error}</p>}
   {mode==='load'&&error&&entries.length===0&&<button className="menu-primary" onClick={()=>setRetry(value=>value+1)}>Try again</button>}
 </section></div>;
}
