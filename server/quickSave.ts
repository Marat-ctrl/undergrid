import { normalizeSave } from './saveData';
import { namedSavesHandler } from './namedSaves';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isQuickSave } from '../src/gameSave';
export function quickSaveHandler(root:string){
  const folder=join(root,'saves'),file=join(folder,'quick-save.json');
  let writes:Promise<void>=Promise.resolve();
  return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    if(req.url?.split('?')[0]!=='/api/quick-save'){next();return;}
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const send=(code:number,value:unknown)=>{res.statusCode=code;res.end(JSON.stringify(value));};
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'Origin is not allowed.'});return;}
    try{
      if(req.method==='GET'){
        await writes;
        try{const save=JSON.parse(await readFile(file,'utf8'));if(!isQuickSave(save)){send(422,{error:'Quick save is incompatible.'});return;}send(200,save);}
        catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')send(200,null);else send(422,{error:'Quick save could not be read.'});}
        return;
      }
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'Method not allowed.'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')){send(415,{error:'JSON required.'});return;}
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>262144){send(413,{error:'Save is too large.'});return;}}
      let save:unknown;try{save=JSON.parse(body);}catch{send(400,{error:'Invalid JSON.'});return;}
      if(!isQuickSave(save)){send(400,{error:'Invalid quick save.'});return;}
      const clean=normalizeSave(save);
      const write=writes.then(async()=>{try{const current=JSON.parse(await readFile(file,'utf8'));if(isQuickSave(current)&&current.updatedAt>clean.updatedAt)return;}catch{}await mkdir(folder,{recursive:true});const tmp=join(folder,'quick-save.tmp');await writeFile(tmp,JSON.stringify(clean,null,2)+'\n','utf8');await rename(tmp,file);});
      writes=write.catch(()=>{});await write;send(200,{saved:true});
    }catch{send(500,{error:'Quick save could not be written.'});}
  };
}
export function quickSavePlugin():Plugin {
  let root='';
  return {name:'undergrid-local-save',configResolved:config=>{root=config.root;},configureServer:server=>{server.middlewares.use(quickSaveHandler(root));server.middlewares.use(namedSavesHandler(root));},configurePreviewServer:server=>{server.middlewares.use(quickSaveHandler(root));server.middlewares.use(namedSavesHandler(root));}};
}
