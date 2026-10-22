'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell, protocol, net, Notification, nativeImage } = require('electron');
const {MediaLibrary}=require('./media.cjs');
const {ProjectPreview}=require('./project-preview.cjs');
const {PreviewData}=require('./preview-data.cjs');
const {CompletionNotifier}=require('./completion.cjs');
const {ReleaseNotes}=require('./release-notes.cjs');
const {APP_ID,TOAST_CLSID,configureIdentity}=require('./desktop-identity.cjs');
const {createTaskbarBadge}=require('./taskbar-badge.cjs');
const { modelById } = require('./model-catalog.cjs');
const { reviewLimit } = require('./context-limits.cjs');
const { PlanningReview, planningReview, executionReview } = require('./planning-review.cjs');
const { existsSync, readFileSync, readdirSync, lstatSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { homedir } = require('node:os');
const { PersonalLibrary } = require('./personal-library.cjs');
const { DesktopUpdates } = require('./desktop-updates.cjs');
const { KnowledgeLibrary } = require('./knowledge.cjs');
const { LegalReference } = require('./legal-reference.cjs');
const { DesktopController, createValidator, assertLocalWriteTree, redact } = require('./backend.cjs');

const repositoryRoot = resolve(__dirname,'../..');
const buildRoot = join(repositoryRoot,'build/sandubah/gui');
const runtime = JSON.parse(readFileSync(join(buildRoot,'runtime.json'),'utf8'));
const indexUrl = pathToFileURL(join(__dirname,'index.html')).href;
const Ajv = require(join(buildRoot,'vendor/node_modules/ajv'));
const hidden = process.argv.includes('--sandubah-test');
app.setName('SanduBAH');
if(process.platform==='win32'){app.setAppUserModelId(APP_ID);app.setToastActivatorCLSID?.(TOAST_CLSID);}
if(!app.isReady())protocol.registerSchemesAsPrivileged([{scheme:'sandubah-media',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}},{scheme:'sandubah-preview',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
assertLocalWriteTree(repositoryRoot,join(buildRoot,hidden?'test-profile':'profile'));
assertLocalWriteTree(repositoryRoot,join(buildRoot,'logs'));
app.setPath('userData',join(buildRoot,hidden?'test-profile':'profile'));
app.setPath('logs',join(buildRoot,'logs'));
app.commandLine.appendSwitch('renderer-process-limit','1');

let mainWindow;
let controller;
let updates;
let quitting = false;
const planningReviews=new PlanningReview(review=>mainWindow.webContents.send('sandubah:planning-review',review));

function assertSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== indexUrl) throw new Error('Origem IPC não autorizada.');
}

function handle(channel, action) {
  ipcMain.handle(channel,async (event,payload) => {
    assertSender(event);
    const readOnlyKnowledge=channel==='sandubah:knowledge'&&(payload?.action==='status'||payload?.action==='planner-options'&&!payload.options);
    try { if(updates?.active&&!readOnlyKnowledge&&!['sandubah:updates-status','sandubah:initialize','sandubah:release-notes','sandubah:memory-status','sandubah:models-status','sandubah:planner-status','sandubah:notices','sandubah:notice-read'].includes(channel))throw new Error('Aguarde a verificação ou download da atualização.');return { ok:true, value:await action(payload) }; }
    catch (error) { return { ok:false, error:String(error.message || error).slice(0,3000) }; }
  });
}

function testFiles() {
  const result=[];
  function visit(directory) {
    for (const item of readdirSync(directory,{withFileTypes:true})) {
      if (item.isSymbolicLink() || ['node_modules','dist','.git','coverage'].includes(item.name)) continue;
      const filename=join(directory,item.name);
      if (item.isDirectory()) visit(filename);
      else if (item.name.endsWith('.test.ts') && filename.includes('__tests__')) result.push(filename.slice(repositoryRoot.length+1).replaceAll('\\','/'));
    }
  }
  visit(join(repositoryRoot,'v3'));
  return result.sort();
}

async function nativeConfirmation(request) {
  const parameters=JSON.stringify(redact(request.arguments),null,2);
  if(parameters.length>reviewLimit(request))throw new Error(`A revisão excede ${reviewLimit(request).toLocaleString('pt-BR')} caracteres. Reduza o escopo; nada será cortado.`);
  if(request.entry.kind==='cloud-planning')return planningReviews.ask(planningReview({...request,arguments:redact(request.arguments)},parameters));
  if(request.entry.kind==='harness'&&request.arguments.missions?.length&&request.arguments.missions.every(mission=>mission.executor?.startsWith('Codex instalado')))return planningReviews.ask(executionReview({...request,arguments:redact(request.arguments)},parameters));
  const response=await dialog.showMessageBox(mainWindow,{
    type:'warning',title:'Revisar execução local — SanduBAH',
    message:`Executar ${request.entry.name}?`,
    detail:`Projeto: ${request.project}\n\n${request.entry.kind==='development'?'Build/teste da cópia local, com um worker.':request.entry.kind==='harness'?'A fila registra os agentes e executa as ferramentas listadas, em ordem. Para no primeiro erro.':'A ferramenta pode criar, atualizar ou excluir dados deste projeto privado.'} Nenhuma chamada será repetida automaticamente.\n\nParâmetros:\n${parameters}`,
    buttons:['Cancelar','Executar uma vez'],defaultId:0,cancelId:0,noLink:true,
  });
  return response.response===1;
}

function createWindow() {
  const catalog=JSON.parse(readFileSync(join(buildRoot,'catalog.json'),'utf8'));
  controller=new DesktopController({ repositoryRoot,runtime,catalog,personalLibrary:hidden?null:new PersonalLibrary({home:homedir()}),confirm:nativeConfirmation,validator:createValidator(Ajv) });
  controller.knowledge=new KnowledgeLibrary({repositoryRoot,home:homedir(),appData:app.getPath('appData'),includeParent:!runtime.distribution?.installed,directory:join(buildRoot,hidden?'test-profile/brain':'brain'),projects:controller.projects,catalog:()=>controller.getCatalog(),write:(path,content)=>controller.projects.write(path,content)});
  controller.projects.knowledgeLibrary=controller.knowledge;
  controller.legal=new LegalReference({directory:join(buildRoot,hidden?'test-profile/brain/legal-cache':'brain/legal-cache'),guard:path=>controller.projects.guard(path),write:(path,content)=>controller.projects.write(path,content)});
  controller.knowledge.legal=controller.legal;
  controller.media=new MediaLibrary({root:repositoryRoot,directory:join(buildRoot,hidden?'test-profile/media':'media'),guard:path=>assertLocalWriteTree(repositoryRoot,path),write:(path,content)=>controller.projects.write(path,content)});
  const previews=new ProjectPreview(controller.projects);
  const previewData=new PreviewData(controller.projects);
  const releaseNotes=new ReleaseNotes({directory:app.getPath('userData'),guard:path=>assertLocalWriteTree(repositoryRoot,path),write:(path,content)=>controller.projects.write(path,content)});
  mainWindow=new BrowserWindow({
    title:'SanduBAH',icon:join(__dirname,'sandubah-logo.png'),width:1500,height:980,minWidth:860,minHeight:640,
    show:!hidden,backgroundColor:'#f5f5f2',autoHideMenuBar:true,
    webPreferences:{ preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,spellcheck:false,backgroundThrottling:!hidden },
  });
  configureIdentity({app,window:mainWindow,shell,root:repositoryRoot,hidden,distribution:runtime.distribution});
  const configPath=join(repositoryRoot,'build/sandubah/distribution/update-public.json');
  const updateConfig=runtime.updateConfig||(existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{});
  updates=new DesktopUpdates({root:repositoryRoot,version:runtime.distribution?.version||updateConfig.version||'0.1.0',publicKey:updateConfig.publicKey,isBusy:()=>Boolean(controller.active),confirm:async request=>{
    const answer=await dialog.showMessageBox(mainWindow,{type:'question',title:'Atualizar SanduBAH',message:request.stage==='download'?`Baixar SanduBAH ${request.version}?`:`Fechar e instalar SanduBAH ${request.version}?`,detail:request.stage==='download'?`Download de ${(request.bytes/1024/1024).toFixed(1)} MB da versão assinada.\n\n${request.notes.join('\n')}\n\nSeus projetos e chaves não são enviados. O download não instala nada.`:'O assistente de instalação será aberto. Seus dados ficam separados da pasta do programa. Somente esta janela do SanduBAH será fechada; outros programas não serão alterados.',buttons:['Agora não',request.stage==='download'?'Baixar atualização':'Fechar e abrir instalador'],defaultId:0,cancelId:0,noLink:true});return answer.response===1;
  },launch:filename=>new Promise((resolvePromise,rejectPromise)=>{const child=spawn(filename,[],{shell:false,detached:true,windowsHide:false,stdio:'ignore'});child.once('error',rejectPromise);child.once('spawn',()=>{child.unref();quitting=true;controller.close();resolvePromise();app.quit();});})});
  updates.on('state',state=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:updates',state);});
  handle('sandubah:updates-status',()=>updates.snapshot());
  handle('sandubah:updates-check',()=>updates.check());
  handle('sandubah:updates-download',()=>updates.download());
  handle('sandubah:updates-install',()=>updates.install());
  const badge=createTaskbarBadge({window:mainWindow,nativeImage});
  const noticeFile=join(app.getPath('userData'),'notifications.json');
  const notices=new CompletionNotifier({Notification,window:mainWindow,hidden,icon:join(__dirname,'sandubah-logo.png'),onBadge:count=>badge.update(count),load:()=>{try{assertLocalWriteTree(repositoryRoot,noticeFile);const info=lstatSync(noticeFile);if(!info.isFile()||info.isSymbolicLink()||info.nlink>1||info.size>128000)return null;return JSON.parse(readFileSync(noticeFile,'utf8'));}catch{return null;}},persist:state=>controller.projects.write(noticeFile,JSON.stringify(state)),send:notice=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:notice',notice);}});
  handle('sandubah:notices',()=>notices.snapshot());
  handle('sandubah:notice-read',payload=>notices.read(payload));
  handle('sandubah:notice-test',()=>notices.done({title:'Teste SanduBAH',body:'Nome, ícone e contador de avisos do SanduBAH. Este é só um teste; nenhuma IA foi chamada.'}));
  protocol.handle('sandubah-media',async request=>{try{const url=new URL(request.url);if(url.hostname!=='asset')throw new Error('Origem inválida.');const filename=controller.media.path(decodeURIComponent(url.pathname.slice(1)));const response=await net.fetch(pathToFileURL(filename).href,{headers:request.headers});const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');return new Response(response.body,{status:response.status,headers});}catch{return new Response('Anexo não disponível',{status:404});}});
  protocol.handle('sandubah-preview',request=>{try{const url=new URL(request.url),result=previews.read(url.hostname,decodeURIComponent(url.pathname.slice(1)));return new Response(result.bytes,{headers:{'Content-Type':result.type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"}});}catch{return new Response('A prévia ainda não está disponível.',{status:404});}});
  handle('sandubah:preview',payload=>({...previews.snapshot(payload.id),lifecycle:controller.knowledge.lifecycle('harness:'+payload.id)}));
  handle('sandubah:preview-file',payload=>previews.text(payload.id,payload.path));
  handle('sandubah:preview-data',payload=>{if(controller.active)throw new Error('Aguarde o worker antes de salvar dados da prévia.');if(payload.action==='load')return previewData.load(payload.id);if(payload.action==='save')return previewData.save(payload.id,payload);throw new Error('Operação de dados inválida.');});
  handle('sandubah:media-list',payload=>controller.media.list(payload.scope));
  handle('sandubah:media-remove',payload=>{if(controller.active)throw new Error('Aguarde o worker para alterar anexos.');return controller.media.remove(payload.scope,payload.id);});
  handle('sandubah:media-frames',payload=>{if(controller.active)throw new Error('Aguarde o worker para preparar o vídeo.');return controller.media.frames(payload.id,payload.frames,payload.duration);});
  handle('sandubah:media-choose',async payload=>{if(controller.active)throw new Error('Aguarde o worker para anexar.');controller.media.scope(payload.scope);const result=await dialog.showOpenDialog(mainWindow,{title:'Fotos e vídeos para este projeto',properties:['openFile','multiSelections'],filters:[{name:'Fotos e vídeos',extensions:['png','jpg','jpeg','webp','mp4','webm','mov']}]});if(result.canceled)return [];if(controller.active)throw new Error('Aguarde o worker para anexar.');return result.filePaths.map(path=>controller.media.importFile(payload.scope,path));});
  handle('sandubah:build-project',async payload=>{const result=await controller.buildProject(payload);if(!result.cancelled)notices.done({title:result.success?'Projeto atualizado':'Projeto pronto para revisão',body:'Confira os arquivos, testes e a prévia no SanduBAH.',projectId:result.projectId,view:'planner'});return result;});
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('did-start-navigation',(_event,_url,isInPlace,isMainFrame)=>{if(isMainFrame&&!isInPlace)planningReviews.cancel();});
  mainWindow.webContents.on('render-process-gone',()=>planningReviews.cancel());
  handle('sandubah:planning-review-response',payload=>planningReviews.respond(payload));
  mainWindow.webContents.on('will-navigate',(event,url)=>{if((event.url||url)!==indexUrl)event.preventDefault();});
  mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
  controller.on('state',state=>{ if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:state',state); });
  controller.on('output',output=>{ if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:output',output); });
  controller.on('project',project=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:project-state',project);});
  controller.on('worker',event=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:worker',event);});
  controller.on('planner',event=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:planner-event',event);});
  handle('sandubah:planner-status',()=>controller.plannerStatus());
  handle('sandubah:planner-context',payload=>controller.single('Consultar cérebro e referências · um worker',async()=>{await controller.prepareLegalContext(payload);return controller.plannerContextPreview(payload);}));
  handle('sandubah:planner-select',payload=>{if(controller.active)throw new Error('Aguarde o worker antes de trocar de planejador.');return controller.cloud.select(payload);});
  handle('sandubah:planner-quota',payload=>controller.single('Consultar cota · sem inferência',()=>controller.cloud.refreshQuota(payload.provider)));
  controller.on('models',snapshot=>{if(!mainWindow.isDestroyed())mainWindow.webContents.send('sandubah:models-event',snapshot);});
  handle('sandubah:models-status',()=>controller.models.snapshot());
  handle('sandubah:memory-status',()=>controller.memory.status());
  handle('sandubah:models-select',payload=>controller.models.select(payload.id));
  handle('sandubah:models-cancel',payload=>controller.models.cancel(payload.id));
  handle('sandubah:models-link',payload=>shell.openExternal(modelById(payload.id).url));
  handle('sandubah:models-install',async payload=>{
    const model=modelById(payload.id);
    if(!model.supported)throw new Error('Este modelo não cabe no perfil local. Consulte Info.');
    const action=payload.action==='validate'?'validate':'install';
    const approval=await dialog.showMessageBox(mainWindow,{type:'question',title:'SanduBAH · IA local',message:action==='install'?`Preparar ${model.name}?`:`Repetir os testes de ${model.name}?`,detail:action==='install'?`Reaproveita arquivos já baixados ou baixa cerca de ${model.downloadGB} GB da fonte oficial. Depois instala e testa conversa e diagrama.\n\n${model.disk}. Um worker; teto de 3,9 GB na GPU inteira.`:`Testa conversa e diagrama com um worker. Pode levar alguns minutos.\n\nPara conversar com uma IA já aprovada, use “Usar no planejador”. Este teste não é necessário para iniciar uma conversa.\n\nA memória será conferida antes de começar; teto de 3,9 GB na GPU inteira.`,buttons:['Cancelar',action==='install'?'Preparar e testar':'Testar uma vez'],defaultId:0,cancelId:0,noLink:true});
    return approval.response===1?controller.models.enqueue(model.id,action):{cancelled:true};
  });
  handle('sandubah:planner-chat',async payload=>{const result=await (controller.cloud.selection.provider==='local'?controller.planWithQwen(payload):controller.planWithCloud(payload));if(!result.cancelled)notices.done({title:'Resposta pronta',body:'Sua IA terminou de responder no SanduBAH.',projectId:payload.projectId||'',view:'planner'});return result;});
  handle('sandubah:planner-stop',()=>{if(controller.active?.worker===controller.cloud)controller.cloud.cancel();else controller.planner.cancel();return {stopping:true};});
  handle('sandubah:planner-image',async()=>{
    if(controller.active)throw new Error('Aguarde o worker antes de anexar uma imagem.');
    const selection=await dialog.showOpenDialog(mainWindow,{title:'Diagrama para o Qwen local',properties:['openFile'],filters:[{name:'Imagens',extensions:['png','jpg','jpeg','webp']}]});
    if(selection.canceled)return null;
    if(controller.active)throw new Error('Aguarde o worker antes de anexar uma imagem.');
    return controller.planner.importImage(selection.filePaths[0]);
  });
  handle('sandubah:initialize',()=>({ catalog:controller.getCatalog(),status:controller.status(),repositoryRoot,version:catalog.version,tests:testFiles(),updateCheckOnOpen:!hidden,releaseNotes:{...releaseNotes.snapshot(),autoShow:!hidden||process.argv.includes('--sandubah-whats-new-test')},protections:{codexConfiguration:'preservada',gateway:'não utilizado',transport:'stdio',workerLimit:1} }));
  handle('sandubah:release-notes',payload=>{if(payload?.action==='status')return releaseNotes.snapshot();if(payload?.action==='seen')return releaseNotes.seen(payload.releaseId);throw new Error('Operação de novidades inválida.');});
  handle('sandubah:connect',()=>controller.connect());
  handle('sandubah:execute',payload=>controller.execute(payload));
  handle('sandubah:help',payload=>controller.help(payload.id));
  handle('sandubah:source',payload=>controller.readSource(payload.id));
  handle('sandubah:development',payload=>controller.development(payload));
  handle('sandubah:brain',()=>controller.projects.index());
  handle('sandubah:knowledge',async payload=>{
    const action=payload?.action||'status';
    if(action==='status')return controller.knowledge.snapshot();
    if(action==='refresh'){if(controller.active)throw new Error('Aguarde o worker antes da varredura.');return controller.knowledge.refresh();}
    if(action==='recommend')return controller.knowledge.recommendations(payload.id);
    if(action==='lifecycle')return controller.knowledge.lifecycle(payload.id);
    if(action==='open'){const project=controller.knowledge.project(payload.id);controller.knowledge.safe(project.directory,project.directory);if(!lstatSync(project.directory).isDirectory())throw new Error('A pasta do projeto não está disponível.');const error=await shell.openPath(project.directory);if(error)throw new Error(error);return {opened:true};}
    if(controller.active)throw new Error('Aguarde o worker antes de alterar o cérebro.');
    if(action==='lifecycle-update')return controller.knowledge.updateLifecycle(payload.id,payload.input);
    if(action==='fine-tuning-save')return controller.knowledge.saveFineTuning(payload.projectId,payload.input);
    if(action==='fine-tuning-study'){const result=controller.knowledge.prepareFineTuning(payload.projectId);controller.media.copyScope('fine-tuning:'+(payload.projectId||'general'),'project:'+result.harnessId);return result;}
    if(action==='fine-tuning-search'){
      const url=controller.knowledge.perplexitySearch(payload.question);
      const approval=await dialog.showMessageBox(mainWindow,{type:'question',title:'Pesquisar no Perplexity web',message:'Abrir esta pergunta no Perplexity?',detail:`Somente a pergunta abaixo será enviada ao site externo. Não anexamos Markdown, datasets ou credenciais. Resultados precisam ser revisados e registrados manualmente; não é integração com a API nem treinamento.\n\n${payload.question}`,buttons:['Cancelar','Abrir pesquisa'],defaultId:0,cancelId:0,noLink:true});
      if(approval.response!==1)return {cancelled:true};await shell.openExternal(url);return {opened:true};
    }
    if(action==='brief')return controller.knowledge.saveBrief(payload.id,payload.answers);
    if(action==='modes')return controller.knowledge.saveModes(payload.id,payload.modes);
    if(action==='planner-options')return payload.options?controller.knowledge.savePlannerOptions(payload.projectId,payload.options):controller.knowledge.plannerOptions(payload.projectId);
    if(action==='conversation')return controller.knowledge.saveConversation(payload.id,payload.content);
    if(action==='plan')return controller.knowledge.plan(payload.id);
    if(action==='continue')return controller.knowledge.continueProject(payload.id);
    if(action==='grill')return controller.knowledge.grill(payload.id);
    if(action==='study-route'){if(controller.active)throw new Error('Aguarde o worker antes de organizar o estudo.');return controller.knowledge.routeStudy(payload.id,payload);}
    if(action==='study'){if(controller.active)throw new Error('Aguarde o worker antes de preparar outro estudo.');const result=controller.knowledge.study(payload.topic,payload.sourceId,{type:payload.type,scope:payload.scope,projectId:payload.projectId});const project=controller.projects.get(result.harnessId),selected=controller.cloud.selection,candidate=['codex','claude'].includes(selected.provider)&&controller.cloud.models(selected.provider).some(model=>model.id===selected.model)?selected:{provider:'codex',model:controller.cloud.models('codex').find(model=>model.id==='gpt-6-luna')?.id};if(candidate.model){Object.assign(project.missions[0],{engine:candidate.provider,model:candidate.model,effort:candidate.effort,tool:candidate.provider==='codex'?'codex.exec':'claude.study'});project.executorDefaults={engine:candidate.provider,model:candidate.model,effort:candidate.effort};controller.projects.save(project);}controller.media.copyScope('study:general','project:'+result.harnessId);return result;}
    if(action==='auto'){if(typeof payload.enabled!=='boolean')throw new Error('Preferência inválida.');controller.knowledge.state.autoAssess=payload.enabled;controller.knowledge.persist();return controller.knowledge.snapshot();}
    throw new Error('Ação do cérebro inválida.');
  });
  handle('sandubah:document',payload=>controller.projects.document(payload.path,payload.projectId));
  handle('sandubah:save-document',async payload=>{
    if(controller.active)throw new Error('Aguarde o worker antes de editar.');
    return controller.projects.edit(payload);
  });
  handle('sandubah:project',payload=>controller.projectAction(payload));
  handle('sandubah:run-project',async payload=>{const result=await controller.runProject(payload);if(!result.cancelled)notices.done({title:'Etapa do projeto encerrada',body:'Confira resultados e testes no SanduBAH.',projectId:payload.id,view:'harness'});return result;});
  handle('sandubah:stop-queue',()=>controller.stopQueue());
  handle('sandubah:interrupt-worker',()=>controller.interruptWorker());
  handle('sandubah:artifacts',payload=>controller.projects.artifacts(payload.id));
  handle('sandubah:artifact',payload=>controller.projects.artifact(payload.id,payload.path));
  handle('sandubah:apply-artifact',payload=>controller.applyArtifact(payload));
  handle('sandubah:handoff',async payload=>{
    const project=controller.projects.get(payload.id);
    const text=`Projeto SanduBAH: ${project.name}\nObjetivo: ${project.goal}\nHarness local: ${controller.projects.location(project.id)}\nUse apenas esta cópia local de Ruflo. Um worker. Não altere gateway ou configurações globais.\n\nPapéis e missões:\n${JSON.stringify({agents:project.agents,missions:project.missions.map(({title,tool,status})=>({title,tool,status}))},null,2)}\n\nContexto de referência:${controller.projects.context(project,{})}`;
    await clipboard.writeText(text);return {copied:true};
  });
  handle('sandubah:copy-request',async payload=>{
    const entry=controller.entry(payload.id);
    const value=payload.arguments??{};
    const text=entry.kind==='mcp'?JSON.stringify({tool:entry.name,arguments:value},null,2):JSON.stringify({entry:join(repositoryRoot,'bin/cli.js'),argv:entry.commandPath||[],note:'Execute somente após revisão dos argumentos e efeitos.'},null,2);
    if(Buffer.byteLength(text)>65536)throw new Error('Pedido grande demais.');
    await clipboard.writeText(text);
    return {copied:true};
  });
  handle('sandubah:open-codex',async()=>{
    if (!existsSync(runtime.codexExecutable)) throw new Error('A CLI do Codex foi movida; abra a pasta manualmente.');
    const child=spawn(runtime.codexExecutable,['app',repositoryRoot],{cwd:repositoryRoot,env:{...process.env,NODE_OPTIONS:''},shell:false,windowsHide:true,stdio:'ignore'});
    await new Promise((resolvePromise,rejectPromise)=>{child.once('error',rejectPromise);child.once('exit',code=>code===0?resolvePromise():rejectPromise(new Error(`O Codex retornou ${code}.`)));});
    return {opened:true};
  });
  mainWindow.on('close',event=>{
    const awaitingReview=Boolean(planningReviews.pending);planningReviews.cancel();
    if(!quitting&&controller.active&&!awaitingReview){
      const choice=dialog.showMessageBoxSync(mainWindow,{type:'warning',message:'Existe uma operação em execução.',detail:'Fechar encerra somente os processos iniciados por esta janela. O resultado de uma ação interrompida pode ser desconhecido.',buttons:['Continuar trabalhando','Fechar e interromper'],defaultId:0,cancelId:0});
      if(choice===0){event.preventDefault();return;}
    }
    quitting=true;
    controller.close();
  });
  mainWindow.loadURL(indexUrl);
}

const ownsInstance=hidden||app.requestSingleInstanceLock();
if(!ownsInstance)app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(()=>{
    session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    session.defaultSession.on('will-download',event=>event.preventDefault());
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
    createWindow();
  }).catch(error=>{if(hidden){process.stderr.write(String(error.stack)+'\n');app.exit(1);}else{dialog.showErrorBox('SanduBAH não conseguiu iniciar',String(error.message));app.quit();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{quitting=true;planningReviews.cancel();controller?.close();});
}
