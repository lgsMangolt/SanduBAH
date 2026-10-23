const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const action=(text,callback,className='button')=>{const element=node('button',className,text);element.type='button';element.addEventListener('click',callback);return element;};
const field=(label,input)=>{const container=node('label','tech-field');container.append(node('span','field-label',label),input);input.setAttribute('aria-label',label);return container;};
const select=(values,current)=>{const input=node('select','text-input');for(const [value,title]of Object.entries(values))input.add(new Option(title,value));if(Object.hasOwn(values,current))input.value=current;return input;};

export function createTech({api,container,notify,onContinue,isBusy=()=>false}){
  let selected='',tab='research',revision=0,localBusy=false,ready=false,context=null;
  const drafts=new Map();
  try{selected=localStorage.getItem('sandubah-tech-project')||'';}catch{}
  const run=callback=>async()=>{if(localBusy)return;localBusy=true;try{await callback();}catch(error){notify(error.message||String(error),true);}finally{localBusy=false;}};
  async function load(id=selected){
    const token=++revision,list=await api.project({action:'list'});
    if(token!==revision)return;
    if(id&&!list.some(project=>project.id===id))id='';
    const state=await api.knowledge({action:'tech-state',id:id||undefined});
    if(token!==revision)return;
    selected=id;context=state;ready=true;
    try{localStorage.setItem('sandubah-tech-project',selected);}catch{}
    draw(list);
  }
  function draw(list){
    container.replaceChildren();
    const hero=node('div','tech-hero');hero.append(node('span','tech-eyebrow','OFICINA DO PROJETO'),node('h2','','Entender. Adaptar. Melhorar.'),node('p','','Tech transforma referências em planos rastreáveis. X-Tudo compara resultados antes de recomendar uma mudança. Você continua no controle.'));container.append(hero);
    const bar=node('div','tech-project-bar'),project=select({'':'Selecione um projeto',...Object.fromEntries(list.map(item=>[item.id,item.name]))},selected);
    project.addEventListener('change',()=>{load(project.value).catch(error=>notify(error.message||String(error),true));});
    bar.append(field('Projeto do espaço Tech',project),action('Atualizar',run(()=>load())));container.append(bar);
    const tabs=node('div','tech-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Áreas do Tech');
    for(const [id,label]of [['research','Tech · referências'],['xtudo','X-Tudo Harness²']]){
      const button=action(label,()=>{tab=id;draw(list);},'button'+(id===tab?' primary':''));button.setAttribute('role','tab');button.setAttribute('aria-selected',String(id===tab));tabs.append(button);
    }
    container.append(tabs);
    if(!context.project){container.append(node('p','tech-empty','Escolha um projeto existente, ou crie um em Novo projeto. Nenhuma referência será enviada sem confirmação.'));return;}
    const executor=context.project.executor;container.append(node('p','tech-meta',executor?`Neste projeto: ${executor.engine} · ${executor.model||'modelo da conta'} · ${executor.effort||'força padrão'}. Mudar de referência não troca sua IA.`:'Configure executor, modelo e força na fila do projeto antes de preparar uma missão.'));
    const panel=node('section','tech-panel');panel.setAttribute('aria-label',tab==='research'?'Análise de referências':'X-Tudo');
    if(tab==='research')research(panel);else refinement(panel);
    container.append(panel,action('Ver agentes e fila deste projeto',()=>onContinue(selected)));
  }
  function research(panel){
    panel.append(node('h3','','Sua próxima referência, com evidências'),node('p','muted','Mods, apps, sistemas e recriações de vídeos começam pela análise. Código aberto usa leitura de fontes; artefatos e runtimes podem usar REA, quando disponível no executor.'));
    panel.append(node('p','tech-meta',context.skill?'Skill reverse-engineer-anything encontrada no índice: será anexada ao papel. Isso não prova conexão com o servidor REA.':'Skill não encontrada no índice do SanduBAH. O roteiro resumido funciona, mas ferramentas REA não são presumidas nem instaladas automaticamente.'));
    const draft=drafts.get(selected)||{type:'source',intent:'mod',target:'',goal:'',rights:'',authorized:false};drafts.set(selected,draft);
    const form=node('form','tech-form'),row=node('div','tech-grid');
    for(const [name,title,values]of [['type','Tipo de referência',context.types],['intent','O que quer criar',context.intents]]){
      const input=select(values,draft[name]);input.addEventListener('change',()=>{draft[name]=input.value;});row.append(field(title,input));
    }
    form.append(row);
    for(const [name,title,placeholder,limit]of [['target','Link ou caminho da referência','URL pública sem segredos ou caminho do material autorizado',1500],['goal','O que aproveitar no projeto','Ex.: adaptar a organização de tarefas; recriar a interação com código próprio',2500],['rights','Permissão e limites de uso','Ex.: projeto próprio, licença MIT com créditos, ou somente inspiração funcional',1000]]){
      const input=node(name==='goal'?'textarea':'input','text-input');input.value=draft[name];input.placeholder=placeholder;input.maxLength=limit;input.required=true;input.addEventListener('input',()=>{draft[name]=input.value;});form.append(field(title,input));
    }
    const authorization=node('input');authorization.type='checkbox';authorization.checked=draft.authorized;authorization.required=true;authorization.addEventListener('change',()=>{draft.authorized=authorization.checked;});
    const label=node('label','tech-authorization');label.append(authorization,node('span','','Posso analisar esta referência dentro dos limites informados. Isso não autoriza copiar assets, burlar licenças ou acessar dados de terceiros.'));form.append(label);
    const rea=node('input');rea.type='checkbox';rea.checked=Boolean(draft.useRea);rea.disabled=!context.rea?.installed||context.project.executor?.engine!=='codex';rea.addEventListener('change',()=>{draft.useRea=rea.checked;});
    const reaLabel=node('label','tech-authorization');reaLabel.append(rea,node('span','',context.rea?.installed?'Conectar REA '+context.rea.version+' nesta missão. Use App ou pacote local e um caminho relativo do workspace (ASAR ou pasta extraída). Só análise estática do alvo confirmado; sem instalar ou abrir aplicativos.':'REA 6.1.0 não encontrado neste PC. Não será baixado automaticamente.'));form.append(reaLabel);
    const submit=node('button','button primary','Preparar análise e plano');submit.type='submit';submit.disabled=isBusy();form.append(submit);
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{submit.disabled=true;try{const result=await api.knowledge({action:'tech-prepare',id:selected,input:{...draft}});notify(result.reused?'A análise já está na fila; nada foi reenviado.':'Análise na fila do projeto. Revise o contexto e confirme antes de executar.');await load();}finally{submit.disabled=isBusy();}})();});
    panel.append(form,node('p','tech-limit','Primeira entrega: relatório e plano. Implementação, downloads e render de vídeo são etapas separadas e confirmadas. Claude/IA local fazem síntese nesta integração; código é executado pelo Codex protegido.'));
    if(context.project.requests.length){const history=node('div','tech-history');history.append(node('h4','','Análises deste projeto'));for(const request of context.project.requests)history.append(node('p','',`${request.title} · ${request.status} · ${request.target}`));panel.append(history);}
  }
  function refinement(panel){
    panel.append(node('h3','','X-Tudo Harness²: uma melhoria por vez'),node('p','muted','Inspirado no Harness², do Google Research: observar → propor → ensaiar → comparar → revisar. Não treina pesos, não altera seu harness sozinho e não executa o runner upstream.'));
    const review=action(context.refinement.queued?'Revisão já está na fila':'Preparar revisão X-Tudo Harness²',run(async()=>{await api.knowledge({action:'prepare-harness-review',id:selected});notify('Revisão preparada. Enviar à IA e executar continuam exigindo confirmação.');await load();}),'button primary');review.disabled=isBusy()||context.refinement.queued;panel.append(review);
    const steps=node('ol','tech-flow');for(const text of ['Registre a base atual e uma hipótese pequena.','Defina critérios críticos antes do ensaio; use a mesma tarefa, dados, modelo e força.','Produza dois resultados em missões confirmadas, um worker por vez.','Confira ganhos e regressões; mantenha o original ou recuse ambos quando necessário.','Revise aplicação e aprendizado separadamente, preservando a versão anterior.'])steps.append(node('li','',text));panel.append(steps);
    const details=node('details','tech-comparison');details.append(node('summary','','Comparar resultados JSON do workspace'));
    details.append(node('p','muted','Este verificador só compara valores dos arquivos selecionados com critérios explícitos. Não executa o app nem atesta a procedência dos resultados. Mesmas condições e evidências de execução precisam de revisão. Não basta uma nota maior: regressões bloqueiam recomendar adoção.'));
    const sample=node('pre','tech-example',JSON.stringify({checks:[{id:'total-correto',path:'order.total',expected:85.15,critical:true}]},null,2));details.append(node('p','muted','Formato do arquivo de critérios. Use dados e critérios do seu ensaio, definidos antes dos resultados:'),sample);
    const form=node('form','tech-form'),files={'':'Selecione um arquivo',...Object.fromEntries(context.artifacts.filter(file=>/\.json$/i.test(file.path)).map(file=>[file.path,file.path]))},inputs={};
    for(const [key,label]of [['contract','Arquivo de critérios'],['baseline','Resultado da base atual'],['candidate','Resultado do candidato']]){inputs[key]=select(files,'');inputs[key].required=true;form.append(field(label,inputs[key]));}
    const compare=node('button','button','Revisar comparação local');compare.type='submit';compare.disabled=isBusy()||Object.keys(files).length<4;form.append(compare);
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{compare.disabled=true;try{const result=await api.knowledge({action:'xtudo-compare',id:selected,input:Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]))});if(!result.cancelled){notify(result.reused?'Este recibo já estava salvo; nada foi duplicado.':'Comparação salva no projeto. Nenhuma mudança foi aplicada.');await load();}}finally{compare.disabled=isBusy()||Object.keys(files).length<4;}})();});
    details.append(form);panel.append(details);
    const history=node('div','tech-history');history.append(node('h4','','Comparações salvas'));
    if(!context.receipts.length)history.append(node('p','muted','Ainda não há comparação neste projeto. Sem teste, a melhoria continua pendente.'));
    for(const receipt of context.receipts){
      const card=node('article','tech-receipt');card.append(node('h4','',receipt.label),node('p','',`Base ${receipt.baselinePassed}/${receipt.total} · candidato ${receipt.candidatePassed}/${receipt.total} · ${receipt.gains} ganho(s) · ${receipt.regressions} regressão(ões)`));
      const table=node('table');table.append(node('caption','','Critérios verificados nos arquivos JSON'));const headings=node('tr');for(const title of ['Critério','Crítico','Base','Candidato'])headings.append(node('th','',title));table.append(headings);
      for(const check of receipt.checks){const row=node('tr');for(const value of [check.id,check.critical?'Sim':'Não',check.baseline?'Passou':'Falhou',check.candidate?'Passou':'Falhou'])row.append(node('td','',value));table.append(row);}
      card.append(table,node('p','tech-meta',`Comparador local: 0 chamadas a modelos. Tokens de geração: não coletados aqui; consulte os recibos das missões. ${receipt.learning}`));
      const sources=node('details');sources.append(node('summary','','Fontes, hashes e limites'),node('pre','tech-example',JSON.stringify({createdAt:receipt.createdAt,sources:receipt.sources,scope:receipt.scope},null,2)));card.append(sources);history.append(card);
    }
    panel.append(history,node('p','tech-limit',`Origem: Google Research / Harness² · ${context.refinement.reference.commit.slice(0,7)} · Apache-2.0. Implementação supervisionada própria do SanduBAH. Windows: runner upstream completo ainda não validado. Abrir esta aba não instala nada nem consome cota.`));
  }
  return {show(view){container.hidden=view!=='tech';if(view==='tech')load().catch(error=>notify(error.message||String(error),true));},openProject(id){selected=id;ready=false;revision++;},get ready(){return ready;}};
}
