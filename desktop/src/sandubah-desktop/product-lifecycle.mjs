const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const statusLabels={done:'Concluída pelo checklist',active:'Em revisão',pending:'A iniciar',blocked:'Aguarda etapas anteriores'};
export function lifecycleOverview(lifecycle){
  const section=element('section','product-overview');section.setAttribute('aria-label','Progresso do produto');
  const pending=lifecycle.stages.find(stage=>stage.id===lifecycle.currentStage)?.status==='pending';
  section.append(element('strong','',`Produto · ${lifecycle.currentLabel}${pending?' · a iniciar':''}`));
  const progress=element('progress');progress.max=100;progress.value=lifecycle.progress;progress.setAttribute('aria-label','Progresso dos critérios do produto');
  section.append(progress,element('p','muted',`${lifecycle.done}/${lifecycle.total} critérios do produto · ${lifecycle.progress}% do checklist`));
  const phases=element('ol','product-phase-list');
  for(const stage of lifecycle.stages){const item=element('li','',`${stage.title} · ${stage.done}/${stage.total}`);item.dataset.status=stage.status;if(stage.id===lifecycle.currentStage)item.setAttribute('aria-current','step');phases.append(item);}
  section.append(phases,element('p','muted',lifecycle.reviewed?'Critérios revisados separadamente das missões. Marcar não implanta nem publica o produto.':'Conclusão do produto: não avaliada. Revise as etapas e registre evidências.'));
  return section;
}
export function createLifecycleEditor({document:initial,projectId,api,notify,onSaved}){
  const container=element('section','product-lifecycle');container.setAttribute('aria-label','Checklist das etapas do produto');let current=initial,busy=false;
  async function save(input){
    if(busy)return;busy=true;container.inert=true;
    try{const updated=await api.knowledge({action:'lifecycle-update',id:projectId,input:{...input,revision:current.revision}});current=updated;render();notify('Critério salvo neste projeto. Missões e confirmações permanecem separadas.');await onSaved?.(updated);}
    catch(error){notify(error.message,true);}finally{busy=false;container.inert=false;}
  }
  function render(){
    container.replaceChildren(lifecycleOverview(current.summary));
    container.append(element('p','muted','Conclua cada etapa com evidências antes de avançar. Estes registros são revisão do checklist, não uma certificação automática nem autorização para executar ações protegidas.'));
    for(const stage of current.stages){
      const state=current.summary.stages.find(candidate=>candidate.id===stage.id),details=element('details','product-stage');details.dataset.productStage=stage.id;details.open=stage.id===(current.summary.currentStage||'planning');
      details.append(element('summary','',`${stage.title} · ${state.done}/${state.total} · ${statusLabels[state.status]}`));
      for(const item of stage.items){
        const form=element('form','product-criterion');form.dataset.itemId=item.id;
        const label=element('label','product-check'),checkbox=element('input');checkbox.type='checkbox';checkbox.checked=item.done;checkbox.disabled=state.status==='blocked'&&!item.done;checkbox.setAttribute('aria-label',item.title);label.append(checkbox,element('span','',item.title));
        const evidenceLabel=element('label','product-evidence','Evidência ou referência da revisão'),evidence=element('textarea','text-input');evidence.rows=2;evidence.maxLength=2000;evidence.value=item.evidence;evidence.placeholder='Ex.: documento, teste executado, resultado e limitações.';evidence.setAttribute('aria-label',`Evidência: ${item.title}`);evidenceLabel.append(evidence);
        const submit=element('button','button','Salvar critério');submit.type='submit';
        form.append(label,evidenceLabel,submit);
        if(item.checkedAt)form.append(element('small','muted',`Revisão registrada em ${new Date(item.checkedAt).toLocaleString('pt-BR')}`));
        form.addEventListener('submit',event=>{event.preventDefault();save({operation:'check',stageId:stage.id,itemId:item.id,done:checkbox.checked,evidence:evidence.value});});details.append(form);
      }
      const add=element('form','product-add'),title=element('input','text-input');title.required=true;title.maxLength=240;title.placeholder='Critério específico deste projeto';title.setAttribute('aria-label',`Novo critério de ${stage.title}`);const submit=element('button','button','Adicionar critério');submit.type='submit';add.append(title,submit);add.addEventListener('submit',event=>{event.preventDefault();save({operation:'add',stageId:stage.id,title:title.value});});details.append(add);container.append(details);
    }
    container.append(element('small','muted',`Revisão ${current.revision} · ${current.history.length} registros no histórico local. Desmarcar um critério anterior bloqueia a promoção das etapas seguintes, sem apagar suas evidências.`));
  }
  render();return container;
}
