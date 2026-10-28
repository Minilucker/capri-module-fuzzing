import path from 'node:path';
import { existsSync,readFileSync } from 'node:fs';
import { atomic,hash,safePath } from '@capri/module-utils';
import { tool,field,paging,strings } from '@capri/module-api';
import { setupFfuf } from './ffuf.mjs';

export async function activate(context){
 const {db,workspace,register,mutate,directory,database,worker,capabilities}=context,id=workspace.id;
 const readWordlist=(args,signal)=>worker('wordlist_read',{...args,root:workspace.directory,directory},signal);
 register(tool('fuzzing_read_file','Read a workspace wordlist file with module-owned indexing.',{path:field,sha256:field,...paging},['path']),(a,op)=>readWordlist(a,op.signal));
 const entries={type:'array',minItems:1,maxItems:1000,items:{type:'object',properties:{word:{type:'string',minLength:1,maxLength:200,pattern:'^[^\\r\\n\\u0000]+$'},excerpt:{type:'string',maxLength:500},capture_ids:strings,origin:{enum:['application_response','request_input','unknown','ffuf_input_or_reflection']}},required:['word','capture_ids','origin'],additionalProperties:false}};
 function batch(kind,args,words,operation){
  const batchId=hash([id,kind,operation.actor.kind,operation.actor.mainThreadId,operation.actor.callerThreadId,operation.actor.operator,operation.actor.idempotency_key]);
  const data={id:batchId,kind,created_at:new Date().toISOString(),...args,operation_id:operation.id};
  let accepted=0;db.prepare('INSERT INTO word_batches VALUES(?,?,?,?)').run(id,batchId,kind,JSON.stringify(data));
  for(const entry of words)accepted+=Number(db.prepare('INSERT OR IGNORE INTO word_terms VALUES(?,?,?,?,?)').run(id,entry.word,kind,batchId,entry.origin||'agent_inference').changes);
  return {batch_id:batchId,accepted,duplicates:words.length-accepted};
 }
 register(tool('fuzzing_add_observed','Store words extracted by the agent, referring to immutable proxy evidence. Performs no extraction or inference.',{entries},['entries']),(a,op)=>{
  for(const entry of a.entries)for(const source of entry.capture_ids)capabilities.capture(source,'fuzzing:'+op.id);
  return mutate(op,'observed',a,()=>batch('observed',a,a.entries,op));
 });
 register(tool('fuzzing_add_candidates','Store words inferred by the agent with source batches and a concise rationale.',{words:{type:'array',minItems:1,maxItems:1000,items:{type:'string',minLength:1,maxLength:200,pattern:'^[^\\r\\n\\u0000]+$'}},source_batches:strings,explanation:{type:'string',minLength:1,maxLength:4000}},['words','source_batches','explanation']),(a,op)=>mutate(op,'inferred',a,()=>{
  for(const source of a.source_batches)if(!db.prepare('SELECT 1 FROM word_batches WHERE workspace=? AND id=?').get(id,source))throw new Error('Unknown source batch');
  return batch('inferred',a,a.words.map(word=>({word})),op);
 }));
 function selection(a){let sql='workspace=?',params=[id];if(a.kind&&a.kind!=='all'){sql+=' AND kind=?';params.push(a.kind);}if(a.origin){sql+=' AND origin=?';params.push(a.origin);}if(a.batch_ids?.length){sql+=' AND batch IN ('+a.batch_ids.map(()=>'?').join(',')+')';params.push(...a.batch_ids);}return {sql,params};}
 const filters={kind:{enum:['all','observed','inferred']},batch_ids:strings,origin:field};
 register(tool('fuzzing_words','Read indexed vocabulary and source references.',{...filters,...paging}),(a)=>{
  const {sql,params}=selection(a),limit=a.limit||100,offset=a.offset||0;
  const items=db.prepare('SELECT word,kind,batch,origin FROM word_terms WHERE '+sql+' ORDER BY word,kind,batch,origin LIMIT ? OFFSET ?').all(...params,limit+1,offset);
  return {items:items.slice(0,limit),next_offset:items.length>limit?offset+limit:null};
 });
 const slug={type:'string',pattern:'^[a-z0-9][a-z0-9-]{0,63}$'};
 const exportInfo=(name,revision)=>{const row=db.prepare('SELECT data FROM word_exports WHERE workspace=? AND name=? AND revision=?').get(id,name,revision);if(!row)throw new Error('Unknown completed wordlist revision');return JSON.parse(row.data);};
 register(tool('fuzzing_generate','Write a completed immutable wordlist revision under .capri/modules/<storage lineage>/wordlists/. Interrupted exports retain their reserved revision.',{...filters,name:slug,lowercase:{type:'boolean'},sort:{type:'boolean'}},['name']),async(a,op)=>{
  const reservation=mutate(op,'export-reserve',a,()=>{
   const revision=Number(db.prepare('SELECT COALESCE(MAX(revision),0)+1 n FROM export_operations WHERE name=?').get(a.name).n);
   const file=path.join(directory,'wordlists',a.name,'r'+String(revision).padStart(6,'0')+'.txt'),relative=path.relative(workspace.directory,file).split(path.sep).join('/');
   const info={name:a.name,revision,path:relative,created_at:new Date().toISOString(),selection:a};
   db.prepare('INSERT INTO export_operations VALUES(?,?,?,?,?,?)').run(op.id,a.name,revision,JSON.stringify(a),JSON.stringify(info),'reserved');return {operation_id:op.id,...info};
  });
  const existing=db.prepare('SELECT data FROM word_exports WHERE workspace=? AND name=? AND revision=?').get(id,reservation.name,reservation.revision);if(existing)return JSON.parse(existing.data);
  const file=safePath(workspace.directory,reservation.path);
  const output=await worker('wordlist_export',{...a,database,workspace:id,file,operation_id:reservation.operation_id},op.signal);
  op.signal.throwIfAborted();
  const info={...reservation,...output},sidecar=file.replace(/\.txt$/,'.json');
  if(existsSync(sidecar)&&hash(readFileSync(sidecar))!==hash(JSON.stringify(info,null,2)+'\n'))throw new Error('Preserving operator-modified export metadata');
  atomic(sidecar,info);
  return mutate(op,'export-complete',a,()=>{db.prepare('INSERT INTO word_exports VALUES(?,?,?,?)').run(id,a.name,reservation.revision,JSON.stringify(info));db.prepare("UPDATE export_operations SET state='completed',data=? WHERE id=?").run(JSON.stringify(info),reservation.operation_id);return info;});
 });
 register(tool('fuzzing_list','List completed wordlist revisions; unfinished exports are excluded.',{name:slug,...paging}),a=>{
  const limit=a.limit||100,offset=a.offset||0,items=db.prepare('SELECT data FROM word_exports WHERE workspace=?'+(a.name?' AND name=?':'')+' ORDER BY name,revision DESC LIMIT ? OFFSET ?').all(id,...(a.name?[a.name]:[]),limit+1,offset);
  return {items:items.slice(0,limit).map(r=>JSON.parse(r.data)),next_offset:items.length>limit?offset+limit:null};
 });
 register(tool('fuzzing_read','Read a completed wordlist through this module’s indexed file reader.',{name:slug,revision:{type:'integer',minimum:1},...paging},['name','revision']),async(a,op)=>{const info=exportInfo(a.name,a.revision);return {...info,...await readWordlist({...a,path:info.path,sha256:info.sha256},op.signal)};});
 setupFfuf(context);
}
