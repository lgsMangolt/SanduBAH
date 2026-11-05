const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};

export function nextProjectAction({project=null,preview=null,lifecycle=null,hasPlan=false,ready=false,cloud=null,busy=false,error=null}={}){
  const stages=lifecycle?.stages||[],current=stages.find(stage=>stage.items.some(item=>!item.done));
  const phase=current?.title||stages.at(-1)?.title||'Planejamento';
  if(busy)return {phase,state:'working',title:'Uma etapa está em andamento',detail:'Acompanhe os resultados aqui. O próximo trabalho aguarda o worker.',action:null,label:'Trabalhando…'};
  if(error)return {phase,state:'blocked',title:'Precisamos conferir o projeto',detail:error,action:'refresh',label:'Conferir novamente'};
  if(project?.missions.some(mission=>['error','unknown'].includes(mission.status)))return {phase,state:'review',title:'O resultado anterior precisa de revisão',detail:'Confira os arquivos e a saída antes de decidir o próximo trabalho.',action:'files',label:'Revisar resultado e arquivos'};
  const pending=project?.missions.find(mission=>mission.status==='pending');
  if(pending){
    const provider=pending.engine==='codex'?'codex':pending.engine==='claude'?'claude':null,account=cloud?.providers?.find(item=>item.id===provider);
    if(provider&&(!account?.installed||!account?.authenticated))return {phase,state:'blocked',title:'A etapa está preparada; falta conectar o executor',detail:`${pending.title}. Confira ${provider==='codex'?'Codex':'Claude'} antes de executar. Sua IA de planejamento permanece escolhida.`,action:'setup',label:'Conferir o executor',missionId:pending.id};
    return {phase,state:'ready',title:'Sua próxima etapa já está preparada',detail:pending.title,action:'run',label:'Revisar e executar esta etapa',missionId:pending.id,executor:pending.engine||'mcp',model:pending.model||null};
  }
  if(preview?.entry){
    if(current?.id==='mvp')return {phase,state:'ready',title:'Vamos evoluir o próximo critério do MVP',detail:current.items.find(item=>!item.done)?.title||'Revise o fluxo mínimo antes de ampliar o produto.',action:'build',label:'Preparar a próxima melhoria'};
    return {phase,state:'review',title:current?.id==='production'?'Prepare a revisão para uso real':current?.id==='prototype'?'Veja o protótipo e registre seu aceite':'Confira a prévia e os critérios do projeto',detail:'A prévia mostra arquivos reais. O checklist só avança com sua revisão e evidências.',action:'check',label:current?.id==='prototype'?'Revisar e aceitar o protótipo':'Revisar etapas e critérios',stage:current?.id||'production'};
  }
  if(project?.missions.some(mission=>mission.status==='done'))return {phase,state:'review',title:'A etapa terminou; confira o que foi produzido',detail:'Uma missão concluída não aprova o projeto inteiro. Revise o resultado e os arquivos antes de avançar.',action:'files',label:'Revisar resultado e arquivos'};
  if(hasPlan)return {phase,state:'ready',title:'Transforme o planejamento na primeira implementação',detail:'O pedido será preparado com a conversa e os Markdown deste projeto para você revisar.',action:'build',label:'Revisar e construir o protótipo'};
  if(!ready)return {phase,state:'blocked',title:'Conte sua ideia e confira a IA',detail:'Sua ideia pode ficar como rascunho. Escolha ou conecte a IA para começar a conversa.',action:'setup',label:'Escolher ou conectar minha IA'};
  return {phase,state:'ready',title:'Vamos entender o que você quer criar',detail:'Conte a ideia abaixo. A entrevista pode tratar uma decisão por vez.',action:'describe',label:'Contar minha ideia'};
}

export function implementationRequest({project=null,lifecycle=null}={}){
  const stage=lifecycle?.stages.find(item=>item.id==='mvp'),criterion=stage?.items.find(item=>!item.done);
  const goal=project?.goal?.slice(0,900);
  return `${goal?'Objetivo deste projeto: '+goal+'\n\n':''}${criterion&&lifecycle?.summary.currentStage==='mvp'?'Implemente a próxima melhoria do MVP: '+criterion.title+'.':'Implemente o protótipo mínimo combinado no planejamento desta conversa e nos Markdown selecionados.'} Preserve o projeto e os arquivos existentes. Use dados fictícios, execute testes locais seriais e informe resultados e pendências. Se faltar uma decisão essencial, explique a lacuna antes de implementar. Para uma interface web, prepare index.html e arquivos locais para a prévia lateral. Não publique, instale dependências ou altere gateway, Corel, impressão ou credenciais. Não marque etapas do produto como aprovadas por conta própria.`;
}

export function createStartScreen({container,onCreate,onStudy,onContinue}){
  container.className='guided-start';
  const cards=[['create','Criar um projeto','Conte sua ideia e avance com a IA, uma etapa por vez.',onCreate],['study','Estudar um assunto','Consulte o histórico e forme conhecimento no Cérebro.',onStudy],['continue','Continuar de onde parei','Retome seus projetos, conversas, arquivos e próximas etapas.',onContinue]];
  for(const [id,title,description,action]of cards){const button=node('button','guided-start-card');button.type='button';button.dataset.startAction=id;button.append(node('span','guided-start-icon',id==='create'?'+':id==='study'?'◉':'↗'),node('strong','',title),node('span','',description));button.addEventListener('click',action);container.append(button);}
  container.append(node('p','qwen-note','Escolher uma entrada organiza seu espaço. Envios, execuções e alterações protegidas continuam sujeitos à revisão.'));
}

export function createGuidedWorkspace({api,planner,dock,notify}){
  const container=node('section','guided-project');container.id='guided-project';container.setAttribute('aria-label','Próxima etapa do projeto');
  const workspace=document.querySelector('.planner-workspace');workspace.prepend(container);
  const advanced=node('details','guided-advanced');advanced.id='planner-advanced';advanced.append(node('summary','','Detalhes avançados · IA, força, contexto e ferramentas'));
  for(const selector of ['.cloud-selection','#planner-readiness','#planner-client-link','#planner-empty','.planner-work-mode','.planner-start-check','.planner-models']){const element=document.querySelector(selector);if(element)advanced.append(element);}
  const context=document.getElementById('brain-context-mode').closest('.planner-context'),usage=document.getElementById('brain-token-usage');
  workspace.append(usage,advanced);advanced.append(context);
  const live=document.getElementById('qwen-status');workspace.insertBefore(live,document.getElementById('qwen-messages'));
  document.body.classList.add('guided-ui');
  let snapshot=null,request=0,timer=null,acting=false,runningOwn=false,workerBusy=false;
  const output=node('section','guided-result');output.hidden=true;container.after(output);
  function openAdvanced(){advanced.open=true;document.getElementById('planner-provider').scrollIntoView({block:'center'});document.getElementById('planner-provider').focus();}
  function draw(error=null){
    const context=planner.guidedContext(),state=nextProjectAction({...snapshot,hasPlan:context.hasPlan,ready:context.ready,cloud:context.cloud,busy:workerBusy||context.running,error});
    container.replaceChildren();container.dataset.state=state.state;
    const heading=node('div','guided-project-heading');heading.append(node('span','guided-phase','Onde estamos · '+state.phase),node('span','guided-ai','IA escolhida · '+(context.model||'a conferir')));
    container.append(heading,node('h3','',state.title),node('p','',state.detail));
    if(state.executor)container.append(node('p','qwen-note','Executor da etapa · '+state.executor+(state.model?' · '+state.model:'')));
    const action=node('button','button primary',state.label);action.type='button';action.disabled=acting||!state.action;action.id='guided-next';
    const expected=context.projectId;
    action.addEventListener('click',async()=>{
      if(acting||workerBusy)return;if(planner.guidedContext().projectId!==expected){await refresh();return;}
      acting=true;action.disabled=true;
      try{
        if(state.action==='setup')openAdvanced();
        else if(state.action==='refresh')await refresh();
        else if(state.action==='describe')document.getElementById('qwen-prompt').focus();
        else if(state.action==='build')planner.prepareGuidedBuild(implementationRequest(snapshot||{}));
        else if(state.action==='files')await dock.openFiles(expected);
        else if(state.action==='check')await dock.openStage(expected,state.stage);
        else if(state.action==='run'){
          runningOwn=true;draw();const result=await api.runProject({id:expected,missionId:state.missionId});
          output.replaceChildren();output.hidden=false;
          if(result.cancelled)output.append(node('strong','','Etapa cancelada antes da execução.'),node('p','qwen-note','A etapa continua preparada e pode ser revisada novamente.'));
          else{const mission=result.project?.missions.find(item=>item.id===state.missionId);output.append(node('strong','',mission?.status==='done'?'Resultado da etapa':'Resultado precisa de revisão'),node('p','qwen-note',mission?.title||'Confira os arquivos e as etapas ao lado.'));if(mission?.result){const details=node('details','guided-output-details');details.append(node('summary','','Ver saída completa do executor'),node('pre','',mission.result));output.append(details);}}
        }
      }catch(error){notify(error.message,true);}finally{acting=false;runningOwn=false;await refresh();}
    });
    const actions=node('div','guided-actions');actions.append(action);
    const settings=node('button','button subtle','Ajustar minha IA');settings.type='button';settings.disabled=workerBusy;settings.addEventListener('click',openAdvanced);actions.append(settings);
    if(context.projectId){const checklist=node('button','button subtle','Ver checklist');checklist.type='button';checklist.addEventListener('click',()=>dock.openStage(context.projectId).catch(error=>notify(error.message,true)));actions.append(checklist);}
    if(runningOwn){const stop=node('button','button subtle','Parar após esta etapa');stop.type='button';stop.addEventListener('click',()=>api.stopQueue().then(()=>notify('A fila vai parar após esta etapa.')).catch(error=>notify(error.message,true)));actions.append(stop);}
    container.append(actions);
  }
  async function refresh(){
    const revision=++request,id=planner.guidedContext().projectId;
    try{
      const values=id?await Promise.all([api.project({action:'get',id}),api.preview(id),api.knowledge({action:'lifecycle',id:'harness:'+id})]):[null,null,null];
      if(revision!==request||id!==planner.guidedContext().projectId)return;
      snapshot={project:values[0],preview:values[1],lifecycle:values[2]};draw();
    }catch(error){if(revision===request){snapshot=null;draw(error.message);}}
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(refresh,80);};
  window.addEventListener('sandubah:project-selected',()=>{snapshot=null;output.hidden=true;schedule();});
  window.addEventListener('sandubah:planner-updated',schedule);
  window.addEventListener('sandubah:guided-setup',openAdvanced);
  api.onProject(schedule);api.onState(status=>{workerBusy=status.busy;draw();schedule();});schedule();
  return {refresh,openAdvanced};
}
