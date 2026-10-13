import { useEffect, useRef } from 'react';
import * as maplibre from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { attachCameraGesture, buildingTileZoom } from './camera';
import type { SavedCamera } from '../gameSave';
import { createMapStyle, type DisplayOptions } from './mapStyle';

maplibre.setWorkerUrl(mapWorkerUrl);
export const NEW_YORK_BOUNDS: maplibre.LngLatBoundsLike = [[-74.32, 40.47], [-73.65, 40.98]];
export type MapStatus = 'loading' | 'ready' | 'error';
export interface MapControls { north: () => void; tilt:()=>void; }
export default function NewYorkMap({ onStatus, controls, display, initialCamera, onCamera }: {
  onStatus: (status: MapStatus) => void;
  controls: React.RefObject<MapControls | null>;
  display: DisplayOptions;
  initialCamera:SavedCamera;
  onCamera:(camera:SavedCamera)=>void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const instance=useRef<maplibre.Map|null>(null);
  const displayRef=useRef(display);displayRef.current=display;
  const callbacks = useRef({ onStatus, onCamera });
  callbacks.current = { onStatus, onCamera };
  useEffect(() => {
    let map: maplibre.Map | undefined;
    let failed = false;
    let ready = false;
    let active = true;
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
      map.on('style.load',()=>{if(!active)return;const buildings=map!.getSource('building-tiles');if(buildings)buildings.calculateTileZoom=buildingTileZoom;applyDisplay(map!,displayRef.current);});
      removeGesture=attachCameraGesture(map);
      map.on('error', () => { if (!active) return; failed = true; callbacks.current.onStatus('error'); });
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
      const activeMap = map;
      controls.current = {
        tilt:()=>activeMap.setPitch(activeMap.getPitch()>5?0:50),
        north: () => activeMap.easeTo({ bearing: 0, duration: 350 })
      };
    } catch { callbacks.current.onStatus('error'); clearTimeout(timer); }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current!);
    return () => { active = false; removeGesture?.(); clearTimeout(timer); observer.disconnect(); controls.current = null; instance.current=null; map?.remove(); };
  }, [controls,initialCamera]);
  useEffect(()=>{const map=instance.current;if(map?.isStyleLoaded())applyDisplay(map,display);},[display]);
  return <div ref={container} className="ny-map" aria-label="New York OpenStreetMap world" />;
}

function applyDisplay(map:maplibre.Map,display:DisplayOptions){
  const detail=display.preset==='detailed';
  const visibility:Record<string,boolean>={
    'labels-places':display.preset!=='clean','labels-roads-major':display.preset!=='clean',
    'labels-neighborhoods':detail,'labels-roads-minor':detail,'labels-poi':detail,
    'paths':detail,'existing-rail':detail,'buildings-3d':display.buildings,'building-footprints':!display.buildings
  };
  for(const [id,visible] of Object.entries(visibility))if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
}
