import {dashboard} from '@capri/sdk/dashboard';
import {page} from './common.mjs';
import {runs} from './runs.mjs';
import {wordlists} from './wordlists.mjs';
import {vocabulary} from './vocabulary.mjs';
import {tasks} from './tasks.mjs';
import {settings} from './settings.mjs';

export async function mount(context){
 const ui=dashboard(context),catalogue=await context.tools.list();context.signal.throwIfAborted();
 const body=document.createElement('div'),navigation=ui.row(),label=ui.notice('Workspace '+context.workspace.id+' · Fuzzing '+context.module.version);
 navigation.element.setAttribute('role','tablist');navigation.element.setAttribute('aria-label','Fuzzing sections');
 const views={Runs:runs,Wordlists:wordlists,Vocabulary:vocabulary,Tasks:tasks,Settings:settings},buttons=[];let current,serial=0,disposed=false;
 const show=(name,selection)=>{
  if(disposed)return;const ticket=++serial;current?.close();body.replaceChildren();current=page(context,ui,body,catalogue);
  for(const [title,button]of buttons){button.element.setAttribute('aria-selected',String(title===name));button.element.tabIndex=title===name?0:-1;}
  const target=current;void target.guard(async()=>{await views[name](target,{show,selection});if(ticket!==serial)target.close();});
 };
 for(const name of Object.keys(views)){const button=ui.button(name,()=>show(name));button.element.setAttribute('role','tab');buttons.push([name,button]);navigation.element.append(button.element);}
 navigation.element.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=buttons.findIndex(([,b])=>b.element===context.root.getRootNode().activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length;buttons[next][1].element.click();buttons[next][1].element.focus();});
 context.root.append(label.element,navigation.element,body);show('Runs');
 return ()=>{disposed=true;serial++;current?.close();label.destroy();navigation.destroy();for(const [,b]of buttons)b.destroy();body.remove();};
}
