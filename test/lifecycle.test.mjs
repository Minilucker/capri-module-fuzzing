import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';

async function wait(read,predicate){for(let n=0;n<300;n++){const value=read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Wordlist lifecycle timeout');}

test('wordlist export and reads expose their own receipts, preserve initiator and poll without another task',async t=>{
  const f=await fixture(t),call=f.operation();
  await f.call('fuzzing_add_observed',{entries:[{word:'one',capture_ids:['capture-one'],origin:'application_response'}]},call);
  const receipt=f.rawCall('fuzzing_generate',{name:'paths'},call);
  assert.equal(receipt.state,'preparing');assert.ok(receipt.export_id);assert.equal(receipt.family_reference.owner,'fuzzing');
  const exported=await wait(()=>f.rawCall('fuzzing_export_result',{export_id:receipt.export_id}),r=>r.ready);
  assert.equal(exported.revision,1);assert.equal(exported.count,1);
  const task=f.rawCall('fuzzing_export_status',{export_id:receipt.export_id});assert.equal(task.actor.callerThreadId,'fixture-child');
  const reading=f.rawCall('fuzzing_read',{name:'paths',revision:1});assert.equal(reading.state,'preparing');assert.ok(reading.read_id);
  const lines=await wait(()=>f.rawCall('fuzzing_read_result',{read_id:reading.read_id}),r=>r.ready);assert.deepEqual(lines.lines,['one']);
  for(let i=0;i<3;i++)assert.equal(f.rawCall('fuzzing_read_result',{read_id:reading.read_id}).read_id,reading.read_id);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM wordlist_tasks').get().n,2);
  assert.equal(f.db.prepare("SELECT 1 FROM sqlite_master WHERE name='operations'").get(),undefined);
});

test('separate mutations in one invocation do not collide without idempotency keys',async t=>{
  const f=await fixture(t),call=f.operation('same-invocation');
  const input={entries:[{word:'one',capture_ids:['capture-one'],origin:'application_response'}]};
  const first=await f.call('fuzzing_add_observed',input,call),second=await f.call('fuzzing_add_observed',input,call);
  assert.notEqual(first.batch_id,second.batch_id);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM word_batches').get().n,2);
});

test('cancelling an accepted export before execution preserves existing completed wordlists',async t=>{
  const f=await fixture(t);await f.call('fuzzing_add_observed',{entries:[{word:'one',capture_ids:['capture-one'],origin:'application_response'}]});await f.call('fuzzing_generate',{name:'kept'});
  const receipt=f.rawCall('fuzzing_generate',{name:'cancelled'});assert.equal(f.rawCall('fuzzing_export_cancel',{export_id:receipt.export_id}).state,'cancelling');
  const cancelled=await wait(()=>f.rawCall('fuzzing_export_result',{export_id:receipt.export_id}),r=>r.state==='cancelled');assert.equal(cancelled.ready,false);
  assert.deepEqual((await f.call('fuzzing_list')).items.map(item=>item.name),['kept']);
});

test('named-wordlist verification remains inside a single fuzzing-owned run',async t=>{
  const f=await fixture(t);await f.call('fuzzing_add_observed',{entries:[{word:'one',capture_ids:['capture-one'],origin:'application_response'}]});await f.call('fuzzing_generate',{name:'paths'});
  let executions=0;f.family.execute=async()=>{executions++;return{fixture:true};};
  const receipt=await f.rawOverrides.get('fuzz_run').handler({options:{url:'https://fixture.invalid/FUZZ'},wordlist:{name:'paths',revision:1}},f.operation(),{execute(){throw Error('Must not start a second public run');}});
  assert.ok(receipt.run_id);await f.settled(receipt);assert.equal(executions,1);assert.equal(f.family.rows('run').length,1);
});
