import {createModelCenter} from './models.mjs';
import {createPlannerSessions,plannerMessages} from './planner-sessions.mjs';
import {advanceReceipt,receiptView} from './planner-receipts.mjs';
import {createMediaPicker} from './media-ui.mjs';

export function createPlanner({api,notify}) {
  const byId=id=>document.getElementById(id);
  const state={ready:false,busy:false,running:false,switching:false,history:[],messages:[],image:null,model:'Qwen local',provider:'local',cloud:null,selection:null,efforts:{},projectId:'',loaded:false};
  const sessions=createPlannerSessions(localStorage,message=>notify(message,true)),images=new Map();
  state.projectId=sessions.active();
  const modeRow=document.createElement('div');modeRow.className='planner-work-mode';const modeLabel=document.createElement('label');modeLabel.textContent='O que vamos fazer?';modeLabel.htmlFor='planner-action';const action=document.createElement('select');action.id='planner-action';action.add(new Option('Conversar e planejar','plan'));action.add(new Option('Construir / alterar o projeto','code'));const executorNote=document.createElement('small');executorNote.className='qwen-note';executorNote.textContent='Construção usa o Codex instalado para criar arquivos e testar aqui.';modeRow.append(modeLabel,action,executorNote);byId('qwen-form').prepend(modeRow);
  const mediaBox=document.createElement('div');mediaBox.className='media-picker';byId('qwen-prompt').after(mediaBox);byId('qwen-image').hidden=true;byId('qwen-image-name').hidden=true;
  const media=createMediaPicker({api,container:mediaBox,scope:()=>`planner:${state.projectId||'new'}`,notify});
  action.onchange=()=>{saveSession();controls();};
  const typing=document.createElement('article');typing.id='planner-typing';typing.className='qwen-typing';typing.setAttribute('role','status');typing.setAttribute('aria-live','polite');
  const typingLabel=document.createElement('span'),dots=document.createElement('span');dots.className='qwen-typing-dots';dots.setAttribute('aria-hidden','true');for(let index=0;index<3;index++)dots.append(document.createElement('i'));typing.append(typingLabel,dots);
  let revision=0;
  function saveSession(){
    if(!state.loaded)return;
    images.set(state.projectId,state.image);
    sessions.save(state.projectId,{history:state.history,messages:state.messages,prompt:byId('qwen-prompt').value,selection:state.selection,efforts:state.efforts,usage:byId('brain-token-usage').textContent,sourceId:byId('brain-context-source').value,action:action.value});
  }
  function restoreSession(){
    const saved=sessions.load(state.projectId);state.history=saved?.history||[];state.messages=plannerMessages(saved?.messages||[]);state.efforts=saved?.efforts||{};state.selection=saved?.selection||null;state.image=images.get(state.projectId)||null;state.sourceId=saved?.sourceId||'';
    action.value=saved?.action==='code'?'code':'plan';media.refresh(`planner:${state.projectId||'new'}`).catch(error=>notify(error.message,true));window.dispatchEvent(new CustomEvent('sandubah:project-selected',{detail:{id:state.projectId}}));
    byId('qwen-prompt').value=saved?.prompt||'';byId('qwen-messages').replaceChildren();
    for(const [index,item]of state.messages.entries()){message(item.role,item.text,item.model,false);if(item.delivery)setDelivery(index,item.delivery);}
    byId('qwen-image-name').textContent=state.image?.name||'Nenhum diagrama';byId('brain-token-usage').textContent=saved?.usage||'Tokens usados: ainda não há geração nesta conversa.';
    byId('brain-context-summary').textContent='A busca usará os documentos deste projeto ao enviar.';byId('brain-context-sources').replaceChildren();
    const source=saved?.sourceId||'';if([...byId('brain-context-source').options].some(option=>option.value===source))byId('brain-context-source').value=source;
    state.loaded=true;
  }
  function resourceAdvice(){
    if(state.provider!=='local'){byId('planner-resource-hint').hidden=true;byId('qwen-status').hidden=false;return;}
    const readings=state.resources?Object.values(state.resources):[];
    const shortages=readings.filter(reading=>reading.state==='low');
    const showAdvice=state.ready&&!state.running&&shortages.length>0&&!state.memoryError;
    byId('planner-resource-hint').hidden=!showAdvice;
    byId('qwen-status').hidden=showAdvice;
    byId('planner-resource-hint').textContent=`IA aprovada. ${shortages.map(reading=>reading.detail).join('. ')}. Libere memória antes de enviar.`;
    if(state.memoryError&&readings.length===2&&readings.every(reading=>reading.state==='good')){state.memoryError=false;byId('qwen-status').textContent='Memória inicial disponível. Você pode tentar enviar novamente.';}
  }
  function controls(){
    const locked=state.busy||state.switching;
    const executor=state.cloud?.providers.find(provider=>provider.id==='codex'),canCode=Boolean(executor?.installed&&executor?.authenticated);
    byId('qwen-send').disabled=!(action.value==='code'?canCode:state.ready)||locked;
    byId('qwen-send').textContent=action.value==='code'?'Construir no projeto →':'Planejar meu projeto →';action.disabled=locked;media.setBusy(locked);
    byId('planner-provider').disabled=locked;
    byId('planner-cloud-model').disabled=locked||state.provider==='local';
    byId('planner-effort').disabled=locked||state.provider==='local'||byId('planner-effort').options.length===1;
    for(const id of ['qwen-image','qwen-clear','qwen-project','qwen-prompt','brain-context-mode','brain-context-source','brain-context-refresh','brain-context-preview'])byId(id).disabled=locked;
    byId('qwen-image').disabled=locked||state.provider!=='local';
    byId('qwen-stop').textContent=action.value==='code'?'Interromper agente':state.provider==='local'?'Interromper Qwen':'Interromper planejador';
    for(const button of byId('planner-account-quotas').querySelectorAll('button'))button.disabled=state.busy;
    byId('qwen-stop').disabled=!state.running;
    for(const button of document.querySelectorAll('[data-planner-option]'))button.disabled=locked;
    byId('planner-empty').hidden=false;
    resourceAdvice();
  }
  const retrievalKey=()=>`sandubah-brain-mode:${byId('qwen-project').value||'new'}`;
  function restoreContextMode(){let value;try{value=localStorage.getItem(retrievalKey());}catch{}byId('brain-context-mode').value=value==='complete'?'complete':'economic';}
  function contextPayload(prompt=byId('qwen-prompt').value.trim()){return {prompt,projectId:byId('qwen-project').value,contextMode:byId('brain-context-mode').value,retrievalSourceId:byId('brain-context-source').value||undefined,mediaScope:media.scope()};}
  function renderContext(report){
    byId('brain-context-summary').textContent=`${report.mode==='economic'?'Econômico':'Completo'} · ${report.included.length} fonte(s)/trecho(s) · ${report.characters.toLocaleString('pt-BR')}/${report.limit.toLocaleString('pt-BR')} caracteres · ~${report.estimatedTokens.toLocaleString('pt-BR')} tokens estimados de contexto · ${report.message}${state.history.length>6?' Histórico: últimas 6 mensagens; '+(state.history.length-6)+' antigas fora do envio.':''}`;
    const container=byId('brain-context-sources');container.replaceChildren();
    const method=document.createElement('p');method.className='qwen-note';method.textContent=report.tokenMethod;container.append(method);
    for(const warning of report.scanWarnings||[]){const item=document.createElement('p');item.className='qwen-note';item.textContent='Aviso do índice: '+warning;container.append(item);}
    if(report.legalReference){const legal=report.legalReference,item=document.createElement('p');item.className='qwen-note';item.textContent=`Referência jurídica: ${legal.included.length} artigo(s) selecionado(s). Cobertura não exaustiva; vigência oficial ainda precisa ser conferida.`;container.append(item);for(const source of legal.included){const detail=document.createElement('p');detail.className='qwen-note';detail.textContent=`Lei: ${source.id} · linhas ${source.startLine}–${source.endLine} · fonte oficial: ${source.source}`;container.append(detail);}for(const source of legal.excluded){const detail=document.createElement('p');detail.className='qwen-note';detail.textContent=`Consulta pendente: ${source.id} · ${source.reason}`;container.append(detail);}}
    if(report.sharedReference){const shared=report.sharedReference,item=document.createElement('p');item.className='qwen-note';item.textContent=`Central: ${shared.included.length} trecho(s) relevante(s); ${shared.excluded.length} fora desta consulta.`;container.append(item);for(const source of shared.included){const detail=document.createElement('p');detail.className='qwen-note';detail.textContent=`C${source.citation.slice(1)} · ${source.label} · linhas ${source.startLine}–${source.endLine}`;container.append(detail);}for(const source of shared.excluded){const detail=document.createElement('p');detail.className='qwen-note';detail.textContent=`Central fora do envio: ${source.label} · ${source.reason}`;container.append(detail);}}
    for(const source of report.included){const item=document.createElement('p');item.className='qwen-note';item.textContent=`[${source.citation}] ${source.label} · ${source.title} · linhas ${source.startLine}–${source.endLine} · ${source.kind} · ~${source.estimatedTokens} tokens estimados · SHA-256 ${source.sha256}`;container.append(item);}
    let shown=0;const omitted=document.createElement('div');container.append(omitted);
    const more=document.createElement('button');more.type='button';more.className='button subtle';const showMore=()=>{for(const source of report.excluded.slice(shown,shown+25)){const item=document.createElement('p');item.className='qwen-note';item.textContent=`Fora: ${source.label}${source.title?' · '+source.title:''}${source.startLine?' · linhas '+source.startLine+'–'+source.endLine:''} · ${source.reason}`;omitted.append(item);}shown=Math.min(shown+25,report.excluded.length);more.textContent=`Ver mais exclusões (${shown}/${report.excluded.length})`;more.hidden=shown>=report.excluded.length;};more.addEventListener('click',showMore);container.append(more);showMore();
  }
  async function refreshSources(scan=false){const snapshot=await api.knowledge({action:scan?'refresh':'status'}),select=byId('brain-context-source'),selected=state.sourceId||select.value;select.replaceChildren(new Option('Somente referências anexadas ao harness',''));for(const source of snapshot.sources)select.add(new Option(`${source.name} · ${source.documents} notas`,source.id));if([...select.options].some(option=>option.value===selected))select.value=selected;}
  async function previewContext(){const report=await api.plannerContext(contextPayload());renderContext(report);return report;}
  byId('brain-context-mode').addEventListener('change',()=>{try{localStorage.setItem(retrievalKey(),byId('brain-context-mode').value);}catch{}byId('brain-context-summary').textContent='Modo salvo para este projeto. A busca é refeita automaticamente ao enviar.';});
  byId('qwen-project').addEventListener('change',async()=>{saveSession();state.projectId=byId('qwen-project').value;sessions.activate(state.projectId);restoreSession();restoreContextMode();state.switching=true;controls();try{await refresh();}finally{state.switching=false;controls();}});
  byId('qwen-prompt').addEventListener('input',saveSession);
  byId('brain-context-source').addEventListener('change',()=>{state.sourceId=byId('brain-context-source').value;saveSession();});
  byId('brain-context-preview').addEventListener('click',async()=>{try{await previewContext();}catch(error){notify(error.message,true);}});
  byId('brain-context-refresh').addEventListener('click',async()=>{try{await refreshSources(true);notify('Índice local atualizado; nenhuma IA foi chamada.');}catch(error){notify(error.message,true);}});
  function renderAccounts(){
    if(!state.cloud)return;
    byId('planner-provider').value=state.provider;
    const selected=state.cloud.providers.find(provider=>provider.id===state.provider),choices=byId('planner-cloud-model');choices.replaceChildren();
    if(!selected)choices.add(new Option('Use os modelos locais ao lado',''));
    else{for(const model of selected.models)choices.add(new Option(`${model.tier} · ${model.name}`,model.id));choices.value=state.cloud.selection.model||'';}
    const effort=byId('planner-effort'),model=selected?.models.find(item=>item.id===choices.value),labels={low:'Baixa · mais rápida',medium:'Média · equilibrada',high:'Alta',xhigh:'Extra',max:'Máxima'};
    effort.replaceChildren(new Option('Automática · padrão do modelo',''));
    for(const level of model?.effortLevels||[])effort.add(new Option(labels[level]||level,level));
    effort.value=state.cloud.selection.effort||'';
    byId('planner-effort-hint').textContent=state.provider==='local'?'Este motor local usa a força definida pelo próprio modelo.':'Salva para cada modelo neste projeto. Mais força pode aumentar o tempo e o uso da sua cota.';
    byId('planner-cloud-info').textContent=state.provider==='local'?'Qwen roda neste PC; os testes e o limite de 3,9 GB permanecem. Você também pode escolher Codex ou Claude na nuvem.':`${selected?.installed?'CLI encontrada':'CLI não instalada'} · ${selected?.authenticated?'login local encontrado, acesso ao modelo será verificado ao enviar':'login não encontrado'}. Inferência na nuvem: não requer VRAM local. Mensagem e Markdown só são enviados após confirmação. Fable pode consumir créditos extras. O SanduBAH não troca de modelo por conta própria.`;
    const accounts=byId('planner-account-quotas');accounts.replaceChildren();
    for(const provider of state.cloud.providers){
      const card=document.createElement('section');card.className='cloud-quota';const title=document.createElement('strong');title.textContent=provider.name;card.append(title);
      const note=document.createElement('p');note.className='qwen-note';note.textContent=provider.quota.message;card.append(note);
      const stale=!provider.quota.checkedAt||Date.now()-Date.parse(provider.quota.checkedAt)>300000;
      for(const window of provider.quota.windows){const label=document.createElement('p');label.className='qwen-note';label.textContent=`${window.name}: ${window.remainingPercent.toFixed(0)}% restante${stale?' · leitura antiga, atualize':''}${window.resetsAt?' · renova '+new Date(window.resetsAt).toLocaleString('pt-BR'):''}`;const bar=document.createElement('progress');bar.max=100;bar.value=window.remainingPercent;bar.setAttribute('aria-label',`${provider.name} · ${window.name} · restante`);card.append(label,bar);}
      if(provider.quota.checkedAt){const date=document.createElement('small');date.textContent='Consultado em '+new Date(provider.quota.checkedAt).toLocaleString('pt-BR');card.append(date);}
      const update=document.createElement('button');update.type='button';update.className='button subtle';update.textContent=`Atualizar cota ${provider.name}`;update.disabled=state.busy;
      update.addEventListener('click',async()=>{try{update.disabled=true;await api.plannerQuota(provider.id);await refresh();}catch(error){notify(error.message,true);}finally{update.disabled=state.busy;}});card.append(update);accounts.append(card);
    }
  }
  function message(role,text,model=state.model,record=true){
    if(record)state.messages.push({role,text,model,at:new Date().toISOString()});
    const index=record?state.messages.length-1:byId('qwen-messages').querySelectorAll('.qwen-message').length,item=state.messages[index];
    const article=document.createElement('article');article.className=`qwen-message ${role}`;article.dataset.messageIndex=String(index);
    const label=document.createElement('strong');label.textContent=role==='user'?'Você':`SanduBAH · ${model}`;
    const content=document.createElement('p');content.textContent=text;
    const footer=document.createElement('footer');footer.className='qwen-message-footer';
    const date=new Date(item?.at);if(Number.isFinite(date.getTime())){const time=document.createElement('time');time.dateTime=item.at;time.textContent=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});footer.append(time);}
    article.append(label,content,footer);const messages=byId('qwen-messages');messages.insertBefore(article,typing.parentElement===messages?typing:null);article.scrollIntoView({block:'nearest'});
  }
  function setDelivery(index,delivery){
    const item=state.messages[index];if(!item)return;
    if(delivery==='sending'){item.delivery='sending';item.receipt='queued';}
    else if(['sent','delivered','read'].includes(delivery)){item.delivery='sending';item.receipt=advanceReceipt(item.receipt,delivery);}
    else{item.delivery=delivery;if(delivery==='answered')item.receipt='read';}
    const article=byId('qwen-messages').querySelector(`[data-message-index="${index}"]`);if(!article)return;
    let status=article.querySelector('.qwen-delivery');
    if(!status){status=document.createElement('span');status.className='qwen-delivery';status.setAttribute('role','status');article.querySelector('footer').append(status);}
    const view=receiptView(item);status.replaceChildren();status.dataset.receipt=view.receipt;status.setAttribute('aria-label',view.note?`${view.label}. ${view.note}`:view.label);status.title=status.getAttribute('aria-label');
    const marks=document.createElement('span');marks.className=view.ticks?'qwen-receipt-ticks':'qwen-receipt-clock';marks.setAttribute('aria-hidden','true');
    for(let count=0;count<view.ticks;count++){const tick=document.createElement('span');tick.textContent='✓';marks.append(tick);}status.append(marks);
    let note=article.querySelector('.qwen-delivery-note');if(!note){note=document.createElement('small');note.className='qwen-delivery-note';article.append(note);}note.textContent=view.note;note.hidden=!view.note;
  }
  function showTyping(receipt){
    if(!state.running||state.stopping||!['delivered','read'].includes(receipt)){typing.remove();return;}
    typingLabel.textContent=`${state.model} ${receipt==='read'?'respondendo':'preparando a resposta'}`;byId('qwen-messages').append(typing);typing.scrollIntoView({block:'nearest'});
  }
  async function refresh(){
    const requested=++revision;
    try{
      let status=await api.plannerStatus();if(requested!==revision)return;
      const project=byId('qwen-project');project.replaceChildren(new Option('Nova ideia — sem harness existente',''));
      for(const item of status.projects)project.add(new Option(item.name,item.id));
      if(![...project.options].some(option=>option.value===state.projectId))state.projectId='';
      project.value=state.projectId;
      if(!state.loaded)restoreSession();
      if(state.selection&&JSON.stringify({...state.selection,effort:state.selection.effort||null})!==JSON.stringify({...status.cloud.selection,effort:status.cloud.selection.effort||null})){
        await api.plannerSelect(state.selection);status=await api.plannerStatus();if(requested!==revision)return;
      }
      state.ready=status.ready;state.selection={...status.cloud.selection};
      state.cloud=status.cloud;state.provider=status.cloud?.selection.provider||'local';renderAccounts();
      document.body.dataset.plannerProvider=state.provider;
      state.model=status.model;
      byId('model-current').textContent=`${status.model} · um worker · ${state.provider==='local'?'teto de 3,9 GB':'inferência na nuvem'}`;
      document.querySelector('.planner-local-badge').textContent=state.provider==='local'?'● No seu PC':'● Sua conta na nuvem';
      if(state.provider!=='local')byId('planner-use-ready').hidden=true;
      byId('qwen-status').textContent=status.message;
      byId('planner-state-title').textContent=status.ready?'IA pronta para planejar':'Esta IA ainda não está disponível';
      byId('planner-readiness').dataset.state=status.ready?'ready':'blocked';
      restoreContextMode();
      if(state.provider!=='local')byId('qwen-metrics').textContent='Fotos e quadros de vídeo podem ser enviados após confirmação. Nuvem usa a cota da conta, sem reserva de VRAM local.';
      else if(status.validation)byId('qwen-metrics').textContent=`Último teste: pico amostrado de ${(status.validation.devicePeakSampledBytes/1e9).toFixed(2)} GB na GPU inteira, incluindo outros apps.`;
      else byId('qwen-metrics').textContent='Este modelo ainda não tem validação aprovada nesta versão.';
      await refreshOptions();controls();
    }catch(error){if(requested!==revision)return;state.ready=false;byId('qwen-status').textContent=error.message;byId('planner-state-title').textContent='Não foi possível consultar a IA';controls();}
  }
  async function selectCloud(provider,model,effort=state.efforts[`${provider}:${model}`]||null){
    saveSession();++revision;state.switching=true;controls();
    try{const result=await api.plannerSelect({provider,model,effort});state.selection={...result.selection};state.efforts[`${provider}:${model}`]=effort;saveSession();await refresh();}
    catch(error){notify(error.message,true);await refresh();}
    finally{state.switching=false;controls();}
  }
  byId('planner-provider').addEventListener('change',()=>{const provider=byId('planner-provider').value;selectCloud(provider,state.cloud?.providers.find(entry=>entry.id===provider)?.models[0]?.id);});
  byId('planner-cloud-model').addEventListener('change',()=>selectCloud(state.provider,byId('planner-cloud-model').value));
  byId('planner-effort').addEventListener('change',()=>selectCloud(state.provider,byId('planner-cloud-model').value,byId('planner-effort').value||null));
  async function refreshOptions(){const id=state.projectId,options=await api.knowledge({action:'planner-options',projectId:id});if(id!==state.projectId)return;for(const button of document.querySelectorAll('[data-planner-option]'))button.setAttribute('aria-pressed',String(options[button.dataset.plannerOption]===true));}
  for(const button of document.querySelectorAll('[data-planner-option]'))button.addEventListener('click',async()=>{if(state.busy||state.switching)return;state.switching=true;controls();try{await api.knowledge({action:'planner-options',projectId:state.projectId,options:{[button.dataset.plannerOption]:button.getAttribute('aria-pressed')!=='true'}});await refreshOptions();byId('brain-context-summary').textContent='Preferências salvas neste projeto. Serão aplicadas ao contexto no próximo envio.';}catch(error){notify(error.message,true);}finally{state.switching=false;controls();}});
  byId('qwen-image').addEventListener('click',async()=>{
    try{const selected=await api.plannerImage();if(selected){state.image=selected;byId('qwen-image-name').textContent=selected.name;saveSession();}}catch(error){notify(error.message,true);}
  });
  byId('qwen-clear').addEventListener('click',()=>{
    state.history=[];state.messages=[];state.image=null;byId('qwen-messages').replaceChildren();byId('qwen-image-name').textContent='Nenhum diagrama';byId('qwen-prompt').value='';
    byId('brain-token-usage').textContent='Tokens usados: ainda não há geração nesta conversa.';byId('brain-context-summary').textContent='O contexto será selecionado automaticamente ao enviar.';
    saveSession();controls();
  });
  byId('qwen-stop').addEventListener('click',async()=>{state.stopping=true;typing.remove();if(action.value==='code')await api.interruptWorker();else await api.plannerStop();byId('qwen-status').textContent='Interrompendo somente o worker desta tarefa…';});
  byId('qwen-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy||state.switching||byId('qwen-send').disabled)return;
    const prompt=byId('qwen-prompt').value.trim();if(!prompt)return;
    byId('brain-token-usage').textContent='Uso desta tentativa: aguardando contagem reportada pelo provedor.';
    state.busy=true;state.running=true;controls();
    const previous=state.messages.at(-1);
    if(previous?.role!=='user'||previous.text!==prompt||previous.delivery==='sent')message('user',prompt);
    const attempt=state.messages.length-1;state.attempt=attempt;state.stopping=false;setDelivery(attempt,'sending');saveSession();byId('qwen-status').textContent=state.provider==='local'?'Conferindo memória e iniciando um worker local…':'Revise o envio à nuvem. A consulta só começa após sua confirmação…';
    try{
      let response;
      if(action.value==='code'){byId('qwen-status').textContent='Preparando arquivos e missão do projeto. Revise a execução do Codex nesta tela…';response=await api.buildProject({...contextPayload(prompt),history:state.history.slice(-6)});}
      else{const context=await previewContext();if(context.blocked)throw new Error(context.message);response=await api.plannerChat({...contextPayload(prompt),contextFingerprint:context.fingerprint,history:state.history.slice(-6),imageId:state.provider==='local'?state.image?.id:undefined});}
      if(response.cancelled){setDelivery(attempt,'cancelled');byId('brain-token-usage').textContent='Envio cancelado antes da geração; nenhuma nova contagem de tokens.';byId('qwen-status').textContent='Envio cancelado. Nenhuma consulta ao modelo foi iniciada.';return;}
      if(response.contextInfo)renderContext(response.contextInfo);
      const usage=response.usage;const count=value=>Number.isSafeInteger(value)?value.toLocaleString('pt-BR'):'não informado';byId('brain-token-usage').textContent=`Uso reportado nesta geração: entrada ${count(usage?.inputTokens)} · saída ${count(usage?.outputTokens)} · entrada em cache ${count(usage?.cachedInputTokens)}. ${usage?.source||'O provedor não forneceu contagem.'} Inclui o envelope/histórico, não só os Markdown; não é estimativa de preço.`;
      const answer=response.answer+(response.tests?.length?'\n\nTestes reportados pelo agente:\n'+response.tests.join('\n'):'');setDelivery(attempt,'answered');typing.remove();message('assistant',answer,action.value==='code'?'Executor do projeto':state.model);state.history.push({role:'user',content:prompt},{role:'assistant',content:answer});
      byId('qwen-prompt').value='';
      byId('qwen-status').textContent=action.value==='code'?(response.success?'Projeto atualizado. Confira a prévia e os arquivos ao lado.':'A execução precisa de revisão. Confira as etapas e arquivos ao lado.'):response.truncated?'Limite de resposta atingido; o texto pode estar incompleto.':'Resposta concluída.';
      byId('qwen-metrics').textContent=action.value==='code'?`${response.model} · código e testes no workspace deste projeto.`:response.provider?`Geração: ${response.seconds.toFixed(1)} s · ${response.provider} · ${response.model} · somente planejamento.`:`Geração: ${response.seconds.toFixed(1)} s · GPU inteira: pico amostrado ${(response.devicePeakSampledBytes/1e9).toFixed(2)} GB · ${response.imageProcessed?'diagrama processado':'somente texto'}.`;
    }catch(error){setDelivery(attempt,'failed');byId('brain-token-usage').textContent='Esta tentativa não retornou contagem de tokens. Valores de gerações anteriores não se aplicam.';state.memoryError=/RAM|VRAM|memória/i.test(error.message);byId('qwen-status').textContent=error.message;notify(error.message,true);}
    finally{state.running=false;state.busy=false;state.attempt=null;state.stopping=false;typing.remove();saveSession();controls();}
  });
  api.onPlanner(event=>{if(event.type==='project'&&state.running&&action.value==='code'){state.projectId=event.projectId;sessions.activate(state.projectId);const select=byId('qwen-project');if(![...select.options].some(option=>option.value===event.projectId))select.add(new Option(event.name,event.projectId));select.value=event.projectId;media.refresh(`planner:${state.projectId}`).catch(error=>notify(error.message,true));window.dispatchEvent(new CustomEvent('sandubah:project-selected',{detail:{id:state.projectId}}));saveSession();}if(event.type==='progress')byId('qwen-status').textContent=event.message;if(event.type==='delivery'&&['sent','delivered','read'].includes(event.status)&&state.running&&Number.isInteger(state.attempt)&&!state.stopping){setDelivery(state.attempt,event.status);showTyping(state.messages[state.attempt].receipt);saveSession();}});
  api.onWorker(({projectId,event})=>{if(state.running&&action.value==='code'&&state.projectId===projectId){if(['turn.started','item.started','item.completed'].includes(event.type)){setDelivery(state.attempt,event.type==='turn.started'?'delivered':'read');showTyping(state.messages[state.attempt].receipt);}byId('qwen-status').textContent=event.item?.type==='file_change'?'O agente está atualizando os arquivos do projeto.':event.item?.type==='command_execution'?'O agente está executando código e testes.':'O agente está trabalhando no projeto.';}});
  const models=createModelCenter({api,notify,onSelect(){selectCloud('local',null);},onUpdate(){if(!state.running&&!state.switching)refresh();},onMemory(readings){state.resources=readings;resourceAdvice();}});
  return {async prepareTutorialProject(id,prompt){if(state.busy||state.running||state.switching)throw new Error('Aguarde o worker antes de preparar o exercício.');const existing=sessions.load(id);if(existing?.prompt||existing?.history?.length)throw new Error('Este projeto já tem conversa ou rascunho; nada foi sobrescrito.');saveSession();state.projectId=id;sessions.activate(id);restoreSession();byId('qwen-prompt').value=prompt;action.value='plan';saveSession();await refresh();},openProject(id){saveSession();state.projectId=id;sessions.activate(id);restoreSession();refresh();},show(view){byId('planner-view').hidden=view!=='planner';if(view==='planner'){window.dispatchEvent(new CustomEvent('sandubah:project-selected',{detail:{id:state.projectId}}));refresh();models.refresh();refreshSources().catch(error=>notify(error.message,true));}},status(status){state.busy=status.busy;controls();models.status(status);}};
}
