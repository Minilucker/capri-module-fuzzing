// Explicit module integration against an installed Capri image, real ffuf, and
// a disposable loopback fixture. Never imported by framework unit tests.
import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {mkdtempSync,cpSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';import {pathToFileURL} from 'node:url';
const framework=process.env.CAPRI_FRAMEWORK,source=process.env.FUZZING_MODULE;if(!framework||!source)throw Error('Set CAPRI_FRAMEWORK and FUZZING_MODULE');
const from=name=>import(pathToFileURL(path.join(framework,name)).href),{createCore}=await from('src/core.mjs'),{atomic,provisionWorkspace}=await from('src/modules.mjs');
const root=mkdtempSync(path.join(os.tmpdir(),'capri-fuzzing-sdk-')),directory=path.join(root,'project'),bare=path.join(root,'bare'),module=path.join(root,'modules/fuzzing'),requests=[];let core,server;
try{
 cpSync(source,module,{recursive:true,filter:file=>!['.git','.capri','node_modules'].includes(path.basename(file))&&!path.basename(file).endsWith('.log')});
 atomic(path.join(root,'workspace.json'),{schemaVersion:1,root:true,id:'shared',modules:{fuzzing:{enabled:false}}});
 atomic(path.join(directory,'workspace.json'),{schemaVersion:1,id:'fuzzing-sdk-check',modules:{fuzzing:{enabled:true}}});atomic(path.join(bare,'workspace.json'),{schemaVersion:1,id:'bare',modules:{}});
 core=await createCore({directory:root,token:'synthetic-fuzzing-sdk-installed-token',nativeProvider:async()=>({available:false,reason:'Operator-owned installed module acceptance'})});
 for(const d of [directory,bare]){const staged=provisionWorkspace(root,d);await core.apply(staged.request_id);}
 const ctx=await core.contextFor('fuzzing-sdk-check'),empty=await core.contextFor('bare'),operator={operator:'module-acceptance'};
 const call=(name,args={})=>core.perform(ctx,name,{...args,...(ctx.operatorDefinitions.find(t=>t.name===name)?.inputSchema.properties.context?{context:{purpose:'Module-owned loopback acceptance'}}:{})},operator);
 assert.ok(ctx.operatorDefinitions.some(t=>t.name==='fuzzing_batches'));assert.ok(!empty.operatorDefinitions.some(t=>t.name==='fuzzing_settings'));
 const component=(await core.components.call('catalog',{scope:'workspace',workspace_id:ctx.id})).components[0];assert.equal(component.title,'Fuzzing');assert.equal((await core.components.call('catalog',{scope:'workspace',workspace_id:'bare'})).components.length,0);
 assert.ok(existsSync(path.join(directory,'.codex/agents/fuzzing.toml')));assert.ok(existsSync(path.join(directory,'.agents/skills/fuzzing/SKILL.md')));
 server=http.createServer((req,res)=>{requests.push({url:req.url,proxy:req.headers['proxy-authorization']});res.statusCode=req.url==='/admin'?200:404;res.end(req.url==='/admin'?'fixture admin':'missing');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const words=path.join(directory,'fixture-input.txt');writeFileSync(words,'admin\nmissing\n');
 const preview=await call('fuzzing_read_file',{path:words});async function settle(tool,key,id){for(let i=0;i<600;i++){const r=await call(tool,{[key]:id});if(r.ready||r.state==='exited')return r;if(['failed','cancelled','interrupted'].includes(r.state||r.view_state))throw Error(r.error||JSON.stringify(r));await new Promise(r=>setTimeout(r,50));}throw Error('Acceptance receipt did not finish');}
 assert.deepEqual((await settle('fuzzing_read_result','read_id',preview.read_id)).lines,['admin','missing']);
 const url='http://127.0.0.1:'+server.address().port+'/FUZZ',options={url,wordlists:[words],match_status:'all',threads:2};
 const started=await Promise.all([call('fuzz_run',{options}),call('fuzz_run',{options})]);assert.notEqual(started[0].id,started[1].id);const ended=await Promise.all(started.map(r=>settle('fuzz_status','id',r.id)));assert.ok(ended.every(r=>r.state==='exited'));
 const views=await Promise.all(started.map(r=>call('fuzz_result',{id:r.id,view:'summary',filters:{status:[200]}})));const summaries=await Promise.all(views.map(v=>settle('fuzz_result','view_id',v.view_id)));assert.ok(summaries.every(r=>r.summary.status_counts[200]===1));
 assert.ok(requests.some(r=>r.url==='/admin'));assert.ok(requests.every(r=>!r.proxy));
 const {compileDashboardComponents}=await from('src/dashboard/component-build.mjs');const built=await compileDashboardComponents({indexRoot:root,index:{version:1,components:[{...component,directory:component.package_path}]}});assert.equal(built.manifest.components[0].state,'ready',built.manifest.components[0].error);
 console.log(JSON.stringify({pass:true,platform:process.platform,module:JSON.parse(readFileSync(path.join(module,'module.json'))).version,checks:['SDK runtime snapshot loading','enabled and disabled workspace separation','native agent and shared skill assets','explicit file preview','two concurrent real direct ffuf runs','filtered summaries through selected provider','component catalogue and production bundle'],run_ids:started.map(r=>r.id),requests:requests.length},null,2));
}finally{await core?.close();if(server)await new Promise(r=>server.close(r));if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('capri-fuzzing-sdk-'))throw Error('Unexpected fixture path');rmSync(root,{recursive:true,force:true});}
