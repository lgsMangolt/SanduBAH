import { categoryLabels, kindLabels, compactDescription, filterEntries, formatResult, initialArguments, summarizeCategories } from './ui-model.mjs';
import { createWorld } from './world.mjs';
import { createPlanner } from './planner.mjs';
import { createPlanningReview } from './planning-review.mjs';
import { createOffice } from './office.mjs';
import { createConnections } from './connections.mjs';
import {createProjectDock} from './project-dock.mjs';
import {createNotices} from './notice-ui.mjs';
import {createTutorials} from './tutorials.mjs';
import {createWhatsNew} from './whats-new.mjs';
import {createUpdates} from './updates.mjs';
import {createGauchos} from './gaucho.mjs';

const api=window.sandubah;
createPlanningReview(api);
const byId=id=>document.getElementById(id);
const pageSize=24;
const state={catalog:null,view:'all',kind:'all',category:'all',search:'',page:0,selected:null,jsonMode:false,arguments:{},status:{connected:false,busy:false,history:[]},tests:[],favorites:[]};
let world;
let planner;
let office,connections,dock,tutorialHub,gauchos;
try{state.favorites=JSON.parse(localStorage.getItem('sandubah-favorites')||'[]');}catch{}

function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function showToast(message,error=false){const toast=byId('toast');toast.textContent=message;toast.classList.toggle('is-error',error);toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{toast.hidden=true;},4000);}
function setOutput(title,value){byId('output-panel').hidden=false;byId('output-title').textContent=title;byId('output-content').textContent=formatResult(value);}
function showError(error){showToast(error.message||String(error),true);}
function categoryName(category){return categoryLabels[category]||category;}
function saveFavorites(){localStorage.setItem('sandubah-favorites',JSON.stringify(state.favorites));}

function setView(view){
  if(view==='settings')view='connections';
  if(view==='overview')view='all';
  state.view=view;state.page=0;state.category='all';
  document.body.dataset.currentView=view;
  state.kind=['mcp','cli','plugin','skill','agent'].includes(view)?view:'all';
  const titles={all:'Tudo o que sua cópia pode fazer.',mcp:'Ferramentas reais. Controle local.',cli:'Seu terminal, sem adivinhação.',library:'O conhecimento da sua cópia.',favorites:'Suas funções, a um clique.',development:'Da alteração ao teste, aqui.',activity:'Cada operação, sem mistério.'};
  const shortTitles={all:'Visão geral',mcp:'Ferramentas MCP',cli:'Comandos CLI',library:'Biblioteca',favorites:'Favoritos',development:'Compilar e testar',activity:'Atividade da sessão',plugin:'Plugins',skill:'Skills',agent:'Agentes',brain:'Cérebro',projects:'Meus projetos',harness:'Meu projeto',tutorials:'Tutoriais',gauchos:'Gauchinhos'};
  byId('page-title').textContent=view==='planner'?'Seu próximo projeto começa aqui.':titles[view]||shortTitles[view];
  byId('breadcrumb-view').textContent=view==='planner'?'Novo projeto':shortTitles[view]||view;
  const library='Skills, agentes e plugins disponíveis na sua cópia, para ler antes de usar.';
  const subtitles={all:'Explore as funções reais do seu Ruflo. Inspecione, prepare e execute com controle.',mcp:'Ferramentas do MCP local: consultas rodam direto, ações pedem confirmação e o que sai do escopo fica bloqueado.',cli:'Comandos e subcomandos da CLI da sua cópia, com a sintaxe real.',library,plugin:library,skill:library,agent:library,favorites:'As funções que você marcou com estrela, num só lugar.',development:'Build e testes usando apenas os arquivos e dependências da sua cópia.',activity:'As operações desta sessão, na ordem em que aconteceram.',connections:'O que está instalado e conectado: MCP local, Codex e Claude.',brain:'Seus Markdown conectados. Escolha o que entra no contexto e veja as fontes usadas.',office:'Os papéis de cada projeto e o andamento das missões, um worker por vez.',harness:'O projeto aberto: missões, contexto conectado e arquivos do workspace.',planner:'Converse sobre a ideia, conecte os Markdown do projeto e organize o trabalho dos agentes.',projects:'Os projetos conhecidos pelo seu Cérebro, com progresso, recomendações e acesso ao trabalho.',tutorials:'Guias práticos para planejar, construir e acompanhar seus projetos no SanduBAH.',gauchos:'Agentes que você cria do zero e ensina conversando, corrigindo e dando uma base própria.'};
  byId('page-subtitle').textContent=subtitles[view]||subtitles.all;
  if(view==='office'){byId('page-title').textContent='Seu time, no mesmo lugar.';byId('breadcrumb-view').textContent='Escritório';}
  if(view==='connections')byId('page-title').textContent='Conecte o que faz sentido para você.';
  const settings=['development','activity','connections'].includes(view);
  const group=settings?'settings':view==='harness'?'projects':['brain','projects','planner','office','tutorials','gauchos'].includes(view)?view:'all';
  document.querySelectorAll('.nav-button').forEach(button=>button.classList.toggle('active',button.dataset.view===group));
  document.querySelectorAll('.section-tab').forEach(button=>{const active=(button.dataset.view==='overview'?'all':button.dataset.view)===view;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
  byId('settings-tabs').hidden=!settings;
  if(settings)byId('breadcrumb-view').textContent=`Configurações / ${view==='connections'?'Conexões':shortTitles[view]}`;
  byId('catalog-view').hidden=['development','activity','brain','projects','harness','planner','office','connections','tutorials','gauchos'].includes(view);
  office?.show(view);connections?.show(view);
  tutorialHub?.show(view);gauchos?.show(view);
  dock?.show(view);
  world?.show(view);
  planner?.show(view);
  if(view==='tutorials')byId('page-title').textContent='Um passo de cada vez. Sem complicação.';
  if(view==='gauchos')byId('page-title').textContent='Seus gauchinhos, do seu jeito.';
  byId('development-view').hidden=view!=='development';
  byId('activity-view').hidden=view!=='activity';
  byId('category-filter').value='all';
  if(state.catalog)renderCatalog();
  renderActivity();
  byId('main-content').classList.remove('view-enter');
  requestAnimationFrame(()=>byId('main-content').classList.add('view-enter'));
}

function entriesForView(){
  let entries=state.catalog?.entries||[];
  if(state.view==='library')entries=entries.filter(entry=>['skill','agent','plugin'].includes(entry.kind));
  return entries;
}

function renderCatalog(){
  const allEntries=entriesForView();
  const baseFiltered=filterEntries(allEntries,{kind:state.kind,search:state.search,favoritesOnly:state.view==='favorites',favorites:state.favorites});
  const categorySelect=byId('category-filter');
  categorySelect.replaceChildren(new Option('Todas as categorias','all'));
  for(const [category,count]of summarizeCategories(baseFiltered))categorySelect.add(new Option(`${categoryName(category)} · ${count}`,category));
  if([...categorySelect.options].some(option=>option.value===state.category))categorySelect.value=state.category;else state.category='all';
  const filtered=filterEntries(baseFiltered,{category:state.category});
  const maxPage=Math.max(0,Math.ceil(filtered.length/pageSize)-1);
  state.page=Math.min(state.page,maxPage);
  const shown=filtered.slice(state.page*pageSize,(state.page+1)*pageSize);
  const list=byId('entry-list');list.replaceChildren();
  for(const entry of shown){
    const row=element('article','function-row');row.dataset.entryId=entry.id;
    row.classList.toggle('selected',state.selected?.id===entry.id);
    const icon=element('div',`function-icon ${entry.kind}`,{mcp:'⌘',cli:'›_',skill:'✦',agent:'♧',plugin:'◈'}[entry.kind]);
    const content=element('button','function-content');content.type='button';content.setAttribute('aria-label',`Ver detalhes de ${entry.name}`);
    const nameRow=element('span','function-name-row');nameRow.append(element('strong','function-name',entry.name),element('span','kind-badge',entry.kind.toUpperCase()));
    content.append(nameRow,element('span','function-description',compactDescription(entry.description)),element('span','function-category',categoryName(entry.category)));
    content.addEventListener('click',()=>selectEntry(entry));
    const favorite=element('button','favorite-button',state.favorites.includes(entry.id)?'★':'☆');favorite.setAttribute('aria-label',`${state.favorites.includes(entry.id)?'Remover dos':'Adicionar aos'} favoritos: ${entry.name}`);favorite.setAttribute('aria-pressed',String(state.favorites.includes(entry.id)));
    favorite.addEventListener('click',()=>{state.favorites=state.favorites.includes(entry.id)?state.favorites.filter(id=>id!==entry.id):[...state.favorites,entry.id];saveFavorites();renderCatalog();});
    const detailButton=element('button','row-action','Abrir ↗');detailButton.setAttribute('aria-label',`Abrir ${entry.name}`);detailButton.addEventListener('click',()=>selectEntry(entry));
    row.append(icon,content,favorite,detailButton);list.append(row);
  }
  byId('empty-state').hidden=filtered.length!==0;
  byId('results-count').textContent=`${filtered.length.toLocaleString('pt-BR')} ${filtered.length===1?'função encontrada':'funções encontradas'}`;
  byId('total-count').textContent=state.catalog.entries.length.toLocaleString('pt-BR');
  byId('pagination-label').textContent=filtered.length?`${state.page*pageSize+1}–${Math.min((state.page+1)*pageSize,filtered.length)} de ${filtered.length.toLocaleString('pt-BR')}`:'0 resultados';
  byId('previous-page').disabled=state.page===0;byId('next-page').disabled=state.page>=maxPage;
  byId('kind-filter').value=state.kind;
}

function selectEntry(entry){
  state.selected=entry;state.arguments=initialArguments(entry.inputSchema);state.jsonMode=false;
  const panel=byId('detail-panel');panel.hidden=false;document.body.classList.add('detail-open');
  byId('detail-kind').textContent=`${kindLabels[entry.kind]} / ${categoryName(entry.category)}`;
  byId('detail-title').textContent=entry.title||entry.name;
  byId('detail-name').textContent=entry.name;
  byId('detail-description').textContent=entry.description||'Consulte o conteúdo local para detalhes.';
  byId('detail-policy').replaceChildren(element('strong','',entry.policy.label),element('p','',entry.policy.reason));
  byId('detail-policy').dataset.mode=entry.policy.mode;
  byId('detail-source-path').hidden=!entry.sourcePath;byId('detail-source-path').textContent=entry.sourcePath||'';
  byId('entry-help').hidden=entry.kind!=='cli';byId('view-source').hidden=!['skill','agent','plugin'].includes(entry.kind);
  byId('execute-entry').hidden=entry.kind!=='mcp';byId('execute-entry').disabled=entry.policy.mode==='blocked'||state.status.busy;
  byId('execute-entry').textContent=entry.policy.mode==='confirm'?'Revisar e executar':entry.policy.mode==='blocked'?'Execução protegida':'Executar consulta local';
  byId('toggle-json').hidden=entry.kind!=='mcp';
  byId('copy-request').hidden=!['mcp','cli'].includes(entry.kind);
  byId('detail-error').textContent='';
  byId('detail-examples').replaceChildren();
  for(const example of entry.examples||[]){const group=element('div','example');group.append(element('small','',example.description||'Exemplo do código original'),element('code','',example.command||String(example)));byId('detail-examples').append(group);}
  if(entry.kind==='cli'&&entry.options?.length){const heading=element('h3','','Opções do comando');byId('detail-examples').prepend(heading);for(const option of entry.options){const group=element('div','option-description');group.append(element('code','',`--${option.name}${option.required?' · obrigatório':''}`),element('p','',option.description||''));byId('detail-examples').append(group);}}
  renderForm();renderCatalog();
  byId('close-detail').focus({preventScroll:true});
}

function renderForm(){
  const entry=state.selected;const form=byId('parameter-form');form.replaceChildren();
  byId('arguments-json').hidden=!state.jsonMode;byId('json-label').hidden=!state.jsonMode;form.hidden=state.jsonMode;
  byId('toggle-json').textContent=state.jsonMode?'Usar formulário':'Editar JSON';
  byId('arguments-json').value=JSON.stringify(state.arguments,null,2);
  if(entry.kind!=='mcp'){form.append(element('p','muted',entry.kind==='cli'?'A ajuda é executada com argv literal. Exemplos não são executados automaticamente.':'Abra as instruções para conhecer e modificar esta capacidade.'));return;}
  const properties=entry.inputSchema?.properties||{};
  if(!Object.keys(properties).length){form.append(element('p','muted','Esta função não exige parâmetros.'));return;}
  for(const [name,schema]of Object.entries(properties)){
    const group=element('div','parameter-field');const label=element('label','field-label',`${name}${entry.inputSchema.required?.includes(name)?' *':''}`);
    const fieldId=`field-${encodeURIComponent(name)}`;label.htmlFor=fieldId;let input;
    if(schema.enum){input=element('select','');input.add(new Option('Não informar',''));for(const choice of schema.enum)input.add(new Option(String(choice),JSON.stringify(choice)));input.value=state.arguments[name]===undefined?'':JSON.stringify(state.arguments[name]);}
    else if(schema.type==='boolean'){input=element('select','');input.add(new Option('Não informar',''));input.add(new Option('Sim','true'));input.add(new Option('Não','false'));input.value=state.arguments[name]===undefined?'':String(state.arguments[name]);}
    else if(['array','object'].includes(schema.type)||schema.anyOf||schema.oneOf||!schema.type){input=element('textarea','json-field');input.spellcheck=false;input.placeholder=schema.type==='array'?'[]':'{}';input.value=state.arguments[name]===undefined?'':JSON.stringify(state.arguments[name],null,2);}
    else{input=element('input','text-input');input.type=['integer','number'].includes(schema.type)?'number':/(?:secret|password|token|apikey)/i.test(name)?'password':'text';input.value=state.arguments[name]??'';if(schema.type==='integer')input.step='1';if(schema.minimum!==undefined)input.min=String(schema.minimum);if(schema.maximum!==undefined)input.max=String(schema.maximum);}
    input.id=fieldId;input.dataset.parameter=name;
    input.addEventListener('input',()=>{
      byId('detail-error').textContent='';
      try{
        if(input.value==='')delete state.arguments[name];
        else if(schema.enum||schema.type==='boolean'||['array','object'].includes(schema.type)||schema.anyOf||schema.oneOf||!schema.type)state.arguments[name]=JSON.parse(input.value);
        else if(['integer','number'].includes(schema.type)){const value=Number(input.value);if(!Number.isFinite(value))throw new Error('Número inválido.');state.arguments[name]=value;}
        else state.arguments[name]=input.value;
        byId('arguments-json').value=JSON.stringify(state.arguments,null,2);
      }catch{byId('detail-error').textContent=`Revise o campo ${name}: use um valor JSON válido.`;}
    });
    group.append(label,input);if(schema.description)group.append(element('small','field-description',schema.description));form.append(group);
  }
}

function currentArguments(){
  if(byId('detail-error').textContent&&!state.jsonMode)throw new Error(byId('detail-error').textContent);
  const value=state.jsonMode?JSON.parse(byId('arguments-json').value):state.arguments;
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('Informe um objeto JSON.');
  return value;
}

function renderStatus(status){
  state.status=status;const indicator=byId('connection-status');indicator.classList.toggle('connected',status.connected);indicator.replaceChildren(element('span','status-dot'),document.createTextNode(status.busy?'Operação em execução':status.connected?'MCP local conectado':'MCP em espera'));
  world?.status(status);
  planner?.status(status);
  byId('connect-button').textContent=status.connected?'Verificar conexão':'Conectar MCP';byId('connect-button').disabled=status.busy;
  for(const id of ['build-cli','run-test','entry-help','refresh-catalog'])byId(id).disabled=status.busy;
  if(state.selected)byId('execute-entry').disabled=status.busy||state.selected.policy.mode==='blocked';
  renderActivity();
}

function renderActivity(){
  const list=byId('activity-list');list.replaceChildren();
  if(!state.status.history.length){const empty=element('div','empty-state');empty.append(element('span','','◷'),element('h3','','Sua sessão começa aqui.'),element('p','','As operações que você executar aparecerão neste espaço.'));list.append(empty);return;}
  for(const operation of state.status.history){const row=element('div','activity-row');row.append(element('span',operation.status==='erro'?'activity-error':'activity-success',operation.status==='erro'?'!':'✓'),element('strong','',operation.label),element('small','',new Date(operation.startedAt).toLocaleTimeString('pt-BR')),element('span','',operation.status));if(operation.error)row.append(element('p','',operation.error));list.append(row);}
}

function renderTestFiles(){const query=byId('test-file-search').value.toLowerCase();const select=byId('test-file-select');select.replaceChildren(new Option('Selecione um arquivo',''));for(const path of state.tests.filter(path=>path.toLowerCase().includes(query)))select.add(new Option(path,path));}

async function initialize(){
  try{
    if(!api)throw new Error('Abra este painel pelo SanduBAH.exe. A ponte local não está disponível neste navegador.');
    const initial=await api.initialize();state.catalog=initial.catalog;state.tests=initial.tests;
    dock=createProjectDock({api,notify:showToast});createNotices({api,navigate:setView});
    world=createWorld({api,catalog:state.catalog,notify:showToast,output:setOutput,navigate:setView});
    planner=createPlanner({api,notify:showToast});
    office=createOffice({api,container:byId('office-view'),onContinue:id=>world.continueProject(id)});
    connections=createConnections({api,container:byId('connections-view'),navigate:setView,getStatus:()=>state.status});
    tutorialHub=createTutorials({container:byId('tutorials-view'),navigate:setView});
    gauchos=createGauchos({api,container:byId('gauchos-view'),notify:showToast});
    const desktopUpdates=createUpdates({api,container:byId('tutorials-view'),notify:showToast,autoCheck:initial.updateCheckOnOpen});
    const whatsNew=createWhatsNew({api,initial:initial.releaseNotes,navigate:setView,notify:showToast});
    window.addEventListener('sandubah:open-project',event=>{if(event.detail.view==='harness')world.continueProject(event.detail.id);else planner.openProject(event.detail.id);});
    const counts=state.catalog.counts;byId('metric-mcp').textContent=counts.mcp.toLocaleString('pt-BR');byId('metric-cli').textContent=counts.cli.toLocaleString('pt-BR');byId('metric-library').textContent=(counts.skill+counts.agent).toLocaleString('pt-BR');byId('metric-plugin').textContent=counts.plugin.toLocaleString('pt-BR');
    byId('nav-mcp-count').textContent=counts.mcp;byId('nav-cli-count').textContent=counts.cli;
    byId('heading-version').textContent=`SANDUBAH v${initial.version}`;byId('repository-path').textContent=initial.repositoryRoot;
    byId('catalog-date').textContent=`Catálogo de ${new Date(state.catalog.generatedAt).toLocaleDateString('pt-BR')}`;
    byId('footer-source').textContent=`${state.catalog.entries.length.toLocaleString('pt-BR')} entradas reais · cópia local`;
    renderTestFiles();renderStatus(initial.status);renderCatalog();
    api.onState(renderStatus);api.onOutput(chunk=>{byId('output-content').textContent=(byId('output-content').textContent+chunk).slice(-1000000);byId('output-content').scrollTop=byId('output-content').scrollHeight;});
    try{renderStatus(await api.connect());}catch(error){showToast(`Catálogo disponível; MCP: ${error.message}`,true);}
    document.body.dataset.ready='true';
    whatsNew.showOnStartup();
    desktopUpdates.start().catch(showError);
  }catch(error){byId('load-error').hidden=false;byId('load-error').textContent=error.message;document.body.dataset.ready='error';}
}

document.querySelectorAll('.nav-button,.section-tab').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();setView('all');});
document.querySelectorAll('.metric').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.kind)));
byId('kind-filter').addEventListener('change',event=>{state.kind=event.target.value;state.page=0;state.category='all';renderCatalog();});
byId('search-input').addEventListener('input',event=>{state.search=event.target.value;state.page=0;renderCatalog();});
byId('category-filter').addEventListener('change',event=>{state.category=event.target.value;state.page=0;renderCatalog();});
byId('reset-filters').addEventListener('click',()=>{state.search='';state.kind='all';state.category='all';state.page=0;byId('search-input').value='';renderCatalog();});
byId('previous-page').addEventListener('click',()=>{state.page--;renderCatalog();});byId('next-page').addEventListener('click',()=>{state.page++;renderCatalog();});
byId('close-detail').addEventListener('click',()=>{byId('detail-panel').hidden=true;document.body.classList.remove('detail-open');state.selected=null;renderCatalog();});
byId('close-output').addEventListener('click',()=>{byId('output-panel').hidden=true;});
byId('toggle-json').addEventListener('click',()=>{try{state.arguments=currentArguments();state.jsonMode=!state.jsonMode;byId('detail-error').textContent='';renderForm();}catch(error){byId('detail-error').textContent=error.message;}});
byId('arguments-json').addEventListener('input',()=>{byId('detail-error').textContent='';});
byId('execute-entry').addEventListener('click',async()=>{try{const args=currentArguments();setOutput(state.selected.name,'Executando no MCP local…');const result=await api.execute({id:state.selected.id,arguments:args});setOutput(state.selected.name,result);showToast(result.cancelled?'Execução cancelada.':result.isError?'A ferramenta retornou um erro.':'Resposta recebida do motor local.',Boolean(result.isError));}catch(error){byId('detail-error').textContent=error.message;setOutput('Não foi possível executar',error.message);showError(error);}});
byId('entry-help').addEventListener('click',async()=>{try{setOutput(`Ajuda: ${state.selected.name}`,'Carregando ajuda da CLI local…');const result=await api.help(state.selected.id);setOutput(`Ajuda: ${state.selected.name}`,result.output);if(!result.success)showToast(`A CLI retornou código ${result.exitCode}.`,true);}catch(error){setOutput('Erro na ajuda',error.message);showError(error);}});
byId('view-source').addEventListener('click',async()=>{try{const source=await api.readSource(state.selected.id);setOutput(source.path,source.content);}catch(error){showError(error);}});
byId('copy-request').addEventListener('click',async()=>{try{await api.copyRequest({id:state.selected.id,arguments:state.selected.kind==='mcp'?currentArguments():{}});showToast('Chamada copiada. Revise os efeitos antes de usar no Codex.');}catch(error){showError(error);}});
byId('connect-button').addEventListener('click',async()=>{try{renderStatus(await api.connect());showToast('MCP da sua cópia está conectado.');}catch(error){showError(error);}});
byId('open-codex').addEventListener('click',async()=>{try{await api.openCodex();showToast('Pasta local enviada ao Codex.');}catch(error){showError(error);}});
byId('test-file-search').addEventListener('input',renderTestFiles);
async function development(action){try{const testPath=byId('test-file-select').value;if(action==='test'&&!testPath)throw new Error('Selecione um arquivo de testes.');setOutput(action==='test'?'Teste local · um worker':'Compilar CLI local','');const result=await api.development({action,testPath});if(result.cancelled){setOutput('Operação cancelada','Nenhum build/teste foi iniciado.');return;}setOutput(action==='test'?'Resultado do teste':'Resultado da compilação',result.output||`Processo encerrado com código ${result.exitCode}.`);showToast(result.success?'Processo local concluído com sucesso.':`Processo retornou código ${result.exitCode}.`,!result.success);}catch(error){showError(error);}}
byId('build-cli').addEventListener('click',()=>development('build'));byId('run-test').addEventListener('click',()=>development('test'));
byId('refresh-catalog').addEventListener('click',async()=>{try{await api.development({action:'catalog'});window.location.reload();}catch(error){showError(error);}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(['development','activity','brain','harness','planner','tutorials'].includes(state.view))setView('all');byId('search-input').focus();}if(event.key==='Escape'&&!byId('detail-panel').hidden)byId('close-detail').click();});
initialize();
