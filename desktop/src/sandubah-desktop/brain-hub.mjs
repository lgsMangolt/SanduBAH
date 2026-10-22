import {createInterview} from './interview.mjs';
import {createMediaPicker} from './media-ui.mjs';
import {createLifecycleEditor,lifecycleOverview} from './product-lifecycle.mjs';
const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const button=(text,action)=>{const element=node('button','button',text);element.type='button';element.addEventListener('click',action);return element;};

export function createBrainHub({container,api,notify,onLibrary,onOverview,onContinue,onOpen,onRefresh,onRecommend,onProjects,projectsOnly=false}){
  let snapshot=null,selected=projectsOnly?'projects':'library',selectedProject=null,selectedLifecycle=null,projectQuery='',loading=null;
  let studyTypeFilter='all',studyScopeFilter='all';const studyDraft={topic:'',type:'',scope:'central',projectId:'',sourceId:''};
  const tabs=node('nav','section-tabs brain-hub-tabs');tabs.setAttribute('aria-label','Áreas do cérebro');
  const content=node('section','brain-hub-content');content.id=projectsOnly?'my-projects-content':'brain-hub-content';container.append(tabs,content);tabs.hidden=projectsOnly;
  const run=action=>async()=>{try{await action();}catch(error){notify(error.message,true);}};
  const tabButtons=new Map();
  for(const [id,title]of projectsOnly?[]:[['library','Biblioteca 3D'],['overview','Visão geral'],['study','Área de estudo'],['fine-tuning','Fine-tuning'],['learning','Aprendizados']]){const tab=button(title,run(async()=>{selected=id;await refresh(false);render();}));tab.dataset.brainTab=id;tabButtons.set(id,tab);tabs.append(tab);}
  async function refresh(scan){
    if(loading)return loading;
    loading=(async()=>{snapshot=await api.knowledge({action:scan?'refresh':'status'});if(!snapshot.scan&&!scan)snapshot=await api.knowledge({action:'refresh'});onProjects?.(snapshot.projects);onRefresh();})().finally(()=>{loading=null;});return loading;
  }
  function card(title,description){const card=node('article','world-card brain-hub-card');card.append(node('h3','',title));if(description)card.append(node('p','muted',description));return card;}
  function render(){
    for(const [id,tab]of tabButtons){tab.classList.toggle('active',id===selected);tab.setAttribute('aria-current',id===selected?'page':'false');}
    onLibrary(selected==='library');content.replaceChildren();content.hidden=selected==='library';if(!snapshot)return;
    if(selected==='overview'){
      const overview=card('Seu conhecimento, conectado.','Fontes locais em leitura: suas bibliotecas de notas e os Markdown dos projetos. Originais e credenciais não são copiados para fora do computador.');
      overview.append(node('p','brain-hub-metrics',`${snapshot.scan?.documents||0} Markdown · ${snapshot.sources.length} fontes · ${snapshot.projects.length} projetos / pastas`));
      overview.append(button('Ver mapa geral',()=>{selected='library';render();onOverview();}),button('Atualizar varredura',run(async()=>{await refresh(true);render();notify('Índice local atualizado.');})));
      if(snapshot.scan)overview.append(node('p','muted',`Última varredura: ${new Date(snapshot.scan.scannedAt).toLocaleString('pt-BR')}. Limites: 4.000 documentos, 24 MB, profundidade 9. Arquivos grandes, ocultos, releases, dependências e possíveis segredos ficam de fora.`));
      for(const warning of snapshot.scan?.warnings||[])overview.append(node('p','brain-hub-warning',warning));content.append(overview);
      const grid=node('div','brain-hub-grid');for(const source of snapshot.sources){const sourceCard=card(source.name,source.directory);sourceCard.append(node('p','muted',`${source.documents} Markdown indexados · originais somente leitura`));grid.append(sourceCard);}for(const source of snapshot.referenceSources||[]){const sourceCard=card(source.name,source.url);sourceCard.append(node('p','muted','Padrão em apps e sites · consulta seletiva, anônima e com cache local. O projeto não é enviado ao acervo.'),node('p','muted',source.scope+' '+source.mode));grid.append(sourceCard);}content.append(grid);
    }else if(selected==='projects')renderProjects();
    else if(selected==='study')renderStudy();
    else if(selected==='fine-tuning')renderFineTuning();
    else renderLearning();
  }
  function renderProjects(){
    const tools=node('div','world-toolbar'),search=node('input','text-input');search.type='search';search.placeholder='Buscar nos meus projetos…';search.setAttribute('aria-label','Buscar nos meus projetos');
    search.value=projectQuery;const count=node('span','muted',`${snapshot.projects.length} projetos no Cérebro`);tools.append(search,count,button('Atualizar projetos',run(async()=>{await refresh(true);render();notify('Projetos do Cérebro atualizados.');})));content.append(tools);
    content.append(node('p','muted','Progresso vem de missões ou checklists Markdown, não de uma estimativa inventada. O catálogo de pastas Codex é um retrato local; não lê conversas. Continuar cria ou retoma um harness separado, sem editar a pasta original.'));
    const grid=node('div','brain-hub-grid');
    for(const project of snapshot.projects){
      const item=card(project.name,project.directory);item.dataset.projectId=project.id;
      item.dataset.projectSearch=`${project.name} ${project.directory} ${project.kind}`.toLocaleLowerCase('pt-BR');
      item.append(node('p','muted',`${project.kind} · ${project.status}`));
      item.append(lifecycleOverview(project.lifecycle));
      if(project.progress!==null){const scope=project.progressBasis==='missions'?'missões cadastradas concluídas':'itens do checklist de origem concluídos';const missions=node('section','mission-overview');missions.setAttribute('aria-label',project.progressBasis==='missions'?'Progresso das missões':'Checklist de origem');missions.append(node('strong','',project.progressBasis==='missions'?'Execução das missões':'Checklist de origem'));const progress=node('progress');progress.max=100;progress.value=project.progress;progress.setAttribute('aria-label',`Conclusão de tarefas de ${project.name}, não do produto`);missions.append(progress,node('p','muted',`${project.done}/${project.total} ${scope} · ${project.progress}% das tarefas`));item.append(missions);}
      item.append(button('Etapas e checklist',run(async()=>{selectedLifecycle=project.id;selectedProject=null;render();document.getElementById('project-lifecycle-detail')?.scrollIntoView({block:'start'});})))
      if(onOpen)item.append(button('Abrir projeto',run(async()=>{const result=await api.knowledge({action:'continue',id:project.id});await onOpen(result.harnessId);})));
      item.append(button('Abrir pasta',run(()=>api.knowledge({action:'open',id:project.id}))),button('Continuar no harness',run(async()=>{const result=await api.knowledge({action:'continue',id:project.id});await refresh(false);await onContinue(result.harnessId);})),button('Grill-me e recomendações',()=>{selectedProject=project.id;render();document.getElementById('brain-project-detail')?.scrollIntoView({block:'start',behavior:'auto'});}));grid.append(item);
    }
    content.append(grid);
    const filter=()=>{projectQuery=search.value;const query=projectQuery.trim().toLocaleLowerCase('pt-BR');let found=0;for(const item of grid.children){item.hidden=!item.dataset.projectSearch.includes(query);if(!item.hidden)found++;}count.textContent=`${found} de ${snapshot.projects.length} projetos no Cérebro`;};search.addEventListener('input',filter);filter();
    if(!snapshot.projects.length)content.append(card('Seus projetos aparecem aqui','Esta é a mesma lista conhecida pelo Cérebro. Crie em Novo projeto ou atualize a varredura das fontes locais.'));
    if(selectedLifecycle){const project=snapshot.projects.find(row=>row.id===selectedLifecycle);if(project){const panel=card(`Etapas do produto: ${project.name}`,'Planejamento → Protótipo → MVP → Produção. O progresso vem dos critérios revisados, nunca da quantidade de missões.');panel.id='project-lifecycle-detail';content.append(panel);api.knowledge({action:'lifecycle',id:project.id}).then(document=>{if(panel.isConnected)panel.append(createLifecycleEditor({document,projectId:project.id,api,notify,onSaved:async()=>{await refresh(false);render();}}));}).catch(error=>notify(error.message,true));}}
    const project=snapshot.projects.find(row=>row.id===selectedProject);if(!project)return;
    const detail=card(`Entenda o projeto: ${project.name}`,'Uma pergunta por vez. As respostas ficam neste projeto e orientam recomendações locais; nada é instalado ou executado automaticamente.');detail.id='brain-project-detail';
    const answers=snapshot.briefs[project.id]?.answers||{};
    const modes=snapshot.modes?.[project.id]||{grillMe:true,vibewase:false};
    const controls=node('div','brain-project-modes');controls.setAttribute('aria-label','Modos deste projeto');
    for(const [key,title]of [['grillMe','Grill-me'],['vibewase','Vibewase']]){
      const toggle=button(`${title}: ${modes[key]?'ligado':'desligado'}`,run(async()=>{toggle.disabled=true;try{snapshot=await api.knowledge({action:'modes',id:project.id,modes:{[key]:!modes[key]}});render();notify('Modo salvo somente para este projeto.');}finally{toggle.disabled=false;}}));
      toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',title);toggle.setAttribute('aria-checked',String(modes[key]));controls.append(toggle);
    }
    detail.append(controls,node('p','muted','Preferências salvas por projeto. Os dois modos são independentes; desligá-los nunca remove as confirmações das ações protegidas. Salve seu texto antes de trocar de modo.'));
    if(modes.vibewase){
      const freeForm=node('form','brain-hub-form');const idea=node('textarea','text-input');idea.id='brain-vibewase-idea';idea.maxLength=8000;idea.rows=5;idea.setAttribute('aria-label','Conversa livre do Vibewase');idea.placeholder='Conte livremente o que quer criar ou mudar neste projeto…';idea.value=snapshot.briefs[project.id]?.conversation||'';
      const saveIdea=node('button','button','Salvar ideia');saveIdea.type='submit';freeForm.append(idea,saveIdea,node('p','muted','Sua ideia vira contexto do plano. Salvar não chama IA nem executa ações; prepare a missão abaixo para conversar e refinar com o Codex.'));
      freeForm.addEventListener('submit',event=>{event.preventDefault();run(async()=>{snapshot=await api.knowledge({action:'conversation',id:project.id,content:idea.value});notify('Ideia salva neste projeto.');})();});detail.append(freeForm);
    }
    if(modes.grillMe)detail.append(createInterview({api,projectId:project.id,answers,onSaved:updated=>{snapshot=updated;}}));
    else detail.append(node('p','muted','Grill-me desligado: planejamento direto, com suposições e pendências explícitas. Respostas anteriores são preservadas.'));
    detail.append(button(modes.grillMe?'Aprofundar com Codex · preparar missão':'Preparar plano com Codex',run(async()=>{const result=await api.knowledge({action:modes.grillMe?'grill':'plan',id:project.id});await refresh(false);notify('Missão de planejamento preparada. Revise e confirme no harness.');await onContinue(result.harnessId);})));content.append(detail);
    const recommendations=card('O que este projeto pode precisar','Harness · MCP · CLI · Skills · AR Board. Sugestões são referências para revisão, não uma garantia de compatibilidade.');detail.append(recommendations);
    api.knowledge({action:'recommend',id:project.id}).then(result=>{
      if(!recommendations.isConnected)return;
      recommendations.append(node('p','muted',result.harness),node('p','muted',result.mode));
      for(const [key,title]of [['mcp','MCP'],['cli','CLI'],['skills','Skills'],['arBoard','AR Board']]){recommendations.append(node('h4','',title));if(!result[key].length)recommendations.append(node('p','muted','Sem correspondência justificada ainda. Complete o briefing ou consulte o catálogo.'));for(const entry of result[key]){const row=node('div','brain-recommendation');row.append(node('strong','',entry.name),node('p','muted',entry.reason),button('Ver no catálogo',()=>onRecommend(entry)));recommendations.append(row);}}
    }).catch(error=>notify(error.message,true));
  }
  function renderStudy(){
    const filters=node('nav','study-filters');filters.setAttribute('aria-label','Organizar estudos');const all=button('Todos os tipos',()=>{studyTypeFilter='all';render();}),central=button('Central · todos os projetos',()=>{studyScopeFilter=studyScopeFilter==='central'?'all':'central';render();});all.setAttribute('aria-pressed',String(studyTypeFilter==='all'));central.setAttribute('aria-pressed',String(studyScopeFilter==='central'));filters.append(all,central);for(const type of snapshot.studyTypes||[]){const filter=button(type.name,()=>{studyTypeFilter=type.id;render();});filter.setAttribute('aria-pressed',String(studyTypeFilter===type.id));filters.append(filter);}content.append(filters);
    const study=card('O que seu cérebro vai estudar?','Organize fontes, prepare o pedido e escolha o agente no harness. A execução pede confirmação e usa um worker. O resultado vira uma proposta de conhecimento, não fine-tuning nem treinamento de pesos.');
    const form=node('form','brain-hub-form');const topic=node('textarea','text-input');topic.id='brain-study-topic';topic.required=true;topic.maxLength=500;topic.rows=3;topic.placeholder='Ex.: estudar RAG para suporte de uma farmácia, com fontes e exemplos';topic.setAttribute('aria-label','Tema ou nicho para estudar');
    const source=node('select');source.setAttribute('aria-label','Fontes locais do estudo');source.add(new Option('Anexar fontes depois no harness',''));for(const entry of snapshot.sources)source.add(new Option(`${entry.name} · até 16 referências`,entry.id));
    const type=node('select'),scope=node('select'),target=node('select');type.id='brain-study-type';type.setAttribute('aria-label','Tipo do estudo');type.add(new Option('Identificar pelo contexto',''));for(const entry of snapshot.studyTypes||[])type.add(new Option(entry.name,entry.id));scope.id='brain-study-scope';scope.setAttribute('aria-label','Onde usar este conhecimento');scope.add(new Option('Central · reutilizar em todos os projetos','central'));scope.add(new Option('Somente em um projeto','project'));target.id='brain-study-project';target.setAttribute('aria-label','Projeto do estudo');target.add(new Option('Escolha o projeto',''));for(const entry of snapshot.projects.filter(project=>project.harnessId))target.add(new Option(entry.name,entry.harnessId));
    topic.value=studyDraft.topic;type.value=studyDraft.type;scope.value=studyDraft.scope;target.value=studyDraft.projectId;source.value=studyDraft.sourceId;target.hidden=scope.value!=='project';target.required=scope.value==='project';
    for(const element of [topic,type,scope,target,source])element.addEventListener('input',()=>{Object.assign(studyDraft,{topic:topic.value,type:type.value,scope:scope.value,projectId:target.value,sourceId:source.value});target.hidden=scope.value!=='project';target.required=scope.value==='project';});
    const submit=node('button','button primary','Preparar missão de estudo');submit.type='submit';form.append(topic,type,scope,target,source,node('p','muted','A Central guarda referências reutilizáveis, não joga tudo no contexto. Só resultados aceitos na triagem e trechos relevantes são consultados. Links e vídeos não autorizam instalar nem executar conteúdo.'),submit);
    const attachments=node('div','media-picker');form.insertBefore(attachments,submit);createMediaPicker({api,container:attachments,scope:'study:general',notify});
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{submit.disabled=true;try{const result=await api.knowledge({action:'study',topic:topic.value,sourceId:source.value||undefined,type:type.value||undefined,scope:scope.value,projectId:target.value||undefined});Object.assign(studyDraft,{topic:'',type:'',scope:'central',projectId:'',sourceId:''});await refresh(false);notify('Estudo preparado com pedido e agente. Revise modelo, força e execução no harness.');await onContinue(result.harnessId);}finally{submit.disabled=false;}})();});study.append(form);content.append(study);
    if(['all','legal'].includes(studyTypeFilter))for(const reference of snapshot.referenceSources||[]){const item=card(reference.name,'Central · referência padrão para todos os projetos');item.append(node('p','muted',reference.url),node('p','muted',reference.mode));content.append(item);}
    for(const row of snapshot.studies.filter(row=>(studyTypeFilter==='all'||row.type===studyTypeFilter)&&(studyScopeFilter==='all'||row.scope===studyScopeFilter))){const project=snapshot.projects.find(project=>project.harnessId===row.id);const item=card(row.topic,`${snapshot.studyTypes?.find(type=>type.id===row.type)?.name||'Outros'} · ${row.scope==='central'?'Central · todos os projetos':'Conhecimento restrito ao projeto'} · ${project?.status||'Estado não disponível'}`);const category=node('select');category.setAttribute('aria-label','Categoria de '+row.topic);for(const type of snapshot.studyTypes||[])category.add(new Option(type.name,type.id));category.value=row.type;item.append(category,button('Salvar categoria',run(async()=>{await api.knowledge({action:'study-route',id:row.id,type:category.value,scope:row.scope,projectId:row.targetProjectId});await refresh(false);render();})),button('Continuar estudo',run(()=>onContinue(row.id))));if(row.scope!=='central')item.append(button('Compartilhar na Central',run(async()=>{await api.knowledge({action:'study-route',id:row.id,type:category.value,scope:'central'});await refresh(false);render();})));content.append(item);}
  }
  function renderFineTuning(){
    const panel=card('Fine-tuning · pesquisa e preparação','Perplexity web → fontes revisadas → exemplos → avaliação → plano de experimento. Pesquisa, RAG e treinamento de pesos são coisas diferentes. Nenhum treinamento está configurado ou será iniciado aqui.');
    const project=node('select');project.id='fine-tuning-project';project.setAttribute('aria-label','Projeto da preparação');project.add(new Option('Preparação geral',''));for(const entry of snapshot.projects.filter(entry=>entry.harnessId))project.add(new Option(entry.name,entry.harnessId));
    const form=node('form','brain-hub-form'),fields={};
    const attachments=node('div','media-picker');form.append(attachments);const media=createMediaPicker({api,container:attachments,scope:()=> 'fine-tuning:'+(project.value||'general'),notify});project.addEventListener('change',()=>media.refresh().catch(error=>notify(error.message,true)));
    for(const [key,label,limit,placeholder]of [['topic','Tema e objetivo',500,'Qual comportamento você quer melhorar?'],['question','Pergunta para o Perplexity',2000,'Pesquise fontes primárias e compare fine-tuning, RAG e instruções para…'],['model','Modelo candidato',200,'Modelo e versão; possibilidade de treino ainda precisa ser verificada'],['notes','Notas revisadas da pesquisa',8000,'Registre conclusões, dúvidas, data e limitações. Não cole credenciais ou dados pessoais.'],['sources','Fontes · uma URL HTTPS por linha',4000,'https://…'],['examples','Exemplos JSONL · opcional',20000,'{"messages":[{"role":"user","content":"Pergunta"},{"role":"assistant","content":"Resposta desejada"}]}'],['evaluation','Critérios de avaliação',4000,'Quais testes, conjunto separado e métricas demonstrariam melhora?']]){
      const labelElement=node('label','field-label',label),input=node('textarea','text-input');input.id='fine-tuning-'+key;labelElement.htmlFor=input.id;input.maxLength=limit;input.rows=key==='examples'?5:3;input.placeholder=placeholder;fields[key]=input;form.append(labelElement,input);
    }
    const restore=()=>{const saved=snapshot.fineTuning?.[project.value||'general']||{};for(const [key,input]of Object.entries(fields))input.value=saved[key]||'';};project.addEventListener('change',restore);restore();
    const save=async()=>{snapshot=await api.knowledge({action:'fine-tuning-save',projectId:project.value||undefined,input:Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value]))});notify('Preparação salva localmente. Nenhum treinamento iniciado.');};
    const saveButton=node('button','button primary','Salvar preparação');saveButton.type='submit';form.addEventListener('submit',event=>{event.preventDefault();run(save)();});
    form.append(button('Pesquisar no Perplexity web',run(async()=>{await api.knowledge({action:'fine-tuning-search',question:fields.question.value});})),saveButton,button('Preparar análise no harness',run(async()=>{await save();const result=await api.knowledge({action:'fine-tuning-study',projectId:project.value||undefined});await refresh(false);notify('Estudo pendente. Revise e confirme no harness; não inicia treino.');await onContinue(result.harnessId);})));
    panel.append(node('p','muted','O navegador usa sua sessão do Perplexity. Volte e registre notas e links; o SanduBAH não lê a página automaticamente, não usa API e não envia datasets. Salve antes de trocar de projeto.'),project,form);content.append(panel);
  }
  function renderLearning(){
    const settings=card('Aprendizado com procedência',snapshot.assessmentMode+' Avalia apenas operações feitas pelo SanduBAH; não vigia outros chats ou aplicativos.');
    const label=node('label','brain-auto-assess');const enabled=node('input');enabled.type='checkbox';enabled.checked=snapshot.autoAssess;enabled.id='brain-auto-assess';label.append(enabled,node('span','','Avaliar automaticamente os resultados do SanduBAH'));
    enabled.addEventListener('change',run(async()=>{snapshot=await api.knowledge({action:'auto',enabled:enabled.checked});render();}));settings.append(label);content.append(settings);
    if(!snapshot.learning.length)content.append(card('Sem aprendizados registrados','Execute uma missão ou prepare um estudo. Resultados úteis são classificados; segredos e saídas grandes não são arquivados automaticamente.'));
    for(const row of snapshot.learning){const item=card(row.title,row.reason);item.append(node('p','muted',`${{accepted:'Incluído como referência',review:'Requer revisão',rejected:'Não arquivado'}[row.decision]} · ${new Date(row.createdAt).toLocaleString('pt-BR')}`));if(row.content){const details=node('details');details.append(node('summary','','Ver registro e procedência'),node('p','muted',row.provenance),node('pre','brain-learning-content',row.content));item.append(details);}content.append(item);}
  }
  return {async show(){await refresh(false);render();},async refresh(){await refresh(true);render();}};
}
