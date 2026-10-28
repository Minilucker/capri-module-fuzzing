import {frameworkImport,frameworkRoot} from './framework.mjs';
// Real provider MCP and local HTTP fixture. No third-party target traffic.
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const { acceptanceClient }=await frameworkImport("test/acceptance-client.mjs");
const inContainer=existsSync('/run/secrets/core-token'),root=frameworkRoot,settings=inContainer?null:JSON.parse(readFileSync(path.join(root,'.capri/settings.json')));
const token=readFileSync(inContainer?'/run/secrets/core-token':path.join(root,'.capri/core-token'),'utf8').trim(),workspace=process.env.PT_TEST_WORKSPACE||'fuzzing-acceptance',api='http://127.0.0.1:'+(inContainer?8472:settings.apiPort),marker='wordlist-'+randomUUID(),fixtureHost=inContainer?'core':'127.0.0.1';
const client=await acceptanceClient({api,token,workspace}),state=await client.call('proxy_status');assert.equal(state.binding?.engagement,workspace);let hits=0;
const server=http.createServer((req,res)=>{hits++;res.writeHead(200,{'content-type':'text/plain'});res.end('inventory warehouse catalog '+marker);});await new Promise(r=>server.listen(0,'0.0.0.0',r));
const report={time:new Date().toISOString(),provider:state.provider,workspace,checks:{},synthetic_only:true};
try{
 const url='http://'+fixtureHost+':'+server.address().port+'/'+marker+'/catalog';
 await promisify(execFile)(process.platform==='win32'?'curl.exe':'curl',['--silent','--show-error','--max-time','10','--noproxy','','-x',inContainer?state.endpoints.proxy:'http://127.0.0.1:8080',url]);
 const audited=await client.call('http_request',{url,revision:state.revision});assert.equal(audited.status,200);assert.ok(audited.artifacts.every(ref=>ref.workspace===workspace&&ref.path.startsWith('.capri/core/')));report.checks.core_http_proxy_and_portable_evidence=true;const before=hits;
 let cursor,source;for(let page=0;page<100;page++){const result=await client.call('proxy_traffic_read',{revision:state.revision,filter:{hosts:[fixtureHost],path_prefix:'/'+marker+'/'},limit:20,...(cursor?{cursor}:{})});source=result.items[0];if(source)break;cursor=result.next_cursor;if(!cursor)break;}
 assert.ok(source,'Provider history did not expose the local fixture');assert.match(source.response.body,/inventory/);assert.equal(hits,before);report.checks.provider_native_passive_history=true;report.checks.immutable_capture=!!source.capture_id;
 const observed=await client.call('fuzzing_add_observed',{entries:[{word:'catalog',origin:'application_response',capture_ids:[source.capture_id],excerpt:'Local fixture route'},{word:'warehouse',origin:'application_response',capture_ids:[source.capture_id],excerpt:'Fixture vocabulary'}]});
 const inferred=await client.call('fuzzing_add_candidates',{words:['warehouses'],source_batches:[observed.batch_id],explanation:'Synthetic test supplies an agent candidate; inference itself is not performed by MCP.'});
 const exported=await client.call('fuzzing_generate',{name:marker,batch_ids:[observed.batch_id,inferred.batch_id]});assert.equal((await client.call('fuzzing_read',{name:marker,revision:exported.revision})).lines.length,3);
 const generatedPath='/workspaces/development/fuzzing-acceptance/'+exported.path;
 const job=await client.submit('fuzzing_ffuf_start',{options:{url:'http://'+(inContainer?'core':'host.docker.internal')+':'+server.address().port+'/'+marker+'/FUZZ',wordlists:[generatedPath],threads:1,rate:5,match_status:'200'}});await client.wait(job.id);assert.equal((await client.call('fuzzing_ffuf_results',{id:job.id})).items.length,3);report.checks.direct_ffuf=true;
 await new Promise(r=>setTimeout(r,150));const inbox=await client.call('inbox_list',{session_id:client.context.session_id,agent_id:'main'});assert.ok(inbox.items.some(i=>i.type==='fuzzing.wordlist.created'));report.checks.core_change_notification=true;
 report.pass=true;report.requests=hits;const output=path.join(inContainer?'/workspaces':settings.workspace,'development/.capri/core/acceptance');mkdirSync(output,{recursive:true});writeFileSync(path.join(output,'live-fuzzing-'+state.provider+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
