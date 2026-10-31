import {columns} from './common.mjs';
export async function vocabulary(p){
 p.append(p.ui.notice('Observed content and agent-inferred candidates retain separate provenance. This page does not perform inference.'));
 let table,serial=0;const load=async kind=>{const ticket=++serial;table?.destroy();const next=await p.table('fuzzing_words',{kind},columns('word','kind','origin','batch'),async item=>p.append(p.ui.jsonView(await p.call('fuzzing_batch',{id:item.batch}))),{search:true});if(ticket!==serial)next.destroy();else table=next;};
 p.append(p.ui.row(['all','observed','inferred'].map(kind=>p.button(kind==='all'?'All vocabulary':kind,()=>load(kind)))));await load('all');
 p.append(p.ui.section('Source batches'));await p.table('fuzzing_batches',{},columns('id','kind','submitted_count','created_at'),async item=>p.append(p.ui.jsonView(await p.call('fuzzing_batch',{id:item.id}))),{search:true});
}
