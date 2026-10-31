import {filters} from './vocabulary-schema.mjs';
import path from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {tool,field,paging,strings} from '@capri/sdk';
import {atomic,hash,safePath} from './io.mjs';
import {randomUUID} from 'node:crypto';
const described=(schema,description)=>({...schema,description});
import {createWordlistLifecycle} from './wordlist-lifecycle.mjs';
export function registerWordlists(context){
const {db,workspace,register,mutate,directory,database,worker}=context,id=workspace.id;
const wordlists=createWordlistLifecycle(context);
const readWordlist=(args,signal)=>worker('wordlist_read',{...args,root:workspace.directory,directory},signal);
 register(tool('fuzzing_read_file','Start reading/indexing a wordlist. Supply an explicit container path or workspace-relative path and optional SHA-256; use offset/limit to page. Returns read_id; poll fuzzing_read_result for lines or fuzzing_read_cancel to stop.',{path:described(field,'Explicit container file path, or a path relative to this workspace. Host filesystem paths are not translated.'),sha256:described(field,'Optional expected content hash; a mismatch fails without returning lines.'),...paging},['path']),(a,call)=>wordlists.start('read',a,call,run=>readWordlist(a,run.signal)),{family:'wordlists',attribution:'action'});
 const slug={type:'string',pattern:'^[a-z0-9][a-z0-9-]{0,63}$',description:'Wordlist name: lowercase letters, digits and hyphens, up to 64 characters.'};
 const exportInfo=(name,revision)=>{const row=db.prepare('SELECT data FROM word_exports WHERE workspace=? AND name=? AND revision=?').get(id,name,revision);if(!row)throw new Error('Unknown completed wordlist revision');return JSON.parse(row.data);};
 register(tool('fuzzing_generate','Start an immutable wordlist export from stored vocabulary. Supply a name and filters; returns export_id. Poll fuzzing_export_result for the completed revision/path/hash; use fuzzing_export_cancel to stop.',{...filters,name:slug,lowercase:{type:'boolean',description:'Lowercase selected words before deduplication; default false.'},sort:{type:'boolean',description:'Sort the generated words; default true.'}},['name']),(a,call)=>wordlists.start('export',a,call,async op=>{
  const reservation=mutate(op,'export-reserve',a,()=>{
   const revision=Number(db.prepare('SELECT COALESCE(MAX(revision),0)+1 n FROM export_operations WHERE name=?').get(a.name).n);
   const file=path.join(directory,'wordlists',a.name,'r'+String(revision).padStart(6,'0')+'.txt'),relative=path.relative(workspace.directory,file).split(path.sep).join('/');
   const info={name:a.name,revision,path:relative,created_at:new Date().toISOString(),selection:a};
   db.prepare('INSERT INTO export_operations VALUES(?,?,?,?,?,?)').run(op.id,a.name,revision,JSON.stringify(a),JSON.stringify(info),'reserved');return {export_id:op.id,...info};
  });
  const existing=db.prepare('SELECT data FROM word_exports WHERE workspace=? AND name=? AND revision=?').get(id,reservation.name,reservation.revision);if(existing)return JSON.parse(existing.data);
  const file=safePath(workspace.directory,reservation.path);
  const output=await worker('wordlist_export',{...a,database,workspace:id,file,operation_id:reservation.export_id},op.signal);
  op.signal.throwIfAborted();
  const info={...reservation,...output},sidecar=file.replace(/\.txt$/,'.json');
  if(existsSync(sidecar)&&hash(readFileSync(sidecar))!==hash(JSON.stringify(info,null,2)+'\n'))throw new Error('Preserving operator-modified export metadata');
  atomic(sidecar,info);
  return mutate(op,'export-complete',a,()=>{db.prepare('INSERT INTO word_exports VALUES(?,?,?,?)').run(id,a.name,reservation.revision,JSON.stringify(info));db.prepare("UPDATE export_operations SET state='completed',data=? WHERE id=?").run(JSON.stringify(info),reservation.export_id);return info;});
 }),{family:'wordlists',attribution:'action'});
 register(tool('fuzzing_list','Find completed wordlist names, revisions, paths and hashes for reading or fuzzing. Optionally filter by name; unfinished exports are excluded.',{name:slug,...paging}),a=>{
  const limit=a.limit||100,offset=a.offset||0,items=db.prepare('SELECT data FROM word_exports WHERE workspace=?'+(a.name?' AND name=?':'')+' ORDER BY name,revision DESC LIMIT ? OFFSET ?').all(id,...(a.name?[a.name]:[]),limit+1,offset);
  return {items:items.slice(0,limit).map(r=>JSON.parse(r.data)),next_offset:items.length>limit?offset+limit:null};
 },{family:'wordlists',attribution:'none'});
 register(tool('fuzzing_read','Start reading a completed generated wordlist with hash verification. Supply its name and exact revision from fuzzing_list. Returns read_id; poll fuzzing_read_result for lines.',{name:slug,revision:{type:'integer',minimum:1,description:'Exact completed revision; no implicit latest revision is selected.'},...paging},['name','revision']),(a,call)=>{const info=exportInfo(a.name,a.revision);return wordlists.start('read',a,call,async run=>({...info,...await readWordlist({...a,path:info.path,sha256:info.sha256},run.signal)}));},{family:'wordlists',attribution:'action'});
 for(const kind of ['read','export']){
  const key=kind+'_id',input={[key]:described(field,'ID returned by the wordlist '+kind+' initiating tool.')};
  register(tool('fuzzing_'+kind+'_result','Read the saved outcome of a wordlist '+kind+' without starting new work. A ready result includes its lines or immutable export metadata.',input,[key]),a=>wordlists.result(a[key],kind),{family:'wordlists',attribution:'none'});
  register(tool('fuzzing_'+kind+'_cancel','Request cancellation of a wordlist '+kind+'; poll its result tool to confirm termination. Completed wordlists are retained.',input,[key]),a=>wordlists.cancel(a[key],kind),{family:'wordlists',attribution:'identity'});
 }
 register(tool('fuzzing_export_status','Inspect an export\'s native state, requested selection and saved attribution.',{export_id:field},['export_id']),a=>wordlists.status(a.export_id,'export'),{family:'wordlists',attribution:'none'});

register(tool('fuzzing_wordlist_tasks','List this workspace’s wordlist read/export operations, original attribution and native states. Use after reopening a view; polling does not start new work.',{kind:{enum:['read','export']},state:{type:'string'},...paging}),a=>{
 const clauses=["json_extract(data,'$.workspace')=?"],params=[id];for(const k of ['kind','state'])if(a[k]){clauses.push("json_extract(data,'$."+k+"')=?");params.push(a[k]);}const limit=a.limit??100,offset=a.offset??0,rows=db.prepare('SELECT data FROM wordlist_tasks WHERE '+clauses.join(' AND ')+" ORDER BY json_extract(data,'$.created_at') DESC,id LIMIT ? OFFSET ?").all(...params,limit+1,offset).map(r=>JSON.parse(r.data));return {items:rows.slice(0,limit),next_offset:rows.length>limit?offset+limit:null};
 },{family:'wordlists',attribution:'none'});
 return {exportInfo,readWordlist};
}
