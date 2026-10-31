// Explicit live acceptance only. Bind to the operator's LAN address so both
// container Caido and host Burp can reach the same synthetic target.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [directory,host,portText='18993']=process.argv.slice(2);
if(!directory||!host)throw Error('Usage: live-fixture.mjs EVIDENCE_DIRECTORY BIND_IP [PORT]');
fs.mkdirSync(directory,{recursive:true});
const prefix='/capri-fuzzing-live-20261031/',phaseFile=path.join(directory,'fixture-phase.txt');
if(!fs.existsSync(phaseFile))fs.writeFileSync(phaseFile,'1');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture'),phase=fs.readFileSync(phaseFile,'utf8').trim();
 fs.appendFileSync(path.join(directory,'requests.jsonl'),JSON.stringify({at:new Date().toISOString(),method:req.method,path:url.pathname,query:url.search,source:req.socket.remoteAddress,agent:req.headers['user-agent'],probe:req.headers['x-capri-probe']})+'\n');
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end('Not a fixture path');return;}
 const name=url.pathname.slice(prefix.length);res.setHeader('Cache-Control','no-store');
 if(name==='health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,phase}));return;}
 if(name.startsWith('seed/')){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Saffron operations</title><h1>Saffron ledger</h1><p>Ledger export and backup functions are available. Status reports describe the service.</p><a href="'+prefix+'status">status</a>'+(phase==='2'?'<p>Cobalt archive service: archival exports are now available.</p>':''));return;}
 if(name.startsWith('slow/'))await new Promise(resolve=>setTimeout(resolve,5000));
 const known=['saffron','ledger','ledger-export','ledger-backup','status',...(phase==='2'?['cobalt','archive','cobalt-archive','archive-export']:[])];
 if(known.includes(name)){res.setHeader('content-type','application/json');res.end(JSON.stringify({fixture:true,name,phase}));return;}
 res.writeHead(404,{'content-type':'text/plain'}).end('Synthetic endpoint not found');
});
server.listen(Number(portText),host,()=>{const record={pid:process.pid,host,port:Number(portText),base:'http://'+host+':'+portText+prefix};fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
