import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from './fixture.mjs';

const base = { execute() { throw new Error('Enhanced results must not read a pre-paginated base page'); } };
const signature = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const row = (n, status = 200) => ({ url: 'https://fixture.invalid/item-' + n, status, length: n, words: n + 1, lines: 1, input: { FUZZ: 'item-' + n } });

test('plain result calls delegate unchanged to the base and keep its exact output', async t => {
  const f = await fixture(t), args = { id: 'run', offset: 5, limit: 2 }, result = { parsed: true, items: [], next_offset: null }; let calls = 0;
  const output = await f.overrides.get('fuzz_result').handler(args, f.operation(), { execute(input) { calls++; assert.deepEqual(input, args); return result; } });
  assert.equal(output, result); assert.equal(calls, 1);
});

test('filters scan before pagination and summaries cover all matches without altering raw artifacts', async t => {
  const f = await fixture(t), rows = [...Array.from({ length: 250 }, (_, n) => row(n, 404)), row(300), row(301)];
  const run = f.results(rows), original = signature(run.file), handler = f.overrides.get('fuzz_result').handler;
  const first = await handler({ id: run.id, filters: { status: [200] }, view: 'compact', limit: 1 }, f.operation(), base);
  assert.equal(first.total, 252); assert.equal(first.matched_total, 2); assert.equal(first.returned, 1); assert.equal(first.next_offset, 1);
  assert.equal(first.items[0].url, rows[250].url); assert.equal(first.items[0].input, undefined);
  const second = await handler({ id: run.id, filters: { status: [200] }, view: 'compact', limit: 1, cursor: first.next_cursor }, f.operation(), base);
  assert.equal(second.items[0].url, rows[251].url); assert.equal(second.next_cursor, null);
  const summary = await handler({ id: run.id, filters: { status: [200] }, view: 'summary', limit: 1 }, f.operation(), base);
  assert.equal(summary.matched_total, 2); assert.equal(summary.summary.status_counts[200], 2); assert.equal(summary.summary.bytes, 601);
  assert.equal(summary.returned, 0); assert.equal(summary.items, undefined); assert.equal(summary.next_offset, null);
  assert.equal(signature(run.file), original);
});

test('inclusive filters and field projection preserve source order with accurate empty pages', async t => {
  const f = await fixture(t), run = f.results([row(1), row(2), row(3)]), handler = f.overrides.get('fuzz_result').handler;
  const page = await handler({ id: run.id, filters: { min_bytes: 2, max_bytes: 3, min_words: 3, max_words: 4, min_lines: 1, max_lines: 1, url_contains: '/item-' }, fields: ['status', 'url'] }, f.operation(), base);
  assert.deepEqual(page.items, [{ status: 200, url: row(2).url }, { status: 200, url: row(3).url }]); assert.equal(page.matched_total, 2);
  const empty = await handler({ id: run.id, filters: { url_contains: 'absent' } }, f.operation(), base);
  assert.equal(empty.matched_total, 0); assert.deepEqual(empty.items, []); assert.equal(empty.next_cursor, null);
  await assert.rejects(handler({ id: run.id, filters: { min_bytes: 4, max_bytes: 2 } }, f.operation(), base), /Minimum bytes/);
  await assert.rejects(handler({ id: run.id, fields: ['unknown'] }, f.operation(), base), /Unknown result field/);
});

test('table view escapes control characters, markup and pipes without duplicate raw rows', async t => {
  const f = await fixture(t), run = f.results([{ ...row(1), url: '<script>alert(1)</script>|[click](https://fixture.invalid)\u001b[31m' }]);
  const result = await f.overrides.get('fuzz_result').handler({ id: run.id, view: 'table', fields: ['url', 'status'] }, f.operation(), base);
  assert.equal(result.returned, 1); assert.equal(result.items, undefined); assert.match(result.table, /&lt;script&gt;/); assert.match(result.table, /\\\|/);
  assert.ok(!result.table.includes('\u001b')); assert.ok(!result.table.includes('<script>')); assert.ok(!result.table.includes('[click]('));
});

test('continuation cursors bind the artifact, filters and view rather than reusing stale page identities', async t => {
  const f = await fixture(t), run = f.results([row(1), row(2), row(3)]), handler = f.overrides.get('fuzz_result').handler;
  const args = { id: run.id, view: 'compact', filters: { status: [200] }, limit: 1 }, first = await handler(args, f.operation(), base);
  await assert.rejects(handler({ ...args, cursor: first.next_cursor, limit: 2 }, f.operation(), base), /cursor does not match/);
  await assert.rejects(handler({ ...args, cursor: first.next_cursor, filters: { status: [404] } }, f.operation(), base), /cursor does not match/);
  await assert.rejects(handler({ ...args, cursor: first.next_cursor, offset: 0 }, f.operation(), base), /cursor OR offset/);
  writeFileSync(run.file, JSON.stringify({ results: [row(1), row(2), row(3), row(4)] }));
  await assert.rejects(handler({ ...args, cursor: first.next_cursor }, f.operation(), base), /cursor does not match/);
});

test('unsupported and incomplete outputs retain explicit diagnostics and raw artifact references', async t => {
  const f = await fixture(t), run = f.results([], { format: 'csv' }), handler = f.overrides.get('fuzz_result').handler;
  const unsupported = await handler({ id: run.id, view: 'summary' }, f.operation(), base);
  assert.equal(unsupported.parsed, false); assert.match(unsupported.reason, /standard ffuf JSON/); assert.ok(unsupported.artifact);
  f.family.patch('run',run.id,{output_format:'json',result_format:'json'}); writeFileSync(run.file, '');
  const incomplete = await handler({ id: run.id, view: 'compact' }, f.operation(), base);
  assert.equal(incomplete.parsed, false); assert.match(incomplete.reason, /incomplete/); assert.ok(incomplete.artifact);
});
