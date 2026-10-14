import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp,readdir,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { namedSavesHandler } from './namedSaves';
import { DEFAULT_CAMERA,type QuickSave } from '../src/gameSave';
import { DEFAULT_CONSTRUCTION,stretchedStation } from '../src/components/stationPlacement';
const world:QuickSave={version:1,city:'new-york',active:true,updatedAt:100,camera:{...DEFAULT_CAMERA,pitch:50,bearing:35},preset:'detailed',stationLabels:true,analysis:{mode:'jobs'},stations:[{...stretchedStation([-74.007,40.712],[-74.006,40.712],DEFAULT_CONSTRUCTION)!,id:'station',name:'Station 1',stage:'constructed'}],tracks:[{id:'track',mode:'parallel',stage:'constructed',curve:'straight',start:{stationId:'station',end:'end',lane:'pair'},end:{position:[-74.003,40.712],depth:-35}},{id:'branch',mode:'single',stage:'constructed',curve:'arc',start:{trackId:'track',at:.42,lane:'right',direction:1},end:{position:[-74.001,40.713],depth:-35}}]};
async function fixture(){const root=await mkdtemp(join(tmpdir(),'undergrid-named-'));const start=async()=>{const handler=namedSavesHandler(root),server=createServer((req,res)=>{void handler(req,res,()=>{res.statusCode=404;res.end();});});server.listen(0,'127.0.0.1');await once(server,'listening');return {server,url:`http://127.0.0.1:${(server.address() as {port:number}).port}/api/saves`};};return {root,start,...await start()};}
test('named snapshots persist independently, keep duplicate names and restore full worlds after a server restart',async()=>{
 const f=await fixture();let {server,url}=f;
 try{
   assert.deepEqual(await (await fetch(url)).json(),[]);
   const post=()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'  Нью-Йорк / first 🚇  ',game:world})});
   const firstResponse=await post();assert.equal(firstResponse.status,201);const first=await firstResponse.json(),second=await (await post()).json();assert.notEqual(first.id,second.id);assert.equal(first.name,'Нью-Йорк / first 🚇');
   assert.equal((await (await fetch(url)).json()).length,2);
   await new Promise<void>(resolve=>server.close(()=>resolve()));({server,url}=await f.start());
   const restored=await (await fetch(`${url}/${first.id}`)).json();assert.deepEqual(restored.game,world);assert.equal(restored.name,first.name);
   const files=await readdir(join(f.root,'saves','manual'));assert.deepEqual(new Set(files),new Set([`${first.id}.json`,`${second.id}.json`]));
   assert.deepEqual(JSON.parse(await readFile(join(f.root,'saves','manual',`${first.id}.json`),'utf8')),restored);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(f.root,{recursive:true,force:true});}
});
test('named saves reject invalid writes and identifiers without touching existing snapshots',async()=>{
 const {root,server,url}=await fixture();
 try{
   const post=(data:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   const saved=await (await post({name:'../Snapshot',game:world})).json();
   for(const name of ['', ' '.repeat(5),'a'.repeat(61),'bad\nname'])assert.equal((await post({name,game:world})).status,400);
   assert.equal((await post({name:'Wrong',game:{...world,tracks:[{...world.tracks![0],start:{trackId:'missing',at:.5,lane:'pair',direction:1}}]}})).status,400);
   assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:JSON.stringify({name:'Wrong',game:world})})).status,403);
   assert.equal((await fetch(`${url}/%2e%2e%2fquick-save.json`)).status,400);
   assert.equal((await fetch(`${url}/00000000-0000-0000-0000-000000000000`)).status,404);
   assert.equal((await fetch(url,{method:'DELETE'})).status,405);
   assert.deepEqual((await (await fetch(`${url}/${saved.id}`)).json()).game,world);
   await writeFile(join(root,'saves','manual','11111111-1111-1111-1111-111111111111.json'),'broken JSON');assert.equal((await (await fetch(url)).json()).length,1);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
