function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}

import {createMemoryBars} from './memory.mjs';

export function createModelCenter({api,notify,onSelect,onUpdate,onMemory=()=>{}}){
  createMemoryBars(api,onMemory);
  const byId=id=>document.getElementById(id);
  let snapshot={models:[],tasks:[]},session={busy:false,history:[]},progress='';
  const labels={queued:'Na fila',running:'Em execução',done:'Concluída',error:'Precisa de atenção',cancelled:'Cancelada'};
  async function attempt(operation){try{return await operation();}catch(error){notify(error.message,true);}}
  async function selectModel(id){return attempt(async()=>{snapshot=await api.modelsSelect(id);renderModels();renderAvailability();onSelect(snapshot.models.find(model=>model.id===id));});}
  function renderModels(){
    const container=byId('model-cards');
    const expanded=new Set([...container.querySelectorAll('details[open]')].map(node=>node.dataset.model));
    container.replaceChildren();
    for(const model of snapshot.models){
      const card=element('article','model-card');card.dataset.model=model.id;
      if(snapshot.selected===model.id)card.classList.add('selected');
      const top=element('div','model-card-top');
      const select=element('button','model-select',`${snapshot.selected===model.id?'●':'○'} ${model.name}`);
      select.type='button';select.setAttribute('aria-pressed',String(snapshot.selected===model.id));select.disabled=session.busy||!model.supported;
      select.addEventListener('click',()=>selectModel(model.id));
      const tier=element('span','model-tier',model.tier);top.append(select,tier);card.append(top);
      card.append(element('p','model-state',!model.supported?'Incompatível com este perfil':model.ready?'Pronto para conversar':model.installed?'Instalado · validação pendente':model.downloaded?'Baixado · preparação pendente':'Ainda não instalado'));
      const use=element('button',`button model-use${model.ready?' primary':''}`,!model.supported?'Indisponível neste PC':snapshot.selected===model.id?'Selecionado':model.ready?'Usar no planejador':'Selecionar');
      use.type='button';use.setAttribute('aria-label',`Usar ${model.name} no planejador`);use.disabled=session.busy||!model.supported||snapshot.selected===model.id;
      use.addEventListener('click',()=>selectModel(model.id));card.append(use);
      const info=element('details','model-info');info.dataset.model=model.id;info.open=expanded.has(model.id);
      const summary=element('summary','','ⓘ Info · memória e fonte');summary.setAttribute('aria-label',`Info sobre ${model.name}`);info.append(summary);
      for(const [label,value] of [['VRAM',model.vram],['RAM',model.ram],['Disco',model.disk]]){
        const row=element('p');row.append(element('strong','',`${label}: `),document.createTextNode(value));info.append(row);
      }
      info.append(element('p','',model.description));
      const link=element('a','model-source','Página oficial ↗');link.href=model.url;link.addEventListener('click',event=>{event.preventDefault();attempt(()=>api.modelsLink(model.id));});info.append(link);card.append(info);
      const action=element('button','button model-maintenance',!model.supported?'Download indisponível neste PC':model.ready?'Repetir testes':model.installed?'Testar conversa e diagrama':model.downloaded?'Instalar e validar':'Baixar e instalar');
      action.type='button';action.disabled=!model.supported||snapshot.tasks.some(task=>task.modelId===model.id&&['queued','running'].includes(task.state));
      action.addEventListener('click',()=>attempt(()=>api.modelsInstall(model.id,model.ready||model.installed?'validate':'install')));card.append(action);
      container.append(card);
    }
  }
  function taskRow(task,cancellable=false){
    const row=element('article','queue-task');const content=element('div');
    content.append(element('strong','',task.label),element('span','queue-state',labels[task.state]||task.state),element('p','',task.message||''));row.append(content);
    if(cancellable){const button=element('button','button subtle',task.state==='queued'?'Remover':'Interromper');button.type='button';button.addEventListener('click',()=>attempt(()=>api.modelsCancel(task.id)));row.append(button);}
    return row;
  }
  function renderTasks(){
    const running=snapshot.tasks.find(task=>task.state==='running');
    const pending=snapshot.tasks.filter(task=>task.state==='queued');
    const latest=snapshot.tasks.at(-1);
    const title=running?.label||(session.busy?session.active:pending.length?`${pending.length} tarefa(s) na fila`:latest?'Última tarefa: '+latest.label:'Nenhuma tarefa em execução');
    byId('task-bar-title').textContent=title;
    byId('task-bar-message').textContent=running?.message||(session.busy?progress||'Um worker local trabalhando':latest?.message||'Clique para abrir a fila · um worker por vez');
    byId('task-bar-count').textContent=String(pending.length);
    const bar=byId('task-bar-progress');
    if(running&&Number.isFinite(running.percent))bar.value=running.percent;
    else if(running||session.busy)bar.removeAttribute('value');
    else bar.value=latest?.state==='done'?100:0;
    const list=byId('task-list');list.replaceChildren();
    if(session.busy&&!running)list.append(taskRow({label:session.active,state:'running',message:progress||'Acompanhe os detalhes no painel da tarefa.'}));
    const ordered=[...snapshot.tasks.filter(task=>task.state==='running'),...pending,...snapshot.tasks.filter(task=>!['queued','running'].includes(task.state)).slice(-10).reverse()];
    for(const task of ordered)list.append(taskRow(task,['queued','running'].includes(task.state)));
    for(const item of session.history.slice(0,5))if(!snapshot.tasks.some(task=>task.label===item.label))list.append(taskRow({label:item.label,state:item.status,message:item.error||'Operação desta sessão'}));
    if(!list.children.length)list.append(element('p','qwen-note','Sua fila está vazia. Downloads, instalações e validações aparecem aqui.'));
  }
  function renderAvailability(){
    const approved=snapshot.models.find(model=>model.ready&&model.supported);
    const selected=snapshot.models.find(model=>model.id===snapshot.selected);
    const button=byId('planner-use-ready');button.hidden=!approved||selected?.ready;
    button.disabled=session.busy;button.textContent=approved?`Usar ${approved.name} aprovado`:'Usar IA aprovada';
    button.dataset.model=approved?.id||'';
  }
  function receive(value){snapshot=value;renderModels();renderAvailability();renderTasks();onUpdate();}
  byId('planner-use-ready').addEventListener('click',()=>{if(byId('planner-use-ready').dataset.model)selectModel(byId('planner-use-ready').dataset.model);});
  byId('task-bar-toggle').addEventListener('click',()=>{const panel=byId('task-drawer');panel.hidden=!panel.hidden;byId('task-bar-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
  byId('task-drawer-close').addEventListener('click',()=>{byId('task-drawer').hidden=true;byId('task-bar-toggle').setAttribute('aria-expanded','false');byId('task-bar-toggle').focus();});
  byId('task-drawer').addEventListener('keydown',event=>{if(event.key==='Escape')byId('task-drawer-close').click();});
  api.onModels(receive);
  api.onPlanner(event=>{if(event.type==='progress'){progress=event.message;renderTasks();}});
  attempt(async()=>receive(await api.modelsStatus()));
  return {refresh:()=>attempt(async()=>receive(await api.modelsStatus())),status(value){session=value;if(!value.busy)progress='';renderTasks();renderAvailability();renderModels();}};
}
