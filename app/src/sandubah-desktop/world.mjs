import { normalized, initialArguments, createWorkerPanel, workerPanelKey, workerPanelLimits, updateWorkerPanels, restoreWorkerPanel, workerPanelView, workerResultText } from './ui-model.mjs';
import {createBrainMap} from './brain-3d.mjs';
import {createBrainHub} from './brain-hub.mjs';
import {missionDraft,executorChoices} from './harness-executors.mjs';
import {createProjectTrack} from './project-track.mjs';
import {createProjectHistory} from './project-history.mjs';
import {layoutStore,panelControls} from './panels.mjs';

const node=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
const button=(text,action,className='button')=>{const value=node('button',className,text);value.type='button';value.addEventListener('click',action);return value;};
const field=(label,input)=>{const wrapper=node('label','world-field');wrapper.append(node('span','field-label',label),input);return wrapper;};
const input=(placeholder,id)=>{const value=node('input','text-input');value.placeholder=placeholder;value.id=id;return value;};
const area=(placeholder,id)=>{const value=node('textarea','json-editor');value.placeholder=placeholder;value.id=id;return value;};
const select=id=>{const value=node('select');value.id=id;return value;};
const statusLabels={pending:'Na fila',running:'Executando',done:'Concluída',error:'Erro',unknown:'Resultado desconhecido'};

export function markdownView(content){
  const article=node('article','markdown-body');
  let code=null;
  for(const line of content.split('\n')){
    if(line.startsWith('```')){if(code){article.append(code);code=null;}else code=node('pre');continue;}
    if(code){code.textContent+=line+'\n';continue;}
    const heading=line.match(/^(#{1,6})\s+(.*)$/);
    if(heading)article.append(node(`h${heading[1].length}`,'',heading[2]));
    else if(/^\s*[-*]\s/.test(line))article.append(node('p','markdown-item',line.replace(/^\s*[-*]\s/,'• ')));
    else if(line.trim())article.append(node('p','',line));
  }
  if(code)article.append(code);
  return article;
}

const itemStatusLabels={running:'Em andamento',completed:'Concluído',failed:'Falhou'};
const fileKindLabels={add:'Criado',added:'Criado',create:'Criado',update:'Alterado',updated:'Alterado',modify:'Alterado',delete:'Removido',deleted:'Removido',rename:'Renomeado'};
function workerSection(title,id){const section=node('section','worker-section');section.dataset.readingId=id;section.append(node('h4','',title));return section;}
function workerList(values){const list=node('ul');for(const value of values)list.append(node('li','',value));return list;}

export function renderWorkerPanelContent(container,state){
  const key=workerPanelKey(state.projectId,state.missionId);
  if(container.workerKey!==key){container.replaceChildren();container.workerKey=key;container.workerRows=new Map();container.workerParts=null;}
  if(!container.workerParts||container.workerParts.key!==key){
    const overview=node('div');const timeline=workerSection('Atividade do Codex','activity');const list=node('div','worker-items');timeline.append(list);container.append(overview,timeline);
    container.workerParts={key,overview,timeline,list};
  }
  const {overview,timeline,list}=container.workerParts;const view=workerPanelView(state);overview.replaceChildren();
  if(view.historyNote)overview.append(node('p','worker-note',view.historyNote));
  if(view.summary||view.message||view.diagnostic||state.result){
    const result=workerSection('Resumo da missão','result');
    if(view.summary)result.append(node('p','worker-message',view.summary));
    if(view.reportStatus)result.append(node('p','muted',`Relatório do agente: ${view.reportStatus==='completed'?'conclusão relatada':'limitação relatada'}. O estado da missão vem do executor.`));
    if(view.message)result.append(node('p','worker-note',view.message));
    if(view.exitCode!==undefined&&view.exitCode!==null)result.append(node('p','muted',`Código de saída do executor: ${view.exitCode}`));
    if(view.configPreserved===false)result.append(node('p','worker-note','O executor informou alteração na configuração. Revise o resultado.'));
    if(view.diagnostic){const details=node('details');details.append(node('summary','','Diagnóstico do executor'),node('pre','worker-output',view.diagnostic));result.append(details);}
    overview.append(result);
  }
  if(view.notices.length){const warnings=workerSection('Avisos','notices');warnings.append(workerList(view.notices));overview.append(warnings);}
  const files=workerSection(`Arquivos · ${view.files.length}`,'files');
  if(view.files.length)files.append(workerList(view.files.map(file=>`${file.path} — ${fileKindLabels[file.kind]||file.kind||'Informado'} · ${file.source}${file.status==='failed'?' · alteração falhou':file.status==='running'?' · em andamento':''}`)));
  else files.append(node('p','muted','Nenhuma alteração de arquivo informada.'));overview.append(files);
  const tests=workerSection('Testes','tests');
  if(!view.evidence.length)tests.append(node('p','muted','Sem contagem comprovada na saída de comandos recebida.'));
  for(const evidence of view.evidence){
    const row=node('div','worker-test-evidence');row.append(node('code','',evidence.command),node('p','',`Total: ${evidence.total??'não informado'} · Aprovados: ${evidence.passed??'não informado'} · Falhos: ${evidence.failed??'não informado'}`),node('small','',`${evidence.source} · ${evidence.complete?'saída recebida':'saída parcial; comando em andamento'}`));tests.append(row);
  }
  if(view.claims.length){tests.append(node('h5','','Relato do agente · sem comprovação pela saída'),workerList(view.claims));}overview.append(tests);
  const kept=new Set();
  for(const item of view.items){
    kept.add(item.id);let row=container.workerRows.get(item.id);
    if(!row){row=node('article','worker-item');row.dataset.readingId=`item:${item.id}`;container.workerRows.set(item.id,row);list.append(row);}
    if(row.workerItem===item)continue;
    row.workerItem=item;
    const status=itemStatusLabels[item.status]||'Estado não informado';
    if(item.type==='command_execution'){
      if(!row.workerCommand){const heading=node('h5');const command=node('code');const details=node('details');const summary=node('summary','','Saída do comando');const output=node('pre','worker-output');details.append(summary,output);row.append(heading,command,details);row.workerCommand={heading,command,details,output};}
      const parts=row.workerCommand;parts.heading.textContent=`Comando · ${status}${item.exitCode!==undefined?` · saída ${item.exitCode}`:''}`;parts.command.textContent=item.command||'Comando ainda não informado';parts.output.textContent=item.output||'Sem saída recebida.';
    }else{
      row.replaceChildren();
      if(item.type==='agent_message')row.append(node('h5','',`Mensagem do agente · ${status}`),node('p','worker-message',item.report?'Relatório estruturado recebido. Resumo, arquivos e testes aparecem acima.':item.text||'Aguardando mensagem…'));
      else if(item.type==='file_change')row.append(node('h5','',`Alterações de arquivos · ${status}`),workerList((item.changes||[]).map(change=>`${change.path} — ${fileKindLabels[change.kind]||change.kind||'Alteração informada'}`)));
      else if(item.type==='error')row.append(node('h5','','Aviso do Codex (item)'),node('p','worker-message',item.message||item.text),node('small','','Este aviso não confirma sucesso nem falha da missão.'));
      else row.append(node('h5','',`Atividade do Codex · ${status}`),node('p','worker-message',item.text||item.message||'Atividade recebida sem conteúdo de apresentação.'));
    }
  }
  for(const [id,row]of container.workerRows)if(!kept.has(id)){row.remove();container.workerRows.delete(id);}
  timeline.hidden=!view.items.length;
  if(!view.items.length&&!state.result)overview.append(node('p','muted',state.hasEvents?'Aguardando os próximos eventos do Codex.':'Aguardando uma missão Codex.'));
  return view;
}

export function createWorld({api,catalog,notify,output,navigate}){
  let current=null,documents=[],activeDocument=null,busy=false,indexPromise,view='all';
  const missionDrafts=new Map();let executionChoices=[],executionLoading=false;
  async function refreshExecutors(){if(executionLoading)return;executionLoading=true;try{const planner=await api.plannerStatus(),local=await api.modelsStatus();executionChoices=executorChoices(planner,local);if(current)renderProject();}catch(error){notify(error.message,true);}finally{executionLoading=false;}}
  refreshExecutors();
  let workerPanels=new Map(),workerCurrentKey=null,restoringWorkerScroll=false;
  const workerSelections=new Map(),workerReadings=new Map(),workerSavedResults=new Map();
  const run=action=>async()=>{try{await action();}catch(error){notify(error.message,true);}};
  const main=document.getElementById('main-content');
  const harness=node('section','world-view');harness.id='harness-view';harness.hidden=true;
  const brain=node('section','world-view');brain.id='brain-view';brain.hidden=true;
  const projectsView=node('section','world-view');projectsView.id='projects-view';projectsView.hidden=true;main.insertBefore(projectsView,document.getElementById('development-view'));
  main.insertBefore(harness,document.getElementById('development-view'));main.insertBefore(brain,harness);

  const hero=node('div','quest-hero');
  const mascot=node('img','quest-mascot');mascot.src='sandubah-logo.png';mascot.alt='SanduBAH, sanduíche de cacetinho em pixel art';
  const heroText=node('div');heroText.append(node('span','eyebrow','SANDUBAH / MODO CONSTRUÇÃO'),node('h2','','Pequenas missões. Grandes ideias.'),node('p','','Monte sua equipe, conecte o conhecimento e execute uma etapa por vez.'));
  hero.append(heroText,mascot);harness.append(hero);
  const toolbar=node('div','world-toolbar');
  const projectSelect=select('project-select');projectSelect.setAttribute('aria-label','Selecionar harness');
  const createButton=button('+ Novo harness',()=>{creation.hidden=!creation.hidden;name.focus();},'button primary');createButton.id='new-harness';
  toolbar.append(button('← Meus projetos',()=>navigate('projects')),projectSelect,createButton);harness.append(toolbar);
  const creation=node('form','world-card creation-form');creation.hidden=true;creation.id='create-harness-form';
  const name=input('Ex.: Meu próximo projeto','harness-name');name.maxLength=120;name.required=true;
  const goal=area('O que vamos construir?','harness-goal');goal.maxLength=4000;goal.required=true;
  const submit=node('button','button primary','Criar meu harness');submit.type='submit';submit.id='create-harness';
  creation.append(node('h3','','Dê um objetivo à sua aventura.'),field('Nome',name),field('Objetivo',goal),submit);
  creation.addEventListener('submit',event=>{event.preventDefault();run(async()=>{current=await api.project({action:'create',input:{name:name.value,goal:goal.value}});creation.hidden=true;name.value='';goal.value='';remember();await refreshProjects();renderProject();notify('Harness criado. Seus Markdown já estão prontos.');})();});
  harness.append(creation);
  const projectBody=node('div');projectBody.id='project-body';harness.append(projectBody);

  const live=node('section','world-card worker-panel');live.id='worker-panel';live.setAttribute('aria-labelledby','worker-panel-title');
  const liveTitle=node('h3','','Agente em campo');liveTitle.id='worker-panel-title';
  const workerSelect=select('worker-mission');workerSelect.setAttribute('aria-label','Missão exibida no painel Codex');
  const workerFollow=button('Pausar acompanhamento',()=>{
    const reading=workerReadings.get(workerCurrentKey);if(!reading)return;reading.follow=!reading.follow;reading.unread=false;if(reading.follow)workerLog.scrollTop=workerLog.scrollHeight;updateWorkerFollow();
  });workerFollow.setAttribute('aria-controls','worker-log');
  const workerToolbar=node('div','world-toolbar');workerToolbar.append(workerSelect,workerFollow);
  const workerStatus=node('p','worker-status');workerStatus.setAttribute('role','status');workerStatus.setAttribute('aria-live','polite');workerStatus.setAttribute('aria-atomic','true');
  const workerPhases=node('ol','worker-phases');workerPhases.setAttribute('aria-label','Etapas observadas da missão');
  const workerLog=node('div','worker-log');workerLog.id='worker-log';workerLog.tabIndex=0;workerLog.setAttribute('role','region');workerLog.setAttribute('aria-label','Resumo e atividade da missão Codex');
  live.append(liveTitle,node('p','muted','Eventos reais por missão. Revise resultados parciais antes de aplicar arquivos.'),workerToolbar,workerStatus,workerPhases,workerLog);
  function rememberWorkerReading(){
    if(harness.hidden||!workerLog.isConnected)return;
    const reading=workerReadings.get(workerCurrentKey);if(!reading)return;
    reading.scrollTop=workerLog.scrollTop;
    const top=workerLog.getBoundingClientRect().top;
    const anchor=[...workerLog.querySelectorAll('[data-reading-id]')].find(row=>!row.querySelector('[data-reading-id]')&&row.getBoundingClientRect().bottom>top);
    reading.anchor=anchor?{id:anchor.dataset.readingId,offset:anchor.getBoundingClientRect().top-top}:null;
  }
  function updateWorkerFollow(){
    const reading=workerReadings.get(workerCurrentKey);workerFollow.disabled=!reading;
    workerFollow.textContent=reading?.follow?'Pausar acompanhamento':reading?.unread?'Acompanhar novos eventos (há atualizações)':'Acompanhar novos eventos';workerFollow.setAttribute('aria-pressed',String(Boolean(reading?.follow)));
  }
  workerLog.addEventListener('scroll',()=>{
    if(restoringWorkerScroll||harness.hidden)return;const reading=workerReadings.get(workerCurrentKey);if(!reading)return;
    reading.follow=workerLog.scrollHeight-workerLog.clientHeight-workerLog.scrollTop<=24;if(reading.follow)reading.unread=false;rememberWorkerReading();updateWorkerFollow();
  });
  workerSelect.addEventListener('change',()=>{rememberWorkerReading();workerSelections.set(current.id,workerSelect.value);renderWorkerArea();});
  function renderWorkerArea(changedKey,captureReading=true){
    if(!current)return;
    if(captureReading)rememberWorkerReading();
    const missions=current.missions.filter(mission=>mission.engine&&mission.engine!=='mcp');
    const selected=missions.find(mission=>mission.id===workerSelections.get(current.id))||missions.find(mission=>mission.status==='running')||missions.at(-1);
    workerSelect.replaceChildren();for(const mission of missions)workerSelect.add(new Option(`${mission.title} · ${statusLabels[mission.status]||mission.status}`,mission.id));workerSelect.disabled=!missions.length;
    if(!selected){workerCurrentKey=null;workerStatus.textContent='Aguardando uma missão Codex';workerPhases.replaceChildren();workerLog.replaceChildren(node('p','muted','Nenhuma missão Codex neste projeto.'));workerLog.workerKey=null;updateWorkerFollow();return;}
    workerSelect.value=selected.id;
    const key=workerPanelKey(current.id,selected.id);workerCurrentKey=key;
    let state=workerPanels.get(key)||createWorkerPanel(current.id,selected.id);
    if(!selected.result&&['pending','running'].includes(selected.status)&&state.result){state=createWorkerPanel(current.id,selected.id);workerPanels.delete(key);workerSavedResults.delete(key);workerReadings.delete(key);}
    if(selected.result&&(!state.result||workerSavedResults.get(key)!==selected.result)){
      state=restoreWorkerPanel(state,selected.result,selected.status);workerSavedResults.set(key,selected.result);
      workerPanels=updateWorkerPanels(workerPanels,{projectId:current.id,missionId:selected.id});workerPanels.set(key,state);
    }
    if(!workerReadings.has(key))workerReadings.set(key,{follow:true,scrollTop:0,anchor:null,unread:false});
    const reading=workerReadings.get(key);if(changedKey===key&&!reading.follow)reading.unread=true;
    const presentation=renderWorkerPanelContent(workerLog,state);if(workerStatus.textContent!==presentation.label)workerStatus.textContent=presentation.label;workerStatus.dataset.tone=presentation.tone;
    workerPhases.replaceChildren();for(const phase of presentation.phases){const step=node('li',`worker-phase ${phase.state}`);step.append(node('span','',phase.label),node('small','',{observed:'Observada',current:'Atual',pending:'Aguardando',unconfirmed:'Não confirmada'}[phase.state]));if(phase.state==='current')step.setAttribute('aria-current','step');workerPhases.append(step);}
    restoringWorkerScroll=true;
    if(!harness.hidden){
      if(reading.follow)workerLog.scrollTop=workerLog.scrollHeight;
      else{workerLog.scrollTop=reading.scrollTop;const anchor=[...workerLog.querySelectorAll('[data-reading-id]')].find(row=>row.dataset.readingId===reading.anchor?.id);if(anchor)workerLog.scrollTop+=anchor.getBoundingClientRect().top-workerLog.getBoundingClientRect().top-reading.anchor.offset;}
    }
    restoringWorkerScroll=false;updateWorkerFollow();
    for(const cache of [workerReadings,workerSavedResults,workerSelections])while(cache.size>workerPanelLimits.panels)cache.delete(cache.keys().next().value);
  }

  function remember(){if(current)localStorage.setItem('sandubah-project',current.id);}
  async function refreshProjects(){
    const projects=await api.project({action:'list'});
    projectSelect.replaceChildren(new Option('Escolha um harness',''));
    for(const project of projects)projectSelect.add(new Option(project.name,project.id));
    if(current)projectSelect.value=current.id;
    else if(!projects.length)creation.hidden=false;
  }
  projectSelect.addEventListener('change',run(async()=>{current=projectSelect.value?await api.project({action:'get',id:projectSelect.value}):null;remember();renderProject();}));
  async function update(action,data){current=await api.project({action,id:current.id,input:data});renderProject();}
  function renderProject(){
    rememberWorkerReading();
    projectBody.replaceChildren();
    if(!current){projectBody.append(node('div','empty-state','Crie um harness para começar. Cada projeto tem sua própria equipe, memória e fila.'));return;}
    if(view==='harness')window.dispatchEvent(new CustomEvent('sandubah:project-selected',{detail:{id:current.id}}));
    const completed=current.missions.filter(mission=>mission.status==='done').length;
    const progress=node('div','quest-progress');progress.append(node('strong','',current.name),node('span','',`${completed} / ${current.missions.length} missões concluídas · 1 worker`));
    const meter=node('progress');meter.max=Math.max(1,current.missions.length);meter.value=completed;meter.setAttribute('aria-label','Missões concluídas');progress.append(meter,node('p','',current.goal));projectBody.append(progress);
    const projectId=current.id;
    const track=createProjectTrack({api,projectId,run,notify,isBusy:()=>busy,onProjectChanged:async()=>{current=await api.project({action:'get',id:projectId});renderProject();},openPrompt:async path=>{navigate('brain');await openDocument(path,projectId);}});projectBody.append(track);
    const actions=node('div','world-toolbar');
    const play=button('▶ Revisar e executar fila',run(()=>executeQueue()),'button primary');play.id='run-queue';play.disabled=busy||!current.missions.some(mission=>mission.status==='pending');
    const stop=button('■ Parar após esta missão',run(async()=>{const result=await api.stopQueue();notify(result.message);}));stop.disabled=!busy;stop.id='stop-queue';
    const interrupt=button('Interromper agente',run(async()=>notify((await api.interruptWorker()).message)));interrupt.id='interrupt-worker';interrupt.disabled=!busy||!current.missions.some(mission=>mission.engine!=='mcp'&&mission.status==='running');
    actions.append(play,stop,interrupt);projectBody.append(actions);
    const files=node('div','project-docs');
    for(const file of ['HARNESS.md','AGENTS.md','CONTEXT.md','BOARD.md','MEMORY.md'])files.append(button(file,run(async()=>{navigate('brain');await openDocument(file,current.id);}),'document-chip'));
    projectBody.append(files);
    const columns=node('div','harness-columns');const team=node('section','world-card');team.append(node('h3','','Sua equipe'),node('p','muted','O motor local registra os papéis. O Codex executa código e testes em um workspace privado, um agente por vez.'));
    for(const agent of current.agents){
      const card=node('div','agent-card');card.append(node('span','pixel-avatar',agent.name.slice(0,2).toUpperCase()),node('strong','',agent.name),node('small','',`${agent.role} · ${agent.registered?'registrado no motor local':'pronto para registrar'}`));
      if(agent.source)card.append(button('Ler instruções',run(async()=>{navigate('brain');await openDocument(agent.source);}),'text-button'));
      team.append(card);
    }
    const agentForm=node('form','compact-form');
    const agentName=input('Nome do agente','agent-name');agentName.required=true;agentName.maxLength=120;
    const role=select('agent-role');for(const type of ['coordinator','researcher','coder','tester','reviewer','architect'])role.add(new Option(type,type));
    const source=select('agent-source');source.add(new Option('Sem instruções adicionais',''));for(const entry of catalog.entries.filter(item=>item.kind==='agent'))source.add(new Option(entry.title||entry.name,entry.sourcePath));
    const addAgent=node('button','button','+ Adicionar agente');addAgent.type='submit';addAgent.disabled=busy;
    agentForm.append(field('Nome',agentName),field('Papel',role),field('Markdown do agente',source),addAgent);
    agentForm.addEventListener('submit',event=>{event.preventDefault();run(()=>update('agent',{name:agentName.value,role:role.value,source:source.value}))();});team.append(agentForm);columns.append(team);
    if(missionDrafts.get(current.id)?.editing&&!current.missions.some(mission=>mission.id===missionDrafts.get(current.id).id&&mission.status==='pending'))missionDrafts.delete(current.id);
    const draft=missionDrafts.get(current.id)||missionDraft(current);missionDrafts.set(current.id,draft);
    const missionPanel=node('section','world-card');missionPanel.append(node('h3','',draft.editing?'Configurar etapa pendente':'Nova missão'),node('p','muted','Pedido, agente e anexos vêm do contexto. Codex programa e testa; Claude e IAs locais produzem estudo e Markdown sem comandos. Instalações e ações protegidas continuam exigindo confirmação.'));
    const pending=select('mission-edit');pending.add(new Option('Nova etapa',''));for(const mission of current.missions.filter(item=>item.status==='pending'))pending.add(new Option(mission.title,mission.id));pending.value=draft.editing?draft.id:'';pending.onchange=()=>{const selected=current.missions.find(item=>item.id===pending.value);missionDrafts.set(current.id,selected?{...selected,editing:true}:missionDraft({...current,missions:[]}));renderProject();};missionPanel.append(field('Etapa',pending),button('Atualizar modelos disponíveis',refreshExecutors,'button subtle'));
    const missionForm=node('form','compact-form');
    const missionTitle=input('Ex.: Descobrir capacidades','mission-title');missionTitle.required=true;missionTitle.maxLength=120;
    const assigned=select('mission-agent');for(const agent of current.agents)assigned.add(new Option(agent.name,agent.id));
    const engine=select('mission-engine');for(const provider of executionChoices.length?executionChoices:[{id:'codex',name:'Codex · carregando catálogo'},{id:'mcp',name:'MCP · ferramenta local'}])engine.add(new Option(provider.name,provider.id));
    const model=select('mission-model'),effort=select('mission-effort'),modelNote=node('p','muted');
    const instructions=area('Descreva a implementação e os testes esperados…','mission-instructions');instructions.maxLength=16000;instructions.required=true;
    const sourceFiles=area('src/exemplo.ts\ntests/exemplo.test.ts','mission-files');
    const codexFields=node('div','compact-form');codexFields.append(field('Modelo',model),field('Força de raciocínio',effort),modelNote,field('Pedido para o agente',instructions),field('Arquivos da cópia para preparar · somente Codex',sourceFiles),node('p','muted','Codex escreve no workspace privado. Claude/local geram relatório, não executam código ou instalações. A força usa apenas níveis anunciados pelo modelo; não altera permissões.'));
    const toolFilter=input('Buscar ferramenta local…','mission-tool-search');
    const tool=select('mission-tool');const toolHelp=node('p','field-description');
    const available=catalog.entries.filter(entry=>entry.kind==='mcp'&&entry.policy.mode!=='blocked');
    const args=area('{}','mission-arguments');args.spellcheck=false;
    const populateTools=()=>{const previous=tool.value;tool.replaceChildren();for(const entry of available.filter(item=>normalized(item.name+' '+item.description).includes(normalized(toolFilter.value))))tool.add(new Option(entry.name,entry.name));if([...tool.options].some(option=>option.value===previous))tool.value=previous;else if([...tool.options].some(option=>option.value==='guidance_brain'))tool.value='guidance_brain';setTool();};
    const setTool=()=>{const entry=available.find(item=>item.name===tool.value);args.value=JSON.stringify(initialArguments(entry?.inputSchema),null,2);toolHelp.textContent=entry?`${entry.description.split(' Use when ')[0]} Campos obrigatórios: ${(entry.inputSchema?.required||[]).join(', ')||'nenhum'}.`:'';};
    toolFilter.addEventListener('input',populateTools);tool.addEventListener('change',setTool);populateTools();
    const dependency=select('mission-dependency');dependency.add(new Option('Sem dependência',''));for(const mission of current.missions)dependency.add(new Option(mission.title,mission.id));
    const addMission=node('button','button primary',draft.editing?'Salvar configuração da etapa':'+ Adicionar à fila');addMission.id='add-mission';addMission.type='submit';addMission.disabled=busy||!current.agents.length;
    const mcpFields=node('div','compact-form');mcpFields.hidden=true;mcpFields.append(field('Ferramenta MCP',toolFilter),tool,toolHelp,field('Parâmetros JSON',args));
    missionTitle.value=draft.title||'';assigned.value=draft.agentId||assigned.value;engine.value=draft.engine||'codex';instructions.value=draft.instructions||'';sourceFiles.value=(draft.files||[]).join('\n');dependency.value=draft.dependsOn||'';if(current.study||/^Estudo:/i.test(current.name))role.value='researcher';
    const saveDraft=()=>Object.assign(draft,{title:missionTitle.value,agentId:assigned.value,engine:engine.value,model:model.value,effort:effort.value,instructions:instructions.value,files:sourceFiles.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),dependsOn:dependency.value});
    const populateEffort=()=>{const selected=executionChoices.find(provider=>provider.id===engine.value)?.models.find(item=>item.id===model.value);effort.replaceChildren(new Option('Automática do modelo',''));for(const level of selected?.effortLevels||[])effort.add(new Option(({low:'Baixa',medium:'Média',high:'Alta',xhigh:'Extra',max:'Máxima'})[level]||level,level));if([...effort.options].some(option=>option.value===draft.effort))effort.value=draft.effort;effort.disabled=busy||!(selected?.effortLevels.length);modelNote.textContent=engine.value==='local'?(selected?.reason||'Somente modelos locais validados podem iniciar; RAM/VRAM são conferidas antes de carregar.'):'Catálogo da conta/CLI; acesso e cota são verificados ao executar. Ultra/multiagentes não é usado nesta fila de um worker.';addMission.disabled=busy||!current.agents.length||engine.value!=='mcp'&&(!selected||selected.disabled);};
    const populateModels=()=>{const choices=executionChoices.find(provider=>provider.id===engine.value)?.models||[];model.replaceChildren();for(const choice of choices){const option=new Option(choice.name+(choice.disabled?' · indisponível':'') ,choice.id);option.disabled=Boolean(choice.disabled);model.add(option);}if(choices.some(item=>item.id===draft.model))model.value=draft.model;else if((current.study||/^Estudo:/i.test(current.name))&&choices.some(item=>item.id==='gpt-6-luna'))model.value='gpt-6-luna';populateEffort();codexFields.hidden=engine.value==='mcp';mcpFields.hidden=engine.value!=='mcp';instructions.required=engine.value!=='mcp';sourceFiles.disabled=engine.value!=='codex';};
    for(const element of [missionTitle,assigned,instructions,sourceFiles,dependency,effort])element.addEventListener('input',saveDraft);
    model.addEventListener('change',()=>{draft.effort='';populateEffort();saveDraft();});engine.addEventListener('change',()=>{draft.model='';draft.effort='';populateModels();saveDraft();});populateModels();
    missionForm.append(field('Objetivo desta etapa',missionTitle),field('Agente responsável',assigned),field('Executor',engine),codexFields,mcpFields,field('Depende de',dependency),addMission);
    missionForm.addEventListener('submit',event=>{event.preventDefault();saveDraft();run(async()=>{missionDrafts.delete(current.id);await update(draft.editing?'configure-mission':'mission',{...draft,missionId:draft.id,tool:tool.value,arguments:engine.value==='mcp'?JSON.parse(args.value):{}});})();});missionPanel.append(missionForm);columns.append(missionPanel);projectBody.append(columns);
    const board=node('section','mission-board');board.id='mission-board';
    for(const [label,statuses]of [['Na fila',['pending']],['Em campo',['running']],['Concluídas',['done']],['Revisar',['error','unknown']]]){
      const column=node('div','board-column');const missions=current.missions.filter(mission=>statuses.includes(mission.status));column.append(node('h3','',`${label} · ${missions.length}`));
      for(const mission of missions){
        const card=node('article',`mission-card ${mission.status}`);card.dataset.missionId=mission.id;
        card.append(node('span','eyebrow',statusLabels[mission.status]),node('h4','',mission.title),node('code','',mission.tool),node('small','',current.agents.find(agent=>agent.id===mission.agentId)?.name||''));
        if(mission.engine!=='mcp')card.append(node('small','',`${mission.model||'Modelo padrão do executor'} · ${mission.effort||'força automática'}. Salve a configuração da etapa antes de executar se fizer alterações.`));
        if(mission.status==='pending'){const execute=button('▶ Executar',run(()=>executeQueue(mission.id)));execute.disabled=busy;card.append(execute);}
        if(mission.result)card.append(button('Ver resultado',()=>output(mission.title,mission.engine==='codex'?workerResultText(mission.result,mission.status):mission.result),'text-button'));
        if(['error','unknown'].includes(mission.status)){const retry=button('Preparar nova tentativa',run(()=>update('retry',{missionId:mission.id})),'text-button');retry.disabled=busy;card.append(retry);}
        column.append(card);
      }
      if(!missions.length)column.append(node('p','muted','Nenhuma missão aqui.'));board.append(column);
    }
    projectBody.append(board);
    projectBody.append(live);renderWorkerArea(undefined,false);
    const results=node('section','world-card');results.id='artifact-list';results.append(node('h3','','Arquivos do workspace'),node('p','muted','Resultados novos ficam no workspace privado. Arquivos importados podem ser aplicados à cópia, com backup e proteção contra conflitos.'),button('Atualizar arquivos',run(()=>showArtifacts(results,current.id))));projectBody.append(results);run(()=>showArtifacts(results,current.id))();
    const restore=node('section','world-card');restore.id='checkpoint-list';restore.append(node('h3','','Checkpoints aplicados'),node('p','muted','Cada aplicação guarda o conteúdo anterior. Restaurar exige revisão do diff e confirmação; se o arquivo mudou fora do SanduBAH, nada é sobrescrito.'),button('Atualizar checkpoints',run(()=>showCheckpoints(restore,current.id))));projectBody.append(restore);run(()=>showCheckpoints(restore,current.id))();
    const history=createProjectHistory({api,projectId,run,notify,output,isBusy:()=>busy});projectBody.append(history);
    const context=node('div','world-card');context.append(node('h3','',`Contexto conectado · ${current.context.length} Markdown`),node('p','muted','HARNESS.md, MEMORY.md, documentos conectados, papel do agente e resultados anteriores são lidos novamente a cada missão Codex. Nada para copiar manualmente.'));
    for(const sourcePath of current.context)context.append(button(sourcePath,run(async()=>{navigate('brain');await openDocument(sourcePath);}),'document-chip'));
    context.append(button('◉ Explorar e conectar Markdown',()=>navigate('brain'),'button'));projectBody.append(context);
    // Cada painel do projeto pode ser recolhido ou maximizado; o que fica recolhido é lembrado por projeto.
    const layout=layoutStore('project:'+projectId);
    for(const [element,id,title] of [[track,'track','Trilha do projeto'],[team,'team','Sua equipe'],[missionPanel,'mission','Nova missão'],[board,'board','Quadro de missões'],[live,'worker','Agente trabalhando'],[results,'files','Arquivos do workspace'],[restore,'checkpoints','Checkpoints aplicados'],[history,'history','Histórico de versões'],[context,'context','Contexto conectado']])panelControls(element,{id,title,store:layout});
  }
  async function showArtifacts(container,id){
    const files=await api.artifacts(id);if(current?.id!==id||!container.isConnected)return;
    container.querySelectorAll('.artifact-row').forEach(row=>row.remove());
    for(const file of files){const row=node('div','artifact-row');row.append(node('code','',file.path),node('small','',`${file.bytes} bytes`),button('Revisar',run(async()=>{
      const artifact=await api.artifact({id,path:file.path});output(file.path,`${artifact.original===null?'ARQUIVO NOVO NO WORKSPACE':`ORIGEM ATUAL:\n${artifact.original}`}\n\nRESULTADO DO CODEX:\n${artifact.content}`);
      row.querySelector('.apply-artifact')?.remove();
      if(artifact.canApply){const apply=button(artifact.conflict?'Conflito na origem':'Confirmar aplicação',run(async()=>{const result=await api.applyArtifact({id,path:file.path,version:artifact.version});notify(result.cancelled?'Aplicação cancelada.':`Aplicado com backup: ${result.backup}`);apply.disabled=true;const list=document.getElementById('checkpoint-list');if(!result.cancelled&&list)await showCheckpoints(list,id);}),'button apply-artifact');apply.disabled=busy||artifact.conflict;row.append(apply);}
    })));container.append(row);}
  }
  async function showCheckpoints(container,id){
    const checkpoints=await api.checkpoints(id);if(current?.id!==id||!container.isConnected)return;
    container.querySelectorAll('.checkpoint-row').forEach(row=>row.remove());
    const labels={applied:'aplicado',restored:'restaurado','external-change':'alterado fora do SanduBAH',missing:'arquivo ausente','backup-invalid':'backup inválido'};
    if(!checkpoints.length){const empty=node('p','muted checkpoint-row','Nenhuma aplicação registrada neste harness.');container.append(empty);return;}
    for(const item of checkpoints){const row=node('div','artifact-row checkpoint-row');row.append(node('code','',item.path),node('small','',`${new Date(item.at).toLocaleString('pt-BR')} · ${labels[item.status]||item.status}`),button('Revisar diff',run(async()=>{
      const checkpoint=await api.checkpoint({id,checkpointId:item.id});
      output(`Checkpoint ${item.path}`,checkpoint.diff===null?'Diff indisponível: o arquivo atual ou o backup não pode ser lido.':checkpoint.diff.tooLarge?'Arquivo grande demais para o diff integrado. Compare no editor; nada foi omitido silenciosamente.':`--- antes da aplicação (backup)\n+++ arquivo atual na cópia\n${checkpoint.diff.lines.join('\n')}`);
      row.querySelector('.restore-checkpoint')?.remove();
      if(checkpoint.canRestore){const action=button('Confirmar restauração',run(async()=>{const result=await api.restoreCheckpoint({id,checkpointId:item.id,version:checkpoint.currentVersion});notify(result.cancelled?'Restauração cancelada.':`Restaurado; backup de segurança: ${result.safety}`);action.disabled=true;if(!result.cancelled)await showCheckpoints(container,id);}),'button restore-checkpoint');action.disabled=busy;row.append(action);}
    })));container.append(row);}
  }
  async function executeQueue(missionId){
    const result=await api.runProject({id:current.id,missionId});
    if(result.cancelled){notify('Execução cancelada. Nenhuma missão iniciada.');return;}
    current=result.project;renderProject();notify(result.stopped?'Fila pausada. As missões restantes continuam pendentes.':result.success?'Fila finalizada. Confira os resultados reais.':'A fila parou para revisão.',!result.success);
  }

  const brainHeader=node('div','world-toolbar');const brainSearch=input('Buscar Markdown, skill, arquitetura…','brain-search');brainSearch.type='search';const brainCount=node('span','subtle-label');
  brainHeader.append(brainSearch,brainCount);brain.append(brainHeader);
  const brainLayout=node('div','brain-layout');const documentList=node('div','brain-index');documentList.id='brain-index';documentList.setAttribute('aria-label','Arquivos Markdown');
  const explorer=node('div','brain-explorer');const graphCard=node('section','world-card graph-card');
  const graphTitle=node('h3','','Mapa do conhecimento');const graphNote=node('p','muted','Selecione um documento para navegar pelos links locais.');const graph=node('div','brain-graph');graph.id='brain-graph';
  const graphControls=node('div');
  graphCard.append(graphTitle,graphControls,graphNote,graph);explorer.append(graphCard);
  const brainMap=createBrainMap({container:graph,toolbar:graphControls,onOpen:item=>run(()=>openGraphItem(item))(),onClassic:()=>renderClassicGraph()});
  graphControls.append(button('Visão geral',run(()=>showOverview()),'button subtle'));
  const reader=node('section','world-card document-reader');reader.id='markdown-reader';explorer.append(reader);brainLayout.append(documentList,explorer);brain.append(brainLayout);
  const hub=node('div');brain.insertBefore(hub,brainHeader);
  const brainHub=createBrainHub({container:hub,api,notify,onLibrary:visible=>{brainHeader.hidden=!visible;brainLayout.hidden=!visible;},onRefresh:()=>{indexPromise=null;run(()=>loadIndex())();},onContinue:id=>openProject(id),onRecommend:entry=>{navigate('all');const search=document.getElementById('search-input');search.value=entry.name;search.dispatchEvent(new Event('input',{bubbles:true}));},onOverview:()=>run(()=>showOverview())()});
  const projectsHub=createBrainHub({container:projectsView,api,notify,projectsOnly:true,onLibrary:()=>{},onRefresh:()=>{},onProjects:projects=>{document.querySelector('.main-nav [data-view="projects"] .nav-count').textContent=String(projects.length);},onOpen:id=>{navigate('planner');window.dispatchEvent(new CustomEvent('sandubah:open-project',{detail:{id,view:'planner'}}));},onContinue:id=>openProject(id),onRecommend:entry=>{navigate('all');const search=document.getElementById('search-input');search.value=entry.name;search.dispatchEvent(new Event('input',{bubbles:true}));}});
  async function showOverview(){
    await loadIndex();const snapshot=await api.knowledge({action:'status'});
    activeDocument={path:'brain:overview',title:'Visão geral do cérebro',overview:true,editable:false,content:`# Visão geral\n\n${documents.length} documentos disponíveis.\n\nCada nó representa uma fonte de conhecimento. Clique para entrar e explorar seus documentos. Estes são atalhos de navegação, não relações inferidas entre notas.\n\nProjetos, progresso, entrevistas e estudos estão nas abas acima.`,links:snapshot.sources.slice(0,24).map(source=>({path:'brain:source:'+source.id,title:`${source.name} · ${source.documents}`,clusterId:source.id,directory:source.directory}))};renderDocument();renderGraph();
  }
  async function openGraphItem(item){
    if(item.clusterId){await loadIndex();const matches=documents.filter(document=>document.sourceId===item.clusterId);activeDocument={path:item.path,title:item.title,overview:true,backToOverview:true,editable:false,content:`# ${item.title}\n\nOrigem: ${item.directory}\n\n${matches.length} documentos indexados. O mapa mostra até 24 entradas; a lista e a busca mantêm acesso aos demais. Clique no centro para voltar à visão geral.`,links:matches.slice(0,24).map(document=>({path:document.path,title:document.title}))};renderDocument();renderGraph();return;}
    if(item.overview){if(item.backToOverview)await showOverview();return;}
    await openDocument(item.path,item.projectId);
  }
  async function openProject(id){await refreshProjects();current=await api.project({action:'get',id});projectSelect.value=id;remember();renderProject();navigate('harness');}
  async function loadIndex(){if(!indexPromise)indexPromise=api.brain().then(result=>{documents=result;renderIndex();}).catch(error=>{indexPromise=null;throw error;});return indexPromise;}
  function renderIndex(){
    const query=normalized(brainSearch.value);const matches=documents.filter(item=>normalized(item.title+' '+item.path+' '+(item.sourceLabel||'')).includes(query));
    brainCount.textContent=`${matches.length} documentos · ${documents.length} na cópia`;
    documentList.replaceChildren();
    if(current){documentList.append(node('h3','',current.name));for(const file of ['HARNESS.md','AGENTS.md','CONTEXT.md','BOARD.md','MEMORY.md'])documentList.append(button(file,run(()=>openDocument(file,current.id)),'brain-file project-file'));}
    let shown=0;const more=button('Carregar mais',()=>appendPage(),'button');
    function appendPage(){more.remove();for(const document of matches.slice(shown,shown+60)){const file=button('',run(()=>openDocument(document.path)),'brain-file');file.title=document.path;file.append(node('strong','',document.title),node('small','',document.path));file.classList.toggle('selected',activeDocument?.path===document.path&&!activeDocument?.projectId);documentList.append(file);}shown+=60;if(shown<matches.length)documentList.append(more);}
    appendPage();if(!matches.length)documentList.append(node('p','muted','Nenhum Markdown encontrado.'));
  }
  brainSearch.addEventListener('input',renderIndex);
  async function openDocument(path,projectId){
    await loadIndex();activeDocument=await api.document({path,projectId});renderIndex();renderDocument();renderGraph();
  }
  function renderDocument(){
    const source=activeDocument;reader.replaceChildren();
    const top=node('div','reader-toolbar');top.append(node('h3','',source.sourceLabel||source.title||source.path));
    if(current&&!source.projectId&&!source.overview){const attach=button(current.context.includes(source.path)?'− Retirar do contexto':'+ Usar no harness',run(async()=>{await update('context',{path:source.path});renderDocument();}),'button primary');attach.id='attach-document';attach.disabled=busy;top.append(attach);}
    const mode=button('Ver Markdown',()=>{raw.hidden=!raw.hidden;rendered.hidden=!raw.hidden;mode.textContent=raw.hidden?'Ver Markdown':'Ver leitura';},'button subtle');top.append(mode);reader.append(top);
    const rendered=markdownView(source.content);const raw=area('','markdown-source');raw.value=source.content;raw.readOnly=!source.editable;raw.hidden=true;reader.append(rendered,raw);
    if(source.editable){const save=button('Salvar Markdown',run(async()=>{activeDocument=await api.saveDocument({path:source.path,projectId:source.projectId,version:source.version,content:raw.value});renderDocument();notify('Markdown salvo no harness local.');}),'button primary');save.id='save-markdown';save.disabled=busy;reader.append(save,node('p','field-description','Use “Ver Markdown” para editar. Arquivos originais da biblioteca não são alterados.'));}
    const links=node('div','document-links');links.append(node('h4','','Conexões locais'));
    for(const link of source.links)links.append(button(link.title||link.path,run(()=>openGraphItem(link)),'document-chip'));
    if(!source.links.length)links.append(node('p','muted','Este documento não tem links locais indexados.'));reader.append(links);
  }
  function renderGraph(){
    if(!activeDocument)return;
    graphTitle.textContent=activeDocument.title||activeDocument.path.split('/').pop();graphNote.textContent=activeDocument.overview?`${documents.length} documentos no índice · até 24 atalhos de entrada, não relações inferidas`:`${activeDocument.links.length} conexões locais reais · escolha o visual acima${activeDocument.links.length>24?' · mostrando 24':''}`;
    brainMap.render(activeDocument);
  }
  function renderClassicGraph(){
    graph.replaceChildren();if(!activeDocument)return;
    const source=activeDocument;const neighbors=source.links.slice(0,24);
    graphTitle.textContent=source.title||source.path.split('/').pop();graphNote.textContent=`${source.links.length} ${source.overview?'atalhos da visão geral':'conexões locais'} · arraste os nós para organizar · clique para abrir${source.links.length>24?' · mostrando 24':''}`;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 780 400');svg.setAttribute('role','group');svg.setAttribute('aria-label','Mapa interativo de Markdown');
    const create=(tag,attributes)=>{const value=document.createElementNS(svg.namespaceURI,tag);for(const [key,attribute]of Object.entries(attributes))value.setAttribute(key,attribute);return value;};
    const center={horizontal:390,vertical:200};
    const items=[{...source,...center},...neighbors.map((link,index)=>({...link,horizontal:390+290*Math.cos(index/Math.max(1,neighbors.length)*Math.PI*2),vertical:200+142*Math.sin(index/Math.max(1,neighbors.length)*Math.PI*2)}))];
    const lines=items.slice(1).map(item=>{const line=create('line',{x1:center.horizontal,y1:center.vertical,x2:item.horizontal,y2:item.vertical,class:'brain-edge'});svg.append(line);return line;});
    items.forEach((item,index)=>{
      const group=create('g',{transform:`translate(${item.horizontal} ${item.vertical})`,tabindex:'0',role:'button','aria-label':`Abrir ${item.path}`,class:index?'brain-node':'brain-node brain-center'});
      const shape=create('rect',{x:index?-18:-30,y:index?-18:-30,width:index?36:60,height:index?36:60,rx:6});group.append(shape);
      const label=create('text',{x:0,y:index?35:48,'text-anchor':'middle'});const title=item.title||item.path.split('/').pop();label.textContent=title.length>27?title.slice(0,24)+'…':title;group.append(label);
      const glyph=create('text',{x:0,y:5,'text-anchor':'middle',class:'node-glyph'});glyph.textContent=index?'MD':'◉';group.append(glyph);
      let drag=null,moved=false;
      group.addEventListener('pointerdown',event=>{drag={horizontal:event.clientX,vertical:event.clientY};moved=false;group.setPointerCapture(event.pointerId);});
      group.addEventListener('pointermove',event=>{if(!drag)return;const scale=780/svg.getBoundingClientRect().width;const deltaX=(event.clientX-drag.horizontal)*scale,deltaY=(event.clientY-drag.vertical)*scale;if(Math.abs(deltaX)+Math.abs(deltaY)>3)moved=true;item.horizontal=Math.max(35,Math.min(745,item.horizontal+deltaX));item.vertical=Math.max(35,Math.min(350,item.vertical+deltaY));group.setAttribute('transform',`translate(${item.horizontal} ${item.vertical})`);if(index){lines[index-1].setAttribute('x2',item.horizontal);lines[index-1].setAttribute('y2',item.vertical);}else for(const line of lines){line.setAttribute('x1',item.horizontal);line.setAttribute('y1',item.vertical);}drag={horizontal:event.clientX,vertical:event.clientY};});
      group.addEventListener('pointerup',()=>{drag=null;if(!moved)run(()=>openGraphItem(item))();});
      group.addEventListener('pointercancel',()=>{drag=null;});group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();run(()=>openGraphItem(item))();}});svg.append(group);
    });graph.append(svg);
  }

  api.onProject(project=>{if(current?.id===project.id){current=project;renderProject();}});
  api.onWorker(({projectId,missionId,event})=>{
    workerPanels=updateWorkerPanels(workerPanels,{projectId,missionId,event});
    if(current?.id===projectId&&missionId)renderWorkerArea(workerPanelKey(projectId,missionId));
  });
  run(async()=>{await refreshProjects();const saved=localStorage.getItem('sandubah-project');if(saved&&[...projectSelect.options].some(option=>option.value===saved)){current=await api.project({action:'get',id:saved});projectSelect.value=saved;}renderProject();})();
  return {
    continueProject:openProject,
    show(next){if(view==='harness')rememberWorkerReading();view=next;harness.hidden=next!=='harness';brain.hidden=next!=='brain';projectsView.hidden=next!=='projects';brainMap.setVisible(next==='brain');if(next==='projects')run(()=>projectsHub.show())();if(next==='harness'){renderWorkerArea(undefined,false);if(current)window.dispatchEvent(new CustomEvent('sandubah:project-selected',{detail:{id:current.id}}));}if(next==='brain')run(async()=>{await brainHub.show();await loadIndex();renderIndex();if(!activeDocument)await openDocument(current?'HARNESS.md':'AGENTS.md',current?.id);})();},
    status(status){busy=status.busy;if(view==='harness')renderProject();},
  };
}
