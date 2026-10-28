import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { fixture, manifest, moduleRoot, load } from './fixture.mjs';

test('module adds vocabulary tools and extends core fuzzing without global guidance or duplicate controls', async t => {
  const f = await fixture(t);
  assert.deepEqual([...f.overrides.keys()], ['fuzz_run', 'fuzz_result']);
  assert.ok(![...f.tools.keys()].some(name => name.startsWith('fuzzing_ffuf_')));
  assert.ok(f.tools.has('fuzzing_generate')); assert.ok(f.tools.has('fuzzing_read_file'));
  assert.equal(manifest.guidance, undefined); assert.equal(manifest.agents[0].start, 'manual');
  assert.equal(manifest.toolOverrides.fuzz_run.mode, 'extend');
  assert.ok(existsSync(path.join(moduleRoot, manifest.skills[0].source, 'SKILL.md')));
  assert.deepEqual(await f.call('fuzzing_settings'), { autonomous_discovery: false, ffuf_defaults: {} });
});

test('observations, inference and immutable wordlists remain module-owned and preserve source evidence', async t => {
  const f = await fixture(t);
  const observed = await f.call('fuzzing_add_observed', { entries: [{ word: 'inventory', capture_ids: ['capture-one'], origin: 'application_response' }] });
  const inferred = await f.call('fuzzing_add_candidates', { words: ['inventories', 'inventory', 'inventories'], source_batches: [observed.batch_id], explanation: 'Synthetic agent inference' });
  assert.equal(inferred.accepted, 2); assert.equal(inferred.duplicates, 1); assert.equal(f.captures.length, 1);
  const exported = await f.call('fuzzing_generate', { name: 'paths' });
  assert.equal(exported.count, 2); assert.match(exported.path, /^\.capri\/modules\/fuzzing.v1\/wordlists\//);
  assert.equal(readFileSync(path.join(f.workspace.directory, exported.path), 'utf8'), 'inventories\ninventory\n');
  assert.deepEqual((await f.call('fuzzing_read', { name: 'paths', revision: 1 })).lines, ['inventories', 'inventory']);
  assert.deepEqual((await f.call('fuzzing_read_file', { path: exported.path, offset: 1, limit: 1 })).lines, ['inventory']);
  assert.equal((await f.call('fuzzing_list')).items.length, 1);
  assert.ok(existsSync(path.join(f.directory, 'cache/index.sqlite')));
  await assert.rejects(async () => f.call('fuzzing_add_candidates', { words: ['bad'], source_batches: ['missing'], explanation: 'Invalid evidence' }), /Unknown source batch/);
});

test('export failures preserve operator files and a new export uses a distinct reserved revision', async t => {
  const f = await fixture(t);
  await f.call('fuzzing_add_observed', { entries: [{ word: 'one', capture_ids: ['capture-one'], origin: 'application_response' }] });
  const sidecar = path.join(f.directory, 'wordlists/recovery/r000001.json'); mkdirSync(path.dirname(sidecar), { recursive: true }); writeFileSync(sidecar, 'operator content');
  const op = f.operation('same-export');
  await assert.rejects(f.call('fuzzing_generate', { name: 'recovery' }, op), /Preserving operator-modified/);
  assert.equal(readFileSync(sidecar, 'utf8'), 'operator content');
  assert.equal((await f.call('fuzzing_list')).items.length, 0);
  unlinkSync(sidecar);
  const saved = await f.call('fuzzing_generate', { name: 'recovery' }, op);
  assert.equal(saved.revision, 2); assert.equal((await f.call('fuzzing_list')).items.length, 1);
});

test('module upgrade cleanup removes unfinished exports while retaining completed artifacts', async t => {
  const f = await fixture(t), cleanup = (await load('upgrade-clean.mjs')).cleanup;
  const pending = path.join(f.directory, 'wordlists/pending/r000001.txt'), completed = path.join(f.directory, 'wordlists/kept/r000001.txt');
  for (const file of [pending, pending.replace('.txt', '.json'), pending + '.pending.part', completed]) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, 'fixture'); }
  for (const [id, file, state] of [['pending', pending, 'reserved'], ['complete', completed, 'completed']]) f.db.prepare('INSERT INTO export_operations VALUES(?,?,?,?,?,?)').run(id, id, 1, '{}', JSON.stringify({ path: path.relative(f.workspace.directory, file).split(path.sep).join('/') }), state);
  const result = cleanup({ db: f.db, directory: f.directory, workspace: f.workspace });
  assert.equal(result.removed_reservations, 1); assert.ok(!existsSync(pending)); assert.ok(!existsSync(pending + '.pending.part')); assert.ok(existsSync(completed));
});
