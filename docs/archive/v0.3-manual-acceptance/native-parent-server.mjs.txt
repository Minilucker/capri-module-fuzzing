// Keep app-server alive across parent turn completion, matching desktop ownership.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
const directory='/workspaces/development/fuzzing-acceptance/.capri/core/acceptance',marker=directory+'/server-boundary-'+Date.now()+'.jsonl';mkdirSync(directory,{recursive:true});
const child=spawn('codex',['app-server','--listen','stdio://'],{stdio:['pipe','pipe','pipe']});const lines=createInterface({input:child.stdout}),pending=new Map();let next=0,parent,completed,diagnostics='';
child.stderr.on('data',b=>diagnostics=(diagnostics+b).slice(-4000));let finish;const done=new Promise(r=>finish=r);
lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
 if(m.id!==undefined&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}
 else if(m.method==='turn/completed'&&m.params.threadId===parent){completed=Date.now();finish(m.params.turn);}
 else if(m.id!==undefined&&m.method)child.stdin.write(JSON.stringify({id:m.id,error:{code:-32601,message:'No interactive approval handler in bounded acceptance'}})+'\n');
});
const send=(method,params)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
let watchdog;try{
 await send('initialize',{clientInfo:{name:'pt-boundary-acceptance',version:'1'},capabilities:{experimentalApi:true}});child.stdin.write('{"method":"initialized"}\n');
 const session=await send('thread/start',{cwd:'/workspaces/development/fuzzing-acceptance'});parent=session.thread.id;
 await send('turn/start',{threadId:parent,input:[{type:'text',text:`Bounded local native delegation acceptance. Launch exactly one native fuzzing child. No targets, proxy reads, fuzzing or browser use. Child must append a JSON line {stage:1,time:Date.now()} to ${marker} with a shell tool, wait 20 seconds with a tool, append {stage:2,time:Date.now()}, and terminate. Main must wait only until stage 1 appears, then immediately give your final answer without waiting for or closing the child. Do not start any other specialist. Direct shell is allowed solely for these test markers.`,text_elements:[]}]});
 const turn=await Promise.race([done,new Promise((_,reject)=>watchdog=setTimeout(()=>reject(new Error('Parent turn timeout')),180000))]);clearTimeout(watchdog);await new Promise(r=>setTimeout(r,35000));
 const markers=existsSync(marker)?readFileSync(marker,'utf8').trim().split('\n').flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}}):[];
 const receipt={time:new Date().toISOString(),parent_turn_status:turn.status,parent_completed_at:completed,markers,continued_after_parent_turn:markers.some(m=>m.stage===2&&m.time>completed),boundary:'Native app-server remains alive after parent turn completion'};
 writeFileSync(directory+'/native-parent-server.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{clearTimeout(watchdog);writeFileSync(directory+'/native-parent-server-diagnostics.txt',diagnostics);lines.close();child.stdin.end();child.kill();}
