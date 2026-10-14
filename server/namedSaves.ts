import { randomUUID } from 'node:crypto';
import { mkdir,readdir,readFile,writeFile,rename,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { isQuickSave } from '../src/gameSave';
import { isNamedSave,saveSummary,validSaveName,SAVE_ID,type NamedSave } from '../src/namedSaves';
import { normalizeSave } from './saveData';
export function namedSavesHandler(root:string){
 const folder=join(root,'saves','manual');let writes:Promise<void>=Promise.resolve();
 return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
   const path=req.url?.split('?')[0]??'';if(path!=='/api/saves'&&!path.startsWith('/api/saves/')){next();return;}
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   const send=(code:number,value:unknown)=>{res.statusCode=code;res.end(JSON.stringify(value));};
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'Origin is not allowed.'});return;}
   const id=path==='/api/saves'?null:path.slice('/api/saves/'.length);
   if(id!==null&&!SAVE_ID.test(id)){send(400,{error:'Invalid save identifier.'});return;}
   try{
     if(req.method==='GET'){
       await writes;
       if(id){
         try{const save:unknown=JSON.parse(await readFile(join(folder,`${id}.json`),'utf8'));if(!isNamedSave(save)||save.id!==id){send(422,{error:'Save is incompatible.'});return;}send(200,save);}
         catch(error){send((error as NodeJS.ErrnoException).code==='ENOENT'?404:422,{error:'Save could not be loaded.'});}return;
       }
       let files:string[];try{files=await readdir(folder);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;send(200,[]);return;}
       const entries=await Promise.all(files.filter(file=>file.endsWith('.json')&&SAVE_ID.test(file.slice(0,-5))).map(async file=>{try{const save:unknown=JSON.parse(await readFile(join(folder,file),'utf8'));return isNamedSave(save)&&save.id===file.slice(0,-5)?saveSummary(save):null;}catch{return null;}}));
       send(200,entries.filter(entry=>entry!==null).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id)));return;
     }
     if(req.method!=='POST'||id){res.setHeader('Allow',id?'GET':'GET, POST');send(405,{error:'Method not allowed.'});return;}
     if(!req.headers['content-type']?.startsWith('application/json')){send(415,{error:'JSON required.'});return;}
     const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>131072){send(413,{error:'Save is too large.'});return;}chunks.push(bytes);}const body=Buffer.concat(chunks).toString('utf8');
     let input:unknown;try{input=JSON.parse(body);}catch{send(400,{error:'Invalid JSON.'});return;}
     if(!input||typeof input!=='object'||!('name' in input)||!validSaveName(input.name)||!('game' in input)||!isQuickSave(input.game)){send(400,{error:'Enter a save name (1–60 characters) and a valid world.'});return;}
     const save:NamedSave={version:1,id:randomUUID(),name:input.name.trim(),createdAt:Date.now(),game:{...normalizeSave(input.game),active:true}};
     const write=writes.then(async()=>{await mkdir(folder,{recursive:true});const temp=join(folder,`${save.id}.tmp`);try{await writeFile(temp,JSON.stringify(save,null,2)+'\n',{encoding:'utf8',flag:'wx'});await rename(temp,join(folder,`${save.id}.json`));}finally{await unlink(temp).catch(()=>{});}});
     writes=write.catch(()=>{});await write;send(201,saveSummary(save));
   }catch{send(500,{error:'Save could not be written. Please try again.'});}
 };
}
