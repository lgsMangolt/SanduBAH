import {createInterview} from './interview.mjs';

// Barra de passos do projeto. Lê o estado real no processo principal e só altera algo por ação explícita.
const statusLabels={done:'Feito',active:'Em andamento',pending:'Pendente',skipped:'Desligado'};
const node=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
const button=(text,action,className='button')=>{const value=node('button',className,text);value.type='button';value.addEventListener('click',action);return value;};

export function createProjectTrack({api,projectId,run,notify,onProjectChanged,openPrompt,isBusy=()=>false}){
  const section=node('section','world-card project-track');section.setAttribute('aria-label','Trilha do projeto');
  let track=null,selected=null,interviewOpen=false;
  const key=`sandubah-track:${projectId}`;
  try{selected=localStorage.getItem(key);}catch{}

  async function load(){
    track=await api.knowledge({action:'track',id:projectId});
    if(!track.steps.some(step=>step.id===selected))selected=track.current||'refined';
    draw();
  }
  function choose(id){selected=id;interviewOpen=false;try{localStorage.setItem(key,id);}catch{}draw();}
  function draw(){
    if(!section.isConnected&&section.childElementCount)return;
    section.replaceChildren();
    const heading=node('div','project-track-heading');heading.append(node('h3','','Trilha do projeto'),node('p','muted','Do prompt enxuto ao protótipo. Cada passo mostra o que existe de verdade nos arquivos do projeto.'));
    const list=node('ol','project-track-steps');
    track.steps.forEach((step,index)=>{
      const item=node('li',`project-track-step is-${step.status}${step.id===selected?' is-selected':''}`);
      const pick=button('',()=>choose(step.id),'project-track-button');pick.setAttribute('aria-current',step.id===selected?'step':'false');
      pick.append(node('span','project-track-number',step.status==='done'?'✓':String(index+1)),node('span','project-track-title',step.title),node('span','project-track-status',statusLabels[step.status]));
      item.append(pick);list.append(item);
    });
    section.append(heading,list,detail(track.steps.find(step=>step.id===selected)));
  }
  function detail(step){
    const panel=node('div','project-track-detail');panel.append(node('h4','',step.title),node('p','muted',step.detail));
    const actions=node('div','project-track-actions');
    if(step.id==='grill'&&step.status!=='skipped'){
      actions.append(button(interviewOpen?'Fechar briefing':'Responder briefing',interviewOpen?run(async()=>{interviewOpen=false;await load();}):()=>{interviewOpen=true;draw();}));
      if(interviewOpen)panel.append(createInterview({api,projectId:'harness:'+projectId,answers:track.answers,onSaved:()=>{}}));
    }
    if(step.id==='refined'){
      const generate=button(track.prompt?'Gerar de novo a partir do briefing':'Gerar prompt refinado',run(async()=>{
        const result=await api.knowledge({action:'refine-prompt',id:projectId,version:track.prompt?.version});
        track=result;notify(result.backup?'Prompt refinado gerado de novo. A versão anterior ficou salva no histórico do harness.':'Prompt refinado salvo em PROMPT.md. Ele entra no contexto das próximas missões.');draw();
      }),'button primary');generate.disabled=isBusy();actions.append(generate);
      if(track.prompt){
        actions.append(button('Abrir e editar PROMPT.md',run(()=>openPrompt('PROMPT.md'))));
        const preview=node('details','project-track-preview');preview.append(node('summary','','Ver o prompt refinado'),node('pre','',track.prompt.content));panel.append(preview);
      }
    }
    if(step.id==='draft'){
      const prepare=button('Preparar rascunho na fila',run(async()=>{track=await api.knowledge({action:'prepare-draft',id:projectId});notify('Missão de rascunho adicionada à fila. Executar ainda pede a sua confirmação.');await onProjectChanged();}),'button primary');
      prepare.disabled=isBusy()||!track.prompt||step.status!=='pending';actions.append(prepare);
      if(!track.prompt)panel.append(node('p','muted','Gere o prompt refinado primeiro: o rascunho é feito a partir dele.'));
    }
    if(step.id==='prototypes')panel.append(node('p','muted','Adicione as missões de protótipo no quadro abaixo depois de revisar o PLAN.md. Cada aplicação na cópia gera um checkpoint.'));
    if(actions.childElementCount)panel.append(actions);
    return panel;
  }
  run(load)();
  return section;
}
