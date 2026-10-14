import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { quickSaveHandler } from './quickSave';
import { DEFAULT_CONSTRUCTION,stretchedStation,stretchedDepot } from '../src/components/stationPlacement';
import { DEFAULT_CAMERA } from '../src/gameSave';
test('quick save persists on disk, survives a new server and rejects invalid overwrites',async()=>{
  const root=await mkdtemp(join(tmpdir(),'undergrid-save-'));
  const start=async()=>{const handler=quickSaveHandler(root),server=createServer((req,res)=>{void handler(req,res,()=>{res.statusCode=404;res.end();});});server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;return {server,url:`http://127.0.0.1:${port}/api/quick-save`};};
  let {server,url}=await start();
  try{
    assert.equal(await (await fetch(url)).json(),null);
    const track={id:'saved-track',curve:'straight',mode:'parallel',stage:'constructed',start:{stationId:'saved-station',end:'end',lane:'pair'},end:{position:[-74.004,40.712],depth:-35}};
    const continuation={id:'saved-continuation',curve:'arc',mode:'parallel',stage:'constructed',start:{trackId:'saved-track',end:'end',lane:'pair'},end:{position:[-74.002,40.714],depth:-45}};
    const branch={id:'saved-branch',curve:'arc',mode:'single',stage:'constructed',start:{trackId:'saved-track',at:.42,lane:'right',direction:1},end:{position:[-74.001,40.713],depth:-35}};
    const save={version:1,city:'new-york',active:true,updatedAt:100,camera:{...DEFAULT_CAMERA,zoom:15.4,pitch:50,bearing:35},preset:'detailed',stationLabels:true,tracks:[track,continuation,branch],stations:[{...stretchedStation([-74.007,40.712],[-74.006,40.712],DEFAULT_CONSTRUCTION)!,id:'saved-station',name:'Station 1',stage:'constructed'},{...stretchedDepot([-74.009,40.713],[-74.008,40.713],{...DEFAULT_CONSTRUCTION,capacity:30})!,id:'saved-depot',name:'Depot 1',stage:'constructed'}],analysis:{mode:'jobs'},underground:{enabled:true,depth:50},planning:{existingRail:true,foundations:false,plannedDepth:64}};
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(save)})).status,200);
    assert.deepEqual(JSON.parse(await readFile(join(root,'saves','quick-save.json'),'utf8')),save);
    await new Promise<void>(resolve=>server.close(()=>resolve()));({server,url}=await start());
    assert.deepEqual(await (await fetch(url)).json(),save);
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...save,camera:{...save.camera,lat:900}})})).status,400);
    assert.deepEqual(await (await fetch(url)).json(),save);
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...save,stationLabels:'true'})})).status,400);
    assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:JSON.stringify(save)})).status,403);
    await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...save,updatedAt:99,camera:{...save.camera,zoom:12}})});assert.deepEqual(await (await fetch(url)).json(),save);
    const legacy={...save,updatedAt:101,analysis:{population:false,districts:true}};
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(legacy)})).status,200);
    assert.deepEqual((await (await fetch(url)).json()).analysis,{mode:'population'});
    const demolished={...legacy,updatedAt:102,stations:[],tracks:[]};
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demolished)})).status,200);
    await new Promise<void>(resolve=>server.close(()=>resolve()));({server,url}=await start());
    const restored=await (await fetch(url)).json();assert.deepEqual(restored.stations,[]);assert.deepEqual(restored.tracks,[]);
    await writeFile(join(root,'saves','quick-save.json'),'broken JSON');assert.equal((await fetch(url)).status,422);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
