import { draftTrack,resolveEndpoint,type PlacedTrack,type TrackEndpoint } from './trackPlacement';
import { installTrackLayers,updateTracks,updateTrackGhost,updatePorts,nearestPort,TRACK_HIT_LAYERS } from './trackLayers';
import { stretchedStation, stationLength, type ConstructionSettings, type PlacedStation, type Coordinate } from './stationPlacement';
import { installStationLayers, updateStations, updateStationGhost, STATION_HIT_LAYERS } from './stationLayers';
import { missingBuildingSupports } from './buildingSupports';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { installMetroPreview, setMetroPreviewVisible, METRO_PREVIEW_CENTER } from './metroPreview';
import { applyPlanningLayers, foundationRange, foundationRisk } from './underground';
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
export interface MapControls { north: () => void; tilt:()=>void;preview:()=>void;cancelStation:()=>boolean; }
export default function NewYorkMap({ onStatus, controls, display, initialCamera, onCamera, onAnalysis, analysisRetry, previewVisible, stations, selectedStation, constructionActive, constructionSettings, onPlaceStation, onSelectStation, onDrawingChange, tracks, selectedTrack, onPlaceTrack, onSelectTrack, onTrackHint }: {
  onStatus: (status: MapStatus) => void;
  controls: React.RefObject<MapControls | null>;
  display: DisplayOptions;
  initialCamera:SavedCamera;
  onCamera:(camera:SavedCamera)=>void;
  onAnalysis:(status:AnalysisStatus)=>void;
  analysisRetry:number;
  previewVisible:boolean;
  stations:PlacedStation[];
  selectedStation:string|null;
  constructionActive:boolean;
  constructionSettings:ConstructionSettings;
  onPlaceStation:(station:PlacedStation)=>void;
  onSelectStation:(id:string|null)=>void;
  onDrawingChange:(drawing:boolean)=>void;
  tracks:PlacedTrack[];selectedTrack:string|null;
  onPlaceTrack:(track:PlacedTrack)=>void;onSelectTrack:(id:string|null)=>void;onTrackHint:(hint:string)=>void;
}) {
  const constructionRef=useRef({active:constructionActive,settings:constructionSettings,stations,selectedStation,onPlaceStation,onSelectStation,onDrawingChange,tracks,selectedTrack,onPlaceTrack,onSelectTrack,onTrackHint});
  constructionRef.current={active:constructionActive,settings:constructionSettings,stations,selectedStation,onPlaceStation,onSelectStation,onDrawingChange,tracks,selectedTrack,onPlaceTrack,onSelectTrack,onTrackHint};
  const trackAnchor=useRef<TrackEndpoint|null>(null),hotPort=useRef<string|null>(null);
  const previousTool=useRef(constructionSettings.tool),previousMode=useRef(constructionSettings.tracks);
  const anchor=useRef<Coordinate|null>(null),cursor=useRef<Coordinate|null>(null);
  const cancelDrawing=useRef<()=>boolean>(()=>false);
  const previewRef=useRef(previewVisible);previewRef.current=previewVisible;
  const container = useRef<HTMLDivElement>(null);
  const instance=useRef<maplibre.Map|null>(null);
  const popupRef=useRef<maplibre.Popup|null>(null);
  const displayRef=useRef(display);displayRef.current=display;
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
    callbacks.current.onAnalysis('idle');
    let removeGesture:(()=>void)|undefined;
    callbacks.current.onStatus('loading');
    const timer = window.setTimeout(() => {
      if (active && !ready) { failed = true; callbacks.current.onStatus('error'); }
    }, 20000);
    try {
      map = new maplibre.Map({
        container: container.current!, center: [initialCamera.lng,initialCamera.lat], zoom:initialCamera.zoom,pitch:initialCamera.pitch,bearing:initialCamera.bearing,
        minZoom: 10, maxZoom: 18, maxBounds: NEW_YORK_BOUNDS,
        renderWorldCopies: false, pitchWithRotate: false, dragRotate: false, bearingSnap:0, aroundCenter:false,
        touchPitch: true, maxPitch:70, pixelRatio:Math.min(devicePixelRatio,2), attributionControl: false,
        style: createMapStyle()
      });
      instance.current=map;
      ensureAnalysis.current=()=>{
        const options=displayRef.current;
        if(!active||!map?.getLayer('background')||options.mode==='off')return;
        if(map.getSource('nyc-tracts')){applyAnalysisLayers(map,{mode:options.mode});return;}
        if(analysisLoading)return;analysisLoading=true;callbacks.current.onAnalysis('loading');
        void loadAnalysisData(analysisAbort.signal).then(data=>{if(!active)return;installAnalysisLayers(map!,data);applyDisplay(map!,displayRef.current);callbacks.current.onAnalysis('ready');}).catch(()=>{if(active)callbacks.current.onAnalysis('error');}).finally(()=>{analysisLoading=false;});
      };
      map.on('style.load',()=>{if(!active)return;const buildings=map!.getSource('building-tiles');if(buildings)buildings.calculateTileZoom=buildingTileZoom;const rail=map!.getSource('rail-tiles');if(rail){rail.tileSize=128;rail.calculateTileZoom=railTileZoom;}applyDisplay(map!,displayRef.current);installMetroPreview(map!);installStationLayers(map!);installTrackLayers(map!);updateTracks(map!,constructionRef.current.tracks,constructionRef.current.stations,constructionRef.current.selectedTrack);updatePorts(map!,constructionRef.current.stations,constructionRef.current.settings.tracks,constructionRef.current.active&&constructionRef.current.settings.tool==='track',null);updateStations(map!,constructionRef.current.stations,constructionRef.current.selectedStation);setMetroPreviewVisible(map!,previewRef.current);ensureAnalysis.current();});
      const cancel=()=>{const hadAnchor=!!anchor.current||!!trackAnchor.current;anchor.current=null;trackAnchor.current=null;hotPort.current=null;cursor.current=null;updateStationGhost(map!,null);updateTrackGhost(map!,null,constructionRef.current.stations);constructionRef.current.onTrackHint('');updatePorts(map!,constructionRef.current.stations,constructionRef.current.settings.tracks,constructionRef.current.active&&constructionRef.current.settings.tool==='track',null);constructionRef.current.onDrawingChange(false);return hadAnchor;};
      cancelDrawing.current=cancel;
      removeGesture=attachCameraGesture(map);
      const canvas=map.getCanvas();
      const leaveCanvas=()=>{if(anchor.current)updateStationGhost(map!,null);if(trackAnchor.current)updateTrackGhost(map!,null,constructionRef.current.stations);};canvas.addEventListener('mouseleave',leaveCanvas);
      map.on('error', (event) => { if (!active) return;const sourceId=(event as typeof event & {sourceId?:string}).sourceId;if(sourceId&&ANALYSIS_SOURCE_IDS.includes(sourceId)){callbacks.current.onAnalysis('error');return;}failed = true; callbacks.current.onStatus('error'); });
      map.on('idle', () => {
        if(active&&map?.isSourceLoaded('building-tiles')){
          const buildings=map.querySourceFeatures('building-tiles',{'sourceLayer':'building'}).filter(feature=>feature.geometry.type==='Polygon'||feature.geometry.type==='MultiPolygon') as Feature<Polygon|MultiPolygon>[];
          const data=missingBuildingSupports(buildings),signature=JSON.stringify(data);
          if(signature!==supportSignature){supportSignature=signature;(map.getSource('building-supports') as maplibre.GeoJSONSource)?.setData(data);}
        }
        if (active && !failed && map?.isSourceLoaded('openmaptiles')) {
          ready = true; clearTimeout(timer); callbacks.current.onStatus('ready');
        }
      });
      map.on('moveend', () => {
        if (!active) return;
        const center=map!.getCenter();callbacks.current.onCamera({lng:center.lng,lat:center.lat,zoom:map!.getZoom(),pitch:map!.getPitch(),bearing:map!.getBearing()});
        const canvas=map!.getCanvas();canvas.setAttribute('aria-label',`New York map. Tilt ${Math.round(map!.getPitch())} degrees. Bearing ${Math.round(map!.getBearing())} degrees.`);
      });
      const trackCursor=(point:{x:number;y:number},position:Coordinate)=>{
        const c=constructionRef.current;
        const excluded=trackAnchor.current?resolveEndpoint(trackAnchor.current,c.stations)?.key??null:null;
        const port=nearestPort(map!,c.stations,c.settings.tracks,point,excluded),key=port?.key??null;
        if(key!==hotPort.current){hotPort.current=key;updatePorts(map!,c.stations,c.settings.tracks,true,key);}
        const end:TrackEndpoint=port?{...port.ref}:{position,depth:c.settings.depth};
        const hint=port?`Snap: ${port.name} · −${Math.abs(port.depth)} m`:trackAnchor.current?'Click to finish · Esc cancels':'Click a station port or the map to start';
        c.onTrackHint(hint);
        if(trackAnchor.current)updateTrackGhost(map!,draftTrack(trackAnchor.current,end,c.settings.tracks,c.stations),c.stations);
        return {port,end};
      };
      map.on('click',event=>{
        const construction=constructionRef.current;
        if(construction.active){
          const point:Coordinate=[event.lngLat.lng,event.lngLat.lat];
          if(construction.settings.tool==='track'){
            const {port,end}=trackCursor(event.point,point);
            if(!trackAnchor.current){
              if(!port){
                const stationHit=map!.queryRenderedFeatures(event.point,{layers:STATION_HIT_LAYERS})[0];
                if(stationHit){construction.onSelectStation(String(stationHit.properties.stationId));return;}
                const trackHit=map!.queryRenderedFeatures(event.point,{layers:TRACK_HIT_LAYERS})[0];
                if(trackHit){construction.onSelectTrack(String(trackHit.properties.trackId));return;}
                if(construction.selectedStation||construction.selectedTrack){construction.onSelectStation(null);construction.onSelectTrack(null);return;}
              }
              trackAnchor.current=end;cursor.current=point;construction.onSelectStation(null);construction.onSelectTrack(null);construction.onDrawingChange(true);construction.onTrackHint('Move to set the end · click to finish · Esc cancels');
            }else{const track=draftTrack(trackAnchor.current,end,construction.settings.tracks,construction.stations);if(track){construction.onPlaceTrack(track);cancel();}else construction.onTrackHint('Move farther away or choose another port');}
            return;
          }
          if(!anchor.current){
            const hit=map!.queryRenderedFeatures(event.point,{layers:STATION_HIT_LAYERS})[0];
            if(hit){construction.onSelectStation(String(hit.properties.stationId));return;}
            if(construction.selectedStation||construction.selectedTrack){construction.onSelectStation(null);construction.onSelectTrack(null);return;}
          }
          if(construction.settings.tool!=='station')return;
          if(!anchor.current){anchor.current=point;cursor.current=point;construction.onSelectStation(null);construction.onSelectTrack(null);construction.onDrawingChange(true);updateStationGhost(map!,stretchedStation(point,point,construction.settings));}
          else if(stationLength(anchor.current,point)>=5){const station=stretchedStation(anchor.current,point,construction.settings);if(station){construction.onPlaceStation(station);cancel();}}
          return;
        }
        const stationHit=map!.queryRenderedFeatures(event.point,{layers:STATION_HIT_LAYERS})[0];
        construction.onSelectStation(stationHit?String(stationHit.properties.stationId):null);
        if(stationHit){popupRef.current?.remove();construction.onSelectTrack(null);return;}
        const trackHit=map!.queryRenderedFeatures(event.point,{layers:TRACK_HIT_LAYERS})[0];construction.onSelectTrack(trackHit?String(trackHit.properties.trackId):null);if(trackHit){popupRef.current?.remove();return;}
        if(displayRef.current.foundations&&map?.getLayer('foundation-risk')){
          const building=map.queryRenderedFeatures(event.point,{layers:['foundation-risk']})[0];
          if(building){popupRef.current?.remove();const height=typeof building.properties.render_height==='number'?building.properties.render_height:null;const range=foundationRange(height);const node=document.createElement('div');node.className='tract-popup';const title=document.createElement('strong');title.textContent='Foundation · game estimate';node.append(title);const line=document.createElement('p');line.textContent=range?`Proxy depth: ${Math.round(range[0])}–${Math.round(range[1])} m`:'Unknown · no usable height';node.append(line);const status=document.createElement('p');const risk=foundationRisk(height,displayRef.current.plannedDepth);status.textContent=`Planned depth ${displayRef.current.plannedDepth} m · ${risk==='overlap'?'Potential overlap':risk==='uncertain'?'Uncertain clearance':risk==='lower'?'Lower proxy risk':'Unknown'}`;node.append(status);const note=document.createElement('small');note.textContent='Height-based gameplay proxy. Actual foundations, utilities and tunnel depths are not verified.';node.append(note);popupRef.current=new maplibre.Popup({closeOnClick:false,maxWidth:'290px'}).setLngLat(event.lngLat).setDOMContent(node).addTo(map);return;}
        }
        if(!map?.getLayer('tract-hit-area')||displayRef.current.mode==='off')return;
        const feature=map.queryRenderedFeatures(event.point,{layers:['tract-hit-area']})[0];
        popupRef.current?.remove();if(!feature)return;
        const p=feature.properties;const node=document.createElement('div');node.className='tract-popup';
        const title=document.createElement('strong');title.textContent=p.neighborhood;node.append(title);
        const subtitle=document.createElement('small');subtitle.textContent=`${p.borough} · Census tract ${p.tract}`;node.append(subtitle);
        const format=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
        const jobsMode=displayRef.current.mode==='jobs';
        const count=document.createElement('p');count.textContent=jobsMode?`${format.format(p.jobs)} covered jobs · LODES ${p.jobs_year}`:`${format.format(p.population)} residents · 2020 Census`;node.append(count);
        const value=jobsMode?p.jobs_density:p.density;
        const density=document.createElement('p');density.textContent=typeof value==='number'?`${format.format(value)} ${jobsMode?'jobs':'residents'} / km² of land`:'Density unavailable · zero official land area';node.append(density);
        if(jobsMode){const note=document.createElement('small');note.textContent='All covered jobs at workplaces, including secondary jobs.';node.append(note);}
        popupRef.current=new maplibre.Popup({closeOnClick:false,maxWidth:'290px'}).setLngLat(event.lngLat).setDOMContent(node).addTo(map);
      });
      map.on('mousemove',event=>{
        if(!map)return;const construction=constructionRef.current;
        if(construction.active){map.getCanvas().style.cursor='crosshair';cursor.current=[event.lngLat.lng,event.lngLat.lat];if(construction.settings.tool==='track')trackCursor(event.point,cursor.current);else if(anchor.current)updateStationGhost(map,stretchedStation(anchor.current,cursor.current,construction.settings));return;}
        const layers=displayRef.current.foundations?['foundation-risk']:displayRef.current.mode!=='off'?['tract-hit-area']:[];const available=layers.filter(id=>map?.getLayer(id));map.getCanvas().style.cursor=available.length&&map.queryRenderedFeatures(event.point,{layers:available}).length?'pointer':'';
      });
      const activeMap = map;
      controls.current = {
        cancelStation:cancel,
        preview:()=>activeMap.easeTo({center:METRO_PREVIEW_CENTER,zoom:16.7,pitch:35,bearing:-15,duration:600}),
        tilt:()=>activeMap.setPitch(activeMap.getPitch()>5?0:50),
        north: () => activeMap.easeTo({ bearing: 0, duration: 350 })
      };
    } catch { callbacks.current.onStatus('error'); clearTimeout(timer); }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current!);
    return () => { active = false;trackAnchor.current=null;anchor.current=null;cursor.current=null;cancelDrawing.current=()=>false;analysisAbort.abort();popupRef.current?.remove();ensureAnalysis.current=()=>{}; removeGesture?.(); clearTimeout(timer); observer.disconnect(); controls.current = null; instance.current=null; map?.remove(); };
  }, [controls,initialCamera]);
  useEffect(()=>{const map=instance.current;if(map?.getLayer('background')){applyDisplay(map,display);ensureAnalysis.current();popupRef.current?.remove();if(display.mode==='off')map.getCanvas().style.cursor='';}},[display,analysisRetry]);
  useEffect(()=>{if(instance.current?.getSource('metro-preview'))setMetroPreviewVisible(instance.current,previewVisible);},[previewVisible]);
  useEffect(()=>{const map=instance.current;if(!map?.getSource('player-stations'))return;updateStations(map,stations,selectedStation);updateTracks(map,tracks,stations,selectedTrack);updatePorts(map,stations,constructionSettings.tracks,constructionActive&&constructionSettings.tool==='track',hotPort.current);},[stations,selectedStation,tracks,selectedTrack]);
  useEffect(()=>{
    const map=instance.current;if(!map?.getSource('station-cursor'))return;
    const changed=previousTool.current!==constructionSettings.tool||(constructionSettings.tool==='track'&&previousMode.current!==constructionSettings.tracks);
    previousTool.current=constructionSettings.tool;previousMode.current=constructionSettings.tracks;
    if(!constructionActive||changed)cancelDrawing.current();
    else if(anchor.current&&cursor.current)updateStationGhost(map,stretchedStation(anchor.current,cursor.current,constructionSettings));
    else if(trackAnchor.current&&cursor.current){const port=nearestPort(map,stations,constructionSettings.tracks,map.project(cursor.current),resolveEndpoint(trackAnchor.current,stations)?.key??null);updateTrackGhost(map,draftTrack(trackAnchor.current,port?port.ref:{position:cursor.current,depth:constructionSettings.depth},constructionSettings.tracks,stations),stations);}
    updatePorts(map,stations,constructionSettings.tracks,constructionActive&&constructionSettings.tool==='track',hotPort.current);
    map.getCanvas().style.cursor=constructionActive?'crosshair':'';
  },[constructionActive,constructionSettings]);
  return <div ref={container} className="ny-map" aria-label="New York OpenStreetMap world" />;
}

function applyDisplay(map:maplibre.Map,display:DisplayOptions){
  applyPlanningLayers(map,display);
  applyAnalysisLayers(map,{mode:display.mode});
  map.setPaintProperty('background','background-color','#f0f0e8');
  for(const id of ['wood','parks','water'])map.setPaintProperty(id,'fill-opacity',id==='wood'?.7:id==='parks'?.8:1);
  for(const id of ['roads-major','roads-minor','waterways','paths'])map.setPaintProperty(id,'line-opacity',1);
  map.setPaintProperty('building-footprints','fill-opacity',.8);
  const detail=display.preset==='detailed';
  const visibility:Record<string,boolean>={
    'labels-places':display.preset!=='clean','labels-roads-major':display.preset!=='clean',
    'labels-neighborhoods':detail,'labels-poi':detail,
    'paths':detail,'building-supports-3d':display.buildings&&!display.foundations,'buildings-3d':display.buildings&&!display.foundations,'building-footprints':!display.buildings&&!display.foundations
  };
  for(const [id,visible] of Object.entries(visibility))if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
}
