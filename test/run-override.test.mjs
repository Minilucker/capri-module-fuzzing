import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { appendFileSync } from 'node:fs';
import { fixture } from './fixture.mjs';

test('explicit core calls remain available with discovery preference false and execute the base once', async t => {
  const f = await fixture(t, { activeDiscovery: false }), args = { options: { url: 'https://fixture.invalid/FUZZ/ALT', wordlists: ['one:FUZZ', 'two:ALT'], mode: 'pitchfork' } };
  const original = structuredClone(args), calls = [];
  const result = await f.overrides.get('fuzz_run').handler(args, f.operation(), { execute: async (input, op) => { calls.push({ input, op }); return { kind: 'ffuf', saved: true }; } });
  assert.deepEqual(result, { kind: 'ffuf', saved: true }); assert.equal(calls.length, 1); assert.deepEqual(calls[0].input, original); assert.deepEqual(args, original);
});

test('configured defaults fill omitted arguments but never provide an implicit wordlist', async t => {
  const f = await fixture(t, { ffufDefaults: { threads: 2, rate: 0, wordlists: ['never-default'] } }), inputs = [];
  const base = { execute: async input => { inputs.push(input); return input; } }, handler = f.overrides.get('fuzz_run').handler;
  await assert.rejects(handler({ options: { url: 'https://fixture.invalid/FUZZ' } }, f.operation(), base), /Supply options.wordlists/);
  await handler({ options: { url: 'https://fixture.invalid/FUZZ', wordlists: ['explicit'], threads: 8 } }, f.operation(), base);
  assert.equal(inputs.length, 1); assert.equal(inputs[0].options.threads, 8); assert.equal(inputs[0].options.rate, 0); assert.deepEqual(inputs[0].options.wordlists, ['explicit']);
  assert.deepEqual(await f.call('fuzzing_settings'), { autonomous_discovery: false, ffuf_defaults: { threads: 2, rate: 0 } });
});

test('named wordlist references resolve a completed revision and reject ambiguity or modified content', async t => {
  const f = await fixture(t);
  await f.call('fuzzing_add_observed', { entries: [{ word: 'one', capture_ids: ['capture-one'], origin: 'application_response' }] });
  const exported = await f.call('fuzzing_generate', { name: 'paths' });
  const calls = [], base = { execute: async input => { calls.push(input); return { stored: true }; } }, handler = f.overrides.get('fuzz_run').handler;
  const args = { options: { url: 'https://fixture.invalid/PATH' }, wordlist: { name: 'paths', revision: 1, keyword: 'PATH' } };
  await handler(args, f.operation(), base);
  assert.equal(calls.length, 1); assert.equal(calls[0].wordlist, undefined);
  assert.deepEqual(calls[0].options.wordlists, [path.join(f.workspace.directory, exported.path) + ':PATH']);
  await assert.rejects(handler({ ...args, options: { ...args.options, wordlists: ['other'] } }, f.operation(), base), /Choose a named wordlist/);
  await assert.rejects(handler({ ...args, options: { ...args.options, input_command: 'echo other' } }, f.operation(), base), /Choose a named wordlist/);
  await assert.rejects(handler({ ...args, wordlist: { name: 'paths', revision: 2 } }, f.operation(), base), /Unknown completed wordlist revision/);
  appendFileSync(path.join(f.workspace.directory, exported.path), 'changed\n');
  await assert.rejects(handler(args, f.operation(), base), /changed outside/);
  assert.equal(calls.length, 1);
});

test('an override propagates a failed base execution without fallback or another invocation', async t => {
  const f = await fixture(t), op = f.operation(); let count = 0;
  await assert.rejects(f.overrides.get('fuzz_run').handler({ options: { url: 'https://fixture.invalid/FUZZ', wordlists: ['explicit'] } }, op, { execute: async () => { count++; throw new Error('base failure'); } }), /base failure/);
  assert.equal(count, 1);
});
