import {dashboard} from '@capri/sdk/dashboard';
import {page} from './common.mjs';
import {runs} from './runs.mjs';
import {wordlists} from './wordlists.mjs';

export async function mount(context){
 if(!context.navigation)throw Error('Rebuild Capri’s dashboard to enable module sidebar navigation.');
 const ui=dashboard(context),catalogue=await context.tools.list();context.signal.throwIfAborted();
 const style=document.createElement('style');style.textContent='.fuzzing-page{display:grid;gap:18px;min-width:0}.fuzzing-page pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 var(--capri-mono);padding:14px;border:1px solid var(--capri-border);border-radius:12px}.fuzzing-page details{border:1px solid var(--capri-border);border-radius:12px;padding:14px}.fuzzing-page summary{cursor:pointer;color:var(--capri-muted)}.fuzzing-page details>div{display:grid;gap:14px;margin-top:14px}.fuzzing-page h3{margin:0}.fuzzing-page .sdk-section{gap:14px}.fuzzing-page .sdk-table-scroll{max-width:100%}';
 const body=document.createElement('div');body.className='fuzzing-page';context.root.append(style,body);
 const current=page(context,ui,body,catalogue),state=context.navigation.getState();
 const show=(name,selection)=>context.navigation.open(name.toLowerCase(),selection);
 const save=patch=>context.navigation.setState({...context.navigation.getState(),...patch});
 const view=context.component.id==='wordlists'?wordlists:runs;
 try{await view(current,{show,state,save,selection:state.selection});save({selection:null});}catch(error){current.close();style.remove();throw error;}
 return ()=>{current.close();style.remove();body.remove();};
}
