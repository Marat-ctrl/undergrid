import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Compass, FolderOpen, Hammer, Layers, X } from 'lucide-react';

const topics=[{id:'camera',title:'Camera',icon:Compass},{id:'construction',title:'Construction',icon:Hammer},{id:'layers',title:'Map layers',icon:Layers},{id:'saves',title:'Saves',icon:FolderOpen}] as const;
type Topic=typeof topics[number]['id'];

export default function HowToPlay({onClose}:{onClose:()=>void}){
 const [topic,setTopic]=useState<Topic>('camera');
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>previous?.focus();},[]);
 return <div className="dialog-shade help-shade"><section className="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
   <button ref={close} className="close-dialog" onClick={onClose} aria-label="Close how to play"><X size={19}/></button>
   <header><span className="dialog-eyebrow">UNDERGRID · FIELD GUIDE</span><h2 id="help-title">Make the city move.</h2><p className="help-intro">Explore New York. Plan stations, connect tracks and build your network.</p></header>
   <nav className="help-topics" aria-label="Help topics">{topics.map(item=><button key={item.id} aria-pressed={topic===item.id} onClick={()=>setTopic(item.id)}>{item.title}</button>)}</nav>
   <div className="help-grid">
     {topics.map(({id,title,icon:Icon},i)=><section key={id} className="help-card" data-active={topic===id} aria-labelledby={`help-${id}`}>
       <h3 id={`help-${id}`}><Icon size={16}/>{title}<span>0{i+1}</span></h3>
       {id==='camera'?<dl>
         <div><dt>Drag</dt><dd>Pan the map</dd></div>
         <div><dt>Scroll</dt><dd>Zoom in or out</dd></div>
         <div><dt>Right-drag<br/>or Ctrl + drag</dt><dd>Rotate and tilt together</dd></div>
         <div><dt>Cube / compass</dt><dd>Toggle tilt / face north</dd></div>
         <div><dt>Esc</dt><dd>Cancel drawing or open the menu</dd></div>
       </dl>:id==='construction'?<ul>
         <li><strong>Station</strong> — click the start, stretch 50–300 m, click to finish.</li>
         <li><strong>Track</strong> — click a connection or track, then the endpoint. Hold <kbd>Shift</kbd> for straight.</li>
         <li><strong>Depot</strong> — choose 5–30 spaces, place the entrance and direction.</li>
         <li><strong>Lines</strong> — name a route, choose a color and click platform sides in travel order.</li>
         <li><strong>Build</strong> confirms plans. <strong>Select</strong> an object to delete or demolish it.</li>
         <li>Right-click cancels drawing. <strong>Undo</strong> / <kbd>Ctrl / Cmd + Z</kbd> reverses an action.</li>
       </ul>:id==='layers'?<ul>
         <li><strong>Clean / Detailed</strong> — a quiet map or more detail with 3D buildings.</li>
         <li><strong>Population / Jobs</strong> — density and district boundaries. Click an area for details.</li>
         <li><strong>Existing rail / Foundations</strong> — planning overlays. Foundation depths are estimates.</li>
         <li>Hover a station or track for labels. <strong>Always show labels</strong> keeps them visible.</li>
       </ul>:<ul>
         <li><strong>New Game → New York → Start</strong> opens a new world.</li>
         <li>Your world saves automatically. <strong>Continue</strong> resumes the quick save.</li>
         <li>Game menu → <strong>Save</strong> creates a named snapshot.</li>
         <li>Main menu → <strong>Load Game</strong> opens your saved worlds.</li>
         <li>Undo history resets when you reload or load a save.</li>
       </ul>}
     </section>)}
   </div>
   <footer className="help-footer"><p>EARLY ALPHA <span>Train operations and the economy are coming later.</span></p><button className="menu-primary" onClick={onClose}>Got it <ArrowRight size={16}/></button></footer>
 </section></div>;
}
