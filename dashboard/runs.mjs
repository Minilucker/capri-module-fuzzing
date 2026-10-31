import {columns,terminal} from './common.mjs';
const raw=(p,label,value)=>{const details=document.createElement('details'),summary=document.createElement('summary'),json=p.use(p.ui.jsonView(value));summary.textContent=label;details.append(summary,json.element);p.root.append(details);return json;};
export async function runs(p,{selection}={}){
 const detail=p.use(p.ui.section('Run details')),composer=p.use(p.ui.section('New run'));composer.element.hidden=!selection;
 p.append(p.ui.row([p.button('New run',()=>{composer.element.hidden=!composer.element.hidden;}),p.button('Refresh runs',()=>refresh())]));p.root.append(composer.element);
 let form,detailPage;
 const describe=async row=>{
  detailPage?.close();const d=detailPage=p.fork(detail.element),status=d.append(p.ui.notice('Run '+row.id+' · '+row.state)),data=raw(d,'Run metadata',row);
  void d.watch(()=>d.call('fuzz_status',{id:row.id}),r=>{status.element.textContent='Run '+r.id+' · '+r.state;data.setValue(r);},terminal);
  function follow(result){
   d.alive();if(!result.view_id)return;
   const area=d.append(p.ui.section('Result view')),v=d.fork(area.element),progress=v.append(p.ui.notice('Preparing saved results…')),json=raw(v,'Result metadata',result);
   v.append(v.button('Cancel result view',()=>v.call('fuzz_cancel',{view_id:result.view_id})));
   void v.watch(()=>v.call('fuzz_result',{view_id:result.view_id}),r=>{
    json.setValue(r);progress.element.textContent=r.ready?(r.parsed===false?r.reason:`${r.matched_total??r.total??0} matching records · ${r.view||'standard'} view`):'Result view · '+r.view_state;
    if(r.ready&&r.items?.length)v.append(p.ui.table({columns:columns(...Object.keys(r.items[0])),rows:r.items}));
    if(r.ready&&r.summary){const rows=Object.entries(r.summary.status_counts||{}).map(([status,count])=>({status,count}));v.append(p.ui.table({columns:columns('status','count'),rows}));}
    if(r.ready&&r.table)v.append(p.ui.codeEditor({file:'results.md',value:r.table,readOnly:true}));
   },r=>r.ready||terminal(r));
  }
  const resultForm=await p.ui.toolForm({name:'fuzz_result',values:{id:row.id,context:{purpose:'Inspect saved fuzzing results'}},onResult:result=>d.guard(()=>follow(result))});d.use(resultForm);resultForm.element.hidden=true;
  d.append(p.ui.row(['summary','compact','table'].map(view=>d.button(view==='compact'?'Matches':view[0].toUpperCase()+view.slice(1),async()=>follow(await d.call('fuzz_result',{id:row.id,view}))))));
  d.append(p.ui.row([d.button('Advanced result filters',()=>{resultForm.element.hidden=!resultForm.element.hidden;}),d.button('Request run cancellation',async()=>data.setValue(await d.call('fuzz_cancel',{id:row.id})))]));d.root.append(resultForm.element);
 };
 form=p.use(await p.ui.toolForm({name:'fuzz_run',values:{options:{},...(selection?{wordlist:{name:selection.name,revision:selection.revision}}:{}),context:{purpose:'Start focused discovery from Fuzzing dashboard'}},fields:{'options.url':{placeholder:'https://target.example/FUZZ'},'wordlist.revision':{note:'Choose an exact completed revision; no implicit latest revision.'}},onResult:receipt=>p.guard(()=>describe(receipt))}));composer.element.append(form.element);
 const picker=p.use(p.ui.section('Generated revisions'));picker.element.hidden=true;let pickerPage;
 const chooser=p.button('Choose generated revision',async()=>{picker.element.hidden=false;pickerPage?.close();const child=pickerPage=p.fork(picker.element);await child.table('fuzzing_list',{},columns('name','revision','count'),item=>{const args=form.getValue();args.options||={};delete args.options.wordlists;delete args.options.input_command;args.wordlist={name:item.name,revision:item.revision};form.setValue(args);picker.element.hidden=true;});});composer.element.prepend(chooser.element,picker.element);
 let listing,serial=0;async function refresh(){const ticket=++serial;listing?.destroy();const next=await p.table('fuzz_list',{},columns('id','state','created_at'),describe);if(ticket!==serial)next.destroy();else listing=next;}
 await refresh();p.root.append(detail.element);
}
