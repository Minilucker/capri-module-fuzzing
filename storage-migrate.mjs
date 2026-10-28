import path from 'node:path';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

export function migrateStorage({db,directory,from,to,dryRun,remap}){
 if(from!==0||to!==1)throw new Error('Unsupported fuzzing storage layout migration');
 const exports=db.prepare('SELECT rowid,data FROM word_exports').all(),operations=db.prepare('SELECT rowid,data FROM export_operations').all();
 const sidecars=[];
 for(const row of exports){
  const data=JSON.parse(row.data),match=/^(?:data|\.capri)\/modules\/[^/]+\/(wordlists\/.+\.txt)$/.exec(data.path||'');
  if(!match)throw new Error('Unrecognized fuzzing export path: '+data.path);
  const sidecar=path.join(directory,match[1].replace(/\.txt$/,'.json'));
  if(existsSync(sidecar)){
   const current=JSON.parse(readFileSync(sidecar,'utf8'));
   if(JSON.stringify(current)!==JSON.stringify(data))throw new Error('Preserving modified wordlist sidecar: '+sidecar);
   sidecars.push({file:sidecar,data:remap(current)});
  }
 }
 if(dryRun)return;
 db.exec('BEGIN');try{
  for(const [table,rows]of [['word_exports',exports],['export_operations',operations]])for(const row of rows)db.prepare('UPDATE '+table+' SET data=? WHERE rowid=?').run(JSON.stringify(remap(JSON.parse(row.data))),row.rowid);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 for(const sidecar of sidecars)writeFileSync(sidecar.file,JSON.stringify(sidecar.data,null,2)+'\n');
}
