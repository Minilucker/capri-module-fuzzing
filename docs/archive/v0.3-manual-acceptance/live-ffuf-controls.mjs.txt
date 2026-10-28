import {frameworkImport,frameworkRoot} from './framework.mjs';
// Inside the container: real pinned ffuf, synthetic local origins and proxy trap.
import http from 'node:http';
import https from 'node:https';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const { createCore,provisionWorkspace }=await frameworkImport("test/apply-helper.mjs");
const { atomic }=await frameworkImport("src/modules.mjs");
import { ffufNativeFlags } from '../ffuf-options.mjs';
const exec=promisify(execFile),tag=randomUUID(),root='/workspaces/development/.capri/core/acceptance/ffuf/'+tag,directory=path.join(root,'project');mkdirSync(directory,{recursive:true});
atomic(path.join(directory,'workspace.json'),{schemaVersion:1,id:'fixture',root:true,modules:{fuzzing:{enabled:true,config:{activeDiscovery:true}}}});await provisionWorkspace(root,directory);
writeFileSync(root+'/input.txt','catalog\n');writeFileSync(root+'/long.txt',Array.from({length:40},(_,i)=>'candidate'+i).join('\n')+'\n');
await exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',root+'/key','-out',root+'/cert','-days','1','-subj','/CN=localhost']);
const hits=[];let proxyHits=0;
const heldResponses=[];
const handler=(req,res)=>{hits.push({path:req.url,headers:req.headers});if(req.url.startsWith('/reservation/')){heldResponses.push(res);return;}if(req.url.includes('/redirect/')){res.writeHead(302,{location:'/followed'});return res.end();}res.writeHead(200,{'content-type':'text/plain'});res.end(req.url.endsWith('/first')?'ALPHA:first':req.url.endsWith('/second')?'BETA:second':req.url.endsWith('/after')?'DONE:ok':'fixture response');};
const servers=[http.createServer(handler),https.createServer({key:readFileSync(root+'/key'),cert:readFileSync(root+'/cert')},handler)];
const trap=http.createServer((req,res)=>{proxyHits++;res.writeHead(502);res.end();});trap.on('connect',(_,socket)=>{proxyHits++;socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
for(const s of [...servers,trap])await new Promise(r=>s.listen(0,'127.0.0.1',r));
const proxyUrl='http://127.0.0.1:'+trap.address().port,url='http://127.0.0.1:'+servers[0].address().port+'/FUZZ',tlsUrl='https://127.0.0.1:'+servers[1].address().port+'/FUZZ';
const configFile=root+'/explicit.toml';writeFileSync(configFile,'[http]\nproxyurl = "'+proxyUrl+'"\nreplayproxyurl = "'+proxyUrl+'"\nfollowredirects = true\n[input]\nwordlists = ["/definitely-not-a-default-wordlist"]\n');
const oldEnv={...process.env},ambient=root+'/ambient';mkdirSync(ambient+'/ffuf',{recursive:true});writeFileSync(ambient+'/ffuf/ffufrc',readFileSync(configFile));
Object.assign(process.env,{HTTP_PROXY:proxyUrl,HTTPS_PROXY:proxyUrl,ALL_PROXY:proxyUrl,http_proxy:proxyUrl,https_proxy:proxyUrl,all_proxy:proxyUrl,NO_PROXY:'',no_proxy:'',XDG_CONFIG_HOME:ambient});
const core=await createCore({directory:root,token:'fixture-token-'.repeat(4)}),ctx=await core.contextFor('fixture');let seq=0;
const context={session_id:'fixture',agent_id:'main',notification_recipient:'main',purpose:'Direct ffuf local acceptance'};
const report={time:new Date().toISOString(),checks:{},route:'direct',interface:'native named options',evidence:root};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const invoke=(name,args={})=>core.perform(ctx,name,args);
await invoke('session_register',{session_id:'fixture',main_agent:'main'});
const finish=async id=>{for(let i=0;i<300;i++){const state=await invoke('operation_result',{id});if(!['queued','running'].includes(state.state))return state;await wait(50);}throw new Error('Operation timed out in test');};
const submit=(name,args={})=>invoke(name,{...args,context:{...context,idempotency_key:String(++seq)}});
const call=async(name,args={})=>{const job=await submit(name,args),result=await finish(job.id);assert.equal(result.state,'completed',JSON.stringify(result));return result.result;};
const base={url,wordlists:[root+'/input.txt'],threads:1,rate:20,noninteractive:true};
const run=async(options,extra={})=>{const job=await submit('fuzzing_ffuf_start',{options,...extra});const completed=await finish(job.id);assert.equal(completed.state,'completed',JSON.stringify(completed));return {job,status:await invoke('operation_status',{id:job.id}),results:await call('fuzzing_ffuf_results',{id:job.id})};};
try{
 const positive=root+'/positive.toml';writeFileSync(positive,'[http]\nproxyurl="'+proxyUrl+'"\n');await exec('/usr/local/bin/ffuf',['-config',positive,'-u',url,'-w',root+'/input.txt','-noninteractive','-mc','all']);assert.ok(proxyHits>0);assert.equal(hits.length,0);proxyHits=0;report.checks.proxy_trap_positive_control=true;
 const help=await call('fuzzing_ffuf_options'),native=(await exec('/usr/local/bin/ffuf',['-h'])).stdout,flags=[...native.matchAll(/^  -([A-Za-z][A-Za-z0-9-]*)\s+/gm)].map(m=>m[1]).filter(f=>!['x','replay-proxy'].includes(f));assert.deepEqual([...ffufNativeFlags].sort(),flags.sort());report.checks.all_nonproxy_flags=true;report.option_count=Object.keys(help.parameters.properties).length;
 for(const target of [url,tlsUrl]){const {results,status}=await run({...base,url:target,config_file:configFile});assert.equal(results.items.length,1);assert.ok(status.result_file);const output=JSON.parse(readFileSync(status.result_file));assert.equal(output.config.proxyurl,'');assert.equal(output.config.replayproxyurl,'');}report.checks.http_https_direct_with_proxy_env_and_config=true;report.checks.automatic_output=true;
 const missing=await submit('fuzzing_ffuf_start',{options:{url,config_file:configFile}});assert.equal((await finish(missing.id)).state,'failed');report.checks.wordlist_never_implicit=true;
 const csv=await run({...base,headers:['X-One: first','X-Two: second'],output:root+'/custom.csv',output_format:'csv'});assert.equal(csv.results.parsed,false);assert.match(readFileSync(root+'/custom.csv','utf8'),/catalog/);assert.ok(hits.some(h=>h.headers['x-one']==='first'&&h.headers['x-two']==='second'));report.checks.headers_csv=true;
 const stdin=await submit('fuzzing_ffuf_start',{options:{...base,wordlists:['-']},stdin:true});while(!(await invoke('operation_status',{id:stdin.id})).pid)await wait(20);await call('fuzzing_ffuf_input',{id:stdin.id,data:'catalog\n',eof:true});assert.equal((await finish(stdin.id)).state,'completed');report.checks.stdin=true;
 const command=await run({url,threads:1,input_command:'printf catalog',input_count:1});assert.equal(command.results.items.length,1);report.checks.input_command=true;
 for(const extra of [{argv:['-x',proxyUrl],options:base},{options:{proxy:proxyUrl}},{options:{x:proxyUrl}},{mode:'pathname',options:base},{options:{threads:'5'}}])await assert.rejects(submit('fuzzing_ffuf_start',extra));report.checks.no_proxy_raw_argv_or_wrapper_mode=true;
 const redirect=await run({...base,url:url.replace('/FUZZ','/redirect/FUZZ'),config_file:configFile,follow_redirects:false,match_status:'all'});assert.equal(redirect.results.items[0].status,302);assert.ok(!hits.some(h=>h.path==='/followed'));report.checks.false_overrides_default=true;
 for(const name of ['first','second','after'])writeFileSync(root+'/'+name+'.req','GET /'+name+' HTTP/1.1\r\nHost: 127.0.0.1:'+servers[0].address().port+'\r\n\r\n');
 const before=hits.length;await run({...base,preflight:[{request_file:root+'/first.req',variables:['FIRST:ALPHA:(.*)']},{request_file:root+'/second.req',variables:['SECOND:BETA:(.*)']}],postflight:[{request_file:root+'/after.req',variables:['DONE:DONE:(.*)']}]});assert.deepEqual(hits.slice(before).map(h=>h.path),['/first','/second','/catalog','/after']);report.checks.ordered_flights=true;
 writeFileSync(root+'/colors.txt','blue\n');const multi=await run({...base,url:url.replace('FUZZ','PATH?color=COLOR'),wordlists:[root+'/input.txt:PATH',root+'/colors.txt:COLOR'],mode:'pitchfork',encoders:['PATH:urlencode']});assert.ok(multi.results.items[0].url.endsWith('/catalog?color=blue'));report.checks.multiple_markers=true;
 // Hold the successful process before it can write output: a competing job must
 // already see an empty reservation and fail without sending another request.
 const reserved=root+'/shared.json',reservedOptions={...base,url:url.replace('/FUZZ','/reservation/FUZZ'),output:reserved};
 const competitors=await Promise.all([submit('fuzzing_ffuf_start',{options:reservedOptions}),submit('fuzzing_ffuf_start',{options:reservedOptions})]);
 let states;
 for(let i=0;i<200;i++){
  states=await Promise.all(competitors.map(job=>invoke('operation_result',{id:job.id})));
  if(states.some(s=>s.state==='failed')&&heldResponses.length)break;
  await wait(25);
 }
 assert.deepEqual(states.map(s=>s.state).sort(),['failed','running']);assert.equal(heldResponses.length,1);
 assert.match(JSON.stringify(states.find(s=>s.state==='failed')),/Output file already exists/);
 assert.equal(readFileSync(reserved,'utf8'),'');report.checks.empty_output_reserved_before_completion=true;
 heldResponses[0].end('reserved output fixture');
 const winner=states.find(s=>s.state==='running');assert.equal((await finish(winner.id)).state,'completed');
 const saved=readFileSync(reserved,'utf8');assert.equal(JSON.parse(saved).results.length,1);
 const hitsBefore=hits.length,existing=await submit('fuzzing_ffuf_start',{options:reservedOptions});assert.equal((await finish(existing.id)).state,'failed');assert.equal(readFileSync(reserved,'utf8'),saved);assert.equal(hits.length,hitsBefore);
 const empty=root+'/preexisting-empty.json';writeFileSync(empty,'');const emptyJob=await submit('fuzzing_ffuf_start',{options:{...base,output:empty}});assert.equal((await finish(emptyJob.id)).state,'failed');assert.equal(readFileSync(empty,'utf8'),'');assert.equal(hits.length,hitsBefore);
 report.checks.concurrent_same_output_one_winner=true;report.checks.existing_empty_and_populated_outputs_untouched=true;report.checks.ffuf_fills_reserved_file=true;
 const separate=await Promise.all([run(base),run(base)]);assert.notEqual(separate[0].status.result_file,separate[1].status.result_file);report.checks.independent_output_jobs_both_complete=true;
 const long=await submit('fuzzing_ffuf_start',{options:{...base,wordlists:[root+'/long.txt'],rate:1}});while(!(await invoke('operation_status',{id:long.id})).pid)await wait(20);
 await fetch(core.base+'/api/proxy/drain',{method:'POST',headers:{Authorization:'Bearer '+'fixture-token-'.repeat(4),'content-type':'application/json'},body:'{}'});assert.equal((await invoke('operation_status',{id:long.id})).state,'running');await invoke('fuzzing_ffuf_cancel',{id:long.id});assert.equal((await finish(long.id)).state,'cancelled');report.checks.proxy_drain_does_not_cancel_direct_job=true;
 assert.equal(proxyHits,0);report.checks.zero_wrapped_proxy_requests=true;report.requests=hits.length;report.pass=true;writeFileSync(root+'/acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await core.close();for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);for(const s of [...servers,trap]){s.closeAllConnections();await new Promise(r=>s.close(r));}}
