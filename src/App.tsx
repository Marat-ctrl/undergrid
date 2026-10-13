import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, Check, ChevronRight, Compass, HelpCircle, LoaderCircle, Menu, RotateCcw, X } from 'lucide-react';
import type { DisplayOptions, DisplayPreset } from './components/mapStyle';
import type { MapControls, MapStatus } from './components/NewYorkMap';
import { DEFAULT_CAMERA, type SavedCamera, type QuickSave } from './gameSave';
import { createQuickSaver, readQuickSave } from './localSave';
const NewYorkMap = lazy(() => import('./components/NewYorkMap'));

type Screen = 'boot' | 'home' | 'cities' | 'loading' | 'world';
function CityArtwork() {
  return <svg className="city-art" viewBox="0 0 800 800" aria-hidden="true">
    <defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d5d7cf" strokeWidth="1"/></pattern></defs>
    <rect width="800" height="800" fill="#eef0e9"/>
    <path d="M0 0H430L440 150 332 285 218 455 180 570 250 685 190 800H0Z" fill="#d9ded0"/>
    <path d="M550 0H800V800H295L300 650 380 530 442 404 420 343 520 180Z" fill="#d9ded0"/>
    <path d="M472 190L505 210 451 351 362 470 319 504 302 483 376 356Z" fill="#d9ded0"/>
    <rect width="800" height="800" fill="url(#grid)" opacity=".55"/>
    <path d="M488 222L434 329 366 426 326 485 398 550 523 575 640 632" fill="none" stroke="#314f43" strokeWidth="5"/>
    <path d="M240 730L330 587 326 485 270 410 190 363" fill="none" stroke="#c3805c" strokeWidth="5"/>
    {[ [488,222],[434,329],[366,426],[326,485],[398,550],[523,575],[640,632],[330,587],[270,410] ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="7" fill="#f5f5ef" stroke={i<7?'#314f43':'#c3805c'} strokeWidth="3"/>)}
  </svg>;
}
export default function App() {
  const [display,setDisplay]=useState<DisplayOptions>({preset:'clean',buildings:false});
  const [screen, setScreen] = useState<Screen>('boot');
  const [status, setStatus] = useState<MapStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [pausedMenu, setPausedMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [initialCamera,setInitialCamera]=useState<SavedCamera>(DEFAULT_CAMERA);
  const [saveError,setSaveError]=useState('');
  const camera=useRef<SavedCamera>(DEFAULT_CAMERA);
  const activeWorld=useRef(false);
  const displayRef=useRef(display);displayRef.current=display;
  const saver=useRef<ReturnType<typeof createQuickSaver>|null>(null);
  useEffect(()=>{
    const writer=createQuickSaver(()=>setSaveError('Quick save could not be written.'));saver.current=writer;
    let alive=true;
    void readQuickSave().then(save=>{if(!alive)return;if(save){camera.current=save.camera;setInitialCamera(save.camera);setDisplay({preset:save.preset,buildings:save.preset==='detailed'});activeWorld.current=save.active;setScreen(save.active?'loading':'home');}else setScreen('home');}).catch(()=>{if(alive){setSaveError('Quick save could not be loaded. Start a new world to replace it.');setScreen('home');}});
    const flush=()=>writer.flush(true);const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);
    return()=>{alive=false;window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);writer.dispose();saver.current=null;};
  },[]);
  function persist(immediate=false){const save:QuickSave={version:1,city:'new-york',active:activeWorld.current,updatedAt:Date.now(),camera:{...camera.current},preset:displayRef.current.preset};saver.current?.save(save,immediate);}
  useEffect(()=>{if(activeWorld.current)persist();},[display]);
  function cameraChanged(next:SavedCamera){camera.current=next;if(activeWorld.current)persist();}
  function exitWorld(next:'home'|'cities'){activeWorld.current=false;persist(true);setPausedMenu(false);setStatus('loading');setScreen(next);}
  const controls = useRef<MapControls | null>(null);
  const worldMounted = screen === 'loading' || screen === 'world';
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (help) setHelp(false);
        else if (screen === 'world') setPausedMenu(value => !value);
        else if (screen === 'cities') setScreen('home');
        else if (screen === 'loading') exitWorld('cities');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, help]);
  function start() { camera.current={...DEFAULT_CAMERA};setInitialCamera(camera.current);activeWorld.current=true;setSaveError('');persist(true);setStatus('loading');setAttempt(value=>value+1);setScreen('loading'); }
  function retryWorld(){setInitialCamera({...camera.current});setStatus('loading');setAttempt(value=>value+1);setScreen('loading');}
  function mapStatus(next: MapStatus) { setStatus(next); if (next === 'ready') setScreen('world'); }
  function leave() { exitWorld('home'); }
  return <main className="game">
    {screen==='boot'&&<div className="loading-screen"><div className="loading-content"><LoaderCircle className="spinner" size={23}/><small>Restoring quick save</small></div></div>}
    {saveError&&<div className="save-error" role="alert">{saveError}<button onClick={()=>setSaveError('')} aria-label="Dismiss save message"><X size={14}/></button></div>}
    {worldMounted && <Suspense fallback={null}><NewYorkMap key={attempt} onStatus={mapStatus} controls={controls} display={display} initialCamera={initialCamera} onCamera={cameraChanged}/></Suspense>}
    {(screen === 'home' || screen === 'cities') && <div className="title-screen">
      <div className="title-art"><CityArtwork/><span className="art-label">A CITY WAITING TO CONNECT.</span></div>
      <div className="title-panel"><div className="wordmark">undergrid<span className="logo-dot"/></div><p className="tagline">Build the city beneath the city.</p>
      {screen === 'home' ? <nav className="main-menu" aria-label="Main menu"><button className="menu-primary" onClick={() => setScreen('cities')}>New Game <ArrowRight size={19}/></button><button onClick={() => setHelp(true)}>How to play <HelpCircle size={17}/></button></nav> : <div className="city-selection">
        <button className="back-link" onClick={() => setScreen('home')}><ArrowLeft size={14}/> Back</button>
        <h1>Choose your city.</h1>
        <button className="city-card selected" aria-pressed="true" aria-label="Select New York"><div className="city-monogram">NYC</div><div><strong>New York</strong><span>United States</span></div><Check size={17}/></button>
        <p className="city-description">Five boroughs. One connected region.<br/>New York City and its surrounding neighborhoods.</p>
        <button className="menu-primary start-button" onClick={start}>Start <ArrowRight size={19}/></button>
      </div>}
      <div className="title-footer"><span>METRO SIMULATION</span><span>ALPHA · 0.4</span></div></div>
    </div>}
    {screen === 'loading' && <div className="loading-screen"><div className="loading-content"><span className="loading-city">NEW YORK</span><h1>{status === 'error' ? 'The city is out of reach.' : 'Loading your world.'}</h1><p>{status === 'error' ? 'Map tiles could not be loaded. Check your internet connection and try again.' : 'Connecting streets, neighborhoods and possibilities.'}</p>{status === 'error' ? <div className="loading-actions"><button className="menu-primary" onClick={retryWorld}><RotateCcw size={16}/> Try again</button><button onClick={() => exitWorld('cities')}>Back to cities</button></div> : <><LoaderCircle size={23} className="spinner"/><small>Fetching OpenStreetMap tiles</small><button className="loading-cancel" onClick={() => exitWorld('cities')}>Cancel</button></>}</div><span className="loading-credit">Map data © OpenStreetMap contributors</span></div>}
    {screen === 'world' && <>
      <header className="world-header"><button className="world-menu-button" onClick={() => setPausedMenu(true)} aria-label="Open menu"><Menu size={15}/></button><span className="world-city">New York</span></header>
      <div className="world-tools" aria-label="Map controls"><div className="display-presets" aria-label="Map detail">{(['clean','detailed'] as DisplayPreset[]).map(preset=><button key={preset} className={display.preset===preset?'selected':''} aria-pressed={display.preset===preset} onClick={()=>setDisplay({preset,buildings:preset==='detailed'})}>{preset.charAt(0).toUpperCase()+preset.slice(1)}</button>)}</div><button className="world-tool" onClick={()=>controls.current?.tilt()} aria-label="Toggle tilted view" title="Toggle tilted view"><Box size={16}/></button><button className="world-tool" onClick={()=>controls.current?.north()} aria-label="Face north" title="Face north"><Compass size={16}/></button></div>
      <div className="world-attribution" aria-label="Map attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a><span> · </span><a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a><span> · </span><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a></div>
      {status === 'error' && <div className="map-error" role="alert">Some map tiles could not be loaded.<button onClick={retryWorld}>Retry <RotateCcw size={13}/></button></div>}
    </>}
    {(pausedMenu || help) && <div className="dialog-shade"><section className="dialog" role="dialog" aria-modal="true" aria-label={help ? 'How to play' : 'Game menu'}><button className="close-dialog" onClick={() => { setHelp(false); setPausedMenu(false); }} aria-label="Close menu"><X size={19}/></button><span className="dialog-eyebrow">UNDERGRID</span><h2>{help ? 'Explore your first world.' : 'New York'}</h2>{help ? <><p>Choose New Game, select New York and start your world.</p><p>Drag to move around the city. Scroll to zoom. Right-drag or Ctrl + drag to rotate and tilt. Choose Clean or Detailed at the top right. Detailed includes 3D buildings. The cube toggles tilt; the compass faces north without changing your location or zoom. Press Escape to open the menu.</p><p className="help-note">This milestone includes the main menu and the New York map. Construction and simulation tools will return in a later stage. Map loading requires an internet connection.</p><button className="menu-primary" onClick={() => setHelp(false)}>Got it <ChevronRight size={17}/></button></> : <nav className="pause-menu"><button className="menu-primary" onClick={() => setPausedMenu(false)}>Resume <ArrowRight size={18}/></button><button onClick={() => {setPausedMenu(false);setHelp(true);}}>Controls <HelpCircle size={16}/></button><button onClick={leave}>Main menu <ArrowLeft size={16}/></button></nav>}</section></div>}
  </main>;
}
