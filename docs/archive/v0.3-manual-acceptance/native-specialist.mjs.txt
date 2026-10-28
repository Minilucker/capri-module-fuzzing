// Bounded native acceptance; uses the operator's configured model and existing login.
import { spawn } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
const cwd='/workspaces/development/fuzzing-acceptance',directory=path.join(cwd,'.capri/core/acceptance');mkdirSync(directory,{recursive:true});
const prompt=`Run one bounded LOCAL acceptance test of native specialist delegation. Do not contact a target, fuzz, browse, or modify source/configuration. Register a fresh logical session via Capri core using a unique session ID and yourself as main. Read session_specialists, claim the configured fuzzing role, then launch exactly one native fuzzing subagent using its own installed role instructions. Bind the claim to its real native agent ID. Tell the child this is a bounded test: register its agent identity, read workspace_status and its inbox twice with a brief wait between reads, report the role it loaded and terminate. It must not read proxy traffic or fuzz. Wait for that child to finish, record specialist_state stopped, and report actual native agent ID and observed tool results. Invoke the installed fuzzing skill if available so its packaged instructions are exercised. If native delegation or the role is unavailable, report the exact limitation without substituting shell processes or invented IDs. Do not launch a second child. Finish within 3 minutes.`;
// Native children require their parent's rollout in 0.164.0; ephemeral exec
// fails with "no rollout found". This local test session is persisted.
const child=spawn('codex',['exec','--json','--skip-git-repo-check','-C',cwd,'--output-last-message',path.join(directory,'native-specialist-final.txt'),prompt],{stdio:['ignore','pipe','pipe']});
let output='',errors='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{errors=(errors+b).slice(-8000);});
const timer=setTimeout(()=>child.kill('SIGTERM'),240000);
const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timer);
writeFileSync(path.join(directory,'native-specialist-events.jsonl'),output);writeFileSync(path.join(directory,'native-specialist-diagnostics.txt'),errors);
const events=output.trim().split('\n').flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}});
console.log(JSON.stringify({exit_code:code,events:events.length,item_types:[...new Set(events.map(e=>e.item?.type).filter(Boolean))],evidence:path.relative('/workspaces',directory),complete:events.some(e=>e.type==='turn.completed')}));
if(code!==0)process.exitCode=1;
