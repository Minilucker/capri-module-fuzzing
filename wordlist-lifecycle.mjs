import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

const final = new Set(['ready', 'completed', 'failed', 'cancelled', 'interrupted']);
const now = () => new Date().toISOString();

// Private wordlist work: read/index and immutable export are module business state.
export function createWordlistLifecycle({ db, workspace, registerCleanup }) {
  const active = new Map(); let accepting = true;
  const get = id => { const row = db.prepare('SELECT data FROM wordlist_tasks WHERE id=?').get(id); if (!row) throw Error('Unknown workspace wordlist task'); const data = JSON.parse(row.data); if (data.workspace !== workspace.id) throw Error('Wordlist task belongs to another workspace'); return data; };
  const patch = (id, change) => { const value = { ...get(id), ...change }; db.prepare('UPDATE wordlist_tasks SET data=? WHERE id=?').run(JSON.stringify(value), id); return value; };
  for (const row of db.prepare('SELECT id,data FROM wordlist_tasks').all()) {
    const task = JSON.parse(row.data); if (final.has(task.state) || task.process_owner?.host !== hostname()) continue;
    try { process.kill(task.process_owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') patch(row.id, { state: 'interrupted', ended_at: now(), error: 'Wordlist worker no longer exists; no automatic replay.' }); }
  }
  const read = (id, kind) => { const value = get(id); if (value.kind !== kind) throw Error('Wrong wordlist task kind'); return value; };
  const result = (id, kind) => { const value = read(id, kind); return { ...(value.result || {}), id, [kind === 'read' ? 'read_id' : 'export_id']: id, state: value.state, ready: kind === 'read' ? value.state === 'ready' : value.state === 'completed', ...(value.error ? { error: value.error } : {}), family_reference: value.family_reference }; };
  const start = (kind, args, call, action) => {
    if (!accepting) throw Error('Wordlist runtime is closed');
    if (!call?.invocation_id || !call.actor || call.actor.kind !== 'operator' && !call.actor.notification_recipient) throw Error('Wordlist work requires invocation attribution and a notification recipient');
    const id = randomUUID(), controller = new AbortController(), family_reference = { workspace: workspace.id, owner: 'fuzzing', family: 'wordlists', kind, id };
    const value = { id, workspace: workspace.id, owner: 'fuzzing', family: 'wordlists', kind, state: 'preparing', created_at: now(), actor: call.actor, invocation_id: call.invocation_id, provider: call.provider, generation: call.generation, requested: args, family_reference, process_owner: { host: hostname(), pid: process.pid } };
    db.prepare('INSERT INTO wordlist_tasks VALUES(?,?)').run(id, JSON.stringify(value));
    const release = call.retain?.('wordlist ' + kind + ' ' + id) || (() => {}), live = { id, controller };
    active.set(id, live);
    const context = { ...call, id, family_reference, signal: controller.signal };
    live.done = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return action(context); }).then(output => patch(id, { state: controller.signal.aborted ? live.cancelState || 'cancelled' : kind === 'read' ? 'ready' : 'completed', ended_at: now(), result: output }), error => patch(id, { state: controller.signal.aborted ? live.cancelState || 'cancelled' : 'failed', ended_at: now(), error: error.message })).finally(() => { active.delete(id); release(); });
    return result(id, kind);
  };
  const cancel = (id, kind, state = 'cancelled') => {
    const task = read(id, kind); if (final.has(task.state)) return result(id, kind);
    const live = active.get(id); if (!live) throw Error('Wordlist task is not controlled by this runtime');
    live.cancelState = state; patch(id, { state: 'cancelling' }); live.controller.abort(Error(state)); return result(id, kind);
  };
  registerCleanup(async () => { accepting = false; const tasks = [...active.values()]; for (const task of tasks) cancel(task.id, get(task.id).kind, 'interrupted'); await Promise.allSettled(tasks.map(task => task.done)); });
  return { start, status: read, result, cancel };
}
