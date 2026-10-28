import {frameworkImport,frameworkRoot} from './framework.mjs';
const {metadata}=await frameworkImport("test/native-fixture.mjs");
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync,mkdirSync,rmSync,readFileSync,unlinkSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsRequestSchema,CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const { createCore }=await frameworkImport("test/apply-helper.mjs");
const { atomic}=await frameworkImport("src/modules.mjs");
const { provisionWorkspace,finishApply }=await frameworkImport("test/apply-helper.mjs");
const { defaults,saveConfig }=await frameworkImport("src/proxy-config.mjs");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function providerFixture(provider){return ()=>{
 const [client,transport]=InMemoryTransport.createLinkedPair(),server=new Server({name:'fixture',version:'1'},{capabilities:{tools:{}}});
 const names=provider==='caido'?['caido_list_projects','caido_list_requests','caido_get_request']:['get_proxy_http_history'];
 server.setRequestHandler(ListToolsRequestSchema,()=>({tools:names.map(name=>({name,description:'Fixture',inputSchema:{type:'object'}}))}));
 server.setRequestHandler(CallToolRequestSchema,request=>{
  const {name,arguments:a}=request.params;let value;
  const text='inventory café warehouse '.repeat(400),bytes=Buffer.from(text);
  if(name==='caido_list_projects')value={projects:[{id:'fixture',isCurrent:true}]};
  else if(name==='caido_list_requests')value={requests:a.after?[]:[{id:'one',url:'http://target.test/catalog',method:'GET',statusCode:200}],hasMore:!a.after,nextCursor:'next'};
  else if(name==='caido_get_request')value={id:'one',response:{body:bytes.subarray(a.bodyOffset||0,(a.bodyOffset||0)+a.bodyLimit).toString('utf8'),bodySize:bytes.length,headers:[]}};
  else value=a.offset?[]:[{request:'GET /catalog HTTP/1.1\r\nHost: target.test\r\n\r\n',response:'HTTP/1.1 200 OK\r\n\r\n'+text}];
  return {content:[{type:'text',text:JSON.stringify(value)}]};
 });void server.connect(transport);return client;
};}
for(const provider of ['caido','burp'])test(provider+': async proxy evidence, isolated storage, exports and core recipient inbox',async t=>{
 const root=mkdtempSync(path.join(tmpdir(),'pt-runtime-')),dir=path.join(root,'project');mkdirSync(dir);atomic(path.join(dir,'workspace.json'),{schemaVersion:1,id:'project',root:true,modules:{fuzzing:{enabled:true}}});await provisionWorkspace(root,dir);
 const configDir=path.join(root,'proxy'),config={...defaults(),provider,state:'running'};saveConfig(configDir,config);
 let core=await createCore({directory:root,token:'x'.repeat(40),proxyConfigDir:configDir,proxyTransportFactory:providerFixture(provider)});
 t.after(async()=>{await core.close();rmSync(root,{recursive:true,force:true});});
 const invoke=async(name,args={})=>core.perform(await core.contextFor('project'),name,args,{metadata:metadata('project','words')});

 const context={notification_recipient:'project-words',purpose:'local contract test',idempotency_key:''};let count=0;
 const call=async(name,args={})=>{const job=await invoke(name,{...args,context:{...context,idempotency_key:String(++count)}});const start=Date.now();while(['queued','running'].includes(core.jobs.get('project',job.id).state)){if(Date.now()-start>10000)throw new Error('Timed out waiting for '+name);await pause(10);}const result=await invoke('operation_result',{id:job.id});assert.equal(result.state,'completed',JSON.stringify(result));return result.result;};
 const binding=await fetch(core.base+'/api/proxy/bind',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(40),'content-type':'application/json'},body:JSON.stringify({engagement:'project',project:'fixture',revision:config.revision})});assert.equal(binding.status,200);
 const first=await call('proxy_traffic_read',{revision:config.revision,limit:1});assert.ok(first.items[0].response.returned_bytes>8192);assert.equal(first.items[0].response.complete,true);
 const saved=first.items[0],partial=await call('proxy_traffic_read',{revision:config.revision,limit:1,body_offset:2,body_limit_bytes:17});assert.notEqual(saved.capture_id,partial.items[0].capture_id);assert.equal(partial.items[0].response.complete,false);
 assert.deepEqual((await call('proxy_traffic_read',{revision:config.revision,capture_ids:[saved.capture_id]})).items[0],saved);
 const observed=await call('fuzzing_add_observed',{entries:[{word:'inventory',capture_ids:[saved.capture_id],origin:'application_response'}]});
 await call('fuzzing_add_candidates',{words:['inventories','last term '],source_batches:[observed.batch_id],explanation:'Agent-supplied inference'});
 const exported=await call('fuzzing_generate',{name:'paths'});assert.equal(exported.count,3);assert.match(exported.path,/\.capri\/modules\/fuzzing.v1\/wordlists/);
 assert.equal(readFileSync(path.join(dir,exported.path),'utf8'),'inventories\ninventory\nlast term \n');
 assert.deepEqual((await call('fuzzing_read_file',{path:exported.path,offset:1,limit:1})).lines,['inventory']);
 // Failure after file publication but before database completion keeps the
 // reserved revision and is explicitly recoverable without overwriting edits.
 const sidecar=path.join(dir,'.capri/modules/fuzzing.v1/wordlists/recovery/r000001.json');atomic(sidecar,'operator data');
 const failed=await invoke('fuzzing_generate',{name:'recovery',context:{...context,idempotency_key:'recovery'}});
 while(['queued','running'].includes(core.jobs.get('project',failed.id).state))await pause(10);
 assert.equal(core.jobs.get('project',failed.id).state,'failed');assert.equal(readFileSync(sidecar,'utf8'),'operator data');
 unlinkSync(sidecar);await invoke('operation_retry',{id:failed.id});while(['queued','running'].includes(core.jobs.get('project',failed.id).state))await pause(10);
 assert.equal(core.jobs.get('project',failed.id).state,'completed');assert.equal(core.jobs.result('project',failed.id).result.revision,1);
 await core.storage.dispatch();
 const own=await invoke('inbox_list',{});assert.ok(own.items.some(n=>n.type==='fuzzing.wordlist.created'));assert.ok(own.items.every(n=>n.primary_recipient==='project-words'||n.primary_role===0));
 const notification=own.items.find(n=>n.type==='fuzzing.wordlist.created');assert.deepEqual(notification.secondary_recipients,['project-main']);
 await invoke('inbox_ack',{id:notification.id});assert.ok((await core.perform(await core.contextFor('project'),'inbox_list',{})).items.some(n=>n.id===notification.id));
 assert.equal(core.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='word_terms'").get().n,0);
 // Desired edits do not change a cached or freshly restarted runtime.
 atomic(path.join(dir,'workspace.json'),{schemaVersion:1,id:'project',root:true,modules:{}});assert.deepEqual(await invoke('workspace_status'),{modules:['fuzzing']});
 await core.close();core=await createCore({directory:root,token:'x'.repeat(40),proxyConfigDir:configDir,proxyTransportFactory:providerFixture(provider)});
 assert.deepEqual(await invoke('workspace_status'),{modules:['fuzzing']});assert.equal((await call('fuzzing_list')).items.length,2);
 await provisionWorkspace(root,dir);assert.deepEqual(await invoke('workspace_status'),{modules:[]});assert.ok(!(await core.contextFor('project')).handlers.has('fuzzing_read_file'));assert.ok(!(await core.contextFor('project')).handlers.has('proxy_traffic_read'));
});
