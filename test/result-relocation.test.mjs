import {frameworkImport,frameworkRoot} from './framework.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
const {atomic}=await frameworkImport("src/modules.mjs");
const {bundleModuleSource}=await frameworkImport("src/package-snapshot.mjs");
const {runWorker}=await frameworkImport("src/worker.mjs");
const ffufBundle=bundleModuleSource(fileURLToPath(new URL('../',import.meta.url)),'ffuf.mjs');
const {setupFfuf}=await import('data:text/javascript;base64,'+ffufBundle.toString('base64'));
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'capri-ffuf-result-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return {root};}
test('ffuf result reads follow a moved workspace reference even when the old absolute path is absent',async t=>{
 const f=fixture(t),old=path.join(f.root,'old'),restored=path.join(f.root,'restored'),relative='.capri/modules/fuzzing.v1/ffuf/test/results.json';
 atomic(path.join(old,relative),{results:[{url:'http://fixture.invalid/example',status:200}]});renameSync(old,restored);
 const handlers=new Map(),job={workspace:'project',module:'fuzzing',tool:'fuzzing_ffuf_start',state:'completed',result_file:path.join(old,relative),result_reference:{workspace:'project',path:relative}};
 const entry=path.join(f.root,'module-result-worker.mjs');atomic(entry,bundleModuleSource(fileURLToPath(new URL('../',import.meta.url)),'workers/ffuf_results.mjs'));
 setupFfuf({workspace:{id:'project',directory:restored},config:{},directory:path.join(restored,'.capri/modules/fuzzing.v1'),jobs:{get:()=>job},register:(definition,handler)=>handlers.set(definition.name,handler),worker:(name,data,signal)=>{assert.equal(name,'ffuf_results');return runWorker('module',{entry,data},signal);}});
 const result=await handlers.get('fuzzing_ffuf_results')({id:'fixture-job'},{signal:new AbortController().signal});assert.equal(result.parsed,true);assert.equal(result.items[0].status,200);
 const external=path.join(f.root,'explicit-external.json');atomic(external,{results:[{status:201}]});job.result_reference={workspace:'project',path:external,external:true,portable:false};
 assert.equal((await handlers.get('fuzzing_ffuf_results')({id:'fixture-job'},{signal:new AbortController().signal})).items[0].status,201);
 job.result_reference.workspace='different';await assert.rejects(handlers.get('fuzzing_ffuf_results')({id:'fixture-job'},{}),/different workspace/);
});
