import {filters} from './vocabulary-schema.mjs';
import path from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {tool,field,paging,strings} from '@capri/sdk';
import {atomic,hash,safePath} from './io.mjs';
import {randomUUID} from 'node:crypto';
const described=(schema,description)=>({...schema,description});
export function registerVocabulary(context){
const {db,workspace,register,mutate,capabilities}=context,id=workspace.id;
 const entries={type:'array',minItems:1,maxItems:1000,description:'Observed vocabulary with immutable proxy capture IDs and provenance. These are supplied observations, not inferred candidates.',items:{type:'object',properties:{word:{type:'string',minLength:1,maxLength:200,pattern:'^[^\\r\\n\\u0000]+$',description:'One observed word or pathname candidate, without line breaks.'},excerpt:{type:'string',maxLength:500,description:'Short evidence excerpt explaining where this word appeared; omit secrets.'},capture_ids:described(strings,'Immutable capture IDs returned by proxy_traffic_read; each must belong to this workspace.'),origin:{enum:['application_response','request_input','unknown','ffuf_input_or_reflection'],description:'Distinguish application vocabulary from supplied request words or reflected fuzz inputs.'}},required:['word','capture_ids','origin'],additionalProperties:false}};
 function batch(kind,args,words,operation){
  const batchId=randomUUID();
  const data={id:batchId,kind,created_at:new Date().toISOString(),...args,invocation_id:operation.invocation_id};
  let accepted=0;db.prepare('INSERT INTO word_batches VALUES(?,?,?,?)').run(id,batchId,kind,JSON.stringify(data));
  for(const entry of words)accepted+=Number(db.prepare('INSERT OR IGNORE INTO word_terms VALUES(?,?,?,?,?)').run(id,entry.word,kind,batchId,entry.origin||'agent_inference').changes);
  return {batch_id:batchId,accepted,duplicates:words.length-accepted};
 }
 register(tool('fuzzing_add_observed','Store words extracted by the agent, referring to immutable proxy evidence. Performs no extraction or inference.',{entries},['entries']),(a,op)=>{
  for(const entry of a.entries)for(const source of entry.capture_ids)capabilities.capture(source,'fuzzing:'+op.invocation_id);
  return mutate(op,'observed',a,()=>batch('observed',a,a.entries,op));
 },{family:'wordlists',attribution:'action'});
 register(tool('fuzzing_add_candidates','Store agent-inferred candidates separately from observed words. Supply existing source batch IDs and a rationale; the tool performs no inference.',{words:{type:'array',minItems:1,maxItems:1000,description:'Candidates already inferred by the calling agent.',items:{type:'string',minLength:1,maxLength:200,pattern:'^[^\\r\\n\\u0000]+$'}},source_batches:described(strings,'Existing batch IDs from fuzzing_add_observed, fuzzing_add_candidates or fuzzing_words.'),explanation:{type:'string',minLength:1,maxLength:4000,description:'Concise reasoning linking the candidates to their source vocabulary.'}},['words','source_batches','explanation']),(a,op)=>mutate(op,'inferred',a,()=>{
  for(const source of a.source_batches)if(!db.prepare('SELECT 1 FROM word_batches WHERE workspace=? AND id=?').get(id,source))throw new Error('Unknown source batch');
  return batch('inferred',a,a.words.map(word=>({word})),op);
 }),{family:'wordlists',attribution:'action'});
 function selection(a){let sql='workspace=?',params=[id];if(a.kind&&a.kind!=='all'){sql+=' AND kind=?';params.push(a.kind);}if(a.origin){sql+=' AND origin=?';params.push(a.origin);}if(a.query){sql+=' AND instr(lower(word),lower(?))>0';params.push(a.query);}if(a.batch_ids?.length){sql+=' AND batch IN ('+a.batch_ids.map(()=>'?').join(',')+')';params.push(...a.batch_ids);}return {sql,params};}
 register(tool('fuzzing_words','Inspect stored vocabulary and provenance before inferring candidates or generating a wordlist. Filter by kind, batch or origin and page through source references.',{...filters,query:{type:'string',description:'Case-insensitive word substring; filtering occurs before pagination.'},...paging}),(a)=>{
  const {sql,params}=selection(a),limit=a.limit||100,offset=a.offset||0;
  const items=db.prepare('SELECT word,kind,batch,origin FROM word_terms WHERE '+sql+' ORDER BY word,kind,batch,origin LIMIT ? OFFSET ?').all(...params,limit+1,offset);
  return {items:items.slice(0,limit),next_offset:items.length>limit?offset+limit:null};
 },{family:'wordlists',attribution:'none'});

 register(tool('fuzzing_batches','List vocabulary batches and inference explanations. Search terms or explanations before pagination; use fuzzing_batch for complete provenance.',{kind:{enum:['observed','inferred']},query:{type:'string'},...paging}),a=>{
  const clauses=['workspace=?'],params=[id];if(a.kind){clauses.push('kind=?');params.push(a.kind);}if(a.query){clauses.push("(instr(lower(COALESCE(json_extract(data,'$.explanation'),'')),lower(?))>0 OR EXISTS(SELECT 1 FROM word_terms t WHERE t.workspace=word_batches.workspace AND t.batch=word_batches.id AND instr(lower(t.word),lower(?))>0))");params.push(a.query,a.query);}
  const limit=a.limit??100,offset=a.offset??0,rows=db.prepare('SELECT data FROM word_batches WHERE '+clauses.join(' AND ')+" ORDER BY json_extract(data,'$.created_at') DESC,id LIMIT ? OFFSET ?").all(...params,limit+1,offset).map(r=>JSON.parse(r.data));
  return {items:rows.slice(0,limit).map(r=>({id:r.id,kind:r.kind,created_at:r.created_at,submitted_count:(r.entries||r.words||[]).length,source_batches:r.source_batches||[],explanation:r.explanation||''})),next_offset:rows.length>limit?offset+limit:null};
 },{family:'wordlists',attribution:'none'});
 register(tool('fuzzing_batch','Read one exact vocabulary batch, its capture references and supplied inference rationale. Performs no inference or target requests.',{id:field},['id']),a=>{const row=db.prepare('SELECT data FROM word_batches WHERE workspace=? AND id=?').get(id,a.id);if(!row)throw Error('Unknown vocabulary batch');return JSON.parse(row.data);},{family:'wordlists',attribution:'none'});
}
