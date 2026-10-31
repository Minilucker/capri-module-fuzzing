export async function settings(p){
 const management=p.context.management,inventory=await management.call('modules','list',{});p.alive();
 const source=inventory.items.find(m=>m.id===p.context.module.id&&m.workspaces.some(w=>w.id===p.context.workspace.id&&w.enabled));if(!source)throw Error('Applied module source is unavailable');
 const configuration=await management.call('modules','configuration',{key:source.key,workspace_id:p.context.workspace.id});p.alive();
 p.append(p.ui.notice('These edits affect this workspace and inheriting descendants. Omitted local fields inherit parent values. Apply requires a reviewed preview.'));
 p.append(p.ui.section('Applied and inherited settings',[p.use(p.ui.jsonView(configuration))]));
 async function preview(config){
  const receipt=await management.call('modules','plan',{request:{operation:'activation',key:source.key,workspace_id:p.context.workspace.id,enabled:true,config}});p.alive();const display=p.append(p.ui.jsonView(receipt));
  await p.watch(()=>management.call('modules','job',{id:receipt.id}),row=>{display.setValue(row);if(row.state==='preview_ready')p.append(p.ui.row([p.button('Confirm and apply this preview',async()=>{
   const change=await management.call('modules','commit',{id:row.id,revision:row.preview.revision,confirm:true});p.alive();display.setValue(change);
   void p.watch(()=>management.call('modules','job',{id:change.id}),result=>{display.setValue(result);if(result.state==='applied')p.append(p.ui.notice('Applied. Reopen the workspace view to load its new generation.'));},r=>['applied','failed','apply_failed','interrupted','pending_installation','apply_pending'].includes(r.state));
  })]));},r=>['preview_ready','failed','interrupted'].includes(r.state));
 }
 p.append(p.ui.form({name:'fuzzing_configuration',schema:configuration.schema,values:configuration.local,fields:{activeDiscovery:{label:'Allow autonomous discovery'},ffufDefaults:{label:'Defaults for omitted ffuf options',note:'An input wordlist is always explicit.'}},submitLabel:'Preview workspace settings',onSubmit:preview}));
 p.append(p.ui.row([p.button('Preview clearing local overrides',()=>preview({}))]));
 p.append(p.ui.notice('Prompt and skill source files are edited in the existing Modules source editor. Such source edits are global to that package; they are not workspace preferences.'));
}
