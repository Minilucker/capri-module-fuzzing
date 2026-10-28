import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { frameworkImport } from './framework.mjs';
const { bundleModuleSource } = await frameworkImport('src/package-snapshot.mjs');
const { runWorker } = await frameworkImport('src/worker.mjs');
const { registerCoreFuzzing } = await frameworkImport('src/fuzzing/index.mjs');
export const moduleRoot = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(readFileSync(path.join(moduleRoot, 'module.json'), 'utf8'));
export async function load(relative) { return import('data:text/javascript;base64,' + bundleModuleSource(moduleRoot, relative).toString('base64')); }

export async function fixture(t, config = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'capri-fuzzing-module-')), workspace = { id: 'project', directory: path.join(root, 'workspace') };
  const directory = path.join(workspace.directory, '.capri/modules/fuzzing.v1'); mkdirSync(directory, { recursive: true });
  const database = path.join(directory, 'module.sqlite'), db = new DatabaseSync(database);
  for(const migration of manifest.migrations)db.exec(readFileSync(path.join(moduleRoot,migration),'utf8'));
  db.exec('CREATE TABLE framework_receipts(tool TEXT,result TEXT)');
  const cleanups=[],tools = new Map(), overrides = new Map(), rawOverrides=new Map(), workers = new Map(), captures = [];
  let sequence = 0;
  const operation = (id = 'invocation-' + ++sequence) => ({ invocation_id:id,workspace,provider:'fuzzing',generation:'fixture-generation',actor: { kind: 'codex',workspace:workspace.id, mainThreadId: 'fixture-main', callerThreadId: 'fixture-child',notification_recipient:'fixture-child',secondary_recipients:['fixture-main'] }, signal: new AbortController().signal,retain:()=>()=>{} });
  const worker = (name, data, signal) => {
    if (!manifest.workers[name]) throw new Error('Undeclared module worker: ' + name);
    if (!workers.has(name)) { const file = path.join(root, name + '.mjs'); writeFileSync(file, bundleModuleSource(moduleRoot, manifest.workers[name])); workers.set(name, file); }
    return runWorker('module', { entry: workers.get(name), data }, signal);
  };
  const family=registerCoreFuzzing({workspace,register(){},worker:runWorker,executable:'synthetic-ffuf',getVersion:async()=> 'fixture',executeProcess:async(context,spec)=>{const file=spec.argv.find(a=>a.startsWith('-o=')).slice(3);writeFileSync(file,JSON.stringify({results:[]}));return{exit_code:0};}});
  async function settled(value){
    value=await value;
    for(let i=0;i<500;i++){
      if(value.view_id){if(value.ready)return value;if(['failed','cancelled','interrupted'].includes(value.view_state))throw Error(value.error||value.view_state);await new Promise(r=>setTimeout(r,10));value=family.result({view_id:value.view_id});continue;}
      if(value.run_id){if(value.state==='exited')return value.result;if(['failed','cancelled','interrupted'].includes(value.state))throw Error(value.error||value.state);await new Promise(r=>setTimeout(r,10));value=family.status(value.run_id);continue;}
      if(value.read_id||value.export_id){if(value.ready)return value;if(['failed','cancelled','interrupted'].includes(value.state))throw Error(value.error||value.state);const kind=value.read_id?'read':'export',key=kind+'_id';await new Promise(r=>setTimeout(r,10));value=tools.get('fuzzing_'+kind+'_result').handler({[key]:value[key]},operation());continue;}
      return value;
    }
    throw Error('Fixture timed out waiting for family work');
  }
  const context = {
    db, database, directory, workspace, config, worker,
    register(definition, handler, options) { tools.set(definition.name, { definition, handler, options }); },
    overrideTool(name, definition, handler) { rawOverrides.set(name,{definition,handler});overrides.set(name, { definition, handler:(...args)=>settled(handler(...args)) }); },
    registerCleanup(fn){cleanups.push(fn);},
    capabilities: { capture(id, owner) { if (!id.startsWith('capture-')) throw new Error('Unknown synthetic capture'); captures.push({ id, owner }); } },
    mutate(op, tool, args, action) {
      db.exec('BEGIN'); try { const value = action(); db.prepare('INSERT INTO framework_receipts VALUES(?,?)').run(tool, JSON.stringify(value)); db.exec('COMMIT');return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    fuzzing:family
  };
  await (await load('server.mjs')).activate(context);
  const rawCall=(name,args={},op=operation())=>tools.get(name).handler(args,op);
  const call = (name, args = {}, op = operation()) => settled(rawCall(name,args,op));
  t.after(async()=>{for(const close of cleanups)await close();await family.close();family.dispose();db.close();assert.equal(path.dirname(root),path.resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});
  function results(rows, { id = 'run', format = 'json' } = {}) {
    const file = path.join(workspace.directory, '.capri/core/fuzzing', id, 'results.json'); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, format === 'json' ? JSON.stringify({ results: rows }) : 'raw output');
    family.put('run', { id,run_id:id,workspace: workspace.id, kind: 'run',ffuf_kind:'ffuf', state: 'exited',created_at:new Date().toISOString(), output_format: format, result_format: format, result_reference: { workspace: workspace.id, path: path.relative(workspace.directory, file).split(path.sep).join('/') } });
    return { id, file };
  }
  return { root, directory, workspace, db, tools, overrides, rawOverrides,worker,context,captures,call,rawCall,settled,operation,results,family };
}
