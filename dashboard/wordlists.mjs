import {columns,terminal,showTask,disclosure} from './common.mjs';
import {vocabulary} from './vocabulary.mjs';
import {tasks} from './tasks.mjs';

const origins={generated:'Generated in this workspace',workspace:'Workspace file',internal:'Internal library',external:'External library / recorded input'};
export async function wordlists(p,{show,state={},save,selection}){
 let catalogId=state.catalogId,listing,listPage,detailPage,previewPage,current=selection||state.selectedWordlist,source=state.source||'',query=state.query||'';
 const status=p.append(p.ui.notice('Reading the workspace wordlist catalog…'));
 p.append(p.ui.row([p.button('Refresh catalog',()=>refresh(true))]));
 const filters=p.append(p.ui.row()),listArea=p.append(p.ui.section('Wordlists')),detail=p.append(p.ui.section('Wordlist details'));
 const buttons=[];
 for(const [value,label]of [['','All wordlists'],['generated','Generated here'],['workspace','Workspace files'],['internal','Internal libraries'],['external','External libraries']]){
  const button=p.button(label,async()=>{source=value;save({source});await list();});button.element.setAttribute('aria-pressed',String(value===source));buttons.push([value,button]);filters.element.append(button.element);
 }
 async function preview(item,offset=0){
  previewPage?.close();const container=document.createElement('div');container.dataset.testid='wordlist-preview';detailPage.root.querySelector('[data-testid=wordlist-preview]')?.remove();detailPage.root.append(container);
  const d=previewPage=detailPage.fork(container),notice=d.append(p.ui.notice('Preparing wordlist preview…')),editor=d.append(p.ui.codeEditor({file:item.name||'wordlist.txt',readOnly:true}));
  const args={offset,limit:100},receipt=item.source==='generated'?await d.call('fuzzing_read',{...args,name:item.name,revision:item.revision}):await d.call('fuzzing_read_file',{...args,path:item.path,...(item.sha256?{sha256:item.sha256}:{})});
  await d.watch(()=>d.call('fuzzing_read_result',{read_id:receipt.read_id}),result=>{
   if(result.error){notice.element.textContent=result.error;return;}
   if(result.ready){
    editor.load(item.name||'wordlist.txt',result.lines.join('\n'));notice.element.textContent=result.count+' words · SHA-256 '+result.sha256;
    if(result.next_offset!==null&&result.next_offset!==undefined)d.append(p.ui.row([d.button('Next wordlist page',()=>preview(item,result.next_offset))]));
   }
  },terminal);
 }
 async function describe(item){
  detailPage?.close();detail.element.replaceChildren();const d=detailPage=p.fork(detail.element);previewPage=null;current=item;save({selectedWordlist:item});
  d.append(p.ui.notice(item.name+(item.revision?' · revision '+item.revision:'')+' · '+(origins[item.source]||item.source)));
  const path=document.createElement('pre');path.textContent=item.path;d.root.append(path);
  if(item.library)d.append(p.ui.notice('Library: '+item.library));
  if(item.created_at)d.append(p.ui.notice('Created: '+item.created_at));
  if(item.count!==undefined)d.append(p.ui.notice(item.count+' words · '+item.bytes+' bytes'));
  if(item.source!=='generated')d.append(p.ui.notice('Preview shows the current file. Historical runs retain its path, not a copy of its old contents.'));
  if(item.available===false)d.append(p.ui.notice('This file is no longer available. Its historical reference is retained.',{tone:'warning'}));
  else d.append(p.ui.row([d.button('Preview wordlist',()=>preview(item)),d.button('Use in a new run',()=>show('Runs',item))]));
  const used=[...new Set([...(item.used_by||[]),item.run_id].filter(Boolean))];
  if(used.length)d.append(p.ui.notice('Used by '+used.length+' saved run'+(used.length===1?'':'s')+': '+used.join(', ')));
  if(selection&&item.available!==false){selection=null;await preview(item);}
 }
 async function list(){
  if(!catalogId)return;listPage?.close();listArea.element.replaceChildren();const child=listPage=p.fork(listArea.element);
  for(const [value,button]of buttons)button.element.setAttribute('aria-pressed',String(value===source));
  const read=async(offset=0,text=query)=>{const value=await child.call('fuzzing_catalog_result',{catalog_id:catalogId,...(source?{source}:{}),query:text,offset,limit:50});status.element.textContent=value.total+' wordlists · catalog captured '+value.captured_at;return {items:value.items||[],next_cursor:value.next_offset};};
  const first=await read();child.alive();listing=child.append(p.ui.table({columns:[...columns('name'),{key:'source',label:'Origin',format:item=>origins[item.source]},...columns('revision','count','bytes'),{key:'available',label:'File',format:item=>item.available?'Available':'Missing'}],rows:first.items,nextCursor:first.next_cursor,onSelect:item=>child.guard(()=>describe(item)),onSearch:async text=>{query=text;save({query});return read(0,text);},onNext:offset=>read(offset)}));
 }
 async function refresh(force=false){
  if(!catalogId||force){const receipt=await p.call('fuzzing_catalog');catalogId=receipt.catalog_id;save({catalogId});}
  let result;await p.watch(()=>p.call('fuzzing_catalog_result',{catalog_id:catalogId,limit:1}),value=>{result=value;status.element.textContent=value.ready?'Catalog ready':'Catalog · '+value.state;},terminal);
  p.alive();if(!result?.ready)throw Error(result?.error||'Catalog did not complete');
  await list();
  if(result.notes?.length)disclosure(p,'Library availability',d=>d.append(p.ui.table({columns:columns('path','reason'),rows:result.notes})));
 }
 if(current)await describe(current);
 await refresh();
 disclosure(p,'Generate a wordlist',async d=>d.append(await p.ui.toolForm({name:'fuzzing_generate',values:{context:{purpose:'Generate a wordlist revision from selected vocabulary'}},onResult:receipt=>d.guard(async()=>{await showTask(d,receipt,'export');await refresh(true);})})));
 disclosure(p,'Preview another file',async d=>d.append(await p.ui.toolForm({name:'fuzzing_read_file',values:{context:{purpose:'Preview an explicit wordlist file'}},onResult:receipt=>d.guard(async()=>{
  let result;await d.watch(()=>d.call('fuzzing_read_result',{read_id:receipt.read_id}),r=>result=r,terminal);if(!result.ready)throw Error(result.error||'Preview failed');
  await describe({path:result.path,name:result.path.split('/').at(-1),source:'external',sha256:result.sha256,available:true});await preview({path:result.path,name:'wordlist.txt',source:'external',sha256:result.sha256});
 })})));
 disclosure(p,'Vocabulary and provenance',vocabulary);
 disclosure(p,'Wordlist tasks',tasks);
}
