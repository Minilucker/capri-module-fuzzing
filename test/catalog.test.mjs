import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fixture} from './fixture.mjs';
import {run as catalog} from '../workers/wordlist_catalog.mjs';
import {runInputs} from '../src/catalog.mjs';
import {shellCommand} from '../dashboard/runs.mjs';

test('catalog keeps origins, revisions, missing inputs and workspace boundaries; all entries are paginated',async t=>{
 const f=await fixture(t),root=f.api.workspace.directory;
 for(const directory of ['words','child','shared-internal','shared-external'])mkdirSync(path.join(root,directory));
 writeFileSync(path.join(root,'child','workspace.json'),'{}');writeFileSync(path.join(root,'child','private.txt'),'secret');
 for(let n=0;n<63;n++)writeFileSync(path.join(root,'words',n+'.txt'),'example');
 const internal=path.join(root,'shared-internal','builtin.txt'),external=path.join(root,'shared-external','external.txt');writeFileSync(internal,'one');writeFileSync(external,'two');
 await f.call('fuzzing_add_observed',{entries:[{word:'admin',capture_ids:['capture-one'],origin:'application_response'}]});const first=await f.call('fuzzing_generate',{name:'paths'}),second=await f.call('fuzzing_generate',{name:'paths'});
 const missing=path.join(root,'gone.txt'),result=await catalog({root,generated:[first,second],inputs:[{path:missing,run_id:'old'},{path:path.resolve(root,first.path),run_id:'one'}],libraries:[{path:path.dirname(internal),kind:'internal'},{path:path.dirname(external),kind:'external'}]});
 assert.equal(result.items.some(x=>x.path.includes('private.txt')),false);assert.equal(result.items.filter(x=>x.source==='generated').length,2);
 assert.equal(result.items.find(x=>x.path===missing).available,false);assert.equal(result.items.find(x=>x.path===internal).source,'internal');assert.equal(result.items.find(x=>x.path===external).source,'external');
 const receipt=await f.rawCall('fuzzing_catalog');let page;for(let n=0;n<500;n++){page=await f.rawCall('fuzzing_catalog_result',{catalog_id:receipt.catalog_id,limit:20});if(page.ready)break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(page.ready,true);const entries=[...page.items];while(page.next_offset!==null){page=await f.rawCall('fuzzing_catalog_result',{catalog_id:receipt.catalog_id,offset:page.next_offset,limit:20});entries.push(...page.items);}
 assert.ok(entries.length>63);assert.equal(new Set(entries.map(x=>x.path)).size,entries.length);
 const filtered=await f.rawCall('fuzzing_catalog_result',{catalog_id:receipt.catalog_id,source:'generated',query:'paths'});assert.equal(filtered.total,2);
 assert.equal(f.processCalls.length,0);
});

test('run inputs resolve each marker from the recorded cwd and link the exact generated revision',async t=>{
 const f=await fixture(t),root=f.api.workspace.directory;
 await f.call('fuzzing_add_observed',{entries:[{word:'admin',capture_ids:['capture-one'],origin:'application_response'}]});const revision=await f.call('fuzzing_generate',{name:'paths'});
 const run=f.results([]),record=f.runs.get(run.id);record.effective={executable:'/usr/bin/ffuf',argv:['-u','http://fixture/FUZZ','-w',revision.path],cwd:root};record.effective_options={wordlists:[revision.path+':PATHS','other list.txt:OTHER','-']};
 const info=await f.rawCall('fuzzing_run_inputs',{id:run.id});assert.equal(info.inputs[0].revision,1);assert.equal(info.inputs[0].source,'generated');assert.equal(info.inputs[0].keyword,'PATHS');assert.equal(info.inputs[1].path,path.join(root,'other list.txt'));assert.equal(info.inputs[2].source,'stdin');
 assert.ok(shellCommand({...info.command,argv:["a'b",'two words']}).includes("'a'\\''b'"));
 assert.equal(runInputs({effective:{cwd:root},effective_options:{wordlists:['plain.txt']}},root)[0].keyword,'FUZZ');
 assert.equal(f.processCalls.length,0);
});
