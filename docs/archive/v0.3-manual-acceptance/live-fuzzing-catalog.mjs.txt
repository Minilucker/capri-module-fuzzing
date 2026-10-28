import {frameworkImport,frameworkRoot} from './framework.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {createManagementClient}=await frameworkImport("src/management/client.mjs");
const root=fileURLToPath(new URL('../',import.meta.url)),local=path.join(root,'.capri'),settings=JSON.parse(fs.readFileSync(path.join(local,'settings.json'))),token=fs.readFileSync(path.join(local,'core-token'),'utf8').trim();
const url='http://127.0.0.1:'+settings.apiPort,client=createManagementClient({url,token}),inventory=await client.call('list');
const fuzzing=inventory.items.find(m=>m.id==='fuzzing');assert.ok(fuzzing);assert.equal(fuzzing.version,'0.3.0');assert.equal(fuzzing.key,'catalog:fuzzing');assert.ok(!inventory.items.some(m=>m.id==='wordlister'));
const states=[];
for(const id of ['pentest','bug-bounty','development','test']){
 const response=await fetch(url+'/mcp/workspaces/'+id,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 assert.equal(response.status,200);const body=await response.json();assert.ok(!body.error,JSON.stringify(body.error));const names=body.result.tools.map(t=>t.name);
 assert.ok(names.includes('http_request'));assert.ok(names.includes('inbox_list'));assert.ok(!names.some(n=>/^(?:wordlist|wordlister|fuzzing)_/.test(n)));
 states.push({workspace:id,fuzzing_enabled:false,fuzzing_tools_exposed:false,core_http_and_inbox:true});
}
console.log(JSON.stringify({at:new Date().toISOString(),pass:true,catalog_id:fuzzing.id,version:fuzzing.version,old_catalog_absent:true,workspaces:states},null,2));
