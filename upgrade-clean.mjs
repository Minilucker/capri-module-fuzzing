import {existsSync,rmSync} from 'node:fs';
import {safePath,within} from '@capri/module-utils';

// Only the owning module understands reservations and their schema. Core calls
// this entry point during the operator-requested offline image upgrade.
export function cleanup({db,directory,workspace}){
 let removed=0;
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='wordlist_tasks'").get())for(const row of db.prepare('SELECT id,data FROM wordlist_tasks').all()){
  const task=JSON.parse(row.data);if(['ready','completed','failed','cancelled','interrupted'].includes(task.state))continue;
  db.prepare('UPDATE wordlist_tasks SET data=? WHERE id=?').run(JSON.stringify({...task,state:'interrupted',ended_at:new Date().toISOString(),error:'Unfinished wordlist work discarded during explicit upgrade.',suppress_observation:true}),row.id);
 }
 for(const operation of db.prepare("SELECT * FROM export_operations WHERE state!='completed'").all()){
  const info=JSON.parse(operation.data),output=safePath(workspace.directory,info.path);
  if(!within(directory,output))throw Error('Export reservation is outside the module store');
  for(const file of [output,output.replace(/\.txt$/,'.json'),output+'.'+operation.id+'.part'])if(existsSync(file))rmSync(file);
  db.prepare('DELETE FROM export_operations WHERE id=?').run(operation.id);removed++;
 }
 db.exec("DELETE FROM framework_receipts WHERE tool='export-reserve' AND COALESCE(json_extract(result,'$.export_id'),json_extract(result,'$.operation_id')) NOT IN (SELECT id FROM export_operations)");
 return {removed_reservations:removed};
}
