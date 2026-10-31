export const columns = (...keys) => keys.map(key => ({key,label:key.replaceAll('_',' ')}));
export function page(context, ui, root, catalogue) {
 const life=new AbortController(),widgets=new Set();let closed=false;
 const alive=()=>{if(closed||context.signal.aborted)throw new DOMException('View closed','AbortError');};
 const use=widget=>{if(closed){widget.destroy();alive();}widgets.add(widget);return widget;};
 const append=widget=>{use(widget);root.append(widget.element);return widget;};
 const error=e=>{if(!closed&&!context.signal.aborted&&e.name!=='AbortError')append(ui.notice(e.message,{tone:'error'}));};
 const guard=fn=>Promise.resolve().then(fn).catch(error);
 const call=async(name,args={})=>{alive();const tool=catalogue.tools.find(t=>t.name===name);if(!tool)throw Error('Tool unavailable: '+name);const value=await context.tools.call(name,tool.inputSchema.properties?.context&&!args.context?{...args,context:{purpose:'Fuzzing dashboard: '+name}}:args);alive();return value;};
 const delay=()=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);life.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,1500);life.signal.addEventListener('abort',done,{once:true});});
 const watch=(read,render,finished)=>guard(async()=>{while(!closed){const value=await read();alive();await render(value);if(finished(value))return;await delay();}});
 async function table(name,args,fields,onSelect,{search=false}={}){
  const read=async(offset=0,query)=>{const result=await call(name,{...args,offset,limit:50,...(query!==undefined?{query}:{})});return {items:result.items,next_cursor:result.next_offset};};
  const first=await read();alive();return append(ui.table({columns:fields,rows:first.items,nextCursor:first.next_cursor,onSelect:item=>guard(()=>onSelect?.(item)),onNext:(offset,{query})=>read(offset,search?query:undefined),...(search?{onSearch:query=>read(0,query)}:{})}));
 }
 const close=()=>{if(closed)return;closed=true;life.abort();for(const widget of widgets)widget.destroy();widgets.clear();root.replaceChildren();context.signal.removeEventListener('abort',close);};context.signal.addEventListener('abort',close,{once:true});
 return {context,ui,root,catalogue,alive,use,append,error,guard,call,watch,table,close,fork:root=>page({...context,signal:life.signal},ui,root,catalogue),button:(label,fn)=>use(ui.button(label,()=>guard(fn)))};
}
export const terminal = row => ['ready','completed','exited','failed','cancelled','interrupted'].includes(row.view_state||row.state);
export function showTask(p,receipt,kind){
 const box=p.append(p.ui.jsonView(receipt)),key=kind+'_id',id=receipt[key]||receipt.id;
 const tool='fuzzing_'+kind;
 p.append(p.ui.row([p.button('Request cancellation',async()=>box.setValue(await p.call(tool+'_cancel',{[key]:id})))]));
 return p.watch(()=>p.call(tool+'_result',{[key]:id}),result=>box.setValue(result),terminal);
}
