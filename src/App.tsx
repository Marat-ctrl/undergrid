import SaveDialog from './components/SaveDialog';
import { createNamedSave,readNamedSave } from './namedSaves';
import { NetworkHistory } from './components/networkHistory';
import { stationConnector,type StationAttachment } from './components/stationConnection';
import { trackUsesStation,tracksToRemove,blueprintErrors,type PlacedTrack } from './components/trackPlacement';
import { DEFAULT_CONSTRUCTION, MAX_STATIONS, type ConstructionSettings, type PlacedStation } from './components/stationPlacement';
import ConstructionPanel from './components/ConstructionPanel';
import { DEFAULT_PLANNING } from './components/underground';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FolderOpen, Save, Box, Check, ChevronRight, Compass, Copyright, HelpCircle, LoaderCircle, Menu, RotateCcw, X } from 'lucide-react';
import Credits from './components/Credits';
import { MapLayersMenu, AnalysisLegend } from './components/MapLayers';
import { DEFAULT_ANALYSIS, normalizeAnalysis, type AnalysisStatus } from './components/analysisLayers';
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
  const [display,setDisplay]=useState<DisplayOptions>({preset:'clean',buildings:false,...DEFAULT_ANALYSIS,...DEFAULT_PLANNING,stationLabels:false});
  const [screen, setScreen] = useState<Screen>('boot');
  const history=useRef(new NetworkHistory());
  const [undoCount,setUndoCount]=useState(0);
  const [tracks,setTracks]=useState<PlacedTrack[]>([]);
  const tracksRef=useRef(tracks);tracksRef.current=tracks;
  const [selectedTrack,setSelectedTrack]=useState<string|null>(null);
  const [trackHint,setTrackHint]=useState('');
  const [stations,setStations]=useState<PlacedStation[]>([]);
  const stationsRef=useRef(stations);stationsRef.current=stations;
  const buildErrors=useMemo(()=>blueprintErrors(tracks,stations),[tracks,stations]);
  const [constructionSettings,setConstructionSettings]=useState<ConstructionSettings>(DEFAULT_CONSTRUCTION);
  const [drawing,setDrawing]=useState(false);
  const [selectedStation,setSelectedStation]=useState<string|null>(null);
  const [constructionOpen,setConstructionOpen]=useState(false);
  const [layersOpen,setLayersOpen]=useState(false);
  const [analysisStatus,setAnalysisStatus]=useState<AnalysisStatus>('idle');
  const [analysisRetry,setAnalysisRetry]=useState(0);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [pausedMenu, setPausedMenu] = useState(false);
  const [credits,setCredits]=useState(false);
  const [help, setHelp] = useState(false);
  const [initialCamera,setInitialCamera]=useState<SavedCamera>(DEFAULT_CAMERA);
  const [saveError,setSaveError]=useState('');
  const [hasSave,setHasSave]=useState(false);
  const [resuming,setResuming]=useState(false);
  const [saveDialog,setSaveDialog]=useState<'save'|'load'|null>(null);
  const [saveNotice,setSaveNotice]=useState('');
  useEffect(()=>{if(!saveNotice)return;const timer=setTimeout(()=>setSaveNotice(''),4000);return()=>clearTimeout(timer);},[saveNotice]);
  const camera=useRef<SavedCamera>(DEFAULT_CAMERA);
  const activeWorld=useRef(false);
  const displayRef=useRef(display);displayRef.current=display;
  const saver=useRef<ReturnType<typeof createQuickSaver>|null>(null);
  useEffect(()=>{
    const writer=createQuickSaver(()=>setSaveError('Quick save could not be written.'),()=>setHasSave(true));saver.current=writer;
    let alive=true;
    void readQuickSave().then(save=>{if(!alive)return;if(save){setHasSave(true);tracksRef.current=save.tracks??[];setTracks(tracksRef.current);setSelectedTrack(null);stationsRef.current=save.stations??[];setStations(stationsRef.current);camera.current=save.camera;setInitialCamera(save.camera);setDisplay({preset:save.preset,buildings:save.preset==='detailed',...normalizeAnalysis(save.analysis),...(save.planning??DEFAULT_PLANNING),stationLabels:save.stationLabels??false});activeWorld.current=save.active;setScreen(save.active?'loading':'home');}else setScreen('home');}).catch(()=>{if(alive){setSaveError('Quick save could not be loaded. Start a new world to replace it.');setScreen('home');}});
    const flush=()=>writer.flush(true);const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);
    return()=>{alive=false;window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);writer.dispose();saver.current=null;};
  },[]);
  function currentSnapshot():QuickSave {return {version:1,city:'new-york',active:activeWorld.current,updatedAt:Date.now(),camera:{...camera.current},preset:displayRef.current.preset,tracks:tracksRef.current.map(track=>({...track,start:{...track.start},end:{...track.end}})),stations:stationsRef.current.map(station=>({...station,start:[...station.start],end:[...station.end]})),analysis:{mode:displayRef.current.mode},stationLabels:displayRef.current.stationLabels,planning:{existingRail:displayRef.current.existingRail,foundations:displayRef.current.foundations,plannedDepth:displayRef.current.plannedDepth}};}
  function persist(immediate=false){saver.current?.save(currentSnapshot(),immediate);}
  useEffect(()=>{if(activeWorld.current)persist();},[display]);
  function cameraChanged(next:SavedCamera){camera.current=next;if(activeWorld.current)persist();}
  function exitWorld(next:'home'|'cities'){setConstructionOpen(false);setLayersOpen(false);activeWorld.current=false;persist(true);setPausedMenu(false);setStatus('loading');setScreen(next);}
  const controls = useRef<MapControls | null>(null);
  const worldMounted = screen === 'loading' || screen === 'world';
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if(saveDialog)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&screen==='world'&&!help&&!pausedMenu&&!credits&&!(e.target as HTMLElement|null)?.closest('input, textarea, [contenteditable="true"]')){e.preventDefault();undo();return;}
      if (e.key === 'Escape') {
        if(credits)setCredits(false);
        else if(layersOpen)setLayersOpen(false);
        else if (help) setHelp(false);
        else if(pausedMenu)setPausedMenu(false);
        else if(drawing)controls.current?.cancelStation();
        else if(selectedStation)setSelectedStation(null);
        else if(selectedTrack)setSelectedTrack(null);
        else if(constructionOpen)changeConstructionOpen(false);
        else if (screen === 'world') setPausedMenu(value => !value);
        else if (screen === 'cities') setScreen('home');
        else if (screen === 'loading') exitWorld('cities');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, help, layersOpen, credits, constructionOpen, drawing, pausedMenu, selectedStation, selectedTrack, undoCount, saveDialog]);
  function start() { history.current.clear();setUndoCount(0); tracksRef.current=[];setTracks([]);setSelectedTrack(null);stationsRef.current=[];setStations([]);setSelectedStation(null);setConstructionSettings({...DEFAULT_CONSTRUCTION});const nextDisplay={...displayRef.current,...DEFAULT_ANALYSIS,...DEFAULT_PLANNING,stationLabels:false};displayRef.current=nextDisplay;setDisplay(nextDisplay);setConstructionOpen(false);setLayersOpen(false);camera.current={...DEFAULT_CAMERA};setInitialCamera(camera.current);activeWorld.current=true;setSaveError('');persist(true);setStatus('loading');setAttempt(value=>value+1);setScreen('loading'); }
  function retryWorld(){setInitialCamera({...camera.current});setStatus('loading');setAttempt(value=>value+1);setScreen('loading');}
  async function continueGame(){
    setResuming(true);setSaveError('');
    try{
      await saver.current?.wait();const save=await readQuickSave();
      if(!save){setHasSave(false);setSaveError('No quick save is available.');return;}
      restoreWorld(save);
    }catch{setHasSave(false);setSaveError('Quick save could not be loaded. Start a new world to replace it.');}
    finally{setResuming(false);}
  }
  function restoreWorld(save:QuickSave){
    controls.current?.cancelStation();history.current.clear();setUndoCount(0);
    tracksRef.current=save.tracks??[];setTracks(tracksRef.current);stationsRef.current=save.stations??[];setStations(stationsRef.current);setSelectedTrack(null);setSelectedStation(null);setTrackHint('');setConstructionSettings({...DEFAULT_CONSTRUCTION});setConstructionOpen(false);setLayersOpen(false);setPausedMenu(false);setHelp(false);
    camera.current={...save.camera};setInitialCamera(camera.current);
    const restored:DisplayOptions={preset:save.preset,buildings:save.preset==='detailed',...normalizeAnalysis(save.analysis),...(save.planning??DEFAULT_PLANNING),stationLabels:save.stationLabels??false};
    displayRef.current=restored;setDisplay(restored);activeWorld.current=true;setSaveError('');persist(true);setStatus('loading');setAttempt(value=>value+1);setScreen('loading');
  }
  async function saveGame(name:string){const saved=await createNamedSave(name,{...currentSnapshot(),active:true});setSaveNotice(`Saved: ${saved.name}`);}
  async function loadGame(id:string){await saver.current?.wait();const saved=await readNamedSave(id);restoreWorld(saved.game);setSaveNotice(`Loaded: ${saved.name}`);}
  function replaceStations(next:PlacedStation[],immediate=false){replaceNetwork(next,tracksRef.current,immediate);}
  function placeStation(station:PlacedStation,attachment?:StationAttachment){
    if(stationsRef.current.length+tracksRef.current.length+(attachment?1:0)>=MAX_STATIONS){setSaveError('This alpha supports up to 200 stations, depots and track sections.');return;}
    const prefix=station.kind==='depot'?'Depot':'Station';
    const number=Math.max(0,...stationsRef.current.filter(item=>item.kind===station.kind).map(item=>Number(item.name.replace(`${prefix} `,''))||0))+1;
    const placed={...station,id:crypto.randomUUID(),name:`${prefix} ${number}`};if(attachment){const connector={...stationConnector(placed,attachment),id:crypto.randomUUID()};replaceNetwork([...stationsRef.current,placed],[...tracksRef.current,connector]);}else replaceStations([...stationsRef.current,placed]);setSelectedStation(null);setSelectedTrack(null);
  }
  function replaceNetwork(nextStations:PlacedStation[],nextTracks:PlacedTrack[],immediate=false,record=true){if(JSON.stringify([nextStations,nextTracks])===JSON.stringify([stationsRef.current,tracksRef.current]))return;if(record){history.current.push({stations:stationsRef.current,tracks:tracksRef.current});setUndoCount(history.current.size);}stationsRef.current=nextStations;tracksRef.current=nextTracks;setStations(nextStations);setTracks(nextTracks);if(activeWorld.current)persist(immediate);}
  function undo(){if(controls.current?.cancelStation())return;const previous=history.current.pop();if(!previous)return;replaceNetwork(previous.stations,previous.tracks,true,false);setUndoCount(history.current.size);setSelectedStation(null);setSelectedTrack(null);setTrackHint('');}
  function placeTrack(track:PlacedTrack){
    if(stationsRef.current.length+tracksRef.current.length>=MAX_STATIONS){setSaveError('This alpha supports up to 200 stations, depots and track sections.');return;}
    const placed={...track,id:crypto.randomUUID()};replaceNetwork(stationsRef.current,[...tracksRef.current,placed]);setSelectedStation(null);setSelectedTrack(null);
  }
  function buildStations(){const errors=blueprintErrors(tracksRef.current,stationsRef.current);if(errors.length){setTrackHint(errors[0]);return;}replaceNetwork(stationsRef.current.map(station=>({...station,stage:'constructed'})),tracksRef.current.map(track=>({...track,stage:'constructed'})),true);setSelectedStation(null);setSelectedTrack(null);}
  function clearStations(){controls.current?.cancelStation();replaceNetwork(stationsRef.current.filter(station=>station.stage==='constructed'),tracksRef.current.filter(track=>track.stage==='constructed'),true);setSelectedStation(null);setSelectedTrack(null);}
  function changeConstructionOpen(open:boolean){setConstructionOpen(open);if(!open){setSelectedStation(null);setSelectedTrack(null);controls.current?.cancelStation();}}
  function selectStation(id:string|null){setSelectedStation(id);if(id){setSelectedTrack(null);setConstructionOpen(true);const asset=stationsRef.current.find(s=>s.id===id);if(asset)setConstructionSettings(current=>asset.kind==='depot'?{...current,tool:'depot',capacity:asset.capacity!,depth:asset.depth}:current.tool==='depot'?{...current,tool:'station',platforms:asset.layout,depth:asset.depth}:current);}}
  function selectTrack(id:string|null){setSelectedTrack(id);if(id){setSelectedStation(null);setConstructionOpen(true);}}
  function removeSelected(stage:'blueprint'|'constructed'){
    if(selectedStation&&stationsRef.current.some(station=>station.id===selectedStation&&station.stage===stage)){const removed=tracksToRemove(tracksRef.current,tracksRef.current.filter(track=>trackUsesStation(track,selectedStation)).map(t=>t.id));replaceNetwork(stationsRef.current.filter(station=>station.id!==selectedStation),tracksRef.current.filter(track=>!removed.has(track.id)),true);}
    else if(selectedTrack&&tracksRef.current.some(t=>t.id===selectedTrack&&t.stage===stage)){const removed=tracksToRemove(tracksRef.current,[selectedTrack]);replaceNetwork(stationsRef.current,tracksRef.current.filter(track=>!removed.has(track.id)),true);}
    setSelectedStation(null);setSelectedTrack(null);
  }
  function demolishSelectedStation(){removeSelected('constructed');}
  function deleteSelectedStation(){removeSelected('blueprint');}
  function mapStatus(next: MapStatus) { setStatus(next); if (next === 'ready') setScreen('world'); }
  function leave() { exitWorld('home'); }
  return <main className="game">
    {screen==='boot'&&<div className="loading-screen"><div className="loading-content"><LoaderCircle className="spinner" size={23}/><small>Restoring quick save</small></div></div>}
    {saveNotice&&<div className="save-notice" role="status">{saveNotice}</div>}
    {saveError&&<div className="save-error" role="alert">{saveError}<button onClick={()=>setSaveError('')} aria-label="Dismiss save message"><X size={14}/></button></div>}
    {worldMounted && <Suspense fallback={null}><NewYorkMap key={attempt} onStatus={mapStatus} controls={controls} display={display} initialCamera={initialCamera} onCamera={cameraChanged} onAnalysis={setAnalysisStatus} analysisRetry={analysisRetry} stations={stations} selectedStation={selectedStation} tracks={tracks} selectedTrack={selectedTrack} onPlaceTrack={placeTrack} onSelectTrack={selectTrack} onTrackHint={setTrackHint} onSnapDepth={depth=>setConstructionSettings(current=>({...current,depth}))} constructionActive={constructionOpen&&!pausedMenu&&!help&&!credits&&screen==='world'} constructionSettings={constructionSettings} onPlaceStation={placeStation} onSelectStation={selectStation} onDrawingChange={setDrawing}/></Suspense>}
    {(screen === 'home' || screen === 'cities') && <div className="title-screen">
      <div className="title-art"><CityArtwork/><span className="art-label">A CITY WAITING TO CONNECT.</span></div>
      <div className="title-panel"><div className="wordmark">undergrid<span className="logo-dot"/></div><p className="tagline">Build the city beneath the city.</p>
      {screen === 'home' ? <nav className="main-menu" aria-label="Main menu">{hasSave&&<button className="menu-primary" disabled={resuming} onClick={continueGame}><span className="continue-label"><strong>{resuming?'Loading…':'Continue'}</strong><small>New York · Quick save</small></span><ArrowRight size={19}/></button>}<button className={hasSave?'menu-secondary':'menu-primary'} onClick={() => setScreen('cities')}>New Game <ArrowRight size={19}/></button><button className="menu-secondary" disabled={resuming} onClick={()=>setSaveDialog('load')}>Load Game <FolderOpen size={18}/></button><button className="menu-help" onClick={() => setHelp(true)}>How to play <HelpCircle size={17}/></button><button className="menu-help menu-credits" onClick={()=>setCredits(true)}>Credits <Copyright size={17}/></button></nav> : <div className="city-selection">
        <button className="back-link" onClick={() => setScreen('home')}><ArrowLeft size={14}/> Back</button>
        <h1>Choose your city.</h1>
        <button className="city-card selected" aria-pressed="true" aria-label="Select New York"><div className="city-monogram">NYC</div><div><strong>New York</strong><span>United States</span></div><Check size={17}/></button>
        <p className="city-description">Five boroughs. One connected region.<br/>New York City and its surrounding neighborhoods.</p>
        <button className="menu-primary start-button" onClick={start}>Start <ArrowRight size={19}/></button>
      </div>}
      <div className="title-footer"><span>METRO SIMULATION</span><span>ALPHA · 0.4</span></div></div>
    </div>}
    {screen === 'loading' && <div className="loading-screen"><div className="loading-content"><span className="loading-city">NEW YORK</span><h1>{status === 'error' ? 'The city is out of reach.' : 'Loading your world.'}</h1><p>{status === 'error' ? 'Map tiles could not be loaded. Check your internet connection and try again.' : 'Connecting streets, neighborhoods and possibilities.'}</p>{status === 'error' ? <div className="loading-actions"><button className="menu-primary" onClick={retryWorld}><RotateCcw size={16}/> Try again</button><button onClick={() => exitWorld('cities')}>Back to cities</button></div> : <><LoaderCircle size={23} className="spinner"/><small>Preparing city map</small><button className="loading-cancel" onClick={() => exitWorld('cities')}>Cancel</button></>}</div></div>}
    {screen === 'world' && <>
      <header className="world-header"><button className="world-menu-button" onClick={() => setPausedMenu(true)} aria-label="Open menu"><Menu size={15}/></button><span className="world-city">New York</span></header>
      <div className="world-tools" aria-label="Map controls"><div className="display-presets" aria-label="Map detail">{(['clean','detailed'] as DisplayPreset[]).map(preset=><button key={preset} className={display.preset===preset?'selected':''} aria-pressed={display.preset===preset} onClick={()=>setDisplay(current=>({...current,preset,buildings:preset==='detailed'}))}>{preset.charAt(0).toUpperCase()+preset.slice(1)}</button>)}</div><MapLayersMenu display={display} open={layersOpen} onOpenChange={setLayersOpen} onStationLabels={stationLabels=>setDisplay(current=>({...current,stationLabels}))} onChange={mode=>setDisplay(current=>({...current,mode,foundations:mode!=='off'?false:current.foundations}))} onPlanning={patch=>setDisplay(current=>({...current,...patch,mode:patch.foundations?'off':current.mode}))}/><button className="world-tool" onClick={()=>controls.current?.tilt()} aria-label="Toggle tilted view" title="Toggle tilted view"><Box size={16}/></button><button className="world-tool" onClick={()=>controls.current?.north()} aria-label="Face north" title="Face north"><Compass size={16}/></button></div>
      <div className={constructionOpen?'construction-legend-shift':''}><AnalysisLegend display={display} status={analysisStatus} onRetry={()=>setAnalysisRetry(value=>value+1)}/></div>
      <ConstructionPanel onUndo={undo} canUndo={undoCount>0} validationMessage={buildErrors[0]??''} open={constructionOpen} onOpenChange={changeConstructionOpen} settings={constructionSettings} onSettingsChange={patch=>setConstructionSettings(current=>({...current,...patch}))} depotBlueprints={stations.filter(station=>station.kind==='depot'&&station.stage==='blueprint').length} blueprints={stations.filter(station=>station.kind!=='depot'&&station.stage==='blueprint').length} drawing={drawing} selected={stations.some(station=>station.id===selectedStation&&station.stage==='blueprint')||tracks.some(track=>track.id===selectedTrack&&track.stage==='blueprint')} onBuild={buildStations} onClear={clearStations} onDelete={deleteSelectedStation} constructedSelected={stations.some(station=>station.id===selectedStation&&station.stage==='constructed')||tracks.some(track=>track.id===selectedTrack&&track.stage==='constructed')} onDemolish={demolishSelectedStation} trackBlueprints={tracks.filter(track=>track.stage==='blueprint').length} trackHint={trackHint} connectedCount={selectedStation?tracksToRemove(tracks,tracks.filter(track=>trackUsesStation(track,selectedStation)).map(t=>t.id)).size:selectedTrack?tracksToRemove(tracks,[selectedTrack]).size-1:0}/>


      {status === 'error'  && <div className="map-error" role="alert">Some map tiles could not be loaded.<button onClick={retryWorld}>Retry <RotateCcw size={13}/></button></div>}
    </>}
    {saveDialog&&<SaveDialog mode={saveDialog} onClose={()=>setSaveDialog(null)} onSave={saveGame} onLoad={loadGame}/>}
    {credits&&<Credits onClose={()=>setCredits(false)}/>}
    {(pausedMenu || help) && !saveDialog && <div className="dialog-shade"><section className="dialog" role="dialog" aria-modal="true" aria-label={help ? 'How to play' : 'Game menu'}><button className="close-dialog" onClick={() => { setHelp(false); setPausedMenu(false); }} aria-label="Close menu"><X size={19}/></button><span className="dialog-eyebrow">UNDERGRID</span><h2>{help ? 'Explore your first world.' : 'New York'}</h2>{help ? <><p>Choose New Game, select New York and start your world. Save in the game menu creates a named snapshot. Load Game in the main menu lets you choose one; Continue resumes the quick save.</p><p>Drag to move around the city. Scroll to zoom. Right-drag or Ctrl + drag to rotate and tilt. Choose Clean or Detailed at the top right. Detailed includes 3D buildings. Use Map layers to choose Population (2020 Census) or Jobs (2023 LODES). Each mode includes district boundaries. Click an area to inspect its density. Construction lets you place stations: click the start, move to set direction and length (50–300 m), then click the end. Right-click without dragging or Escape cancels the current stretch. Build confirms station blueprints; Clear removes unbuilt station projects. Track snaps to highlighted station ports and any point on an existing rail: click the start, move to the endpoint and click again. Choose Single to connect individual rails with a crossover. Intermediate junctions inherit height and tangent and stay available for more branches. Free ends of tracks and blueprints expose continuation points. Stations snap to free track ends and inherit their depth and direction. Undo or Ctrl / Cmd + Z reverses the last construction action; during drawing it cancels the preview. Undo history lasts until the page is reloaded. Stations, depots and tracks always appear at their actual rail elevations (−100 to +50 m). Dashed station outlines mark their ground projection at 0 m. Hover a station to see its name and depth, or hover a track to see its depth transition. Always show labels in Map layers keeps both visible. Platforms rise 1.5 m above rail level; 3D buildings occlude the scheme according to its elevation. Heavy Metro requires at least 20 m main-curve radius, at most 16% grade and smooth vertical transitions. Hold Shift while drawing a track to lock a straight departure; release it to return to curves. Station tapers take 10 m and are excluded from the radius check. Invalid blueprints turn red and must be fixed before Build. Connected ends inherit depth and direction; free ends use the panel depth. Depot creates a 300 m yard: choose capacity (5–30 train sets), click the entrance, move to set direction and click again. Its entrance supports track snapping. Service decks run between each pair of storage tracks. Depot capacity represents parking space; trains are not supplied yet. Build confirms station, depot and track projects. The cube toggles tilt; the compass faces north without changing your location or zoom. Press Escape to open the menu.</p><p className="help-note">Station and track construction are available. Train operations and the economy are planned. Map loading requires an internet connection.</p><button className="menu-primary" onClick={() => setHelp(false)}>Got it <ChevronRight size={17}/></button></> : <nav className="pause-menu"><button className="menu-primary" onClick={() => setPausedMenu(false)}>Resume <ArrowRight size={18}/></button><button onClick={()=>setSaveDialog('save')}>Save <Save size={16}/></button><button onClick={() => {setPausedMenu(false);setHelp(true);}}>Controls <HelpCircle size={16}/></button><button onClick={leave}>Main menu <ArrowLeft size={16}/></button></nav>}</section></div>}
  </main>;
}
