import {frameworkImport,frameworkRoot} from './framework.mjs';
import http from 'node:http';
import { writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const inContainer=existsSync('/run/secrets/core-token'),root=frameworkRoot;
const output=inContainer?'/workspaces/development/.capri/core/acceptance/agent-fixture-hits.json':path.join(root,'workspace/development/.capri/core/acceptance/agent-fixture-burp-hits.json');
mkdirSync(path.dirname(output),{recursive:true});const hits=[];
const server=http.createServer((req,res)=>{
  hits.push(req.url);writeFileSync(output,JSON.stringify(hits));
  const known=['/agent-fuzzing/catalog','/agent-fuzzing/warehouses','/agent-fuzzing/products'];
  res.writeHead(known.includes(req.url)?200:404,{'content-type':'text/plain'});
  res.end(known.includes(req.url)?'Warehouse inventory product catalogue. The API uses plural resource names.':'missing');
});
server.listen(8479,inContainer?'0.0.0.0':'127.0.0.1',()=>console.log('Synthetic fuzzing fixture listening on port 8479'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
