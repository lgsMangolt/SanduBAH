import {createLifecycleEditor} from './product-lifecycle.mjs';
export function createProjectDock({api,notify}){
  const main=document.getElementById('main-content'),body=document.createElement('div');body.className='workbench-body';main.before(body);body.append(main);
  const dock=document.createElement('aside');dock.className='project-dock';dock.id='project-dock';dock.hidden=true;dock.setAttribute('aria-label','Prévia do projeto');body.append(dock);
  const toggle=document.createElement('button');toggle.type='button';toggle.id='preview-toggle';toggle.className='button subtle';toggle.textContent='Prévia do projeto';toggle.disabled=true;toggle.onclick=()=>{dock.hidden=!dock.hidden;if(!dock.hidden)load();};document.querySelector('.topbar-actions').prepend(toggle);
  const heading=document.createElement('header'),title=document.createElement('strong');title.textContent='Seu projeto, acontecendo';const close=document.createElement('button');close.type='button';close.className='button subtle';close.textContent='Recolher';close.onclick=()=>{dock.hidden=true;};heading.append(title,close);
  const tabs=document.createElement('nav');tabs.className='section-tabs';const stage=document.createElement('div');stage.className='project-preview-stage';const files=document.createElement('select');files.setAttribute('aria-label','Arquivo do projeto');const code=document.createElement('pre');code.className='project-code';const frame=document.createElement('iframe');frame.title='Prévia isolada do projeto';frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';const progress=document.createElement('div');progress.className='project-dock-progress';const status=document.createElement('p');status.className='qwen-note';status.setAttribute('role','status');let projectId='',view='preview',snapshot=null,request=0,timer;
  const render=()=>{frame.hidden=view!=='preview';code.hidden=files.hidden=view!=='files';progress.hidden=view!=='progress';for(const button of tabs.querySelectorAll('[data-dock-tab]'))button.classList.toggle('active',button.dataset.dockTab===view);};
  for(const [id,label]of [['preview','Prévia'],['files','Arquivos'],['progress','Etapas']]){const button=document.createElement('button');button.type='button';button.className='section-tab';button.textContent=label;button.dataset.dockTab=id;button.onclick=()=>{view=id;render();};tabs.append(button);}
  let signature='';
  window.addEventListener('message',async event=>{
    if(event.source!==frame.contentWindow||event.origin!=='null'||!projectId||!frame.src.startsWith(`sandubah-preview://${projectId}/`))return;
    const message=event.data;if(!message||message.type!=='sandubah:preview-data'||typeof message.requestId!=='string'||message.requestId.length>80||!['load','save'].includes(message.action))return;
    const selectedProject=projectId,revision=request,source=event.source;
    try{
      const result=await api.previewData({id:selectedProject,action:message.action,revision:message.revision,value:message.value});
      if(selectedProject===projectId&&revision===request)source.postMessage({type:'sandubah:preview-data-result',requestId:message.requestId,ok:true,result},'*');
    }catch(error){if(selectedProject===projectId&&revision===request)source.postMessage({type:'sandubah:preview-data-result',requestId:message.requestId,ok:false,error:error.message},'*');}
  });
  const refresh=document.createElement('button');refresh.type='button';refresh.className='button subtle';refresh.textContent='Atualizar prévia';refresh.onclick=()=>load(true);tabs.append(refresh);stage.append(frame,files,code,progress);dock.append(heading,tabs,status,stage);
  async function file(){if(!files.value)return;try{code.textContent=(await api.previewFile({id:projectId,path:files.value})).content;}catch(error){code.textContent=error.message;}}
  files.onchange=file;
  async function load(force=false){
    if(!projectId)return;const revision=++request,selectedProject=projectId;
    try{
      const loaded=await api.preview(selectedProject);if(revision!==request||selectedProject!==projectId)return;
      snapshot=loaded;title.textContent=loaded.name;status.textContent=loaded.entry?'Prévia dos arquivos locais · isolada do aplicativo':'A prévia aparece assim que o agente criar index.html. Você pode acompanhar os arquivos e etapas.';
      const selected=files.value;files.replaceChildren();for(const item of loaded.files)files.add(new Option(item.path,item.path));if([...files.options].some(option=>option.value===selected))files.value=selected;
      await file();if(revision!==request||selectedProject!==projectId)return;
      const nextSignature=JSON.stringify([selectedProject,loaded.url,loaded.files]);
      if(force||signature!==nextSignature){signature=nextSignature;if(loaded.url)frame.src=loaded.url+'?v='+Date.now();else frame.removeAttribute('src');}
      progress.replaceChildren();
      if(loaded.lifecycle)progress.append(createLifecycleEditor({document:loaded.lifecycle,projectId:'harness:'+selectedProject,api,notify,onSaved:()=>load()}));
      const missionsTitle=document.createElement('h3');missionsTitle.textContent='Missões · execução separada do produto';progress.append(missionsTitle);
      for(const mission of loaded.missions){const row=document.createElement('p');row.textContent=`${{pending:'◷ Na fila',running:'● Trabalhando',done:'✓ Concluída',error:'Revisar falha',unknown:'Resultado não confirmado'}[mission.status]||mission.status} · ${mission.title}`;progress.append(row);}render();
    }catch(error){if(revision===request)status.textContent=error.message;}
  }
  function select(id){const next=id||'',changed=next!==projectId;projectId=next;toggle.disabled=!projectId;dock.hidden=!projectId;if(changed){request++;signature='';frame.removeAttribute('src');code.textContent='';if(projectId)load();}return projectId;}
  window.addEventListener('sandubah:project-selected',event=>select(event.detail.id));
  api.onProject(project=>{if(project.id===projectId){clearTimeout(timer);timer=setTimeout(load,200);}});
  api.onWorker(event=>{if(event.projectId===projectId&&event.event?.type==='item.completed'){clearTimeout(timer);timer=setTimeout(load,300);}});
  return {select,show(view){if(!['planner','harness'].includes(view))dock.hidden=true;else if(projectId)dock.hidden=false;}};
}
