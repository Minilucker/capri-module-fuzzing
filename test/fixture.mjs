import {createModuleHarness} from '@capri/sdk/testing';
import {tool,schema,withRetainedCall} from '@capri/sdk';
import {readFuzzResultPage} from '@capri/sdk/fuzzing';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {activate} from '../src/index.mjs';
export const moduleRoot=fileURLToPath(new URL('../',import.meta.url));
export const manifest=JSON.parse(readFileSync(new URL('../module.json',import.meta.url)));
export function worker(name,data,signal){
 return new Promise((resolve,reject)=>{const thread=new Worker(new URL('./worker-host.mjs',import.meta.url),{workerData:{entry:pathToFileURL(path.join(moduleRoot,manifest.workers[name])).href,data}});let done=false;
  const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);void thread.terminate();error?reject(error):resolve(value);};const abort=()=>finish(Error('Cancelled worker'));
  thread.on('message',r=>finish(r.error?Error(r.error):null,r.value));thread.on('error',e=>finish(e));thread.on('exit',code=>{if(!done)finish(Error('Worker exited '+code));});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}
export async function fixture(t,config={}){
 const family={},runs=new Map(),views=new Map(),processCalls=[],captures=[],waiting=new Set();let ws;
 const options=schema.object({},[],{additionalProperties:true}),page={offset:schema.integer(),limit:schema.integer()},id=schema.string();
 const publicRun=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='controller'));
 const coreTools=[
  {definition:tool('fuzz_status','Read synthetic run',{id},['id']),handler:a=>publicRun(runs.get(a.id)),options:{attribution:'none'}},
  {definition:tool('fuzz_list','List synthetic runs',page),handler:a=>({items:[...runs.values()].slice(a.offset||0,(a.offset||0)+(a.limit||50)).map(publicRun),next_offset:null}),options:{attribution:'none'}},
  {definition:tool('fuzz_cancel','Cancel synthetic run or view',{id,view_id:id}),handler:a=>{const r=a.view_id?views.get(a.view_id):runs.get(a.id);r.controller?.abort();return publicRun(r);},options:{attribution:'none'}},
  {definition:tool('fuzz_run','Synthetic baseline',{options},['options']),handler:(a,c)=>family.start(c,r=>family.execute(a,r)),options:{family:'fuzzing',contract:'2.0.0',overridable:true,attribution:'action'}},
  {definition:tool('fuzz_result','Synthetic baseline result',{id,view_id:id,...page}),handler:(a,c)=>family.result(a,c),options:{family:'fuzzing',contract:'2.0.0',overridable:true,attribution:'optional'}}
 ];
 function work(kind,call,fn){const id=randomUUID(),controller=new AbortController(),directory=path.join(ws.directory,kind,id);mkdirSync(directory,{recursive:true});const row={id,[kind==='run'?'run_id':'view_id']:id,workspace:ws.id,actor:call.actor,state:'preparing'},map=kind==='run'?runs:views;map.set(id,row);
  const done=withRetainedCall(call,async()=>{try{controller.signal.throwIfAborted();row.result=await fn({...call,id,directory,signal:controller.signal});row.state=controller.signal.aborted?'cancelled':kind==='run'?'exited':'ready';}catch(e){row.state=controller.signal.aborted?'cancelled':'failed';row.error=e.message;}},'fixture '+kind);row.controller=controller;waiting.add(done);void done.finally(()=>waiting.delete(done));return {...row,controller:undefined};}
 const harness=await createModuleHarness({module:manifest,config,coreTools,migrations:manifest.migrations.map(p=>readFileSync(path.join(moduleRoot,p),'utf8')),mocks:{fuzzing:family,worker,capabilities:{capture(id){if(!id.startsWith('capture-'))throw Error('Unknown capture');captures.push(id);return{capture_id:id};}}},activate:api=>{
  ws=api.workspace;Object.assign(family,{
   start:(call,fn)=>work('run',call,fn),
   execute:async(args,run)=>{processCalls.push({args,actor:run.actor});return {kind:'ffuf',options:args.options,exit_code:0};},
   resolve:id=>{const job=runs.get(id);if(!job)throw Error('Unknown run');return {job,reference:job.result_reference,file:job.file,format:job.format||'json',cache:path.join(ws.directory,'results-cache.sqlite')};},
   read:(args)=>{const {file,cache,format}=family.resolve(args.id);return readFuzzResultPage({...args,file,cache,format});},
   result:(args,call,processor=family.read)=>{if(args.view_id){const r=views.get(args.view_id);if(!r)throw Error('Unknown view');return {...r.result,view_id:r.id,view_state:r.state,ready:r.state==='ready',error:r.error};}return work('view',call,view=>processor(args,view));}
  });api.registerCleanup(async()=>{for(const row of [...runs.values(),...views.values()])row.controller?.abort();await Promise.allSettled([...waiting]);});return activate(api);
 }});
 t.after(()=>harness.close());
 const rawCall=(name,args={},actor)=>harness.call(name,args,actor?{identity:actor,actor}:{});
 async function settled(value){for(let i=0;i<600;i++){if(value.view_id){value=family.result({view_id:value.view_id});if(value.ready)return value;if(['failed','cancelled'].includes(value.view_state))throw Error(value.error||value.view_state);}else if(value.run_id){const r=runs.get(value.run_id);if(r.state==='exited')return r.result;if(['failed','cancelled'].includes(r.state))throw Error(r.error||r.state);}else if(value.read_id||value.export_id){const kind=value.read_id?'read':'export';value=await rawCall('fuzzing_'+kind+'_result',{[kind+'_id']:value[kind+'_id']});if(value.ready)return value;if(['failed','cancelled','interrupted'].includes(value.state))throw Error(value.error||value.state);}else return value;await new Promise(r=>setTimeout(r,10));}throw Error('Fixture did not finish');}
 return {...harness,rawCall,call:async(...args)=>settled(await rawCall(...args)),settled,captures,processCalls,runs,views,family,directory:harness.api.directory,db:harness.api.db,results(rows){const id=randomUUID(),file=path.join(ws.directory,id+'.json');writeFileSync(file,JSON.stringify({results:rows}));runs.set(id,{id,state:'exited',file,result_reference:{workspace:ws.id,path:path.basename(file)}});return {id,file};}};
}
