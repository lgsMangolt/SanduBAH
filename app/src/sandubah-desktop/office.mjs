import {updateWorkerPanels,workerPanelKey,workerPanelView} from './ui-model.mjs';
import {officeBlocks,officeHandoffs,officeThemes} from './office-pixel.mjs';
import {createPixelRoom} from './office-art.mjs';
const labels={pending:'Na fila · aguarda confirmação',running:'Em execução',done:'Concluída',error:'Precisa de revisão',unknown:'Resultado não confirmado'};
export function officeAgentState(project,agent){
  const missions=project.missions.filter(mission=>mission.agentId===agent.id);
  const mission=missions.find(item=>item.status==='running')||missions.find(item=>item.status==='pending')||missions.at(-1);
  return {mission,status:mission?.status||'idle',label:mission?labels[mission.status]||'Estado não reconhecido':'Sem missão · ocioso'};
}
export function createOffice({api,container,onContinue}){
  const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
  let projects=new Map(),panels=new Map(),visible=false,loading=false,selected=null,timer;
  let scenes=[],frame,lastFrame=0,arrangement='room',moving=true;
  const deliveries=new Map(),seenDeliveries=new Set(),preferences=new Map();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let dimension='2d';try{dimension=localStorage.getItem('sandubah-office-mode')||'2d';}catch{}
  if(!['2d','3d'].includes(dimension))dimension='2d';
  try{arrangement=localStorage.getItem('sandubah-office-arrangement')==='tower'?'tower':'room';moving=localStorage.getItem('sandubah-office-motion')!=='off';}catch{}
  const toolbar=node('div',undefined,'world-toolbar'),mode=node('select');mode.id='office-mode';mode.setAttribute('aria-label','Visual do escritório');mode.add(new Option('2D · estúdio minimalista (modelo 5)','2d'));mode.add(new Option('3D · galpão pixel isométrico','3d'));mode.value=dimension;
  mode.onchange=()=>{dimension=mode.value;try{localStorage.setItem('sandubah-office-mode',dimension);}catch{}render();};
  const refresh=node('button','Atualizar escritório','button');refresh.type='button';refresh.onclick=()=>load();
  const projectFilter=node('select');projectFilter.id='office-project';projectFilter.setAttribute('aria-label','Harness no escritório');projectFilter.add(new Option('Todos os harness',''));projectFilter.onchange=()=>render();
  const layout=node('select');layout.id='office-layout';layout.setAttribute('aria-label','Organizar blocos');layout.add(new Option('Sala · blocos lado a lado','room'));layout.add(new Option('Torre · um bloco por andar','tower'));layout.value=arrangement;
  layout.onchange=()=>{arrangement=layout.value;try{localStorage.setItem('sandubah-office-arrangement',arrangement);}catch{}render();};
  const motion=node('button',undefined,'button');motion.id='office-motion';motion.type='button';
  const motionLabel=()=>{motion.textContent=reduced.matches?'Movimento reduzido pelo sistema':moving?'Pausar animações':'Retomar animações';motion.disabled=reduced.matches;motion.setAttribute('aria-pressed',String(moving&&!reduced.matches));};
  motion.onclick=()=>{moving=!moving;try{localStorage.setItem('sandubah-office-motion',moving?'on':'off');}catch{}motionLabel();draw(performance.now());};motionLabel();reduced.addEventListener('change',()=>{motionLabel();draw(performance.now());});
  const status=node('p','Nenhuma consulta iniciada.','muted');status.setAttribute('role','status');
  const rooms=node('div',undefined,'office-rooms'),detail=node('section',undefined,'world-card office-detail');detail.hidden=true;detail.setAttribute('aria-label','Detalhes do agente');
  toolbar.append(projectFilter,mode,layout,motion,refresh);container.append(node('h2','Nosso galpão de agentes'),node('p','Cada harness ganha blocos de até quatro mesas. Brasil, chimarrão e arcade; um worker por vez. O 3D é uma projeção isométrica em pixel art, sem carregar modelos de IA.','muted'),node('p','Mesa: execução real · arcade: sem missão ativa · aviso: aguarda confirmação ou revisão. Entregas representam dependências concluídas, não agentes executando em paralelo.','muted'),toolbar,status,rooms,detail);
  function draw(time,force=false){for(const scene of scenes){const bounds=scene.canvas.getBoundingClientRect();if(force||bounds.bottom>0&&bounds.top<innerHeight)scene.renderer.draw({...scene,time,motion:moving&&!reduced.matches,handoffs:deliveries.get(scene.projectId)||[]});}}
  function animate(time){
    if(!visible||dimension!=='3d'){frame=null;return;}
    if(!document.hidden&&time-lastFrame>83){if(moving&&!reduced.matches)draw(time);lastFrame=time;}
    frame=requestAnimationFrame(animate);
  }
  function render(){
    if(!visible)return;rooms.dataset.dimension=dimension;rooms.dataset.layout=arrangement;for(const scene of scenes)scene.renderer.dispose();rooms.replaceChildren();scenes=[];
    const chosenProject=projectFilter.value;projectFilter.replaceChildren(new Option('Todos os harness',''));for(const project of projects.values())projectFilter.add(new Option(project.name,project.id));projectFilter.value=projects.has(chosenProject)?chosenProject:'';
    if(!projects.size)rooms.append(node('p','Nenhum harness ainda. Planeje em Novo projeto e acompanhe em Meus projetos.','muted'));
    for(const project of projects.values()){
      if(projectFilter.value&&projectFilter.value!==project.id)continue;
      const room=node('article',undefined,'office-room');room.dataset.projectId=project.id;
      const done=project.missions.filter(item=>item.status==='done').length;
      room.append(node('h3',project.name),node('p',`${done}/${project.missions.length} missões concluídas · ${project.agents.length} agentes cadastrados`,'muted'));
      const progress=node('progress');progress.max=Math.max(1,project.missions.length);progress.value=done;progress.setAttribute('aria-label',`Missões concluídas de ${project.name}`);room.append(progress);
      const theme=node('select');theme.setAttribute('aria-label',`Ambiente de ${project.name}`);
      for(const [value,label] of Object.entries(officeThemes))theme.add(new Option(label,value));
      let chosen=preferences.get(project.id);if(!chosen){try{chosen=localStorage.getItem(`sandubah-office-theme:${project.id}`);}catch{}chosen=Object.hasOwn(officeThemes,chosen)?chosen:project.agents.some(agent=>/research|memory/.test(agent.role))?'biblioteca':project.agents.some(agent=>/test|review/.test(agent.role))?'laboratorio':'galpao';preferences.set(project.id,chosen);}
      theme.value=chosen;theme.onchange=()=>{preferences.set(project.id,theme.value);try{localStorage.setItem(`sandubah-office-theme:${project.id}`,theme.value);}catch{}render();};room.append(theme);
      const blocks=node('div',undefined,'office-blocks');blocks.dataset.layout=arrangement;
      if(dimension==='3d')for(const block of officeBlocks(project)){
        const section=node('section',undefined,'office-block'),canvas=node('canvas');canvas.className='office-pixel';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${project.name}, bloco ${block.number}. Consulte estados e agentes nos botões abaixo.`);
        section.append(node('h4',`${arrangement==='tower'?'Andar':'Bloco'} ${block.number} · ${officeThemes[chosen]}`),canvas);blocks.append(section);
        canvas.onclick=event=>{const bounds=canvas.getBoundingClientRect(),id=renderer.hit((event.clientX-bounds.left)*canvas.width/bounds.width,(event.clientY-bounds.top)*canvas.height/bounds.height);if(id){selected={projectId:project.id,agentId:id};renderDetail();detail.scrollIntoView({block:'nearest'});}};
        const renderer=createPixelRoom(canvas);scenes.push({renderer,canvas,projectId:project.id,agents:block.agents,states:new Map(project.agents.map(agent=>[agent.id,officeAgentState(project,agent)])),theme:chosen});
      }
      room.append(blocks);
      const handoffs=deliveries.get(project.id)||[];
      if(handoffs.length){const latest=handoffs.at(-1),from=project.agents.find(item=>item.id===latest.from),to=project.agents.find(item=>item.id===latest.to);room.append(node('p',`Entrega registrada: ${from?.name} → ${to?.name} · ${latest.title}`,'office-delivery'));}
      const floor=node('div',undefined,'office-floor');
      if(!project.agents.length)floor.append(node('p','Sala vazia: adicione agentes no harness.','muted'));
      for(const agent of project.agents){
        const state=officeAgentState(project,agent),desk=node('button',undefined,'office-desk');desk.type='button';desk.dataset.state=state.status;desk.dataset.agentId=agent.id;
        const avatar=node('span',undefined,'office-station');avatar.setAttribute('aria-hidden','true');
        avatar.append(node('span',undefined,'office-table'),node('span','▰','office-monitor'),node('span',undefined,'office-chair'),node('span',undefined,'office-avatar'));
        const mission=state.mission,panel=mission&&panels.get(workerPanelKey(project.id,mission.id));
        desk.append(avatar,node('strong',agent.name||agent.role||'Agente'),node('span',state.label,'office-state'),node('small',mission?.title||'Nenhuma execução iniciada'));
        if(panel&&mission.status==='running')desk.append(node('small',workerPanelView(panel).label));
        desk.onclick=()=>{selected={projectId:project.id,agentId:agent.id};renderDetail();detail.scrollIntoView({block:'nearest',behavior:'auto'});};floor.append(desk);
      }
      room.append(floor);const open=node('button','Continuar no harness','button');open.type='button';open.onclick=()=>onContinue(project.id).catch(error=>{status.textContent=error.message;});room.append(open);rooms.append(room);
    }
    renderDetail();
    draw(performance.now(),true);if(dimension==='3d'&&!frame)frame=requestAnimationFrame(animate);
  }
  function renderDetail(){
    const project=projects.get(selected?.projectId),agent=project?.agents.find(item=>item.id===selected?.agentId);detail.hidden=!agent;if(!agent)return;detail.replaceChildren();
    detail.append(node('h3',`${agent.name||agent.role} · ${project.name}`));
    const missions=project.missions.filter(item=>item.agentId===agent.id);
    if(!missions.length)detail.append(node('p','Agente cadastrado, sem missão. Não há um processo de IA em execução para esta mesa.'));
    for(const mission of missions){
      const row=node('article',undefined,'office-mission');row.append(node('h4',mission.title),node('p',labels[mission.status]||'Estado não reconhecido'));
      const panel=panels.get(workerPanelKey(project.id,mission.id));
      if(panel){const view=workerPanelView(panel);row.append(node('p',view.label));for(const item of panel.items.slice(-3))row.append(node('p',item.summary||item.message||item.text||(item.command?'Comando do executor recebido':'Evento recebido')));for(const evidence of view.evidence)row.append(node('p',`Testes reportados: ${evidence.passed??'não informado'} aprovados · ${evidence.failed??'não informado'} falhos`));}
      else row.append(node('p','Sem eventos detalhados nesta sessão. Abra o harness para revisar o resultado salvo.','muted'));detail.append(row);
    }
  }
  async function load(){
    if(loading)return;loading=true;refresh.disabled=true;status.textContent='Lendo os harness locais…';
    try{const list=await api.project({action:'list'}),next=new Map();for(const item of list)next.set(item.id,await api.project({action:'get',id:item.id}));projects=next;status.textContent=`Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · eventos acompanhados enquanto o painel está aberto`;render();}
    catch(error){status.textContent=`Não foi possível atualizar: ${error.message}. O último retrato pode estar desatualizado.`;}finally{loading=false;refresh.disabled=false;}
  }
  api.onProject(project=>{
    clearTimeout(timer);
    for(const delivery of officeHandoffs(projects.get(project.id),project))if(!seenDeliveries.has(delivery.id)){seenDeliveries.add(delivery.id);deliveries.set(project.id,[...(deliveries.get(project.id)||[]),{...delivery,at:performance.now()}].slice(-12));}
    projects.set(project.id,project);render();
  });
  api.onWorker(payload=>{panels=updateWorkerPanels(panels,payload);if(visible){clearTimeout(timer);timer=setTimeout(render,200);}});
  return {show(view){visible=view==='office';container.hidden=!visible;if(visible)load();else{clearTimeout(timer);cancelAnimationFrame(frame);frame=null;}}};
}
