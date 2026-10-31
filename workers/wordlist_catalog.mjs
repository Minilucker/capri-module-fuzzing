import {opendir,stat} from 'node:fs/promises';
import path from 'node:path';
import {classifyWordlist} from '../src/catalog.mjs';

// One independent worker per snapshot. Enumerate metadata only, never contents.
export async function run(context){
 const {root,generated,inputs,libraries}=context,items=new Map(),notes=[];
 async function add(file){
  file=path.resolve(root,file);if(items.has(file))return;
  const row=classifyWordlist(file,context);row.used_by=[...new Set(inputs.filter(x=>x.path===file).map(x=>x.run_id))];
  try{const info=await stat(file);if(!info.isFile())return;row.available=true;row.bytes=info.size;row.modified_at=info.mtime.toISOString();}catch(error){row.available=false;row.error=error.code;}
  items.set(file,row);
 }
 for(const row of generated)await add(row.path);
 for(const row of inputs)await add(row.path);
 const visited=new Set(),queue=[root,...libraries.map(x=>path.resolve(root,x.path))];
 while(queue.length){
  const folder=queue.shift();if(visited.has(folder))continue;visited.add(folder);let directory;
  try{directory=await opendir(folder);}catch(error){notes.push({path:folder,reason:error.code});continue;}
  for await(const entry of directory){
   const file=path.join(folder,entry.name);
   if(entry.isDirectory()){
    if(['.capri','.codex','.git','node_modules','modules','.venv','venv','.cache'].includes(entry.name))continue;
    try{if((await stat(path.join(file,'workspace.json'))).isFile())continue;}catch(error){if(error.code!=='ENOENT'){notes.push({path:file,reason:error.code});continue;}}
    queue.push(file);
   }else if(entry.isFile()&&/\.(txt|lst|list|dic|wordlist)$/i.test(entry.name))await add(file);
  }
 }
 return {items:[...items.values()].sort((a,b)=>a.source.localeCompare(b.source)||a.name.localeCompare(b.name)||b.revision-a.revision||a.path.localeCompare(b.path)),notes,captured_at:new Date().toISOString()};
}
