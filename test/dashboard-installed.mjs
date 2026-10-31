// Explicit module-owned installed UI check. Reads retained runs and wordlists;
// starts only local result/metadata reads, never ffuf, proxy calls or settings edits.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';import puppeteer from 'puppeteer-core';
const core=process.env.CAPRI_FRAMEWORK;if(!core)throw Error('Set CAPRI_FRAMEWORK');const from=file=>import(pathToFileURL(path.join(core,file)).href);
const {Client}=await from('node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'),{createInstalledDashboardTransport,readInstalledDashboardUi}=await from('test/installed-dashboard-client.mjs'),{findChrome}=await from('src/browser/host.mjs');
const spec=JSON.parse(fs.readFileSync(path.join(core,'.capri/capri-plugin/plugin/.mcp.json'))).mcpServers.capri_dashboard,client=new Client({name:'fuzzing-installed-ui-read-check',version:'1'}),calls=[],errors=[];let server,browser;
const safeTools=new Set(['fuzz_list','fuzz_status','fuzz_result','fuzzing_run_inputs','fuzzing_catalog','fuzzing_catalog_result','fuzzing_read','fuzzing_read_file','fuzzing_read_result']);
const safe=new Set(['dashboard_open','dashboard_workspaces_read','dashboard_sessions_read','dashboard_components_catalog','dashboard_components_tools','dashboard_tools_list','dashboard_modules_list','dashboard_settings_read','dashboard_browser_read','dashboard_tools_providers']);
async function rpc(request){
 if(!safe.has(request.name)&&request.name!=='dashboard_components_tool')throw Error('Read-only check rejects '+request.name);
 if(request.name==='dashboard_components_tool'&&!safeTools.has(request.arguments.tool))throw Error('Read-only check rejects '+request.arguments.tool);
 const result=await client.callTool(request);calls.push(request.name==='dashboard_components_tool'?request.arguments.tool:request.name);
 if(result.isError)throw Error(result.content?.find(x=>x.type==='text')?.text||'MCP error');return result;
}
try{
 await client.connect(createInstalledDashboardTransport(spec));const resource=await readInstalledDashboardUi(client),html=resource.contents.find(x=>x.text)?.text;assert.ok(html);
 const catalog=(await rpc({name:'dashboard_components_catalog',arguments:{scope:'workspace',workspace_id:'development'}})).structuredContent,components=catalog.components.filter(x=>x.module_id==='fuzzing');assert.deepEqual(components.map(c=>c.component_id),['runs','wordlists']);for(const c of components)assert.ok(html.includes(c.key),'Current applied page absent from served bundle');
 const opened=await rpc({name:'dashboard_open',arguments:{}});
 const source="import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';const frame=document.querySelector('iframe'),bridge=new AppBridge(null,{name:'Module-owned installed UI check',version:'1'},{serverTools:{}},{hostContext:{theme:'dark',displayMode:'inline'}});bridge.oncalltool=async p=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify(p)});if(!r.ok)throw Error(await r.text());return r.json();};bridge.oninitialized=async()=>{await bridge.sendToolInput({arguments:{}});await bridge.sendToolResult(await(await fetch('/opened')).json());};await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.src='/panel';";
 const bundle=(await build({stdin:{contents:source,resolveDir:core},nodePaths:[path.join(core,'src/dashboard/node_modules')],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 server=http.createServer(async(req,res)=>{try{
  if(req.url==='/rpc'){let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');res.end(JSON.stringify(await rpc(JSON.parse(body))));}
  else if(req.url==='/opened'){res.setHeader('content-type','application/json');res.end(JSON.stringify(opened));}
  else if(req.url==='/host.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}
  else{res.setHeader('content-type','text/html');res.end(req.url==='/panel'?html:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><iframe style="width:100%;height:100vh;border:0"></iframe><script type="module" src="/host.js"></script>');}
 }catch(e){res.statusCode=500;res.end(e.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await puppeteer.launch({executablePath:findChrome(),headless:true});const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1200,height:1000});await page.goto('http://127.0.0.1:'+server.address().port);
 const frame=await(await page.waitForSelector('iframe')).contentFrame();await frame.waitForFunction(()=>!document.querySelector('#workspace-picker').disabled);await frame.select('#workspace-picker','development');
 await frame.waitForFunction(()=>[...document.querySelectorAll('.navigation-module-toggle')].some(x=>x.textContent==='Fuzzing'));
 await frame.$eval('.navigation-module-toggle',n=>{if(n.getAttribute('aria-expanded')!=='true')n.click();});
 const key=components.find(c=>c.component_id==='runs').key;await frame.click('[data-section="module-'+key.replaceAll(':','-')+'"]');
 await frame.waitForFunction(()=>document.querySelector('#workspace-components .component-host')?.shadowRoot.querySelector('tbody button'));
 await frame.$eval('#workspace-components .component-host',h=>h.shadowRoot.querySelector('tbody button').click());
 await frame.waitForFunction(()=>document.querySelector('#workspace-components .component-host')?.shadowRoot.querySelector('[data-testid=run-command]'));
 const command=await frame.$eval('#workspace-components .component-host',h=>h.shadowRoot.querySelector('[data-testid=run-command]').textContent);assert.ok(command.includes('ffuf'));
 await frame.waitForFunction(()=>[...document.querySelector('#workspace-components .component-host').shadowRoot.querySelectorAll('button')].some(x=>x.textContent.startsWith('Open wordlist · ')));
 await frame.$eval('#workspace-components .component-host',h=>[...h.shadowRoot.querySelectorAll('button')].find(x=>x.textContent.startsWith('Open wordlist · ')).click());
 await frame.waitForFunction(()=>document.querySelector('#workspace-components .component-host')?.dataset.component.endsWith(':wordlists')&&document.querySelector('#workspace-components .component-detail [role=status]').dataset.state==='ready');
 assert.equal(await frame.$eval('[data-section="module-'+components.find(c=>c.component_id==='wordlists').key.replaceAll(':','-')+'"]',n=>n.getAttribute('aria-current')),'page');
 fs.mkdirSync('.capri/acceptance',{recursive:true});await page.screenshot({path:'.capri/acceptance/fuzzing-installed-wordlists-'+process.platform+'.png',fullPage:true});
 // Disclosure toggles preserve the selected page; workspace changes remove the module family.
 await frame.$eval('.navigation-module-toggle',n=>n.click());assert.equal(await frame.$eval('.navigation-module-pages',n=>n.hidden),true);
 await frame.select('#workspace-picker','');await frame.waitForFunction(()=>document.querySelectorAll('.navigation-module-toggle').length===0);
 assert.deepEqual(errors,[]);const report={pass:true,platform:process.platform,kind:'Installed host MCP and real HTML in an AppBridge test host; not native Desktop clicking',checks:['applied runs/wordlists bundle','collapsible module family','recorded command','run-to-wordlist navigation','selected sidebar child','scope removal'],calls};fs.writeFileSync('.capri/acceptance/fuzzing-installed-ui-'+process.platform+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await client.close();}
