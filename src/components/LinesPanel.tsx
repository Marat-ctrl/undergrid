import { ArrowDown,ArrowLeft,ArrowUp,Check,Plus,Route,Trash2,Undo2,X } from 'lucide-react';
import { LINE_COLORS,MAX_LINES,MAX_LINE_STOPS,platformName,type PlatformSide,type LineRoute,type MetroLine } from './metroLines';
import { elevationText } from './constructionDimensions';
import type { PlacedStation } from './stationPlacement';

export default function LinesPanel({open,onOpenChange,lines,selectedId,onSelect,draft,onDraftChange,onCreate,onCancel,onSave,onDelete,onAddStop,stations,route,statuses,notice,onUndo,canUndo}:{
 open:boolean;onOpenChange:(open:boolean)=>void;lines:MetroLine[];selectedId:string|null;onSelect:(id:string)=>void;draft:MetroLine|null;onDraftChange:(line:MetroLine)=>void;onCreate:()=>void;onCancel:()=>void;onSave:()=>void;onDelete:(id:string)=>void;onAddStop:(id:string,side:PlatformSide)=>void;stations:PlacedStation[];route:LineRoute|null;statuses:Map<string,LineRoute>;notice:string;onUndo:()=>void;canUndo:boolean;
}){
 const active=draft??lines.find(line=>line.id===selectedId),built=stations.filter(station=>station.stage==='constructed'&&station.kind!=='depot');
 const stationName=(id:string)=>stations.find(station=>station.id===id)?.name??'Missing station';
 const closed=!!draft&&draft.stationIds.length>2&&draft.stationIds[0]===draft.stationIds.at(-1);
 const choices=built.filter(station=>!draft?.stationIds.includes(station.id));
 const move=(index:number,delta:number)=>{if(!draft)return;const stops=[...draft.stationIds],target=index+delta;if(target<0||target>=stops.length)return;[stops[index],stops[target]]=[stops[target],stops[index]];const platforms=[...(draft.platforms??stops.map(()=>'right' as const))];[platforms[index],platforms[target]]=[platforms[target],platforms[index]];onDraftChange({...draft,stationIds:stops,platforms});};
 return <div className="lines-controls">
   {open&&<section className="lines-panel" aria-label="Metro lines">
     <header><div>{draft&&<button onClick={onCancel} aria-label="Back to lines"><ArrowLeft size={15}/></button>}<h2>{draft?(lines.some(line=>line.id===draft.id)?'Edit line':'Create line'):'Lines'}</h2></div><button onClick={()=>onOpenChange(false)} aria-label="Close lines"><X size={15}/></button></header>
     {draft?<>
       <label className="line-field">Name<input aria-label="Line name" maxLength={40} value={draft.name} onChange={event=>onDraftChange({...draft,name:event.target.value})}/></label>
       <div className="line-colors" aria-label="Line color">{LINE_COLORS.map(color=><button key={color} style={{backgroundColor:color}} aria-label={`Line color ${color}`} aria-pressed={draft.color===color} onClick={()=>onDraftChange({...draft,color})}>{draft.color===color&&<Check size={14}/>}</button>)}</div>
       <div className="line-stops-heading"><h3>Stops</h3><span>{draft.stationIds.length} / {MAX_LINE_STOPS}</span></div>
       <p className="line-hint">Click the boarding side of each platform in travel order. For an island, choose its left or right edge.</p>
       <ol className="line-stop-list">{draft.stationIds.map((id,index)=>{const station=stations.find(item=>item.id===id);return <li key={`${index}:${id}`}><span className="line-stop-number" style={{color:draft.color}}>{index+1}</span><span><strong>{stationName(id)}</strong><small>{station?`${elevationText(station.depth)} m`:'Removed from the network'}</small><select aria-label={`Platform for stop ${index+1}`} value={draft.platforms?.[index]??''} onChange={event=>{const platforms=draft.platforms?[...draft.platforms]:draft.stationIds.map(()=>'right' as PlatformSide);platforms[index]=event.target.value as PlatformSide;onDraftChange({...draft,platforms});}}><option value="" disabled>Choose platform</option>{(['left','right'] as const).map(side=><option key={side} value={side}>{platformName(side)}</option>)}</select></span><div><button disabled={index===0||closed} onClick={()=>move(index,-1)} aria-label={`Move stop ${index+1} up`}><ArrowUp size={12}/></button><button disabled={index===draft.stationIds.length-1||closed} onClick={()=>move(index,1)} aria-label={`Move stop ${index+1} down`}><ArrowDown size={12}/></button><button onClick={()=>onDraftChange({...draft,stationIds:draft.stationIds.filter((_,i)=>i!==index),...(draft.platforms?{platforms:draft.platforms.filter((_,i)=>i!==index)}:{})})} aria-label={`Remove stop ${index+1}`}><X size={13}/></button></div></li>;})}</ol>
       <select aria-label="Add station to line" value="" disabled={!choices.length||closed||draft.stationIds.length>=MAX_LINE_STOPS} onChange={event=>{if(event.target.value){const [id,side]=JSON.parse(event.target.value) as [string,PlatformSide];onAddStop(id,side);}}}><option value="">{built.length?'Choose a station…':'Build stations to add stops'}</option>{choices.map(station=><optgroup key={station.id} label={station.name}>{(['left','right'] as const).map(side=><option key={side} value={JSON.stringify([station.id,side])}>{station.name} · {platformName(side)}</option>)}</optgroup>)}</select>
       {draft.stationIds.length>=2&&!closed&&draft.stationIds.length<MAX_LINE_STOPS&&<button className="line-text-button" onClick={()=>onAddStop(draft.stationIds[0],draft.platforms?.[0]??'right')}>Close loop at {stationName(draft.stationIds[0])}</button>}
       {(notice||route?.issue)&&<p className="line-route-error" role="status">{notice||route?.issue}</p>}
       {route?.ready&&<p className="line-route-ready"><Check size={13}/> Connected · {(route.metres/1000).toFixed(2)} km</p>}
       <button className="menu-primary line-save" disabled={!route?.ready||!draft.name.trim()||/[\u0000-\u001f\u007f]/.test(draft.name)} onClick={onSave}>Save line <Check size={15}/></button>
       <button className="line-text-button" onClick={onCancel}>Cancel changes</button>
     </>:<>
       <p className="line-hint">Define routes over your built tracks. Each connection follows the direction arrows.</p>
       <div className="line-list">{lines.map(line=>{const status=statuses.get(line.id);return <button key={line.id} className={selectedId===line.id?'active':''} onClick={()=>onSelect(line.id)}><span className="line-color-dot" style={{backgroundColor:line.color}}/><span><strong>{line.name}</strong><small>{line.stationIds.length} stops · {status?.ready?`${(status.metres/1000).toFixed(2)} km`:'Broken route'}</small></span><span className={`line-state ${status?.ready?'ready':'broken'}`}>{status?.ready?'Ready':'Broken'}</span></button>;})}</div>
       {!lines.length&&<div className="lines-empty"><Route size={25}/><strong>Your first line starts here.</strong><p>Build connected stations, then choose their order.</p></div>}
       {active&&<div className="line-details"><h3>{active.name}</h3><ol>{active.stationIds.map((id,i)=><li key={`${i}:${id}`}>{stationName(id)}{active.platforms&&<small> · {platformName(active.platforms[i])}</small>}</li>)}</ol>{route?.issue&&<p className="line-route-error" role="status">{route.issue}</p>}<div><button onClick={()=>onDraftChange({...active,stationIds:[...active.stationIds],...(active.platforms?{platforms:[...active.platforms]}:route?.platforms?{platforms:[...route.platforms]}:{})})}>Edit line</button><button onClick={()=>onDelete(active.id)} aria-label={`Delete line ${active.name}`}><Trash2 size={12}/> Delete line</button></div></div>}
       <button className="menu-primary line-save" disabled={lines.length>=MAX_LINES} onClick={onCreate}>Create line <Plus size={15}/></button>
       <button className="line-text-button" disabled={!canUndo} onClick={onUndo}><Undo2 size={12}/> Undo</button>
       <p className="line-footnote">Route planning only · trains are coming later.</p>
     </>}
   </section>}
   <button className={`lines-toggle ${open?'active':''}`} onClick={()=>onOpenChange(!open)} aria-label="Lines" title="Lines" aria-expanded={open}><Route size={18}/></button>
 </div>;
}
