import {frameworkImport,frameworkRoot} from './framework.mjs';
// Explicit native Codex acceptance inside the agent; no model/API run and no target traffic.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const {atomic,resolveWorkspace,json}=await frameworkImport("src/modules.mjs");
const {createCore,provisionWorkspace}=await frameworkImport("test/apply-helper.mjs");
const tag='override-'+randomUUID().slice(0,8),root=path.join('/workspaces',tag),base=root,report={time:new Date().toISOString(),cases:[]},ids=[],trust=[];
const userConfig='/home/pentest/.codex/config.toml';
const core=await createCore({directory:root,database:path.join(base,'core.sqlite'),token:'native-fixture-token-'.repeat(3)});
async function setup(dir,id,data){mkdirSync(dir,{recursive:true});ids.push(id);atomic(path.join(dir,'workspace.json'),{schemaVersion:1,id,...data});await provisionWorkspace(root,dir);const entry=`\n[projects.${JSON.stringify(dir)}]\ntrust_level="trusted"\n`;trust.push(entry);writeFileSync(userConfig,readFileSync(userConfig,'utf8')+entry);return dir;}
function strings(value){if(typeof value==='string')return [value];if(value&&typeof value==='object')return Object.values(value).flatMap(strings);return [];}
async function roles(dir){const {stdout:raw}=await promisify(execFile)('codex',['debug','prompt-input','Native module visibility diagnostic only.'],{cwd:dir,encoding:'utf8',maxBuffer:4*1024*1024,timeout:45000});const prompt=JSON.parse(raw),text=strings(prompt).find(s=>s.includes('Available roles:')) || '';return {names:[...text.matchAll(/(?:^|\n)([a-z][a-z0-9_-]*): \{/g)].map(m=>m[1]),description:text};}
const registry=path.join(root,'.capri/workspaces.json');
try{
  for(const git of [false,true]){
    const parent=path.join(base,git?'git-parent':'folder-parent');mkdirSync(path.join(parent,'extensions','override-probe'),{recursive:true});
    atomic(path.join(parent,'extensions/override-probe/module.json'),{id:'override-probe',version:'1.0.0',api:1,assets:[{source:'probe.toml',target:'.codex/agents/overrideprobe.toml'}]});
    atomic(path.join(parent,'extensions/override-probe/probe.toml'),'name = "overrideprobe"\ndescription = "Harmless module override acceptance marker."\ndeveloper_instructions = "Return the marker only. Do not use tools."\n');
    if(git)execFileSync('git',['init','--quiet',parent]);
    const prefix=tag+(git?'-git':'-folder');await setup(parent,prefix,{root:true,modules:{fuzzing:{enabled:true,config:{activeDiscovery:true}},'override-probe':{enabled:true}}});
    const disabled=await setup(path.join(parent,'disabled'),prefix+'-disabled',{modules:{}});
    atomic(path.join(disabled,'workspace.json'),{schemaVersion:1,id:prefix+'-disabled',modules:{fuzzing:{enabled:false}}});await provisionWorkspace(root,disabled);
    const sibling=await setup(path.join(parent,'sibling'),prefix+'-sibling',{modules:{}});
    const grandchild=await setup(path.join(disabled,'enabled'),prefix+'-grandchild',{modules:{fuzzing:{enabled:true,config:{activeDiscovery:false}}}});
    const configured=await setup(path.join(parent,'config-only'),prefix+'-config',{modules:{fuzzing:{config:{activeDiscovery:false}}}});
    const replacedConfig=await setup(path.join(parent,'replaced-config'),prefix+'-reset',{modules:{fuzzing:{inherit:false,enabled:true,config:{}}}});
    const replacement=path.join(parent,'replacement'),extension=path.join(replacement,'extensions/fuzzing');mkdirSync(extension,{recursive:true});
    atomic(path.join(extension,'module.json'),{id:'fuzzing',version:'0.2.0',api:1,server:'server.mjs',assets:[{source:'agent.toml',target:'.codex/agents/fuzzing.toml'}]});
    atomic(path.join(extension,'agent.toml'),'name="fuzzing"\ndescription="Child replacement marker"\ndeveloper_instructions="Child replacement instructions. No tools needed."\n');
    atomic(path.join(extension,'server.mjs'),`export function activate({register}){register({name:'replacement_marker',description:'Synthetic replacement',inputSchema:{type:'object'}},()=>({marker:'child'}));}`);
    await setup(replacement,prefix+'-replacement',{modules:{fuzzing:{inherit:false,source:'extensions/fuzzing',config:{}}}});
    for(const [label,dir,expected]of [['parent',parent,true],['disabled-child',disabled,false],['sibling',sibling,true],['re-enabled-grandchild',grandchild,true],['config-child',configured,true],['replaced-config',replacedConfig,true],['replaced-package',replacement,true]]){
      const cfg=path.join(dir,'.codex/config.toml');writeFileSync(cfg,readFileSync(cfg,'utf8').replace('http://core:8472',core.base));
      const native=await roles(dir),resolved=resolveWorkspace(root,dir),present=native.names.includes('fuzzing');
      const runtime=await core.contextFor(resolved.id);
      const toolNames=runtime.definitions.map(d=>d.name),isReplacement=label==='replaced-package';
      let pass=present===expected&&native.names.includes('overrideprobe')&&toolNames.includes('fuzzing_generate')===(expected&&!isReplacement);
      if(isReplacement)pass&&=native.description.includes('Child replacement marker')&&toolNames.includes('replacement_marker')&&(await runtime.handlers.get('replacement_marker').handler({})).marker==='child';
      if(['config-child','re-enabled-grandchild','replaced-config'].includes(label)){
        await assert.rejects(runtime.handlers.get('fuzzing_ffuf_start').handler({options:{}}),/Active discovery is disabled/);
      }
      report.cases.push({layout:git?'shared-git-root':'plain-folders',case:label,id:resolved.id,modules:resolved.modules.map(m=>m.id),native_roles:native.names,tools:toolNames,expected_fuzzing:expected,pass,active_discovery:expected && (resolved.selected.fuzzing?.config?.activeDiscovery ?? false)});
    }
  }
  report.pass=report.cases.every(c=>c.pass);console.log(JSON.stringify({time:report.time,pass:report.pass,cases:report.cases.map(c=>({layout:c.layout,case:c.case,pass:c.pass,native_roles:c.native_roles,tools:c.tools.length}))},null,2));
  mkdirSync('/workspaces/development/.capri/core/acceptance',{recursive:true});writeFileSync('/workspaces/development/.capri/core/acceptance/native-module-overrides.json',JSON.stringify(report,null,2));
  assert.ok(report.pass,'Native child override failed; see case inventory');
}finally{
  await core.close();
  let source=readFileSync(userConfig,'utf8');for(const entry of trust)source=source.replace(entry,'');writeFileSync(userConfig,source);
  if(existsSync(registry)){const value=json(registry);for(const id of ids)delete value[id];atomic(registry,value);}
  if(path.dirname(base)!=='/workspaces'||!path.basename(base).startsWith('override-'))throw new Error('Unexpected test cleanup path');
  rmSync(base,{recursive:true,force:true});
}
