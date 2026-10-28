import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { frameworkImport } from './framework.mjs';
const { bundleModuleSource } = await frameworkImport('src/package-snapshot.mjs');
const { runWorker } = await frameworkImport('src/worker.mjs');
const { resolveFuzzRun } = await frameworkImport('src/fuzzing/index.mjs');
export const moduleRoot = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(readFileSync(path.join(moduleRoot, 'module.json'), 'utf8'));
export async function load(relative) { return import('data:text/javascript;base64,' + bundleModuleSource(moduleRoot, relative).toString('base64')); }

export async function fixture(t, config = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'capri-fuzzing-module-')), workspace = { id: 'project', directory: path.join(root, 'workspace') };
  const directory = path.join(workspace.directory, '.capri/modules/fuzzing.v1'); mkdirSync(directory, { recursive: true });
  const database = path.join(directory, 'module.sqlite'), db = new DatabaseSync(database);
  db.exec(readFileSync(path.join(moduleRoot, '001-schema.sql'), 'utf8'));
  db.exec('CREATE TABLE framework_receipts(tool TEXT,result TEXT)');
  t.after(() => { db.close(); assert.equal(path.dirname(root), path.resolve(tmpdir())); rmSync(root, { recursive: true, force: true }); });
  const tools = new Map(), overrides = new Map(), jobs = new Map(), workers = new Map(), receipts = new Map(), captures = [];
  let sequence = 0;
  const operation = (id = 'operation-' + ++sequence) => ({ id, actor: { kind: 'codex', mainThreadId: 'fixture-main', callerThreadId: 'fixture-child', idempotency_key: id }, signal: new AbortController().signal });
  const worker = (name, data, signal) => {
    if (!manifest.workers[name]) throw new Error('Undeclared module worker: ' + name);
    if (!workers.has(name)) { const file = path.join(root, name + '.mjs'); writeFileSync(file, bundleModuleSource(moduleRoot, manifest.workers[name])); workers.set(name, file); }
    return runWorker('module', { entry: workers.get(name), data }, signal);
  };
  const context = {
    db, database, directory, workspace, config, worker,
    register(definition, handler, options) { tools.set(definition.name, { definition, handler, options }); },
    overrideTool(name, definition, handler) { overrides.set(name, { definition, handler }); },
    capabilities: { capture(id, owner) { if (!id.startsWith('capture-')) throw new Error('Unknown synthetic capture'); captures.push({ id, owner }); } },
    mutate(op, tool, args, action) {
      const key = op.id + ':' + tool; if (receipts.has(key)) return receipts.get(key);
      db.exec('BEGIN'); try { const value = action(); db.prepare('INSERT INTO framework_receipts VALUES(?,?)').run(tool, JSON.stringify(value)); db.exec('COMMIT'); receipts.set(key, value); return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    fuzzing: { resolve(id) { return resolveFuzzRun(workspace, { get(workspaceId, run) { const job = jobs.get(run); if (!job || job.workspace !== workspaceId) throw new Error('Unknown workspace operation'); return job; } }, id); } }
  };
  await (await load('server.mjs')).activate(context);
  const call = (name, args = {}, op = operation()) => tools.get(name).handler(args, op);
  function results(rows, { id = 'run', format = 'json' } = {}) {
    const file = path.join(workspace.directory, '.capri/core/fuzzing', id, 'results.json'); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, format === 'json' ? JSON.stringify({ results: rows }) : 'raw output');
    jobs.set(id, { id, workspace: workspace.id, kind: 'ffuf', state: 'completed', output_format: format, result_format: format, result_reference: { workspace: workspace.id, path: path.relative(workspace.directory, file).split(path.sep).join('/') } });
    return { id, file };
  }
  return { root, directory, workspace, db, tools, overrides, jobs, worker, context, captures, call, operation, results };
}
