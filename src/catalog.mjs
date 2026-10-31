import path from 'node:path';
import {stat} from 'node:fs/promises';
import {tool,field,paging} from '@capri/sdk';
import {within} from './io.mjs';

export const librariesFor=config=>[
 {path:'/usr/share/wordlists',kind:'internal',label:'System wordlists'},
 {path:'/usr/share/seclists',kind:'internal',label:'SecLists'},
 ...(config.wordlistLibraries||[])
];
export function runInputs(run,root){
 const cwd=run.effective?.cwd||root;
 return (run.effective_options?.wordlists||[]).map(value=>{
  const colon=value.lastIndexOf(':'),hasMarker=colon>1;
  const file=hasMarker?value.slice(0,colon):value,keyword=hasMarker?value.slice(colon+1):'FUZZ';
  return {path:file==='-'?null:path.resolve(cwd,file),input:file,keyword,run_id:run.id};
 });
}
export function classifyWordlist(file,{root,generated,libraries}){
 const absolute=path.resolve(root,file),revision=generated.find(row=>path.resolve(root,row.path)===absolute);
 const library=libraries.find(item=>within(path.resolve(root,item.path),absolute));
 return {path:absolute,name:path.basename(absolute),source:within(root,absolute)?'workspace':'external',...(library?{source:library.kind,library:library.label||library.path}:{}),...(revision?{...revision,path:absolute,source:'generated'}:{})};
}
export function registerCatalog(api,lifecycle){
 const {workspace,config,db,tools,worker,register}=api;
 const generated=()=>db.prepare('SELECT data FROM word_exports WHERE workspace=? ORDER BY name,revision DESC').all(workspace.id).map(row=>JSON.parse(row.data));
 const context=()=>({root:workspace.directory,generated:generated(),libraries:librariesFor(config)});
 register(tool('fuzzing_run_inputs','Read the recorded executable, argv, working directory and wordlist identities for one saved run. Links generated inputs to their exact revision; does not run ffuf or read file contents.',{id:field},['id']),async(a,call)=>{
  const run=await tools.call('fuzz_status',{id:a.id},call),ctx=context(),inputs=[];
  for(const input of runInputs(run,workspace.directory)){
   if(!input.path){inputs.push({...input,source:'stdin'});continue;}
   const entry={...classifyWordlist(input.path,ctx),...input};
   try{const info=await stat(input.path);entry.available=info.isFile();entry.bytes=info.size;}catch(error){entry.available=false;entry.error=error.code;}
   inputs.push(entry);
  }
  return {id:run.id,command:run.effective?{executable:run.effective.executable,argv:run.effective.argv,cwd:run.effective.cwd}:null,inputs,input_command:run.effective_options?.input_command||null};
 },{family:'wordlists',attribution:'none'});
 register(tool('fuzzing_catalog','Snapshot this workspace’s wordlists: generated revisions, workspace files, installed/internal libraries, configured external libraries and recorded run inputs. Metadata only; returns catalog_id. Poll fuzzing_catalog_result to browse/filter pages; no scan is started.'),(_a,call)=>lifecycle.start('catalog',{},call,async op=>{
  const inputs=[];let offset=0;
  do{op.signal.throwIfAborted();const page=await tools.call('fuzz_list',{offset,limit:200},call);for(const run of page.items)inputs.push(...runInputs(run,workspace.directory).filter(x=>x.path));offset=page.next_offset;}while(offset!==null&&offset!==undefined);
  return worker('wordlist_catalog',{...context(),inputs},op.signal);
 }),{family:'wordlists',attribution:'action'});
 register(tool('fuzzing_catalog_result','Read a wordlist catalog snapshot with optional origin and name/path filters. Pagination covers the whole snapshot; missing historical inputs remain visible. Does not read contents or enumerate files again.',{catalog_id:field,source:{enum:['generated','workspace','internal','external']},query:{type:'string'},...paging},['catalog_id']),a=>{
  const result=lifecycle.result(a.catalog_id,'catalog'),{items=[],...metadata}=result;
  if(!result.ready)return metadata;
  const query=(a.query||'').toLowerCase(),filtered=items.filter(x=>(!a.source||x.source===a.source)&&(!query||[x.name,x.path,x.library].some(v=>v?.toLowerCase().includes(query))));
  const offset=a.offset||0,limit=a.limit||100;
  return {...metadata,total:filtered.length,items:filtered.slice(offset,offset+limit),next_offset:offset+limit<filtered.length?offset+limit:null};
 },{family:'wordlists',attribution:'none'});
 register(tool('fuzzing_catalog_cancel','Cancel one in-progress metadata catalog. Completed snapshots and wordlist files are retained.',{catalog_id:field},['catalog_id']),a=>lifecycle.cancel(a.catalog_id,'catalog'),{family:'wordlists',attribution:'identity'});
}
