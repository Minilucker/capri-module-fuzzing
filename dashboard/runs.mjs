import {columns,terminal,resultPage,disclosure} from './common.mjs';
import {resultFilters,resultFields} from '../src/results-contract.mjs';
import {settings} from './settings.mjs';

export const shellCommand=command=>command?[command.executable,...command.argv].map(value=>/^[a-zA-Z0-9_@%+=:,./-]+$/.test(value)?value:"'"+value.replaceAll("'","'\\''")+"'").join(' '):null;
export async function runs(p,{show,state={},save,selection}={}){
 const queries={...state.runQueries};let selectedId=state.selectedRun,filterForm,detailPage,listing;
 const composer=p.append(p.ui.section('New run'));composer.element.hidden=!selection;
 const values={options:{},context:{purpose:'Start focused discovery from Fuzzing dashboard'}};
 if(selection?.source==='generated'||selection?.revision)values.wordlist={name:selection.name,revision:selection.revision};else if(selection?.path)values.options.wordlists=[selection.path];
 const form=p.use(await p.ui.toolForm({name:'fuzz_run',values,fields:{'options.url':{placeholder:'https://target.example/FUZZ'}},onResult:receipt=>p.guard(async()=>{await refresh();await describe(receipt);})}));composer.element.append(form.element);
 p.append(p.ui.row([p.button('New run',()=>{composer.element.hidden=!composer.element.hidden;}),p.button('Refresh runs',()=>refresh())]));
 const listArea=p.append(p.ui.section('Run history')),detail=p.append(p.ui.section('Run details'));
 const persist=()=>{if(selectedId&&filterForm){try{if(!filterForm.validate().length)queries[selectedId]=filterForm.getValue();}catch{}}save({runQueries:queries,selectedRun:selectedId});};
 async function describe(row){
  persist();detailPage?.close();detail.element.replaceChildren();composer.element.hidden=true;selectedId=row.id;save({selectedRun:selectedId});
  const d=detailPage=p.fork(detail.element),status=d.append(p.ui.notice('Run '+row.id+' · '+row.state));filterForm=null;
  const inputs=await d.call('fuzzing_run_inputs',{id:row.id});d.alive();
  const command=document.createElement('pre');command.dataset.testid='run-command';command.textContent=shellCommand(inputs.command)||'No process invocation was recorded for this run.';d.root.append(command);
  if(inputs.command?.cwd)d.append(p.ui.notice('Working directory: '+inputs.command.cwd));
  for(const input of inputs.inputs){
   const label=input.source==='generated'?input.name+' · revision '+input.revision:input.path||'Standard input';
   d.append(p.ui.notice('Wordlist: '+label+' · marker '+input.keyword+(input.available===false?' · file unavailable':'')));
   if(input.path)d.append(p.ui.row([d.button('Open wordlist · '+(input.name||input.keyword),()=>{persist();return show('Wordlists',input);})]));
  }
  if(inputs.input_command)d.append(p.ui.notice('Input supplied by command: '+inputs.input_command));
  if(!inputs.inputs.length&&!inputs.input_command)d.append(p.ui.notice('No file wordlist was recorded.'));
  const results=d.append(p.ui.section('Saved results'));let resultView;
  async function display(query){
   resultView?.close();results.element.replaceChildren();const v=resultView=d.fork(results.element);v.append(p.ui.notice('Reading saved results…'));
   const result=await resultPage(v,{...query,id:row.id});v.alive();v.root.replaceChildren();
   if(!result.ready||result.parsed===false){v.append(p.ui.notice(result.reason||result.error||'No completed result artifact is available yet.'));return;}
   v.append(p.ui.notice((result.matched_total??result.total??0)+' matching results · '+query.view));
   if(result.items?.length){const fields=query.fields?.length?query.fields:Object.keys(result.items[0]);v.append(p.ui.table({columns:fields.map(key=>({key,format:item=>typeof item[key]==='object'?JSON.stringify(item[key]):String(item[key]??'')})),rows:result.items,nextCursor:result.next_cursor??result.next_offset,onNext:async cursor=>{
    const page=await resultPage(v,{...query,id:row.id,...(typeof cursor==='string'?{cursor}:{offset:cursor})});return {items:page.items||[],next_cursor:page.next_cursor??page.next_offset};
   }}));}else if(query.view!=='summary')v.append(p.ui.notice('No results match these filters.'));
   if(result.summary)v.append(p.ui.table({columns:columns('status','count'),rows:Object.entries(result.summary.status_counts||{}).map(([status,count])=>({status,count}))}));
   if(result.table)v.append(p.ui.codeEditor({file:'results.md',value:result.table,readOnly:true}));
  }
  filterForm=d.use(p.ui.form({name:'run_result_filters',schema:{type:'object',additionalProperties:false,properties:{view:{enum:['compact','standard','summary','table']},filters:resultFilters,fields:{type:'array',items:{enum:resultFields},uniqueItems:true,minItems:1},limit:p.catalogue.tools.find(t=>t.name==='fuzz_result').inputSchema.properties.limit},required:['view']},values:queries[row.id]||{view:'compact',limit:100},fields:{view:{label:'Result display'},'filters.status':{label:'HTTP status codes',placeholder:'200, 301'},'filters.url_contains':{label:'URL contains',placeholder:'/admin'},'filters.min_bytes':{label:'Minimum response bytes'},'filters.max_bytes':{label:'Maximum response bytes'}},submitLabel:'Apply filters to this run',onSubmit:async query=>{queries[row.id]=query;save({runQueries:queries});await display(query);}}));
  const filterBox=document.createElement('details'),filterLabel=document.createElement('summary');filterLabel.textContent='Filters and display · saved separately for this run';filterBox.append(filterLabel,filterForm.element);d.root.insertBefore(filterBox,results.element);
  d.append(p.ui.row([d.button('Reset this run’s filters',async()=>{const query={view:'compact',limit:100};filterForm.setValue(query);queries[row.id]=query;save({runQueries:queries});await display(query);}),d.button('Request run cancellation',()=>d.call('fuzz_cancel',{id:row.id}))]));
  let prior=row.state;void d.watch(()=>d.call('fuzz_status',{id:row.id}),async r=>{status.element.textContent='Run '+r.id+' · '+r.state;if(prior!==r.state&&terminal(r))await display(queries[row.id]||{view:'compact',limit:100});prior=r.state;},terminal);
  await display(queries[row.id]||{view:'compact',limit:100});
 }
 async function refresh(){listing?.close();listArea.element.replaceChildren();const child=listing=p.fork(listArea.element);await child.table('fuzz_list',{},[...columns('id','state','created_at'),{key:'target',label:'Target',format:row=>row.effective_options?.url||'—'}],describe);}
 await refresh();if(selectedId&&!selection)await describe(await p.call('fuzz_status',{id:selectedId}));
 disclosure(p,'Fuzzing settings',settings);
}
