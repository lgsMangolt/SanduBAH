import {createFieldPanel} from './gaucho-field.mjs';
// Aba Gauchinhos: criar do zero, conversar, corrigir e dar uma base própria a cada agente personalizado.
const node=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
const button=(text,action,className='button')=>{const value=node('button',className,text);value.type='button';value.addEventListener('click',action);return value;};
const kib=bytes=>bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1).replace('.',',')} KB`:`${(bytes/1048576).toFixed(1).replace('.',',')} MB`;
const tabs=[['chat','Conversa'],['tasks','Tarefas'],['lessons','Lições'],['dataset','Dataset'],['field','Campo'],['tools','Ferramentas'],['knowledge','Base'],['settings','Ajustes']];
const sourceLabels={correction:'Correção',example:'Exemplo',task:'Tarefa',upload:'Arquivo',manual:'Escrito à mão'};
const levelLabels={insufficient:'Pouco para treinar',minimum:'Mínimo para um teste',good:'Bom volume'};
const taskStatus={pending:'Pendente',done:'Entregue',error:'Erro',review:'Esperando sua revisão',blocked:'Bloqueada por limite'};
const modeLabels={none:'Só texto',read:'Ler arquivos',write:'Ler e escrever'};
const changeLabels={new:'novo',modified:'alterado',deleted:'removido'};

export function weightLine(gaucho){return `${gaucho.lessons} ${gaucho.lessons===1?'lição':'lições'} · ${gaucho.documents} ${gaucho.documents===1?'documento':'documentos'} · ${kib(gaucho.weight.bytes)} · ~${gaucho.weight.lessonTokens.toLocaleString('pt-BR')} tokens de lições por mensagem`;}

export function createGauchos({api,container,notify}){
  let visible=false,list=[],current=null,tab='chat',busy=false,providers=[],sources=[],rating=null,draft='',fineTune={model:'Qwen/Qwen2.5-0.5B-Instruct',readiness:null,exported:null},fieldPresets={presets:[],limits:{episodes:5000,timeMs:15000}};
  try{tab=localStorage.getItem('sandubah-gaucho-tab')||'chat';}catch{}
  const run=action=>async(...args)=>{try{await action(...args);}catch(error){notify(error.message,true);}};
  async function load(){
    list=await api.gaucho({action:'list'});
    let saved=null;try{saved=localStorage.getItem('sandubah-gaucho');}catch{}
    const id=current?.id||saved;current=id&&list.some(item=>item.id===id)?await api.gaucho({action:'get',id}):null;
    try{providers=(await api.plannerStatus()).cloud.providers.filter(item=>['codex','claude'].includes(item.id));}catch{providers=[];}
    if(!fieldPresets.presets.length)fieldPresets=await api.gaucho({action:'field-presets'});
    draw();
  }
  async function open(id){if(current?.id!==id){draft='';fineTune={...fineTune,readiness:null,exported:null};}current=await api.gaucho({action:'get',id});try{localStorage.setItem('sandubah-gaucho',id);}catch{}rating=null;draw();}
  function replace(updated){current=updated;const index=list.findIndex(item=>item.id===updated.id);const summary={...updated};if(index>=0)list[index]=summary;else list.unshift(summary);draw();}
  function draw(){
    if(!visible)return;container.replaceChildren();
    const layout=node('div','gaucho-layout'),side=node('aside','gaucho-side'),main=node('section','gaucho-main');
    side.append(node('h2','','Seus gauchinhos'),node('p','muted','Cada um começa do zero e aprende só com o que você ensina. Quanto mais lições e documentos, mais ele pesa em cada mensagem.'));
    const cards=node('div','gaucho-cards');
    for(const gaucho of list){const card=button('',run(()=>open(gaucho.id)),`gaucho-card${current?.id===gaucho.id?' is-selected':''}`);card.append(node('strong','',gaucho.name),node('small','muted',weightLine(gaucho)));cards.append(card);}
    if(!list.length)cards.append(node('p','muted','Nenhum gauchinho ainda.'));
    side.append(cards,createForm());layout.append(side,main);
    if(current)main.append(...detail());else main.append(node('div','empty-state','Crie um gauchinho ao lado para começar a ensinar.'));
    container.append(layout);
  }
  function createForm(){
    const form=node('form','gaucho-create');const name=node('input','text-input');name.placeholder='Nome, ex.: Tchê Planilhas';name.maxLength=60;name.id='gaucho-name';
    const persona=node('textarea','text-input');persona.rows=3;persona.maxLength=2000;persona.placeholder='Personalidade (opcional): como fala, no que é bom';persona.id='gaucho-persona';
    const submit=node('button','button primary','Novo gauchinho');submit.type='submit';
    form.append(node('h3','','Criar do zero'),name,persona,submit);
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const provider=providers.find(item=>item.installed&&item.models?.length);const selection=provider?{provider:provider.id,model:provider.models[0].id}:null;const created=await api.gaucho({action:'create',input:{name:name.value,persona:persona.value,selection}});list.unshift(created);current=created;try{localStorage.setItem('sandubah-gaucho',created.id);}catch{}tab='chat';notify(`${created.name} criado. Ele ainda não sabe nada: comece conversando e corrigindo.`);draw();})();});
    return form;
  }
  function detail(){
    const header=node('header','gaucho-header');header.append(node('h2','',current.name),node('p','muted',current.persona||'Sem personalidade definida. Ajuste em Ajustes.'),node('p','gaucho-weight',weightLine(current)));
    const nav=node('nav','section-tabs gaucho-tabs');nav.setAttribute('aria-label','Seções do gauchinho');
    for(const [id,label] of tabs){const item=button(label,()=>{tab=id;try{localStorage.setItem('sandubah-gaucho-tab',id);}catch{}draw();},`section-tab${tab===id?' active':''}`);item.setAttribute('aria-current',tab===id?'page':'false');nav.append(item);}
    const body=tab==='tools'?toolsPanel():tab==='field'?createFieldPanel({api,gaucho:current,run,notify,isBusy:()=>busy,presets:fieldPresets,onChange:replace}):tab==='dataset'?datasetPanel():tab==='tasks'?tasks():tab==='lessons'?lessons():tab==='knowledge'?knowledge():tab==='settings'?settings():chat();
    return [header,nav,body];
  }
  function chat(){
    const panel=node('div','gaucho-chat'),log=node('div','gaucho-messages');log.setAttribute('aria-live','polite');
    if(!current.messages.length)log.append(node('p','muted',`Converse com ${current.name}. Em cada resposta, 👍 guarda como exemplo e 👎 pede a resposta certa, que vira uma lição.`));
    for(const message of current.messages){
      const item=node('article',`gaucho-message is-${message.role}`);item.append(node('span','gaucho-author',message.role==='user'?'Você':current.name),node('p','',message.content));
      if(message.role==='assistant'){
        const actions=node('div','gaucho-rate');
        if(message.rating)actions.append(node('span','muted',message.rating==='good'?'👍 Guardado como exemplo':'👎 Corrigido: virou lição'));
        else{actions.append(button('👍',run(async()=>{replace(await api.gaucho({action:'rate',id:current.id,input:{messageId:message.id,rating:'good'}}));notify('Guardado como exemplo para as próximas respostas.');}),'button gaucho-thumb'),button('👎',()=>{rating=message.id;draw();},'button gaucho-thumb'));}
        if(message.usage&&Number.isSafeInteger(message.usage.inputTokens))actions.append(node('small','muted',`${message.usage.inputTokens.toLocaleString('pt-BR')} entrada / ${(message.usage.outputTokens||0).toLocaleString('pt-BR')} saída · informado pelo provedor`));
        item.append(actions);
        if(rating===message.id){
          const fix=node('form','gaucho-fix');const ideal=node('textarea','text-input');ideal.rows=3;ideal.maxLength=4000;ideal.placeholder='Como a resposta deveria ter sido?';
          const save=node('button','button primary','Salvar correção');save.type='submit';fix.append(ideal,save,button('Cancelar',()=>{rating=null;draw();}));
          fix.addEventListener('submit',event=>{event.preventDefault();run(async()=>{replace(await api.gaucho({action:'rate',id:current.id,input:{messageId:message.id,rating:'bad',ideal:ideal.value}}));rating=null;notify('Correção salva. Ela entra nas próximas conversas.');draw();})();});
          item.append(fix);queueMicrotask(()=>ideal.focus());
        }
      }
      log.append(item);
    }
    const form=node('form','gaucho-compose');const input=node('textarea','text-input');input.rows=3;input.maxLength=4000;input.placeholder=`Mensagem para ${current.name}`;input.id='gaucho-message';input.value=draft;input.addEventListener('input',()=>{draft=input.value;});
    const send=node('button','button primary',busy?'Esperando resposta…':'Enviar');send.type='submit';send.disabled=busy||!current.selection;
    form.append(input,send);if(!current.selection)form.append(node('p','muted','Escolha o Codex ou o Claude em Ajustes para conversar.'));
    form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;busy=true;send.disabled=true;send.textContent='Esperando resposta…';run(async()=>{try{const result=await api.gaucho({action:'chat',id:current.id,prompt:input.value});if(result.cancelled){notify('Nada foi enviado. Sua mensagem continua no campo.');return;}draft='';replace(result);}finally{busy=false;draw();}})();});
    panel.append(log,form);queueMicrotask(()=>{log.scrollTop=log.scrollHeight;});return panel;
  }
  function tasks(){
    const panel=node('div','gaucho-tasks');
    const form=node('form','gaucho-task-form');const title=node('input','text-input');title.maxLength=120;title.placeholder='Título, ex.: Resumo das vendas';title.id='gaucho-task-title';
    const instructions=node('textarea','text-input');instructions.rows=4;instructions.maxLength=4000;instructions.placeholder='O que ele deve entregar, em detalhe';instructions.id='gaucho-task-instructions';
    const picks=node('div','gaucho-sources');const chosen=new Set();
    for(const entry of current.knowledge){const label=node('label','gaucho-source');const check=node('input');check.type='checkbox';check.addEventListener('change',()=>{if(check.checked)chosen.add(entry.id);else chosen.delete(entry.id);});label.append(check,node('span','',entry.title),node('small','muted',kib(entry.bytes)));picks.append(label);}
    const create=node('button','button primary','Criar tarefa');create.type='submit';
    const useTools=node('input');useTools.type='checkbox';useTools.id='gaucho-task-tools';const toolsLabel=node('label','gaucho-include');toolsLabel.append(useTools,node('span','',`Usar ferramentas (${modeLabels[current.permissions.mode]}, numa cópia de ensaio)`));toolsLabel.hidden=current.permissions.mode==='none';
    form.append(node('h3','','Nova tarefa'),node('p','muted','A entrega é um texto em Markdown. Os documentos marcados vão inteiros; se passarem do limite, a tarefa é bloqueada em vez de cortada.'),title,instructions,current.knowledge.length?node('span','field-label','Documentos da base para esta tarefa'):node('p','muted','Sem documentos na base: ele usa só as lições e o conhecimento geral do modelo.'),picks,toolsLabel,create);
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{replace(await api.gaucho({action:'task-create',id:current.id,input:{title:title.value,instructions:instructions.value,documents:[...chosen],tools:useTools.checked}}));notify('Tarefa criada. Envie quando quiser; nada saiu ainda.');})();});
    panel.append(form);
    if(!current.taskList.length)panel.append(node('p','muted','Nenhuma tarefa ainda.'));
    for(const task of current.taskList.slice().reverse()){
      const item=node('article','gaucho-task');const head=node('div','gaucho-task-head');head.append(node('strong','',task.title+(task.tools?' · com ferramentas':'')),node('span',`gaucho-badge is-${task.status}`,taskStatus[task.status]));
      item.append(head,node('p','gaucho-question',task.instructions));
      if(task.documents.length)item.append(node('small','muted',`${task.documents.length} documento(s) da base`));
      if(task.error)item.append(node('p','gaucho-error',task.error));
      const actions=node('div','gaucho-rate');
      if(task.status==='review')item.append(reviewRun(task));
      if(task.run&&task.status==='done')item.append(node('small','muted',task.run.applied?`Ensaio aplicado à pasta dele · ${task.run.changes.length} arquivo(s)`:task.run.changes.length?'Ensaio descartado: a pasta dele não mudou.':'O ensaio não mudou nenhum arquivo.'));
      if(!['done','review'].includes(task.status)){const send=button(busy?'Esperando entrega…':'Enviar ao gauchinho',run(async()=>{busy=true;draw();try{const result=await api.gaucho({action:'task-run',id:current.id,taskId:task.id});if(result.cancelled){notify('Nada foi enviado.');return;}replace(result);notify('Entrega recebida. Avalie para ele aprender.');}finally{busy=false;try{current=await api.gaucho({action:'get',id:current.id});}catch{}draw();}}),'button primary');send.disabled=busy||!current.selection;actions.append(send);}
      actions.append(button('Apagar',run(async()=>{replace(await api.gaucho({action:'task-delete',id:current.id,input:{taskId:task.id}}));notify('Tarefa apagada. Lições já aprendidas continuam.');})));
      item.append(actions);
      if(task.status==='done'){
        const delivery=node('details','project-track-preview');delivery.open=!task.evaluation;delivery.append(node('summary','','Ver entrega'),node('pre','',task.result));item.append(delivery);
        if(task.usage&&Number.isSafeInteger(task.usage.inputTokens))item.append(node('small','muted',`${task.usage.inputTokens.toLocaleString('pt-BR')} entrada / ${(task.usage.outputTokens||0).toLocaleString('pt-BR')} saída · informado pelo provedor`));
        const review=node('form','gaucho-fix');const score=node('select');score.setAttribute('aria-label','Nota');for(let value=5;value>=1;value--){const option=node('option','',`${value} · ${['','Ruim','Fraca','Ok','Boa','Ótima'][value]}`);option.value=String(value);score.append(option);}
        const feedback=node('textarea','text-input');feedback.rows=2;feedback.maxLength=4000;feedback.placeholder='O que ficou bom e o que melhorar na próxima';
        if(task.evaluation){score.value=String(task.evaluation.score);feedback.value=task.evaluation.feedback;}
        const save=node('button','button',task.evaluation?'Atualizar avaliação':'Salvar avaliação');save.type='submit';
        review.append(node('span','field-label',task.evaluation?`Avaliada: nota ${task.evaluation.score}/5`:'Avaliar a entrega'),score,feedback,save);
        review.addEventListener('submit',event=>{event.preventDefault();run(async()=>{replace(await api.gaucho({action:'task-evaluate',id:current.id,input:{taskId:task.id,score:Number(score.value),feedback:feedback.value}}));notify('Avaliação salva como lição.');})();});
        item.append(review);
      }
      panel.append(item);
    }
    return panel;
  }
  function datasetPanel(){
    const panel=node('div','gaucho-dataset'),report=current.dataset.report;
    const summary=node('section','gaucho-dataset-summary');
    summary.append(node('h3','',`${report.included} ${report.included===1?'exemplo incluído':'exemplos incluídos'} · ${levelLabels[report.level]}`));
    const meter=node('progress');meter.max=report.recommended;meter.value=Math.min(report.included,report.recommended);meter.setAttribute('aria-label','Exemplos até o volume recomendado');summary.append(meter);
    summary.append(node('p','muted',`Mínimo sugerido ${report.minimum}, recomendado ${report.recommended}. Treino ${report.train} · validação ${report.validation}${report.excluded?` · ${report.excluded} fora do treino`:''}${report.tooLong?` · ${report.tooLong} longos demais`:''}.`));
    const chips=node('div','gaucho-chips');for(const [source,count] of Object.entries(report.bySource))chips.append(node('span','gaucho-badge',`${sourceLabels[source]||source}: ${count}`));summary.append(chips);
    summary.append(button('Atualizar a partir das lições',run(async()=>{const result=await api.gaucho({action:'dataset-sync',id:current.id});replace(result);const sync=result.sync;notify(`${sync.added} novo(s), ${sync.updated} atualizado(s), ${sync.removed} removido(s) por lições apagadas.`);}),'button primary'));
    panel.append(summary);
    const pair=node('form','gaucho-task-form');const prompt=node('textarea','text-input');prompt.rows=2;prompt.maxLength=8000;prompt.placeholder='Pergunta';const response=node('textarea','text-input');response.rows=3;response.maxLength=8000;response.placeholder='Resposta esperada, no jeito dele';
    const add=node('button','button','Adicionar par');add.type='submit';pair.append(node('h3','','Escrever um exemplo'),prompt,response,add);
    pair.addEventListener('submit',event=>{event.preventDefault();run(async()=>{replace(await api.gaucho({action:'dataset-add',id:current.id,input:{prompt:prompt.value,response:response.value}}));notify('Exemplo adicionado ao dataset.');})();});
    const upload=node('div','gaucho-task-form');const picker=node('label','button gaucho-file','Escolher arquivo JSONL');const file=node('input');file.type='file';file.accept='.jsonl,.json,.txt';file.setAttribute('aria-label','Arquivo JSONL');picker.append(file);
    file.addEventListener('change',run(async()=>{const chosen=file.files?.[0];if(!chosen)return;file.value='';if(chosen.size>2000000){notify('Arquivo maior que 2 MB. Divida em partes.',true);return;}const result=await api.gaucho({action:'dataset-import',id:current.id,input:{text:await chosen.text()}});const info=result.imported;replace(result);notify(`${info.added} exemplo(s) importado(s), ${info.duplicates} repetido(s)${info.rejected.length?`, ${info.rejected.length} linha(s) recusada(s): ${info.rejected.slice(0,3).map(item=>`linha ${item.line} (${item.reason})`).join('; ')}`:''}.`,Boolean(info.rejected.length));}));
    upload.append(node('h3','','Subir arquivo'),node('p','muted','JSONL com uma conversa por linha: {"prompt": "...", "response": "..."} ou {"messages": [{"role":"user",...},{"role":"assistant",...}]}. Linhas inválidas ou com credenciais são recusadas e listadas.'),picker);
    panel.append(pair,upload,fineTunePanel());
    const listing=node('section','gaucho-dataset-records');listing.append(node('h3','',`Exemplos${current.dataset.shown<current.dataset.report.total?` · mostrando os ${current.dataset.shown} mais recentes de ${current.dataset.report.total}`:''}`));
    if(!current.dataset.records.length)listing.append(node('p','muted','Dataset vazio. Atualize a partir das lições, escreva um par ou suba um arquivo.'));
    for(const record of current.dataset.records){
      const item=node('article','gaucho-lesson');const head=node('div','gaucho-task-head');
      const toggle=node('label','gaucho-include');const check=node('input');check.type='checkbox';check.checked=record.include;check.disabled=record.long&&!record.include;
      check.addEventListener('change',run(async()=>{replace(await api.gaucho({action:'dataset-set',id:current.id,input:{recordId:record.id,include:check.checked}}));}));
      toggle.append(check,node('span','',record.include?'No treino':'Fora do treino'));head.append(node('span',`gaucho-badge is-${record.source}`,sourceLabels[record.source]||record.source),toggle);
      item.append(head,node('p','gaucho-question',record.prompt+(record.truncated?'…':'')),node('p','gaucho-answer',record.response+(record.truncated?'…':'')));
      if(record.long)item.append(node('p','gaucho-error','Longo demais para o treino: encurte a lição de origem ou reescreva o par.'));
      if(record.lessonId)item.append(node('small','muted','Vem de uma lição: edite ou apague na aba Lições e atualize.'));
      else item.append(button('Apagar',run(async()=>{replace(await api.gaucho({action:'dataset-delete',id:current.id,input:{recordId:record.id}}));notify('Exemplo apagado do dataset.');})));
      listing.append(item);
    }
    panel.append(listing);return panel;
  }
  function fineTunePanel(){
    const box=node('section','gaucho-finetune');box.append(node('h3','','Ajuste fino (LoRA)'),node('p','muted','O treino muda os pesos de um modelo pequeno com os seus exemplos. Ele precisa de GPU: o SanduBAH verifica esta máquina, exporta o dataset e gera o script, mas não inicia o treino.'));
    const model=node('input','text-input');model.value=fineTune.model;model.setAttribute('list',`gaucho-models-${current.id}`);model.setAttribute('aria-label','Modelo base');model.addEventListener('input',()=>{fineTune.model=model.value.trim();fineTune.readiness=null;});
    const options=node('datalist');options.id=`gaucho-models-${current.id}`;for(const [id,label] of [['Qwen/Qwen2.5-0.5B-Instruct','0,5 B · mais leve'],['Qwen/Qwen2.5-1.5B-Instruct','1,5 B · equilíbrio'],['Qwen/Qwen2.5-3B-Instruct','3 B · mais pesado']]){const option=node('option');option.value=id;option.label=label;options.append(option);}
    const actions=node('div','gaucho-rate');
    actions.append(button('Verificar esta máquina',run(async()=>{fineTune.readiness=await api.gaucho({action:'dataset-readiness',id:current.id,model:fineTune.model});draw();})),button('Exportar dataset e script',run(async()=>{fineTune.exported=await api.gaucho({action:'dataset-export',id:current.id,model:fineTune.model});fineTune.readiness=fineTune.exported.readiness;notify(`Exportado: ${fineTune.exported.stats.train} de treino e ${fineTune.exported.stats.validation} de validação.`);draw();}),'button primary'));
    box.append(node('span','field-label','Modelo base (Hugging Face)'),model,options,actions);
    if(fineTune.readiness){const checks=node('ul','gaucho-checks');for(const check of fineTune.readiness.checks)checks.append(node('li',check.ok?'is-ok':'is-fail',`${check.ok?'✓':'✗'} ${check.message}`));box.append(node('strong','',fineTune.readiness.canTrainHere?'Este PC passou na verificação.':'Este PC não consegue treinar este modelo agora.'),checks,node('p','muted',fineTune.readiness.note));}
    if(fineTune.exported){const done=node('div','gaucho-export');done.append(node('p','',`Pasta: ${fineTune.exported.directory}`),node('p','muted',`Arquivos: ${fineTune.exported.files.join(', ')}. O dataset contém as suas conversas e correções: revise antes de compartilhar.`),button('Abrir pasta',run(()=>api.gaucho({action:'dataset-open',id:current.id}))));box.append(done);}
    return box;
  }
  function reviewRun(task){
    const box=node('section','gaucho-review');box.append(node('h4','',`${task.run.changes.length} arquivo(s) mudaram no ensaio`),node('p','muted','Revise antes de aplicar à pasta dele. Descartar apaga só a cópia de ensaio.'));
    const list=node('ul','project-history-files');for(const change of task.run.changes){const item=node('li');item.append(node('code','',change.path),node('span',`project-history-state is-${change.state}`,changeLabels[change.state]));list.append(item);}box.append(list);
    if(task.run.summary)box.append(node('details','project-track-preview')),box.lastChild.append(node('summary','','O que ele diz que fez'),node('pre','',task.run.summary+(task.run.tests.length?`\n\nTestes relatados: ${task.run.tests.join('; ')}`:'')));
    const actions=node('div','gaucho-rate');
    actions.append(button('Aplicar à pasta dele',run(async()=>{const result=await api.gaucho({action:'task-apply',id:current.id,taskId:task.id});if(result.cancelled){notify('Nada foi aplicado.');return;}replace(result);notify('Ensaio aplicado à pasta do gauchinho.');}),'button primary'),button('Descartar',run(async()=>{replace(await api.gaucho({action:'task-discard',id:current.id,taskId:task.id}));notify('Ensaio descartado. A pasta dele continua igual.');})));
    box.append(actions);return box;
  }
  function toolsPanel(){
    const panel=node('div','gaucho-tools'),rules=current.permissions,codex=current.selection?.provider==='codex';
    panel.append(node('p','muted',`Aqui você decide o que ${current.name} pode fazer além de escrever. Ele sempre trabalha numa cópia de ensaio da pasta dele, pelo Codex com sandbox e sem rede; você revisa e decide se aplica. Passou de um limite, o ensaio é descartado.`));
    if(!codex)panel.append(node('p','gaucho-error','Ferramentas só funcionam com o Codex, que tem sandbox. Este gauchinho está com outro modelo: troque em Ajustes para usar.'));
    const form=node('form','gaucho-task-form');form.append(node('h3','','Permissões e limites'));
    const modes=node('div','gaucho-modes');let mode=rules.mode;
    for(const [value,label,hint] of [['none','Só texto','Conversa e tarefas em texto, sem tocar em arquivos.'],['read','Ler arquivos','Lê e analisa a pasta dele; o sandbox não deixa escrever.'],['write','Ler e escrever','Cria e altera arquivos só na cópia de ensaio da pasta dele.']]){const option=node('label','gaucho-mode');const radio=node('input');radio.type='radio';radio.name=`gaucho-mode-${current.id}`;radio.value=value;radio.checked=mode===value;radio.addEventListener('change',()=>{mode=value;});option.append(radio,node('strong','',label),node('small','muted',hint));modes.append(option);}
    const timeout=node('select');timeout.setAttribute('aria-label','Tempo limite');for(const value of [1,3,5,10,15]){const option=node('option','',`${value} min`);option.value=String(value);timeout.append(option);}timeout.value=String(rules.timeoutMinutes);
    const files=node('input','text-input');files.type='number';files.min='1';files.max='200';files.value=String(rules.maxFiles);files.setAttribute('aria-label','Arquivos por tarefa');
    const block=node('input');block.type='checkbox';block.checked=rules.blockExecutables;const blockLabel=node('label','gaucho-include');blockLabel.append(block,node('span','','Bloquear executáveis e scripts do Windows (.exe, .bat, .ps1…)'));
    const field=(label,input)=>{const wrapper=node('label','project-history-field');wrapper.append(node('span','field-label',label),input);return wrapper;};
    const limits=node('div','project-history-row');limits.append(field('Tempo limite por tarefa',timeout),field('Arquivos que pode mudar por tarefa',files));
    const save=node('button','button primary','Salvar permissões');save.type='submit';
    form.append(modes,limits,blockLabel,save);
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{replace(await api.gaucho({action:'permissions-set',id:current.id,input:{mode,timeoutMinutes:Number(timeout.value),maxFiles:Number(files.value),blockExecutables:block.checked}}));notify('Permissões salvas.');})();});
    panel.append(form);
    const skills=node('section','gaucho-task-form');skills.append(node('h3','',`Skills liberadas · ${rules.skills.length}/5`),node('p','muted','Skills são instruções do catálogo do SanduBAH que ele segue quando forem pertinentes. Elas não ampliam as permissões.'));
    for(const id of rules.skills){const row=node('div','artifact-row');row.append(node('code','',id.replace(/^skill:/,'').split('/').filter(part=>part&&part!=='SKILL.md').at(-1)||id),button('Remover',run(async()=>{replace(await api.gaucho({action:'permissions-set',id:current.id,input:{skills:rules.skills.filter(item=>item!==id)}}));})));skills.append(row);}
    const search=node('form','gaucho-import');const query=node('input','text-input');query.placeholder='Buscar skill no catálogo';const go=node('button','button','Buscar');go.type='submit';const results=node('div','gaucho-sources');
    search.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const found=await api.gaucho({action:'skills-search',query:query.value});results.replaceChildren();for(const skill of found){const row=node('div','artifact-row');row.append(node('strong','',skill.name),node('small','muted',skill.description));const add=button('Liberar',run(async()=>{replace(await api.gaucho({action:'permissions-set',id:current.id,input:{skills:[...rules.skills,skill.id]}}));notify(`${skill.name} liberada para ${current.name}.`);}));add.disabled=rules.skills.includes(skill.id)||rules.skills.length>=5;row.append(add);results.append(row);}if(!found.length)results.append(node('p','muted','Nenhuma skill encontrada.'));})();});
    search.append(query,go);skills.append(search,results);panel.append(skills);
    const folder=node('section','gaucho-task-form');const info=current.workspace;
    folder.append(node('h3','','Pasta de trabalho'),node('p','muted',info.error?info.error:`${info.files} arquivo(s) · ${kib(info.bytes)}. Coloque aqui o que ele deve ler ou editar; as tarefas trabalham numa cópia dela.`),button('Abrir pasta de trabalho',run(()=>api.gaucho({action:'workspace-open',id:current.id}))));
    panel.append(folder);return panel;
  }
  function lessons(){
    const panel=node('div','gaucho-lessons');panel.append(node('p','muted',`${current.lessonList.length} ${current.lessonList.length===1?'lição':'lições'}. As mais recentes entram primeiro; se não couberem numa mensagem, a confirmação mostra quantas ficaram de fora.`));
    for(const lesson of current.lessonList.slice().reverse()){
      const item=node('article','gaucho-lesson');item.append(node('span',`gaucho-badge is-${lesson.kind}`,lesson.kind==='correction'?'Correção':lesson.kind==='task'?`Tarefa · nota ${lesson.score}/5`:'Exemplo'),node('p','gaucho-question',lesson.prompt||'(sem pergunta registrada)'));
      const value=lesson.kind==='example'?lesson.answer:lesson.ideal;const editor=node('textarea','text-input');editor.rows=3;editor.maxLength=4000;editor.value=value;editor.setAttribute('aria-label','Texto da lição');
      const actions=node('div','gaucho-rate');
      actions.append(button('Salvar',run(async()=>{replace(await api.gaucho({action:'lesson-edit',id:current.id,input:{lessonId:lesson.id,ideal:editor.value}}));notify('Lição atualizada.');})),button('Apagar',run(async()=>{replace(await api.gaucho({action:'lesson-delete',id:current.id,input:{lessonId:lesson.id}}));notify('Lição apagada.');})));
      item.append(editor,actions);panel.append(item);
    }
    if(!current.lessonList.length)panel.append(node('p','muted','Ainda não há lições. Avalie respostas na Conversa.'));
    return panel;
  }
  function knowledge(){
    const panel=node('div','gaucho-knowledge');panel.append(node('p','muted',`A base é só de ${current.name}. Importar copia o documento; mudar ou apagar aqui não mexe no Cérebro.`));
    for(const entry of current.knowledge){const item=node('div','artifact-row');item.append(node('strong','',entry.title),node('small','muted',`${entry.source} · ${kib(entry.bytes)}`),button('Remover',run(async()=>{replace(await api.gaucho({action:'remove-document',id:current.id,input:{documentId:entry.id}}));notify('Cópia removida da base. O original no Cérebro continua igual.');})));panel.append(item);}
    if(!current.knowledge.length)panel.append(node('p','muted','Base vazia.'));
    const picker=node('form','gaucho-import');const query=node('input','text-input');query.placeholder='Buscar no Cérebro';query.id='gaucho-source-query';
    const search=node('button','button','Buscar');search.type='submit';const results=node('div','gaucho-sources');
    const selected=new Set();
    const drawResults=()=>{results.replaceChildren();for(const source of sources){const label=node('label','gaucho-source');const check=node('input');check.type='checkbox';check.checked=selected.has(source.path);check.addEventListener('change',()=>{if(check.checked)selected.add(source.path);else selected.delete(source.path);});label.append(check,node('span','',source.title),node('small','muted',source.path));results.append(label);}
      if(sources.length){results.append(button('Importar selecionados',run(async()=>{if(!selected.size){notify('Marque ao menos um documento.',true);return;}const result=await api.gaucho({action:'import',id:current.id,paths:[...selected]});sources=[];replace(result);notify(`${result.imported} documento(s) copiado(s) para a base de ${current.name}.`);}),'button primary'));}};
    picker.addEventListener('submit',event=>{event.preventDefault();run(async()=>{sources=await api.gaucho({action:'sources',query:query.value});selected.clear();drawResults();if(!sources.length)notify('Nada encontrado no Cérebro.');})();});
    picker.append(node('h3','','Importar do Cérebro'),query,search);drawResults();panel.append(picker,results);
    return panel;
  }
  function settings(){
    const form=node('form','gaucho-settings');const name=node('input','text-input');name.value=current.name;name.maxLength=60;
    const persona=node('textarea','text-input');persona.rows=5;persona.maxLength=2000;persona.value=current.persona;
    const provider=node('select'),model=node('select'),effort=node('select');
    for(const item of providers){const option=node('option','',`${item.id==='codex'?'Codex':'Claude'}${item.installed?'':' (não instalado)'}`);option.value=item.id;provider.append(option);}
    provider.value=current.selection?.provider||providers[0]?.id||'';
    const fill=()=>{const chosen=providers.find(item=>item.id===provider.value);model.replaceChildren();for(const item of chosen?.models||[]){const option=node('option','',item.label||item.name||item.id);option.value=item.id;model.append(option);}if(current.selection?.provider===provider.value)model.value=current.selection.model;fillEffort();};
    const fillEffort=()=>{const levels=providers.find(item=>item.id===provider.value)?.models?.find(item=>item.id===model.value)?.effortLevels||[];effort.replaceChildren(Object.assign(node('option','','Automática'),{value:''}));for(const level of levels){const option=node('option','',{low:'Baixa',medium:'Média',high:'Alta',xhigh:'Extra',max:'Máxima'}[level]||level);option.value=level;effort.append(option);}effort.value=current.selection?.model===model.value&&current.selection?.effort||'';};
    provider.addEventListener('change',fill);model.addEventListener('change',fillEffort);fill();
    const field=(label,input)=>{const wrapper=node('label','project-history-field');wrapper.append(node('span','field-label',label),input);return wrapper;};
    const save=node('button','button primary','Salvar ajustes');save.type='submit';
    form.append(field('Nome',name),field('Personalidade',persona),field('Onde ele pensa',provider),field('Modelo',model),field('Força de raciocínio',effort),node('p','muted','O modelo dá a capacidade de linguagem; o que é dele vem das suas lições e da base. Cada mensagem pede confirmação e usa a sua conta.'),save);
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const selection=model.value?{provider:provider.value,model:model.value,effort:effort.value||null}:null;replace(await api.gaucho({action:'update',id:current.id,input:{name:name.value,persona:persona.value,selection}}));notify('Ajustes salvos.');})();});
    return form;
  }
  return {show(view){visible=view==='gauchos';container.hidden=!visible;if(visible)run(load)();}};
}
