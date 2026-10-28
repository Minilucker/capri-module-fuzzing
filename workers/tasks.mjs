import {DatabaseSync} from 'node:sqlite';
import {createReadStream,createWriteStream,statSync,existsSync,mkdirSync,renameSync,unlinkSync} from 'node:fs';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {safePath} from '@capri/module-utils';
async function digest(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
async function exportWords(a){
 const db=new DatabaseSync(a.database,{readOnly:true});let sql='SELECT DISTINCT '+(a.lowercase?'lower(word)':'word')+' AS word FROM word_terms WHERE workspace=?',params=[a.workspace];
 if(a.kind&&a.kind!=='all'){sql+=' AND kind=?';params.push(a.kind);}if(a.origin){sql+=' AND origin=?';params.push(a.origin);}if(a.batch_ids?.length){sql+=' AND batch IN ('+a.batch_ids.map(()=>'?').join(',')+')';params.push(...a.batch_ids);}
 if(a.sort!==false)sql+=' ORDER BY word';mkdirSync(path.dirname(a.file),{recursive:true});const temp=a.file+'.'+a.operation_id+'.part',stream=createWriteStream(temp,{flags:'w'});let count=0;
 try{for(const row of db.prepare(sql).iterate(...params)){if(!stream.write(row.word+'\n'))await once(stream,'drain');count++;}stream.end();await once(stream,'close');if(!count)throw new Error('No words match the requested selection');const sha256=await digest(temp);
  if(existsSync(a.file)){if(await digest(a.file)!==sha256)throw new Error('Preserving unrelated or operator-modified export file');unlinkSync(temp);}else renameSync(temp,a.file);
  return {sha256,count,bytes:statSync(a.file).size};
 }finally{db.close();stream.destroy();}
}
async function readLines(a){
 const file=safePath(a.root,a.path),stat=statSync(file),cache=safePath(a.directory,'cache/index.sqlite');mkdirSync(path.dirname(cache),{recursive:true});
 const db=new DatabaseSync(cache);db.exec('PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS file_index(path TEXT PRIMARY KEY,signature TEXT,sha256 TEXT,count INTEGER);CREATE TABLE IF NOT EXISTS line_offsets(path TEXT,line INTEGER,offset INTEGER,PRIMARY KEY(path,line));');
 const signature=JSON.stringify([stat.size,stat.mtimeMs,stat.ctimeMs]),prior=db.prepare('SELECT * FROM file_index WHERE path=?').get(a.path);let metadata=prior;
 try{
  if(prior?.signature!==signature){let offset=0,line=0;const h=createHash('sha256'),put=db.prepare('INSERT INTO line_offsets VALUES(?,?,?)');db.exec('BEGIN');try{db.prepare('DELETE FROM line_offsets WHERE path=?').run(a.path);put.run(a.path,0,0);let last=10;
   for await(const chunk of createReadStream(file)){h.update(chunk);for(let i=0;i<chunk.length;i++)if(chunk[i]===10){line++;if(line%256===0)put.run(a.path,line,offset+i+1);}offset+=chunk.length;last=chunk.at(-1);}
   if(offset&&last!==10)line++;metadata={signature,sha256:h.digest('hex'),count:line};db.prepare('INSERT OR REPLACE INTO file_index VALUES(?,?,?,?)').run(a.path,signature,metadata.sha256,line);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(a.sha256&&a.sha256!==metadata.sha256)throw new Error('Wordlist was changed outside the tool');
  const offset=a.offset||0,limit=a.limit||100,anchor=db.prepare('SELECT * FROM line_offsets WHERE path=? AND line<=? ORDER BY line DESC LIMIT 1').get(a.path,offset),lines=[];
  if(anchor&&offset<metadata.count){let line=anchor.line,buffer=Buffer.alloc(0);for await(const chunk of createReadStream(file,{start:anchor.offset})){buffer=Buffer.concat([buffer,chunk]);let index;while((index=buffer.indexOf(10))>=0){const value=buffer.subarray(0,index);buffer=buffer.subarray(index+1);if(line++>=offset)lines.push(value.toString('utf8').replace(/\r$/,''));if(lines.length>=limit)break;}if(lines.length>=limit)break;if(buffer.length>1024*1024)throw new Error('Wordlist line exceeds 1 MiB');}if(lines.length<limit&&buffer.length&&line>=offset)lines.push(buffer.toString('utf8'));}
  return {path:a.path,sha256:metadata.sha256,total:metadata.count,lines,next_offset:offset+lines.length<metadata.count?offset+lines.length:null};
 }finally{db.close();}
}
export {exportWords,readLines};
