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
export interface MapControls { north: () => void; tilt:()=>void; }
export default function NewYorkMap({ onStatus, controls, display, initialCamera, onCamera, onAnalysis, analysisRetry }: {
  onStatus: (status: MapStatus) => void;
  controls: React.RefObject<MapControls | null>;
  display: DisplayOptions;
  initialCamera:SavedCamera;
  onCamera:(camera:SavedCamera)=>void;
  onAnalysis:(status:AnalysisStatus)=>void;
  analysisRetry:number;
}) {
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
      map.on('style.load',()=>{if(!active)return;const buildings=map!.getSource('building-tiles');if(buildings)buildings.calculateTileZoom=buildingTileZoom;const rail=map!.getSource('rail-tiles');if(rail){rail.tileSize=128;rail.calculateTileZoom=railTileZoom;}applyDisplay(map!,displayRef.current);ensureAnalysis.current();});
      removeGesture=attachCameraGesture(map);
      map.on('error', (event) => { if (!active) return;const sourceId=(event as typeof event & {sourceId?:string}).sourceId;if(sourceId&&ANALYSIS_SOURCE_IDS.includes(sourceId)){callbacks.current.onAnalysis('error');return;}failed = true; callbacks.current.onStatus('error'); });
      map.on('idle', () => {
        if (active && !failed && map?.isSourceLoaded('openmaptiles')) {
          ready = true; clearTimeout(timer); callbacks.current.onStatus('ready');
        }
      });
      map.on('moveend', () => {
        if (!active) return;
        const center=map!.getCenter();callbacks.current.onCamera({lng:center.lng,lat:center.lat,zoom:map!.getZoom(),pitch:map!.getPitch(),bearing:map!.getBearing()});
        const canvas=map!.getCanvas();canvas.setAttribute('aria-label',`New York map. Tilt ${Math.round(map!.getPitch())} degrees. Bearing ${Math.round(map!.getBearing())} degrees.`);
      });
      map.on('click',event=>{
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
      map.on('mousemove',event=>{if(!map)return;const layers=displayRef.current.foundations?['foundation-risk']:displayRef.current.mode!=='off'?['tract-hit-area']:[];const available=layers.filter(id=>map?.getLayer(id));map.getCanvas().style.cursor=available.length&&map.queryRenderedFeatures(event.point,{layers:available}).length?'pointer':'';});
      const activeMap = map;
      controls.current = {
        tilt:()=>activeMap.setPitch(activeMap.getPitch()>5?0:50),
        north: () => activeMap.easeTo({ bearing: 0, duration: 350 })
      };
    } catch { callbacks.current.onStatus('error'); clearTimeout(timer); }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current!);
    return () => { active = false;analysisAbort.abort();popupRef.current?.remove();ensureAnalysis.current=()=>{}; removeGesture?.(); clearTimeout(timer); observer.disconnect(); controls.current = null; instance.current=null; map?.remove(); };
  }, [controls,initialCamera]);
  useEffect(()=>{const map=instance.current;if(map?.getLayer('background')){applyDisplay(map,display);ensureAnalysis.current();popupRef.current?.remove();if(display.mode==='off')map.getCanvas().style.cursor='';}},[display,analysisRetry]);
  return <div ref={container} className="ny-map" aria-label="New York OpenStreetMap world" />;
}

function applyDisplay(map:maplibre.Map,display:DisplayOptions){
  applyPlanningLayers(map,display);
  applyAnalysisLayers(map,{mode:display.mode});
  const detail=display.preset==='detailed';
  const visibility:Record<string,boolean>={
    'labels-places':display.preset!=='clean','labels-roads-major':display.preset!=='clean',
    'labels-neighborhoods':detail,'labels-poi':detail,
    'paths':detail,'buildings-3d':display.buildings&&!display.foundations,'building-footprints':!display.buildings&&!display.foundations
  };
  for(const [id,visible] of Object.entries(visibility))if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
}
