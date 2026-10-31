// Explicit installed operator acceptance; no fabricated native caller metadata.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const [framework,host,action='seed']=process.argv.slice(2);if(!framework||!host)throw Error('Usage: live-provider.mjs FRAMEWORK HOST_IP [seed|history]');
if(!['seed','history'].includes(action))throw Error('Supported actions: seed, history. Create/select Caido projects in its UI, then use the operator proxy-bind command.');
const local=path.join(framework,'.capri'),settings=JSON.parse(fs.readFileSync(path.join(local,'settings.json'))),token=fs.readFileSync(path.join(local,'core-token'),'utf8').trim();
const directory=path.join(settings.workspace,'development/.capri/core/acceptance/fuzzing-live-20261031');fs.mkdirSync(directory,{recursive:true});
const api='http://127.0.0.1:'+settings.apiPort,base='http://'+host+':18993/capri-fuzzing-live-20261031/';
async function request(route,body){const r=await fetch(api+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok||v.error)throw Error(JSON.stringify(v));return v;}
async function tool(name,args={}){const r=await request('/api/manage/v1/tools/workspaces/development',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});if(r.result.isError)throw Error(r.result.content[0].text);return r.result.structuredContent??JSON.parse(r.result.content[0].text);}
const context={purpose:'Synthetic local fuzzing SDK live acceptance '+action};
async function settled(name,args,family){const accepted=await tool(name,{...args,context}),deadline=Date.now()+60000;for(;;){const v=await tool(family==='proxy'?'proxy_call_result':'http_result',{id:accepted.id});if(v.state===(family==='proxy'?'rpc_returned':'received'))return v.result; if(['rpc_failed','rpc_cancelled','failed','cancelled','interrupted','rpc_interrupted'].includes(v.state))throw Error(JSON.stringify(v));assert.ok(Date.now()<deadline,'Live operation still pending: '+accepted.id);await new Promise(r=>setTimeout(r,100));}}
let status=await tool('proxy_status');assert.equal(status.state,'running');
const original=path.join(directory,'original-proxy-'+process.platform+'.json');if(!fs.existsSync(original))fs.writeFileSync(original,JSON.stringify({config:JSON.parse(fs.readFileSync(path.join(local,'proxy/runtime.json'))),status},null,2));
if(action==='seed'){
 if(status.binding?.engagement!=='development'){assert.ok(status.binding?.project,'Bind the active provider to a project first');await request('/api/proxy/bind',{engagement:'development',project:status.binding.project,revision:status.revision});status=await tool('proxy_status');}
 const response=await settled('http_request',{url:base+'seed/'+status.provider,route:'proxy',revision:status.revision,headers:{'X-Capri-Probe':'fuzzing-live-'+status.provider}},'http');assert.equal(response.status,200);
}
const filter={hosts:[host+':18993'],path_prefix:'/capri-fuzzing-live-20261031/'};
let cursor,items=[],pages=0;do{const r=await settled('proxy_traffic_read',{revision:status.revision,filter,limit:20,include:['request_metadata','response_headers','response_body'],...(cursor?{cursor}:{})},'proxy');items.push(...r.items);cursor=r.next_cursor;assert.ok(++pages<100,'History observation exceeds local acceptance budget');if(action==='seed'&&items.some(row=>JSON.stringify(row).includes('Saffron')))break;}while(cursor);
const file=path.join(directory,'operator-'+status.provider+'-'+action+'-'+process.platform+'-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),base,provider:status.provider,binding:status.binding,pages,items},null,2),{flag:'wx'});
if(action==='seed'){assert.ok(items.some(row=>JSON.stringify(row).includes('Saffron')),'Seed not found in live provider capture');}
console.log(JSON.stringify({provider:status.provider,base,pages,captures:items.length,evidence:file,items:items.map(r=>({id:r.id,url:r.request?.url??r.url}))},null,2));
