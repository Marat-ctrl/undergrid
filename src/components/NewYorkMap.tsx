import { MAP_PALETTE } from './theme';
import { nearbyStationName } from './stationNames';
import { elevationText } from './constructionDimensions';
import { createFlatMetroScene } from './FlatMetroScene';
import type { LineOverlay,PlatformSide } from './metroLines';
import { connectedStation,stationConnector,stationConnectionPorts,type StationAttachment } from './stationConnection';
import { networkPorts,type StationPort } from './trackPlacement';
import { draftTrack,checkTrack,resolveEndpoint,isTrackPointRef,orientTrackPoint,straightHeading,straightPosition,type PlacedTrack,type TrackEndpoint } from './trackPlacement';
import { installTrackLayers,updateTracks,updateTrackGhost as writeTrackGhost,updatePorts as writePorts,nearestPort } from './trackLayers';
import { stretchedStation, stretchedDepot, stationLength, type ConstructionSettings, type PlacedStation, type Coordinate } from './stationPlacement';
import { installStationLayers, updateStations, updateStationGhost as writeStationGhost } from './stationLayers';
import { missingBuildingSupports } from './buildingSupports';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { applyPlanningLayers } from './planningLayers';
import { useEffect, useRef } from 'react';
import * as maplibre from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ANALYSIS_SOURCE_IDS, applyAnalysisLayers, installAnalysisLayers, loadAnalysisData, type AnalysisStatus } from './analysisLayers';
import { attachCameraGesture, buildingTileZoom, railTileZoom } from './camera';
import type { SavedCamera } from '../gameSave';
import { createMapStyle, type DisplayOptions } from './mapStyle';

maplibre.setWorkerUrl(mapWorkerUrl);
export const NEW_YORK_BOUNDS: maplibre.LngLatBoundsLike = [[-74.32, 40.47], [-73.65, 40.98]];
export type MapStatus = 'loading' | 'ready' | 'error';
export interface MapControls { north: () => void; tilt:()=>void;cancelStation:()=>boolean; }
export default function NewYorkMap({ lineOverlay,lineMode,lineChoosingStops,onLineStation,onStatus, controls, display, initialCamera, onCamera, onAnalysis, analysisRetry, stations, selectedStation, constructionActive, constructionSettings, onPlaceStation, onSelectStation, onDrawingChange, tracks, selectedTrack, onPlaceTrack, onSelectTrack, onTrackHint,onSnapDepth }: {
  lineOverlay:LineOverlay[];lineMode:boolean;lineChoosingStops:boolean;onLineStation:(id:string,side:PlatformSide)=>void;
  onStatus: (status: MapStatus) => void;
  controls: React.RefObject<MapControls | null>;
  display: DisplayOptions;
  initialCamera:SavedCamera;
  onCamera:(camera:SavedCamera)=>void;
  onAnalysis:(status:AnalysisStatus)=>void;
  analysisRetry:number;
  stations:PlacedStation[];
  selectedStation:string|null;
  constructionActive:boolean;
  constructionSettings:ConstructionSettings;
  onPlaceStation:(station:PlacedStation,attachment?:StationAttachment)=>void;
  onSelectStation:(id:string|null)=>void;
  onDrawingChange:(drawing:boolean)=>void;
  onSnapDepth:(depth:number)=>void;
  tracks:PlacedTrack[];selectedTrack:string|null;
  onPlaceTrack:(track:PlacedTrack)=>void;onSelectTrack:(id:string|null)=>void;onTrackHint:(hint:string)=>void;
}) {
  const lineRef=useRef({overlay:lineOverlay,active:lineMode,choosing:lineChoosingStops,onStation:onLineStation});
  lineRef.current={overlay:lineOverlay,active:lineMode,choosing:lineChoosingStops,onStation:onLineStation};
  const constructionRef=useRef({active:constructionActive,settings:constructionSettings,stations,selectedStation,onPlaceStation,onSelectStation,onDrawingChange,tracks,selectedTrack,onPlaceTrack,onSelectTrack,onTrackHint,onSnapDepth});
  constructionRef.current={active:constructionActive,settings:constructionSettings,stations,selectedStation,onPlaceStation,onSelectStation,onDrawingChange,tracks,selectedTrack,onPlaceTrack,onSelectTrack,onTrackHint,onSnapDepth};
  const trackAnchor=useRef<TrackEndpoint|null>(null),hotPort=useRef<string|null>(null),magneticPort=useRef<StationPort|null>(null);
  const straightHeld=useRef(false),straightDirection=useRef<[number,number]|null>(null);
  const refreshTrackPreview=useRef<()=>void>(()=>{});
  const previousTool=useRef(constructionSettings.tool),previousMode=useRef(constructionSettings.tracks);
  const anchor=useRef<Coordinate|null>(null),cursor=useRef<Coordinate|null>(null);
  const cancelDrawing=useRef<()=>boolean>(()=>false);

  const container = useRef<HTMLDivElement>(null);
  const instance=useRef<maplibre.Map|null>(null);
  const popupRef=useRef<maplibre.Popup|null>(null);
  const displayRef=useRef(display);displayRef.current=display;
  const sceneRef=useRef<ReturnType<typeof createFlatMetroScene>|null>(null);
  const ghostStation=useRef<PlacedStation|null>(null),ghostTrack=useRef<PlacedTrack|null>(null);
  const stationAnchorPort=useRef<StationPort|null>(null);
  const portsForTool=()=>{
    const c=constructionRef.current;if(!c.active)return [];
    if(c.settings.tool==='station')return stationConnectionPorts(c.stations,c.tracks);
    if(c.settings.tool!=='track')return [];
    const ports=networkPorts(c.stations,c.tracks,c.settings.tracks),magnet=magneticPort.current;
    return magnet&&!ports.some(port=>port.key===magnet.key)?[...ports,magnet]:ports;
  };
  const syncScene=()=>{const c=constructionRef.current;sceneRef.current?.update({linePicking:lineRef.current.active&&lineRef.current.choosing,lineOverlay:lineRef.current.overlay,stationLabels:displayRef.current.stationLabels,stations:c.stations,tracks:c.tracks,selectedStation:c.selectedStation,selectedTrack:c.selectedTrack,ghostStation:ghostStation.current,ghostTrack:ghostTrack.current,ports:portsForTool(),hot:hotPort.current});};
  const updateStationGhost=(map:maplibre.Map,station:PlacedStation|null)=>{ghostStation.current=station;writeStationGhost(map,station);syncScene();};
  const updateTrackGhost=(map:maplibre.Map,track:PlacedTrack|null,stationList:PlacedStation[],network:PlacedTrack[]=[])=>{ghostTrack.current=track;writeTrackGhost(map,track,stationList,network);syncScene();};
  const updatePorts=(map:maplibre.Map,stationList:PlacedStation[],mode:'single'|'parallel',visible:boolean,hot:string|null,network:PlacedTrack[]=[])=>{
    writePorts(map,stationList,mode,visible,hot,network);
    if(constructionRef.current.active&&constructionRef.current.settings.tool==='station')(map.getSource('station-ports') as maplibre.GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features:portsForTool().map(port=>({type:'Feature',properties:{hot:port.key===hot,blueprint:'trackId' in port.ref&&network.find(track=>track.id===('trackId' in port.ref?port.ref.trackId:''))?.stage==='blueprint'},geometry:{type:'Point',coordinates:port.position}}))});
    syncScene();
  };
  const portProject=(port:StationPort)=>sceneRef.current?.portVisible(port)?sceneRef.current.project(port.position,port.depth)??{x:Infinity,y:Infinity}:{x:Infinity,y:Infinity};
  const nearestStationPort=(point:{x:number;y:number})=>{let result:StationPort|null=null,distance=18;for(const port of portsForTool()){const p=portProject(port),d=Math.hypot(point.x-p.x,point.y-p.y);if(d<distance){result=port;distance=d;}}return result;};
  const stationDraft=(position:Coordinate)=>{const c=constructionRef.current;return stationAnchorPort.current?connectedStation(stationAnchorPort.current,position,c.settings,c.tracks)?.station??null:anchor.current?(c.settings.tool==='depot'?stretchedDepot:stretchedStation)(anchor.current,position,c.settings):null;};
  const paintStationDraft=(map:maplibre.Map,position:Coordinate)=>{const station=stationDraft(position);updateStationGhost(map,station);const c=constructionRef.current,attachment=stationAnchorPort.current&&connectedStation(stationAnchorPort.current,position,c.settings,c.tracks)?.attachment;updateTrackGhost(map,station&&attachment?stationConnector(station,attachment):null,station?[...c.stations,station]:c.stations,c.tracks);};
  const ensureAnalysis=useRef<()=>void>(()=>{});
  const callbacks = useRef({ onStatus, onCamera, onAnalysis });
  callbacks.current = { onStatus, onCamera, onAnalysis };
  useEffect(() => {
    let map: maplibre.Map | undefined;
    let failed = false;
    let ready = false;
    let active = true;
    const analysisAbort=new AbortController();
    let analysisLoading=false;
    let supportSignature='';
    let supportDirty=true,supportTimer:ReturnType<typeof setTimeout>|undefined,lastMovement=0;
    const supportCache=new Map<string,Feature<Polygon|MultiPolygon>>();
    callbacks.current.onAnalysis('idle');
    let removeGesture:(()=>void)|undefined,removeTrackKeys:(()=>void)|undefined;
    callbacks.current.onStatus('loading');
    const timer = window.setTimeout(() => {
      if (active && !ready) { failed = true; callbacks.current.onStatus('error'); }
    }, 20000);
    try {
      map = new maplibre.Map({
        container: container.current!, center: [initialCamera.lng,initialCamera.lat], zoom:initialCamera.zoom,pitch:initialCamera.pitch,bearing:initialCamera.bearing,
        minZoom: 10, maxZoom: 18, maxBounds: NEW_YORK_BOUNDS,
        renderWorldCopies: false,boxZoom:!constructionRef.current.active, pitchWithRotate: false, dragRotate: false, bearingSnap:0, aroundCenter:false,
        touchPitch: true, maxPitch:70, pixelRatio:Math.min(devicePixelRatio,2), attributionControl: false,
        style: createMapStyle()
      });
      instance.current=map;
      ensureAnalysis.current=()=>{
        const options=displayRef.current;
        if(!active||!map?.getLayer('background')||options.mode==='off')return;
        if(map.getSource('analysis-tracts')){applyAnalysisLayers(map,{mode:options.mode});return;}
        if(analysisLoading)return;analysisLoading=true;callbacks.current.onAnalysis('loading');
        void loadAnalysisData(analysisAbort.signal).then(data=>{if(!active)return;installAnalysisLayers(map!,data);applyDisplay(map!,displayRef.current);callbacks.current.onAnalysis('ready');}).catch(()=>{if(active)callbacks.current.onAnalysis('error');}).finally(()=>{analysisLoading=false;});
      };
      map.on('style.load',()=>{if(!active)return;const buildings=map!.getSource('building-tiles');if(buildings)buildings.calculateTileZoom=buildingTileZoom;const rail=map!.getSource('rail-tiles');if(rail){rail.tileSize=128;rail.calculateTileZoom=railTileZoom;}applyDisplay(map!,displayRef.current);installTrackLayers(map!);installStationLayers(map!);updateTracks(map!,constructionRef.current.tracks,constructionRef.current.stations,constructionRef.current.selectedTrack);updatePorts(map!,constructionRef.current.stations,constructionRef.current.settings.tracks,constructionRef.current.active&&constructionRef.current.settings.tool==='track',null,constructionRef.current.tracks);updateStations(map!,constructionRef.current.stations,constructionRef.current.selectedStation);sceneRef.current=createFlatMetroScene((id,side)=>lineRef.current.onStation(id,side));map!.addLayer(sceneRef.current.layer,'building-supports-3d');map!.addLayer(sceneRef.current.elevatedLayer);syncScene();applyDisplay(map!,displayRef.current);ensureAnalysis.current();});
      const cancel=()=>{const hadAnchor=!!anchor.current||!!trackAnchor.current;anchor.current=null;stationAnchorPort.current=null;trackAnchor.current=null;hotPort.current=null;magneticPort.current=null;straightDirection.current=null;cursor.current=null;updateStationGhost(map!,null);updateTrackGhost(map!,null,constructionRef.current.stations,constructionRef.current.tracks);constructionRef.current.onTrackHint('');updatePorts(map!,constructionRef.current.stations,constructionRef.current.settings.tracks,constructionRef.current.active&&constructionRef.current.settings.tool==='track',null,constructionRef.current.tracks);constructionRef.current.onDrawingChange(false);return hadAnchor;};
      cancelDrawing.current=cancel;
      removeGesture=attachCameraGesture(map,()=>{if(constructionRef.current.active)cancel();});
      const canvas=map.getCanvas();
      const leaveCanvas=()=>{sceneRef.current?.hover(null);if(anchor.current){updateStationGhost(map!,null);updateTrackGhost(map!,null,constructionRef.current.stations,constructionRef.current.tracks);}if(trackAnchor.current)updateTrackGhost(map!,null,constructionRef.current.stations,constructionRef.current.tracks);};canvas.addEventListener('mouseleave',leaveCanvas);
      map.on('error', (event) => { if (!active) return;const sourceId=(event as typeof event & {sourceId?:string}).sourceId;if(sourceId&&ANALYSIS_SOURCE_IDS.includes(sourceId)){callbacks.current.onAnalysis('error');return;}failed = true; callbacks.current.onStatus('error'); });
      const updateSupports=()=>{
        supportTimer=undefined;
        if(!active||!map||!supportDirty||!displayRef.current.buildings)return;
        if(map.isMoving()||Date.now()-lastMovement<250){scheduleSupports();return;}
        if(map.isSourceLoaded('building-tiles')){
          supportDirty=false;
          const buildings=map.querySourceFeatures('building-tiles',{'sourceLayer':'building'}).filter(feature=>feature.geometry.type==='Polygon'||feature.geometry.type==='MultiPolygon') as Feature<Polygon|MultiPolygon>[];
          const data=missingBuildingSupports(buildings,supportCache),signature=JSON.stringify(data);
          if(signature!==supportSignature){supportSignature=signature;(map.getSource('building-supports') as maplibre.GeoJSONSource)?.setData(data);}
        }
      };
      const scheduleSupports=()=>{if(displayRef.current.buildings&&supportDirty&&!supportTimer)supportTimer=setTimeout(updateSupports,250);};
      map.on('move',()=>{supportDirty=true;lastMovement=Date.now();clearTimeout(supportTimer);supportTimer=undefined;});
      map.on('sourcedata',event=>{if(event.sourceId==='building-tiles'&&event.sourceDataType==='content')supportDirty=true;});
      map.on('idle', () => {
        scheduleSupports();
        if (active && !failed && map?.isSourceLoaded('openmaptiles')) {
          ready = true; clearTimeout(timer); callbacks.current.onStatus('ready');
        }
      });
      map.on('moveend', () => {
        if (!active) return;
        const center=map!.getCenter();callbacks.current.onCamera({lng:center.lng,lat:center.lat,zoom:map!.getZoom(),pitch:map!.getPitch(),bearing:map!.getBearing()});
        const canvas=map!.getCanvas();canvas.setAttribute('aria-label',`New York map. Tilt ${Math.round(map!.getPitch())} degrees. Bearing ${Math.round(map!.getBearing())} degrees.`);
      });
      const setStraight=(held:boolean)=>{if(straightHeld.current!==held)straightDirection.current=null;straightHeld.current=held;};
      const trackCursor=(point:{x:number;y:number},position:Coordinate,shift?:boolean)=>{
        const c=constructionRef.current;let anchor=trackAnchor.current;if(shift!==undefined)setStraight(shift);
        const excluded=anchor?resolveEndpoint(anchor,c.stations,c.tracks)?.key??null:null;
        let port=nearestPort(map!,c.stations,c.settings.tracks,point,excluded,c.tracks,portProject)??sceneRef.current?.snap(point,c.settings.tracks,anchor?resolveEndpoint(anchor,c.stations,c.tracks)?.position??null:null)??null;
        if(anchor&&isTrackPointRef(anchor)){anchor=orientTrackPoint(anchor,port?.position??position,c.stations,c.tracks);trackAnchor.current=anchor;}
        if(anchor&&port&&isTrackPointRef(port.ref)){const ref=orientTrackPoint(port.ref,resolveEndpoint(anchor,c.stations,c.tracks)!.position,c.stations,c.tracks);const resolved=resolveEndpoint(ref,c.stations,c.tracks);if(resolved?.outward)port={...port,outward:resolved.outward,ref};}
        let end:TrackEndpoint=port?{...port.ref}:{position,depth:c.settings.depth},canDraw=true;
        const straight=!!anchor&&straightHeld.current;
        if(straight){
          straightDirection.current??=straightHeading(anchor!,position,c.stations,c.tracks);
          const heading=straightDirection.current,projected=heading?straightPosition(anchor!,position,heading,c.stations,c.tracks):null;
          if(port&&heading){const onAxis=straightPosition(anchor!,port.position,heading,c.stations,c.tracks),dot=heading[0]*port.outward[0]+heading[1]*port.outward[1];if(!onAxis||stationLength(onAxis,port.position)>.02||dot>-.999999)port=null;}
          canDraw=!!projected;end=port?{...port.ref}:{position:projected??position,depth:c.settings.depth};
        }
        magneticPort.current=port&&isTrackPointRef(port.ref)?port:null;const key=port?.key??null;if(key!==hotPort.current){hotPort.current=key;updatePorts(map!,c.stations,c.settings.tracks,true,key,c.tracks);}
        const draft=anchor&&canDraw?draftTrack(anchor,end,c.settings.tracks,c.stations,c.tracks,straight?'straight':'arc'):null;
        if(anchor){
          updateTrackGhost(map!,draft,c.stations,c.tracks);
          if(draft){const check=checkTrack(draft,c.stations,c.tracks),radius=Number.isFinite(check.minRadius)?`${Math.floor(check.minRadius)} m`:'straight';c.onTrackHint(check.valid?`${straight?'Straight · Shift':`R ${radius}`} · grade ${(check.maxGrade*100).toFixed(1)}% · click to finish`:check.issues.join(' · '));}
          else c.onTrackHint(straight?'Move forward along the departure · release Shift for curves':'Choose a forward endpoint, 10 m–10 km away');
        }else c.onTrackHint(port?`Snap: ${port.name} · ${elevationText(port.depth)} m`:'Click a track or connection point · hold Shift for straight');
        return {port,end,draft};
      };
      refreshTrackPreview.current=()=>{const c=constructionRef.current;if(c.active&&c.settings.tool==='track'&&trackAnchor.current&&cursor.current)trackCursor(sceneRef.current?.project(cursor.current,c.settings.depth)??map!.project(cursor.current),cursor.current);};
      const trackKeyDown=(event:KeyboardEvent)=>{
        const c=constructionRef.current,target=event.target as HTMLElement|null;
        if(event.key!=='Shift'||!c.active||c.settings.tool!=='track'||target?.closest('input, textarea, [contenteditable="true"]'))return;
        setStraight(true);refreshTrackPreview.current();
      };
      const trackKeyUp=(event:KeyboardEvent)=>{if(event.key==='Shift'){setStraight(false);refreshTrackPreview.current();}};
      const trackBlur=()=>{setStraight(false);refreshTrackPreview.current();};
      window.addEventListener('keydown',trackKeyDown);window.addEventListener('keyup',trackKeyUp);window.addEventListener('blur',trackBlur);
      removeTrackKeys=()=>{window.removeEventListener('keydown',trackKeyDown);window.removeEventListener('keyup',trackKeyUp);window.removeEventListener('blur',trackBlur);};
      const stationHit=(point:{x:number;y:number})=>{const id=sceneRef.current?.hit(point,'station');return id?{properties:{stationId:id}}:null;};
      const trackHit=(point:{x:number;y:number})=>{const id=sceneRef.current?.hit(point,'track');return id?{properties:{trackId:id}}:null;};
      const atDepth=(point:{x:number;y:number},ground:Coordinate):Coordinate=>sceneRef.current?.unproject(point,stationAnchorPort.current?.depth??constructionRef.current.settings.depth)??ground;
      map.on('click',event=>{
        if(lineRef.current.active)return;
        const construction=constructionRef.current;
        if(construction.active){
          if(construction.settings.tool==='select'){
            const station=stationHit(event.point),track=station?null:trackHit(event.point);
            construction.onSelectStation(station?String(station.properties.stationId):null);
            construction.onSelectTrack(track?String(track.properties.trackId):null);
            return;
          }
          const point:Coordinate=atDepth(event.point,[event.lngLat.lng,event.lngLat.lat]);
          if(construction.settings.tool==='track'){
            const {port,end,draft}=trackCursor(event.point,point,event.originalEvent.shiftKey);
            if(!trackAnchor.current){
              if(!port){
                const stationFeature=stationHit(event.point);
                if(stationFeature){construction.onSelectStation(String(stationFeature.properties.stationId));return;}
                const trackFeature=trackHit(event.point);
                if(trackFeature){construction.onSelectTrack(String(trackFeature.properties.trackId));return;}
                if(construction.selectedStation||construction.selectedTrack){construction.onSelectStation(null);construction.onSelectTrack(null);}
              }
              trackAnchor.current=end;cursor.current=point;construction.onSelectStation(null);construction.onSelectTrack(null);construction.onDrawingChange(true);construction.onTrackHint('Move to set the end · click to finish · Esc cancels');
            }else if(draft){construction.onPlaceTrack(draft);cancel();}
            return;
          }
          if(!anchor.current){
            const port=construction.settings.tool==='station'?nearestStationPort(event.point):null;
            const hit=port?null:stationHit(event.point);
            if(hit){construction.onSelectStation(String(hit.properties.stationId));return;}
            const track=port?null:trackHit(event.point);if(track){construction.onSelectTrack(String(track.properties.trackId));return;}
            if(!port&&(construction.selectedStation||construction.selectedTrack)){construction.onSelectStation(null);construction.onSelectTrack(null);}
          }
          if(construction.settings.tool!=='station'&&construction.settings.tool!=='depot')return;
          if(!anchor.current){stationAnchorPort.current=construction.settings.tool==='station'?nearestStationPort(event.point):null;anchor.current=stationAnchorPort.current?.position??point;if(stationAnchorPort.current)construction.onSnapDepth(stationAnchorPort.current.depth);cursor.current=point;construction.onSelectStation(null);construction.onSelectTrack(null);construction.onDrawingChange(true);paintStationDraft(map!,point);}
          else if(stationLength(anchor.current,point)>=5){const station=stationDraft(point),attachment=stationAnchorPort.current?connectedStation(stationAnchorPort.current,point,construction.settings,construction.tracks)?.attachment:undefined;if(station){const midpoint:Coordinate=[(station.start[0]+station.end[0])/2,(station.start[1]+station.end[1])/2];const source=(sourceLayer:string)=>map!.querySourceFeatures('openmaptiles',{sourceLayer});const roads=source('transportation_name').filter(f=>!['rail','transit','aerialway','ferry'].includes(String(f.properties.class)));const name=station.kind==='depot'?station.name:nearbyStationName(midpoint,roads,['place','poi','park','water_name'].flatMap(source),station,construction.stations.map(s=>s.name));construction.onPlaceStation({...station,name},attachment);cancel();}}
          return;
        }
        const stationFeature=stationHit(event.point);
        construction.onSelectStation(stationFeature?String(stationFeature.properties.stationId):null);
        if(stationFeature){popupRef.current?.remove();construction.onSelectTrack(null);return;}
        const trackFeature=trackHit(event.point);construction.onSelectTrack(trackFeature?String(trackFeature.properties.trackId):null);if(trackFeature){popupRef.current?.remove();return;}
        if(!map?.getLayer('tract-hit-area')||displayRef.current.mode==='off')return;
        const feature=map.queryRenderedFeatures(event.point,{layers:['tract-hit-area']})[0];
        popupRef.current?.remove();if(!feature)return;
        const p=feature.properties;const node=document.createElement('div');node.className='tract-popup';
        const title=document.createElement('strong');title.textContent=p.neighborhood;node.append(title);
        const subtitle=document.createElement('small');subtitle.textContent=p.city?`${p.city} · ${p.region}`:`${p.borough} · Census tract ${p.tract}`;node.append(subtitle);
        const format=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
        const jobsMode=displayRef.current.mode==='jobs';
        const count=document.createElement('p');count.textContent=jobsMode?`${format.format(p.jobs)} covered jobs · LODES ${p.jobs_year}`:`${format.format(p.population)} residents · 2020 Census`;node.append(count);
        const value=jobsMode?p.jobs_density:p.density;
        const density=document.createElement('p');density.textContent=typeof value==='number'?`${format.format(value)} ${jobsMode?'jobs':'residents'} / km² of land`:'Density unavailable · zero official land area';node.append(density);
        if(jobsMode){const note=document.createElement('small');note.textContent='All covered jobs at workplaces, including secondary jobs.';node.append(note);}
        popupRef.current=new maplibre.Popup({closeOnClick:false,maxWidth:'290px'}).setLngLat(event.lngLat).setDOMContent(node).addTo(map);
      });
      map.on('mousemove',event=>{
        if(!map)return;const construction=constructionRef.current;const hovered=sceneRef.current?.hit(event.point,'station')??null;sceneRef.current?.hover(event.point);
        if(lineRef.current.active){map.getCanvas().style.cursor='';return;}
        if(construction.active){if(construction.settings.tool==='select'){map.getCanvas().style.cursor=hovered||sceneRef.current?.hit(event.point,'track')?'pointer':'';return;}map.getCanvas().style.cursor='crosshair';cursor.current=atDepth(event.point,[event.lngLat.lng,event.lngLat.lat]);if(construction.settings.tool==='track')trackCursor(event.point,cursor.current,event.originalEvent.shiftKey);else if(anchor.current)paintStationDraft(map,cursor.current);else if(construction.settings.tool==='station'){const port=nearestStationPort(event.point);hotPort.current=port?.key??null;updatePorts(map,construction.stations,construction.settings.tracks,true,hotPort.current,construction.tracks);}return;}
        const layers=displayRef.current.mode!=='off'?['tract-hit-area']:[];const available=layers.filter(id=>map?.getLayer(id));map.getCanvas().style.cursor=hovered||sceneRef.current?.hit(event.point,'track')||(available.length&&map.queryRenderedFeatures(event.point,{layers:available}).length)?'pointer':'';
      });
      const activeMap = map;
      controls.current = {
        cancelStation:cancel,
        tilt:()=>activeMap.setPitch(activeMap.getPitch()>5?0:50),
        north: () => activeMap.easeTo({ bearing: 0, duration: 350 })
      };
    } catch { callbacks.current.onStatus('error'); clearTimeout(timer); }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current!);
    return () => { active = false;clearTimeout(supportTimer);supportCache.clear();trackAnchor.current=null;anchor.current=null;cursor.current=null;cancelDrawing.current=()=>false;analysisAbort.abort();popupRef.current?.remove();ensureAnalysis.current=()=>{}; removeGesture?.();removeTrackKeys?.();straightHeld.current=false;straightDirection.current=null;refreshTrackPreview.current=()=>{}; clearTimeout(timer); observer.disconnect(); controls.current = null; instance.current=null; map?.remove();sceneRef.current=null;ghostStation.current=null;ghostTrack.current=null;stationAnchorPort.current=null; };
  }, [controls,initialCamera]);
  useEffect(()=>{syncScene();},[lineOverlay,lineMode,lineChoosingStops]);
  useEffect(()=>{const map=instance.current;if(map?.getLayer('background')){applyDisplay(map,display);syncScene();ensureAnalysis.current();popupRef.current?.remove();if(display.mode==='off')map.getCanvas().style.cursor='';}},[display,analysisRetry]);
  useEffect(()=>{const map=instance.current;if(!map?.getSource('player-stations'))return;updateStations(map,stations,selectedStation);updateTracks(map,tracks,stations,selectedTrack);updatePorts(map,stations,constructionSettings.tracks,constructionActive&&constructionSettings.tool==='track',hotPort.current,tracks);},[stations,selectedStation,tracks,selectedTrack]);
  useEffect(()=>{
    const map=instance.current;if(!map)return;
    // MapLibre reserves Shift + left mouse for box zoom, swallowing placement clicks.
    if(constructionActive)map.boxZoom.disable();else map.boxZoom.enable();
    if(!map.getSource('station-cursor'))return;
    const changed=previousTool.current!==constructionSettings.tool||(constructionSettings.tool==='track'&&previousMode.current!==constructionSettings.tracks);
    previousTool.current=constructionSettings.tool;previousMode.current=constructionSettings.tracks;
    if(!constructionActive||changed)cancelDrawing.current();
    else if(anchor.current&&cursor.current)paintStationDraft(map,cursor.current);
    else if(trackAnchor.current&&cursor.current)refreshTrackPreview.current();
    updatePorts(map,stations,constructionSettings.tracks,constructionActive&&constructionSettings.tool==='track',hotPort.current,tracks);
    map.getCanvas().style.cursor=constructionActive&&constructionSettings.tool!=='select'?'crosshair':'';
  },[constructionActive,constructionSettings]);
  return <div ref={container} className="ny-map" aria-label="New York OpenStreetMap world" />;
}

function applyDisplay(map:maplibre.Map,display:DisplayOptions){
  applyPlanningLayers(map,display);
  map.setPaintProperty('background','background-color',MAP_PALETTE.land);
  for(const id of ['cemeteries','green-spaces','wood','parks','water'])map.setPaintProperty(id,'fill-opacity',id==='wood'?.7:id==='water'?1:id==='cemeteries'?.85:.8);
  for(const id of ['roads-major','roads-minor','waterways','paths'])map.setPaintProperty(id,'line-opacity',1);
  map.setPaintProperty('building-footprints','fill-opacity',.8);
  const detail=display.preset==='detailed';
  const visibility:Record<string,boolean>={
    'labels-places':display.preset!=='clean','labels-roads-major':display.preset!=='clean',
    'labels-neighborhoods':detail,'labels-poi':detail,
    'paths':detail,'building-supports-3d':display.buildings,'buildings-3d':display.buildings,'building-footprints':!display.buildings
  };
  for(const layer of map.getStyle().layers??[])if(/^(player-station|cursor-station|player-track|cursor-track|station-ports)/.test(layer.id))map.setLayoutProperty(layer.id,'visibility','none');
  for(const [id,visible] of Object.entries(visibility))if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
  // Analysis opacity must win over the basemap defaults, including on first data load.
  applyAnalysisLayers(map,{mode:display.mode});
}
