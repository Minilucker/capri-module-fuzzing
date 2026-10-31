import {columns,showTask} from './common.mjs';
export async function tasks(p){
 let table,serial=0;const load=async kind=>{const ticket=++serial;table?.destroy();const next=await p.table('fuzzing_wordlist_tasks',kind?{kind}:{},columns('id','kind','state','created_at'),row=>{p.append(p.ui.jsonView(row));void showTask(p,row,row.kind);});if(ticket!==serial)next.destroy();else table=next;};
 p.append(p.ui.row([p.button('All wordlist tasks',()=>load()),p.button('Reads',()=>load('read')),p.button('Exports',()=>load('export'))]));await load();
}
