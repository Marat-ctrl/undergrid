import { uniqueStationName } from './components/stationNames';
import SaveDialog from './components/SaveDialog';
import HowToPlay from './components/HowToPlay';
import LinesPanel from './components/LinesPanel';
import { buildLineNetwork,routeMetroLine,isMetroLineList,LINE_COLORS,MAX_LINES,MAX_LINE_STOPS,type MetroLine,type LineOverlay,type PlatformSide } from './components/metroLines';
import { createNamedSave,readNamedSave } from './namedSaves';
import { NetworkHistory,removeNetworkAsset } from './components/networkHistory';
import { stationConnector,type StationAttachment } from './components/stationConnection';
import { trackUsesStation,tracksToRemove,blueprintErrors,type PlacedTrack } from './components/trackPlacement';
import { DEFAULT_CONSTRUCTION, MAX_STATIONS, type ConstructionSettings, type PlacedStation } from './components/stationPlacement';
import ConstructionPanel from './components/ConstructionPanel';
import { DEFAULT_PLANNING } from './components/underground';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FolderOpen, Save, Box, Check, Compass, HelpCircle, LoaderCircle, Menu, RotateCcw, X } from 'lucide-react';
import Credits from './components/Credits';
import { MapLayersMenu, AnalysisLegend } from './components/MapLayers';
import { DEFAULT_ANALYSIS, normalizeAnalysis, type AnalysisStatus } from './components/analysisLayers';
import type { DisplayOptions, DisplayPreset } from './components/mapStyle';
import type { MapControls, MapStatus } from './components/NewYorkMap';
import { DEFAULT_CAMERA, type SavedCamera, type QuickSave } from './gameSave';
import { createQuickSaver, readQuickSave } from './localSave';
const NewYorkMap = lazy(() => import('./components/NewYorkMap'));

type Screen = 'boot' | 'home' | 'cities' | 'loading' | 'world';
export default function App() {
  const [lines,setLines]=useState<MetroLine[]>([]);
  const linesRef=useRef(lines);linesRef.current=lines;
  const [linesOpen,setLinesOpen]=useState(false),[selectedLineId,setSelectedLineId]=useState<string|null>(null),[lineDraft,setLineDraft]=useState<MetroLine|null>(null),[lineNotice,setLineNotice]=useState('');
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
  const lineNetwork=useMemo(()=>buildLineNetwork(stations,tracks),[stations,tracks]);
  const lineStatuses=useMemo(()=>new Map(lines.map(line=>[line.id,routeMetroLine(lineNetwork,line.stationIds,line.platforms)])),[lines,lineNetwork]);
  const activeRoute=useMemo(()=>lineDraft?routeMetroLine(lineNetwork,lineDraft.stationIds,lineDraft.platforms):selectedLineId?lineStatuses.get(selectedLineId)??null:null,[lineDraft?.stationIds,lineDraft?.platforms,lineNetwork,selectedLineId,lineStatuses]);
  const lineOverlay=useMemo<LineOverlay[]>(()=>{
    const overlays=lines.filter(line=>line.id!==lineDraft?.id).map(line=>{const route=lineStatuses.get(line.id)!;return {color:line.color,paths:route.paths,gaps:route.gaps.map(gap=>gap.path),stationIds:line.stationIds,platforms:line.platforms};});
    if(lineDraft&&activeRoute)overlays.push({color:lineDraft.color,paths:activeRoute.paths,gaps:activeRoute.gaps.map(gap=>gap.path),stationIds:lineDraft.stationIds,platforms:lineDraft.platforms});
    return overlays;
  },[lines,lineStatuses,lineDraft?.id,lineDraft?.color,lineDraft?.stationIds,lineDraft?.platforms,activeRoute]);
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
    void readQuickSave().then(save=>{if(!alive)return;if(save){linesRef.current=save.lines??[];setLines(linesRef.current);setHasSave(true);tracksRef.current=save.tracks??[];setTracks(tracksRef.current);setSelectedTrack(null);stationsRef.current=save.stations??[];setStations(stationsRef.current);camera.current=save.camera;setInitialCamera(save.camera);setDisplay({preset:save.preset,buildings:save.preset==='detailed',...normalizeAnalysis(save.analysis),...(save.planning??DEFAULT_PLANNING),stationLabels:save.stationLabels??false});activeWorld.current=save.active;setScreen(save.active?'loading':'home');}else setScreen('home');}).catch(()=>{if(alive){setSaveError('Quick save could not be loaded. Start a new world to replace it.');setScreen('home');}});
    const flush=()=>writer.flush(true);const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);
    return()=>{alive=false;window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);writer.dispose();saver.current=null;};
  },[]);
  function currentSnapshot():QuickSave {return {version:1,city:'new-york',active:activeWorld.current,updatedAt:Date.now(),camera:{...camera.current},preset:displayRef.current.preset,lines:linesRef.current.map(line=>({...line,stationIds:[...line.stationIds],...(line.platforms?{platforms:[...line.platforms]}:{})})),tracks:tracksRef.current.map(track=>({...track,start:{...track.start},end:{...track.end}})),stations:stationsRef.current.map(station=>({...station,start:[...station.start],end:[...station.end]})),analysis:{mode:displayRef.current.mode},stationLabels:displayRef.current.stationLabels,planning:{existingRail:displayRef.current.existingRail,foundations:displayRef.current.foundations,plannedDepth:displayRef.current.plannedDepth}};}
  function persist(immediate=false){saver.current?.save(currentSnapshot(),immediate);}
  useEffect(()=>{if(activeWorld.current)persist();},[display]);
  function cameraChanged(next:SavedCamera){camera.current=next;if(activeWorld.current)persist();}
  function exitWorld(next:'home'|'cities'){setLinesOpen(false);setLineDraft(null);setConstructionOpen(false);setLayersOpen(false);activeWorld.current=false;persist(true);setPausedMenu(false);setStatus('loading');setScreen(next);}
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
        else if(linesOpen){if(lineDraft)setLineDraft(null);else setLinesOpen(false);}
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
  }, [screen, help, layersOpen, credits, constructionOpen, drawing, pausedMenu, selectedStation, selectedTrack, undoCount, saveDialog, linesOpen, lineDraft]);
  function start() { linesRef.current=[];setLines([]);setLinesOpen(false);setLineDraft(null);setSelectedLineId(null);history.current.clear();setUndoCount(0); tracksRef.current=[];setTracks([]);setSelectedTrack(null);stationsRef.current=[];setStations([]);setSelectedStation(null);setConstructionSettings({...DEFAULT_CONSTRUCTION});const nextDisplay={...displayRef.current,...DEFAULT_ANALYSIS,...DEFAULT_PLANNING,stationLabels:false};displayRef.current=nextDisplay;setDisplay(nextDisplay);setConstructionOpen(false);setLayersOpen(false);camera.current={...DEFAULT_CAMERA};setInitialCamera(camera.current);activeWorld.current=true;setSaveError('');persist(true);setStatus('loading');setAttempt(value=>value+1);setScreen('loading'); }
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
    linesRef.current=save.lines??[];setLines(linesRef.current);setLinesOpen(false);setSelectedLineId(null);setLineDraft(null);setLineNotice('');
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
    const placed={...station,id:crypto.randomUUID(),name:station.kind==='depot'?`${prefix} ${number}`:uniqueStationName(station.name==='Preview'?`Station ${number}`:station.name,stationsRef.current)};if(attachment){const connector={...stationConnector(placed,attachment),id:crypto.randomUUID()};replaceNetwork([...stationsRef.current,placed],[...tracksRef.current,connector]);}else replaceStations([...stationsRef.current,placed]);setSelectedStation(null);setSelectedTrack(null);
  }
  function replaceNetwork(nextStations:PlacedStation[],nextTracks:PlacedTrack[],immediate=false,record=true){if(JSON.stringify([nextStations,nextTracks])===JSON.stringify([stationsRef.current,tracksRef.current]))return false;if(record){history.current.push({stations:stationsRef.current,tracks:tracksRef.current,lines:linesRef.current});setUndoCount(history.current.size);}stationsRef.current=nextStations;tracksRef.current=nextTracks;setStations(nextStations);setTracks(nextTracks);if(activeWorld.current)persist(immediate);return true;}
  function undo(){
    if(lineDraft){setLineDraft({...lineDraft,stationIds:lineDraft.stationIds.slice(0,-1),...(lineDraft.platforms?{platforms:lineDraft.platforms.slice(0,-1)}:{})});setLineNotice('');return;}
    if(controls.current?.cancelStation())return;const previous=history.current.pop();if(!previous)return;
    linesRef.current=previous.lines??[];setLines(linesRef.current);
    if(!replaceNetwork(previous.stations,previous.tracks,true,false)&&activeWorld.current)persist(true);
    setUndoCount(history.current.size);setSelectedStation(null);setSelectedTrack(null);setTrackHint('');
  }
  function replaceLines(next:MetroLine[]){if(JSON.stringify(next)===JSON.stringify(linesRef.current))return;history.current.push({stations:stationsRef.current,tracks:tracksRef.current,lines:linesRef.current});setUndoCount(history.current.size);linesRef.current=next;setLines(next);if(activeWorld.current)persist(true);}
  function openLines(open:boolean){setLinesOpen(open);setLineDraft(null);setLineNotice('');if(open){changeConstructionOpen(false);setSelectedLineId(current=>linesRef.current.some(line=>line.id===current)?current:linesRef.current[0]?.id??null);}}
  function createLine(){if(linesRef.current.length>=MAX_LINES)return;setLineNotice('');setLineDraft({id:crypto.randomUUID(),name:`Line ${Math.max(0,...linesRef.current.map(line=>Number(line.name.match(/^Line (\d+)$/)?.[1])||0))+1}`,color:LINE_COLORS[linesRef.current.length%LINE_COLORS.length],stationIds:[],platforms:[]});}
  function addLineStop(id:string,side:PlatformSide){
    if(!lineDraft)return;const station=stationsRef.current.find(s=>s.id===id&&s.stage==='constructed'&&s.kind!=='depot');
    if(!station){setLineNotice('Choose a built passenger station.');return;}
    const ids=lineDraft.stationIds;if(ids.length>=MAX_LINE_STOPS){setLineNotice(`A line can have up to ${MAX_LINE_STOPS} stops.`);return;}
    if(ids.length>2&&ids[0]===ids.at(-1)){setLineNotice('The loop is closed. Remove its last stop to extend it.');return;}
    if(ids.includes(id)&&!(ids.length>=2&&id===ids[0])){setLineNotice('This station is already on the line.');return;}
    setLineNotice('');setLineDraft({...lineDraft,stationIds:[...ids,id],platforms:[...(lineDraft.platforms??ids.map(()=> 'right' as const)),side]});
  }
  function saveLine(){if(!lineDraft||!activeRoute?.ready||!isMetroLineList([{...lineDraft,name:lineDraft.name.trim()}]))return;const next={...lineDraft,name:lineDraft.name.trim()};replaceLines(linesRef.current.some(line=>line.id===next.id)?linesRef.current.map(line=>line.id===next.id?next:line):[...linesRef.current,next]);setSelectedLineId(next.id);setLineDraft(null);setLineNotice('');}
  function deleteLine(id:string){replaceLines(linesRef.current.filter(line=>line.id!==id));if(selectedLineId===id)setSelectedLineId(null);}
  function placeTrack(track:PlacedTrack){
    if(stationsRef.current.length+tracksRef.current.length>=MAX_STATIONS){setSaveError('This alpha supports up to 200 stations, depots and track sections.');return;}
    const placed={...track,id:crypto.randomUUID()};replaceNetwork(stationsRef.current,[...tracksRef.current,placed]);setSelectedStation(null);setSelectedTrack(null);
  }
  function buildStations(){const errors=blueprintErrors(tracksRef.current,stationsRef.current);if(errors.length){setTrackHint(errors[0]);return;}replaceNetwork(stationsRef.current.map(station=>({...station,stage:'constructed'})),tracksRef.current.map(track=>({...track,stage:'constructed'})),true);setSelectedStation(null);setSelectedTrack(null);}
  function clearStations(){controls.current?.cancelStation();replaceNetwork(stationsRef.current.filter(station=>station.stage==='constructed'),tracksRef.current.filter(track=>track.stage==='constructed'),true);setSelectedStation(null);setSelectedTrack(null);}
  function changeConstructionOpen(open:boolean){if(open){setLinesOpen(false);setLineDraft(null);setSelectedLineId(null);}setConstructionOpen(open);if(!open){setSelectedStation(null);setSelectedTrack(null);controls.current?.cancelStation();}}
  function selectStation(id:string|null){setSelectedStation(id);if(id){setSelectedTrack(null);changeConstructionOpen(true);setConstructionSettings(current=>({...current,tool:'select'}));}}
  function selectTrack(id:string|null){setSelectedTrack(id);if(id){setSelectedStation(null);changeConstructionOpen(true);setConstructionSettings(current=>({...current,tool:'select'}));}}
  function removeSelected(stage:'blueprint'|'constructed'){
    const next=removeNetworkAsset({stations:stationsRef.current,tracks:tracksRef.current},selectedStation,selectedTrack,stage);
    replaceNetwork(next.stations,next.tracks,true);
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
    {worldMounted && <Suspense fallback={null}><NewYorkMap key={attempt} lineOverlay={lineOverlay} lineMode={linesOpen&&!pausedMenu&&!help&&!credits&&!saveDialog&&screen==='world'} lineChoosingStops={!!lineDraft} onLineStation={addLineStop} onStatus={mapStatus} controls={controls} display={display} initialCamera={initialCamera} onCamera={cameraChanged} onAnalysis={setAnalysisStatus} analysisRetry={analysisRetry} stations={stations} selectedStation={selectedStation} tracks={tracks} selectedTrack={selectedTrack} onPlaceTrack={placeTrack} onSelectTrack={selectTrack} onTrackHint={setTrackHint} onSnapDepth={depth=>setConstructionSettings(current=>({...current,depth}))} constructionActive={constructionOpen&&!pausedMenu&&!help&&!credits&&screen==='world'} constructionSettings={constructionSettings} onPlaceStation={placeStation} onSelectStation={selectStation} onDrawingChange={setDrawing}/></Suspense>}
    {(screen === 'home' || screen === 'cities') && <section className="launch-screen" aria-label="Undergrid main screen">
      <div className="launch-content" data-screen={screen}>
        <header className="launch-brand"><h1>undergrid<span aria-hidden="true">.</span></h1><p>Build the city beneath the city.</p></header>
        {screen === 'home' ? <nav className="launch-menu" aria-label="Main menu">
          {hasSave&&<button className="menu-primary launch-resume" disabled={resuming} onClick={continueGame}><span><strong>{resuming?'Loading…':'Continue'}</strong><small>New York · Quick save</small></span><ArrowRight size={19}/></button>}
          <button className={hasSave?'launch-secondary':'menu-primary'} onClick={() => setScreen('cities')}>New Game <ArrowRight size={18}/></button>
          <button className="launch-secondary" disabled={resuming} onClick={()=>setSaveDialog('load')}>Load Game <FolderOpen size={17}/></button>
          <div className="launch-links"><button onClick={() => setHelp(true)}>How to play</button><button onClick={()=>setCredits(true)}>Credits</button></div>
        </nav> : <div className="city-selection">
          <button className="back-link" onClick={() => setScreen('home')}><ArrowLeft size={14}/> Back</button>
          <h2>Choose your city.</h2>
          <button className="city-card selected" aria-pressed="true" aria-label="Select New York"><div className="city-monogram">NYC</div><div><strong>New York</strong><span>United States</span></div><Check size={17}/></button>
          <p className="city-description">Five boroughs. One connected region.<br/>New York City and its surrounding neighborhoods.</p>
          <button className="menu-primary start-button" onClick={start}>Start <ArrowRight size={19}/></button>
        </div>}
      </div>
      <footer className="launch-footer"><span>METRO SIMULATION</span><span>ALPHA · 0.4</span></footer>
    </section>}
    {screen === 'loading' && <div className="loading-screen"><div className="loading-content"><span className="loading-city">NEW YORK</span><h1>{status === 'error' ? 'The city is out of reach.' : 'Loading your world.'}</h1><p>{status === 'error' ? 'Map tiles could not be loaded. Check your internet connection and try again.' : 'Connecting streets, neighborhoods and possibilities.'}</p>{status === 'error' ? <div className="loading-actions"><button className="menu-primary" onClick={retryWorld}><RotateCcw size={16}/> Try again</button><button onClick={() => exitWorld('cities')}>Back to cities</button></div> : <><LoaderCircle size={23} className="spinner"/><small>Preparing city map</small><button className="loading-cancel" onClick={() => exitWorld('cities')}>Cancel</button></>}</div></div>}
    {screen === 'world' && <>
      <header className="world-header"><button className="world-menu-button" onClick={() => setPausedMenu(true)} aria-label="Open menu"><Menu size={15}/></button><span className="world-city">New York</span></header>
      <div className="world-tools" aria-label="Map controls"><div className="display-presets" aria-label="Map detail">{(['clean','detailed'] as DisplayPreset[]).map(preset=><button key={preset} className={display.preset===preset?'selected':''} aria-pressed={display.preset===preset} onClick={()=>setDisplay(current=>({...current,preset,buildings:preset==='detailed'}))}>{preset.charAt(0).toUpperCase()+preset.slice(1)}</button>)}</div><MapLayersMenu display={display} open={layersOpen} onOpenChange={setLayersOpen} onStationLabels={stationLabels=>setDisplay(current=>({...current,stationLabels}))} onChange={mode=>setDisplay(current=>({...current,mode,foundations:mode!=='off'?false:current.foundations}))} onPlanning={patch=>setDisplay(current=>({...current,...patch,mode:patch.foundations?'off':current.mode}))}/><button className="world-tool" onClick={()=>controls.current?.tilt()} aria-label="Toggle tilted view" title="Toggle tilted view"><Box size={16}/></button><button className="world-tool" onClick={()=>controls.current?.north()} aria-label="Face north" title="Face north"><Compass size={16}/></button></div>
      <div className={constructionOpen||linesOpen?'construction-legend-shift':''}><AnalysisLegend display={display} status={analysisStatus} onRetry={()=>setAnalysisRetry(value=>value+1)}/></div>
      <LinesPanel open={linesOpen} onOpenChange={openLines} lines={lines} selectedId={selectedLineId} onSelect={id=>{setSelectedLineId(id);setLineDraft(null);setLineNotice('');}} draft={lineDraft} onDraftChange={line=>{setLineDraft(line);setLineNotice('');}} onCreate={createLine} onCancel={()=>{setLineDraft(null);setLineNotice('');}} onSave={saveLine} onDelete={deleteLine} onAddStop={addLineStop} stations={stations} route={activeRoute} statuses={lineStatuses} notice={lineNotice} onUndo={undo} canUndo={undoCount>0}/>
      <ConstructionPanel selectionName={stations.find(station=>station.id===selectedStation)?.name??(selectedTrack?'Track section':undefined)} onUndo={undo} canUndo={undoCount>0} validationMessage={buildErrors[0]??''} open={constructionOpen} onOpenChange={changeConstructionOpen} settings={constructionSettings} onSettingsChange={patch=>{if(patch.tool&&patch.tool!=='select'){setSelectedStation(null);setSelectedTrack(null);}setConstructionSettings(current=>({...current,...patch}));}} depotBlueprints={stations.filter(station=>station.kind==='depot'&&station.stage==='blueprint').length} blueprints={stations.filter(station=>station.kind!=='depot'&&station.stage==='blueprint').length} drawing={drawing} selected={stations.some(station=>station.id===selectedStation&&station.stage==='blueprint')||tracks.some(track=>track.id===selectedTrack&&track.stage==='blueprint')} onBuild={buildStations} onClear={clearStations} onDelete={deleteSelectedStation} constructedSelected={stations.some(station=>station.id===selectedStation&&station.stage==='constructed')||tracks.some(track=>track.id===selectedTrack&&track.stage==='constructed')} onDemolish={demolishSelectedStation} trackBlueprints={tracks.filter(track=>track.stage==='blueprint').length} trackHint={trackHint} connectedCount={selectedStation?tracksToRemove(tracks,tracks.filter(track=>trackUsesStation(track,selectedStation)).map(t=>t.id)).size:selectedTrack?tracksToRemove(tracks,[selectedTrack]).size-1:0}/>


      {status === 'error'  && <div className="map-error" role="alert">Some map tiles could not be loaded.<button onClick={retryWorld}>Retry <RotateCcw size={13}/></button></div>}
    </>}
    {saveDialog&&<SaveDialog mode={saveDialog} onClose={()=>setSaveDialog(null)} onSave={saveGame} onLoad={loadGame}/>}
    {credits&&<Credits onClose={()=>setCredits(false)}/>}
    {help&&!saveDialog&&<HowToPlay onClose={()=>setHelp(false)}/>}
    {pausedMenu&&!help&&!saveDialog&&<div className="dialog-shade"><section className="dialog" role="dialog" aria-modal="true" aria-label="Game menu"><button className="close-dialog" onClick={()=>setPausedMenu(false)} aria-label="Close menu"><X size={19}/></button><span className="dialog-eyebrow">UNDERGRID</span><h2>New York</h2><nav className="pause-menu"><button className="menu-primary" onClick={()=>setPausedMenu(false)}>Resume <ArrowRight size={18}/></button><button onClick={()=>setSaveDialog('save')}>Save <Save size={16}/></button><button onClick={()=>{setPausedMenu(false);setHelp(true);}}>Controls <HelpCircle size={16}/></button><button onClick={leave}>Main menu <ArrowLeft size={16}/></button></nav></section></div>}

  </main>;
}
