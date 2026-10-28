import {frameworkImport,frameworkRoot} from './framework.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
const {atomic,json,resolveWorkspace,provisionWorkspaces}=await frameworkImport("src/modules.mjs");
const {createCore,provisionWorkspace}=await frameworkImport("test/apply-helper.mjs");
const {cleanupModuleStore}=await frameworkImport("src/module-maintenance.mjs");
const {runWorker}=await frameworkImport("src/worker.mjs");
const {validateModule}=await frameworkImport("src/package-validation.mjs");

async function fixture(t,modules={}){
 const root=fs.mkdtempSync(path.join(tmpdir(),'capri-fuzzing-')),directory=path.join(root,'project');
 atomic(path.join(directory,'workspace.json'),{schemaVersion:1,id:'project',root:true,modules});
 const core=await createCore({directory:root,token:'x'.repeat(40)});
 t.after(async()=>{await core.close();fs.rmSync(root,{recursive:true,force:true});});await provisionWorkspace(root,directory);
 const invoke=async(name,args={})=>core.perform(await core.contextFor('project'),name,args);
 let n=0;
 const call=async(name,args={})=>{const job=await invoke(name,{...args,context:{notification_recipient:'main',purpose:'Local module boundary test',idempotency_key:String(++n)}});while(['queued','running'].includes(core.jobs.get('project',job.id).state))await new Promise(r=>setTimeout(r,5));const r=core.jobs.result('project',job.id);assert.equal(r.state,'completed',r.error);return r.result;};
 return {root,directory,core,invoke,call};
}

test('fuzzing owns all wordlist tools, workers and indexes; disabled children and core-only workspaces expose none',async t=>{
 const f=await fixture(t),names=()=>f.core.contextFor('project').then(c=>[...c.handlers.keys()]);
 assert.ok(!(await names()).some(n=>/wordlist|fuzzing|ffuf/.test(n)));
 const file=path.join(f.directory,'workspace.json');atomic(file,{...json(file),modules:{fuzzing:{enabled:true}}});await provisionWorkspace(f.root,f.directory);
 assert.ok((await names()).includes('fuzzing_read_file'));assert.ok(!(await names()).some(n=>n.startsWith('wordlister_')||n==='wordlist_read'));
 const manifest=resolveWorkspace(f.root,f.directory).modules[0];assert.equal(manifest.id,'fuzzing');assert.ok(manifest.workers.wordlist_export);
 f.core.db.prepare('INSERT INTO captures VALUES(?,?,?,?)').run('project','fixture','fixture','{}');
 const observed=await f.call('fuzzing_add_observed',{entries:[{word:'alpha',capture_ids:['fixture'],origin:'application_response'}]});
 const batch=await f.call('fuzzing_add_candidates',{words:['beta','alpha','beta'],source_batches:[observed.batch_id],explanation:'Synthetic agent candidates'});
 const exported=await f.call('fuzzing_generate',{name:'words',batch_ids:[batch.batch_id]});assert.equal(exported.count,2);
 assert.deepEqual((await f.call('fuzzing_read_file',{path:exported.path})).lines,['alpha','beta']);
 assert.deepEqual((await f.call('fuzzing_read',{name:'words',revision:1})).lines,['alpha','beta']);
 assert.equal((await f.call('fuzzing_list')).items.length,1);
 assert.ok(fs.existsSync(path.join(f.directory,'.capri/modules/fuzzing.v1/cache/index.sqlite')));
 assert.ok(!fs.existsSync(path.join(f.directory,'.capri/core/cache/index.sqlite')));
 assert.ok(fs.existsSync(path.join(f.directory,'.codex/agents/fuzzing.toml')));
 const child=path.join(f.directory,'child');atomic(path.join(child,'workspace.json'),{schemaVersion:1,id:'child',modules:{fuzzing:{enabled:false}}});await provisionWorkspace(f.root,child);
 assert.ok(![...(await f.core.contextFor('child')).handlers.keys()].some(n=>/wordlist|fuzzing|ffuf/.test(n)));
 assert.ok((await names()).includes('fuzzing_generate'));
 atomic(file,{...json(file),modules:{fuzzing:{enabled:false}}});const staged=provisionWorkspaces(f.root,[f.directory,child]);await f.core.apply(staged[0].request_id);
 assert.ok(!(await names()).some(n=>/wordlist|fuzzing|ffuf/.test(n)));assert.ok(!fs.existsSync(path.join(f.directory,'.codex/agents/fuzzing.toml')));
 assert.equal(fs.readFileSync(path.join(f.directory,exported.path),'utf8'),'alpha\nbeta\n');
});

test('offline upgrade delegates export cleanup to its owning module and preserves completed artifacts',async t=>{
 const f=await fixture(t,{fuzzing:{enabled:true}}),store=f.core.storage.opened.get('project:fuzzing.v1');
 const pending=path.join(store.directory,'wordlists/pending/r000001.txt'),completed=path.join(store.directory,'wordlists/kept/r000001.txt');
 for(const file of [pending,pending.replace('.txt','.json'),pending+'.pending.part',completed])atomic(file,'fixture');
 for(const [id,file,state]of [['pending',pending,'reserved'],['complete',completed,'completed']])store.db.prepare('INSERT INTO export_operations VALUES(?,?,?,?,?,?)').run(id,id,1,'{}',JSON.stringify({path:path.relative(f.directory,file).split(path.sep).join('/')}),state);
 const saved=JSON.parse(f.core.db.prepare('SELECT data FROM module_stores WHERE identity=?').get(store.identity).data);
 assert.match(saved.upgradeCleanup.path,/__upgrade-cleanup\.mjs$/);
 assert.equal((await cleanupModuleStore({root:f.root,store:saved,db:store.db})).removed_reservations,1);
 assert.ok(!fs.existsSync(pending));assert.ok(!fs.existsSync(pending+'.pending.part'));assert.ok(fs.existsSync(completed));assert.equal(store.db.prepare('SELECT COUNT(*) n FROM export_operations').get().n,1);
 assert.deepEqual(await cleanupModuleStore({root:f.root,store:{},db:store.db}),{state:'not_declared'});
 await assert.rejects(cleanupModuleStore({root:f.root,store:{...saved,upgradeCleanup:{...saved.upgradeCleanup,sha256:'wrong'}},db:store.db}),/integrity failure/);
});
