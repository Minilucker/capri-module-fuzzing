import {columns,terminal,showTask} from './common.mjs';
export async function wordlists(p,{show}){
 p.append(p.ui.notice('Generated revisions are immutable. Previewing or listing them does not start a scan.'));
 const generate=await p.ui.toolForm({name:'fuzzing_generate',values:{context:{purpose:'Generate a wordlist revision from selected vocabulary'}},onResult:receipt=>void showTask(p,receipt,'export')});p.append(generate);
 p.append(await p.ui.toolForm({name:'fuzzing_read_file',values:{context:{purpose:'Preview an explicit container wordlist file'}},onResult:receipt=>p.guard(()=>preview(receipt))}));
 const previewArea=p.append(p.ui.section('Wordlist preview'));let previewPage;
 async function preview(receipt){previewPage?.close();const d=previewPage=p.fork(previewArea.element),status=d.append(p.ui.jsonView(receipt)),editor=d.append(p.ui.codeEditor({file:'wordlist.txt',readOnly:true}));
  await d.watch(()=>d.call('fuzzing_read_result',{read_id:receipt.read_id}),result=>{status.setValue(result);if(result.ready){editor.load('wordlist.txt',result.lines.join('\n'));if(result.next_offset!==null&&result.next_offset!==undefined)d.append(p.ui.row([d.button('Next wordlist page',async()=>{const next=await d.call('fuzzing_read_file',{path:result.path,sha256:result.sha256,offset:result.next_offset,limit:100});return preview(next);})]));}},terminal);
 }
 let listing;const refresh=async()=>{listing?.destroy();listing=await p.table('fuzzing_list',{},columns('name','revision','count','bytes'),async item=>{
  p.append(p.ui.jsonView(item));p.append(p.ui.row([p.button('Use this revision in a run',()=>show('Runs',item)),p.button('Preview revision',async()=>preview(await p.call('fuzzing_read',{name:item.name,revision:item.revision})))]));
 });};p.append(p.ui.row([p.button('Refresh wordlists',refresh)]));await refresh();
}
