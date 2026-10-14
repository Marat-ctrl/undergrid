import type { Map } from 'maplibre-gl';
export function cameraDelta(pitch:number,bearing:number,dx:number,dy:number){
  return {pitch:Math.max(0,Math.min(70,pitch-dy*.28)),bearing:bearing+dx*.32};
}
// Building tiles must not lose their building layer as they recede toward the horizon.
// The provider's detailed building data is available at zooms 13 and 14.
export function buildingTileZoom(centerZoom:number){return Math.min(14,Math.max(13,Math.floor(centerZoom)));}
// Retain local rail detail across the pitched viewport instead of dropping tunnel segments in coarse horizon tiles.
export function railTileZoom(){return 14;}
export function attachCameraGesture(map:Map,onRightClick?:()=>void){
  const canvas=map.getCanvas();
  let drag:{id:number;x:number;y:number;startX:number;startY:number;started:boolean;right:boolean}|null=null;
  let dx=0,dy=0,frame=0;
  const flush=()=>{frame=0;if(!drag||!drag.started)return;const next=cameraDelta(map.getPitch(),map.getBearing(),dx,dy);dx=0;dy=0;map.jumpTo(next);};
  const down=(e:PointerEvent)=>{
    if(e.pointerType!=='mouse'||!(e.button===2||(e.button===0&&e.ctrlKey)))return;
    e.preventDefault();e.stopPropagation();map.stop();
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,started:false,right:e.button===2};
    canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
  };
  const move=(e:PointerEvent)=>{
    if(!drag||e.pointerId!==drag.id)return;
    e.preventDefault();e.stopPropagation();
    if(!drag.started){const totalX=e.clientX-drag.startX,totalY=e.clientY-drag.startY;if(Math.hypot(totalX,totalY)<4)return;drag.started=true;}
    dx+=e.clientX-drag.x;dy+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
    if(!frame)frame=requestAnimationFrame(flush);
  };
  const end=(event?:Event)=>{const click=event?.type==='pointerup'&&drag?.right&&!drag.started;if(frame){cancelAnimationFrame(frame);flush();}if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null;dx=0;dy=0;canvas.style.cursor='';if(click)onRightClick?.();};
  const context=(e:MouseEvent)=>e.preventDefault();
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);canvas.addEventListener('contextmenu',context);window.addEventListener('blur',end);
  return()=>{end();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('lostpointercapture',end);canvas.removeEventListener('contextmenu',context);window.removeEventListener('blur',end);};
}
