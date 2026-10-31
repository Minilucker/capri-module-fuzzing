import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {writeFileSync,readFileSync} from 'node:fs';import {fixture} from './fixture.mjs';
test('large independent wordlist reads and result views overlap without a family-wide queue',async t=>{
 const f=await fixture(t),inputs=Array.from({length:3},(_,i)=>path.join(f.workspace.directory,'large-'+i+'.txt'));
 for(const file of inputs)writeFileSync(file,('large-word-'+file.length+'\n').repeat(500000));
 const reads=await Promise.all(inputs.map(file=>f.rawCall('fuzzing_read_file',{path:file,offset:499998,limit:2})));
 assert.equal((await f.call('fuzzing_wordlist_tasks',{kind:'read'})).items.length,3);
 const result=await Promise.all(reads.map(f.settled));assert.deepEqual(result.map(r=>r.total),[500000,500000,500000]);
 const rows=Array.from({length:50000},(_,i)=>({url:'http://fixture/'+i,status:i%2?200:404,input:{FUZZ:String(i)},length:i}));
 const runs=Array.from({length:3},()=>f.results(rows));
 const views=await Promise.all(runs.map(r=>f.rawCall('fuzz_result',{id:r.id,view:'summary',filters:{status:[200]}})));
 const summaries=await Promise.all(views.map(f.settled));assert.deepEqual(summaries.map(r=>r.matched_total),[25000,25000,25000]);
 assert.equal(f.processCalls.length,0);assert.equal(readFileSync(inputs[0],'utf8').split('\n').length,500001);
});
