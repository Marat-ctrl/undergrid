import { isQuickSave, type QuickSave } from './gameSave';
export async function readQuickSave(){
  const response=await fetch('/api/quick-save',{cache:'no-store'});
  if(!response.ok)throw new Error('Quick save could not be loaded.');
  const save:unknown=await response.json();if(save===null)return null;
  if(!isQuickSave(save))throw new Error('Quick save is incompatible.');return save;
}
export function createQuickSaver(onError:()=>void){
  let pending:QuickSave|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  let chain=Promise.resolve();
  let lastTimestamp=0;
  const flush=(keepalive=false)=>{
    clearTimeout(timer);if(!pending)return;const save=pending;pending=null;
    const write=async()=>{const response=await fetch('/api/quick-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(save),keepalive});if(!response.ok)throw new Error('Quick save failed.');};
    if(keepalive){void write().catch(onError);return;}
    chain=chain.then(write).catch(onError);
  };
  return {save:(save:QuickSave,immediate=false)=>{lastTimestamp=Math.max(Date.now(),lastTimestamp+1,save.updatedAt);pending={...save,updatedAt:lastTimestamp};clearTimeout(timer);if(immediate)flush();else timer=setTimeout(()=>flush(),250);},flush,dispose:()=>{clearTimeout(timer);pending=null;}};
}
