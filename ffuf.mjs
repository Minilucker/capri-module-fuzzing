import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { parse,stringify } from 'smol-toml';
import { tool,field,paging } from '@capri/module-api';
import { ffufOptionsSchema,ffufArguments } from './ffuf-options.mjs';
import { safePath,within } from '@capri/module-utils';
const exec=promisify(execFile),versions=new Map();
export async function ffufVersion(executable){if(!versions.has(executable))versions.set(executable,exec(executable,['-V'],{windowsHide:true,timeout:5000,maxBuffer:65536}).then(r=>(r.stdout+r.stderr).trim()).catch(e=>{versions.delete(executable);throw new Error('DEPENDENCY_MISSING: ffuf; '+e.message);}));return versions.get(executable);}
export function directFfufInvocation(options,environment,configHome){
 const argv=ffufArguments(options),env=Object.fromEntries(Object.entries(environment).filter(([key])=>!/^(?:http|https|all|no)_proxy$/i.test(key)));
 env.NO_PROXY='*';env.no_proxy='*';env.XDG_CONFIG_HOME=configHome;
 return {argv:['-x=','-replay-proxy=',...argv],env};
}
export function setupFfuf({workspace,register,config,worker,directory,jobs}){
 const executable=process.env.PT_FFUF_PATH||'/usr/local/bin/ffuf';
 register(tool('fuzzing_ffuf_options','Read cached ffuf version and the complete named non-proxy option catalogue.'),async()=>({pin:'2.3.0',version:await ffufVersion(executable),parameters:ffufOptionsSchema,tls_verification:false,route:'direct'}));
 register(tool('fuzzing_ffuf_start','Run direct ffuf with native URL and marker semantics. Supply wordlist file paths explicitly, optionally with :KEYWORD suffixes. No pathname/native wrapper mode. Output is always recorded.',{
  options:ffufOptionsSchema,stdin:{type:'boolean'},deadline_ms:{type:'integer',minimum:0},cwd:field
 },['options']),async(a,op)=>{
  if(config.activeDiscovery!==true)throw new Error('Active discovery is disabled for this workspace');
  const version=await ffufVersion(executable),defaults={...config.ffufDefaults};delete defaults.wordlists;
  const options={...defaults,...a.options};
  if(!a.options.wordlists?.length&&!a.options.input_command&&!a.options.version&&!a.options.search)throw new Error('Supply options.wordlists explicitly (or an explicit input command)');
  if(!options.url&&!options.request_file&&!options.version&&!options.search)throw new Error('Supply a target URL or raw request file');
  const cwd=a.cwd?path.resolve(workspace.directory,a.cwd):workspace.directory;
  const configHome=path.join(op.directory,'config');mkdirSync(configHome,{recursive:true});
  if(options.config_file){
   const source=path.resolve(cwd,options.config_file),native=parse(readFileSync(source,'utf8'));
   for(const [section,values] of Object.entries(native))if(values&&typeof values==='object')for(const key of Object.keys(values))if(/proxyurl|replayproxyurl|wordlists/i.test(key))delete values[key];
   const sanitized=path.join(configHome,'explicit.ffufrc');writeFileSync(sanitized,stringify(native));options.config_file=sanitized;
  }
  options.output ??= path.join(directory,'ffuf',op.id,'results.json');
  options.output=path.resolve(cwd,options.output);options.output_format ??='json';options.noninteractive ??=!a.stdin;
  const invocation=directFfufInvocation(options,process.env,configHome);
  mkdirSync(path.dirname(options.output),{recursive:true});
  // Claim the filename atomically before starting ffuf, including across core processes.
  try{writeFileSync(options.output,'',{flag:'wx'});}catch(error){
   if(error.code==='EEXIST')throw new Error('Output file already exists; choose a new filename');
   throw error;
  }
  const relative=path.relative(workspace.directory,options.output).split(path.sep).join('/');
  const reference=within(workspace.directory,options.output)?{workspace:workspace.id,path:relative}:{workspace:workspace.id,path:options.output,external:true,portable:false};
  op.update({result_file:options.output,result_reference:reference,effective_options:options,ffuf_version:version,route:'direct'});
  const result=await op.process({executable,...invocation,cwd,stdin:a.stdin,metadata:{result_reference:reference,ffuf_version:version,route:'direct',tls_verification:false}});
  return {...result,output_format:options.output_format};
 },{external:true});
 register(tool('fuzzing_ffuf_status','Read the core operation state for this module.',{id:field},['id']),a=>owned(a.id),{immediate:true});
 const owned=id=>{const job=jobs.get(workspace.id,id);if(job.module!=='fuzzing'||job.tool!=='fuzzing_ffuf_start')throw new Error('Operation does not belong to fuzzing ffuf');return job;};
 register(tool('fuzzing_ffuf_results','Read an indexed page of ffuf JSON results; raw output remains available.',{id:field,...paging},['id']),async(a,op)=>{
  const job=owned(a.id),ref=job.result_reference;if(!ref)return {id:a.id,state:job.state,items:[],parsed:false,reason:'Operation has no portable output reference'};
  if(ref.workspace!==workspace.id)throw new Error('Result reference belongs to a different workspace');
  if(ref.external&&!path.isAbsolute(ref.path))throw new Error('External result reference must be absolute');
  const file=ref.external?ref.path:safePath(workspace.directory,ref.path);
  return {id:a.id,state:job.state,...await worker('ffuf_results',{file,cache:path.join(directory,'results-index.sqlite'),offset:a.offset,limit:a.limit},op.signal)};
 });
 register(tool('fuzzing_ffuf_input','Send stdin to this module’s running ffuf process.',{id:field,data:{type:'string',maxLength:65536},eof:{type:'boolean'}},['id']),a=>{owned(a.id);return jobs.input(workspace.id,a.id,a.data,a.eof);},{external:true,priority:'control'});
 register(tool('fuzzing_ffuf_cancel','Request cancellation of this module’s ffuf process.',{id:field},['id']),a=>{owned(a.id);return jobs.cancel(workspace.id,a.id);},{immediate:true});
}
