import { useEffect, useRef } from 'react';
import * as maplibre from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { attachCameraGesture, buildingTileZoom } from './camera';
import { createMapStyle, type DisplayOptions } from './mapStyle';

maplibre.setWorkerUrl(mapWorkerUrl);
export const NEW_YORK_BOUNDS: maplibre.LngLatBoundsLike = [[-74.32, 40.47], [-73.65, 40.98]];
export type MapStatus = 'loading' | 'ready' | 'error';
export interface MapControls { zoomIn: () => void; zoomOut: () => void; reset: () => void; tilt:()=>void; }
export default function NewYorkMap({ onStatus, controls, onPosition, display }: {
  onStatus: (status: MapStatus) => void;
  controls: React.RefObject<MapControls | null>;
  onPosition: (position: string) => void;
  display: DisplayOptions;
}) {
  const container = useRef<HTMLDivElement>(null);
  const instance=useRef<maplibre.Map|null>(null);
  const displayRef=useRef(display);displayRef.current=display;
  const callbacks = useRef({ onStatus, onPosition });
  callbacks.current = { onStatus, onPosition };
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
        container: container.current!, center: [-73.99, 40.735], zoom: 10.7,
        minZoom: 10, maxZoom: 18, maxBounds: NEW_YORK_BOUNDS,
        renderWorldCopies: false, pitchWithRotate: false, dragRotate: false, bearingSnap:0, aroundCenter:false,
        touchPitch: true, maxPitch:70, pixelRatio:Math.min(devicePixelRatio,2), attributionControl: false,
        style: createMapStyle()
      });
      instance.current=map;
      map.on('style.load',()=>{if(!active)return;const buildings=map!.getSource('building-tiles');if(buildings)buildings.calculateTileZoom=buildingTileZoom;applyDisplay(map!,displayRef.current);});
      removeGesture=attachCameraGesture(map);
      map.addControl(new maplibre.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
      map.on('error', () => { if (!active) return; failed = true; callbacks.current.onStatus('error'); });
      map.on('idle', () => {
        if (active && !failed && map?.isSourceLoaded('openmaptiles')) {
          ready = true; clearTimeout(timer); callbacks.current.onStatus('ready');
        }
      });
      map.on('moveend', () => {
        if (!active) return;
        const canvas=map!.getCanvas();canvas.setAttribute('aria-label',`New York map. Tilt ${Math.round(map!.getPitch())} degrees. Bearing ${Math.round(map!.getBearing())} degrees.`);
        const p = map!.getCenter();
        callbacks.current.onPosition(`${p.lat.toFixed(3)}° N  ${Math.abs(p.lng).toFixed(3)}° W`);
      });
      const activeMap = map;
      controls.current = {
        zoomIn: () => activeMap.zoomIn(), zoomOut: () => activeMap.zoomOut(),
        tilt:()=>activeMap.setPitch(activeMap.getPitch()>5?0:50),
        reset: () => activeMap.easeTo({ center: [-73.99, 40.735], zoom: 10.7, bearing: 0, pitch: 0, duration: 700 })
      };
    } catch { callbacks.current.onStatus('error'); clearTimeout(timer); }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current!);
    return () => { active = false; removeGesture?.(); clearTimeout(timer); observer.disconnect(); controls.current = null; instance.current=null; map?.remove(); };
  }, [controls]);
  useEffect(()=>{const map=instance.current;if(map?.isStyleLoaded())applyDisplay(map,display);},[display]);
  return <div ref={container} className="ny-map" aria-label="New York OpenStreetMap world" />;
}

function applyDisplay(map:maplibre.Map,display:DisplayOptions){
  const detail=display.preset==='detailed';
  const visibility:Record<string,boolean>={
    'labels-places':display.preset!=='clean','labels-roads-major':display.preset!=='clean',
    'labels-neighborhoods':detail,'labels-roads-minor':detail,'labels-poi':detail,
    'paths':detail,'existing-rail':detail,'buildings-3d':display.buildings
  };
  for(const [id,visible] of Object.entries(visibility))if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
}
