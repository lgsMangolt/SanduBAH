'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync}=require('node:fs');const {join,resolve,dirname,sep}=require('node:path');const {EventEmitter}=require('node:events');
const {MediaLibrary}=require('../../src/sandubah-desktop/media.cjs');const {ProjectPreview}=require('../../src/sandubah-desktop/project-preview.cjs');const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');const {DesktopController,assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');const {CompletionNotifier}=require('../../src/sandubah-desktop/completion.cjs');const {identity,APP_ID}=require('../../src/sandubah-desktop/desktop-identity.cjs');
const {PreviewData}=require('../../src/sandubah-desktop/preview-data.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'workbench-'));test.after(()=>{assert.ok(directory.startsWith(parent+sep));rmSync(directory,{recursive:true,force:true});});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=','base64');
function fixture(){const root=mkdtempSync(join(directory,'project-')),guard=path=>assertLocalWritePath(root,path),write=(path,bytes)=>{guard(path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);};const media=new MediaLibrary({root,guard,write}),projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard,readLocal:path=>join(root,path)});return {root,guard,write,media,projects};}
test('fotos e vídeos ficam em escopos separados e quadros não são omitidos silenciosamente',()=>{
  const {root,media}=fixture(),photo=join(root,'foto.png');writeFileSync(photo,png);const image=media.importFile('planner:new',photo);assert.equal(media.list('study:general').length,0);assert.equal(media.images('planner:new').length,1);assert.equal(media.images('planner:new')[0].mime,'image/png');
  assert.throws(()=>media.list('../credentials'));assert.throws(()=>media.path('../../.codex/config.toml'));
  const video=join(root,'video.webm');writeFileSync(video,Buffer.from([26,69,223,163,0,0,0,0]));const clip=media.importFile('study:general',video);assert.throws(()=>media.images('study:general'),/quadros/);
  const jpg='data:image/jpeg;base64,'+Buffer.from([255,216,255,0,0,0]).toString('base64');media.frames(clip.id,[{at:.2,data:jpg}],1);assert.equal(media.images('study:general').length,1);assert.match(media.list('study:general')[0].summary,/áudio não analisado/);
  media.copyScope('planner:new','project:fixture');assert.equal(media.list('project:fixture')[0].id,image.id);media.remove('planner:new',image.id);assert.equal(media.list('project:fixture').length,1);
  const restored=new MediaLibrary({root,guard:path=>assertLocalWritePath(root,path),write:()=>{}});assert.equal(restored.list('project:fixture').length,1);
});
test('prévia lê arquivos do projeto e rejeita caminhos externos, ocultos e segredos',()=>{
  const {projects,write}=fixture(),project=projects.create({name:'Protótipo',goal:'Testar prévia'}),workspace=projects.workspace(project.id);write(join(workspace,'index.html'),'<h1>Projeto pronto</h1>');write(join(workspace,'app.js'),'document.title="Teste";');write(join(workspace,'.env'),'SECRET=fixture');
  const preview=new ProjectPreview(projects),snapshot=preview.snapshot(project.id);assert.equal(snapshot.entry,'index.html');assert.match(snapshot.url,/^sandubah-preview:/);assert.equal(snapshot.files.some(file=>file.path==='.env'),false);assert.match(preview.text(project.id,'app.js').content,/document.title/);
  for(const path of ['../harness.json','.env','/outside','node_modules/key.js'])assert.throws(()=>preview.read(project.id,path));
  write(join(workspace,'domain.cjs'),'globalThis.Domain = {nome:"Protótipo"};');assert.equal(preview.read(project.id,'domain.cjs').type,'text/javascript; charset=utf-8');assert.match(preview.text(project.id,'domain.cjs').content,/Protótipo/);
});
test('construir pelo chat prepara e executa código no mesmo projeto após confirmação',async()=>{
  const {root,media}=fixture();const mcp=new EventEmitter();mcp.ready=false;mcp.close=()=>{};let allow=false,runs=0;
  const controller=new DesktopController({repositoryRoot:root,runtime:{nodeExecutable:process.execPath,codexExecutable:process.execPath},catalog:require('../../build/sandubah/gui/catalog.json'),validator:()=>true,mcpClient:mcp,confirm:async()=>allow});controller.media=media;controller.createProjectClient=()=>({close(){}});controller.callTool=async()=>({isError:false});
  controller.createCodexWorker=()=>({async run(input){runs++;assert.match(input.prompt,/Implemente de verdade/);assert.match(input.prompt,/PLANNING.md/);writeFileSync(join(input.workspace,'index.html'),'<h1>Construído pelo executor</h1>');return {success:true,interrupted:false,configPreserved:true,finalMessage:JSON.stringify({status:'completed',summary:'Interface criada',files:['index.html'],tests:['Teste fixture aprovado']})};}});
  const first=await controller.buildProject({prompt:'Criar uma interface local',history:[{role:'user',content:'Pedidos e entregas'}]});assert.equal(first.cancelled,true);assert.equal(runs,0);const id=first.projectId;
  allow=true;const result=await controller.buildProject({projectId:id,prompt:'Criar uma interface local'});assert.equal(result.success,true,JSON.stringify(controller.projects.get(id).missions));assert.equal(runs,1);assert.equal(controller.projects.get(id).missions.length,1);assert.equal(new ProjectPreview(controller.projects).snapshot(id).entry,'index.html');assert.equal(existsSync(join(controller.projects.workspace(id),'PLANNING.md')),true);controller.close();
});

test('dados da prévia são opt-in, atômicos, limitados e isolados por projeto',()=>{
  const {projects,write}=fixture(),first=projects.create({name:'Primeiro',goal:'Simulação'}),second=projects.create({name:'Segundo',goal:'Simulação'}),storage=new PreviewData(projects);
  assert.throws(()=>storage.load(first.id),/habilitou/);
  for(const project of [first,second])write(join(projects.workspace(project.id),'preview-storage.json'),JSON.stringify({version:1,persistence:'local-demo'}));
  assert.deepEqual(storage.load(first.id),{revision:0,value:null});
  assert.deepEqual(storage.save(first.id,{revision:0,value:{orders:[],settlements:['fixture']}}),{revision:1});
  assert.deepEqual(new PreviewData(projects).load(first.id),{revision:1,value:{orders:[],settlements:['fixture']}});
  assert.deepEqual(storage.load(second.id),{revision:0,value:null});
  assert.throws(()=>storage.save(first.id,{revision:0,value:{orders:['stale']}}),/outra janela/);
  for(const input of [{revision:-1,value:{}},{revision:1,value:[]},{revision:1,value:{text:'x'.repeat(256*1024)}}])assert.throws(()=>storage.save(first.id,input));
  assert.deepEqual(storage.load(first.id).value,{orders:[],settlements:['fixture']});
  assert.equal(new ProjectPreview(projects).snapshot(first.id).files.some(file=>file.path==='preview-data.json'),false);
  assert.throws(()=>storage.load('../outside'));
  const before=projects.write;projects.write=()=>{throw new Error('Disco indisponível');};assert.throws(()=>storage.save(first.id,{revision:1,value:{new:true}}),/Disco/);projects.write=before;
  assert.equal(storage.load(first.id).revision,1);
});
test('notificações têm aviso interno e aviso do Windows sem iniciar tarefas ao clicar',()=>{
  const sent=[],notifications=[],actions=[];class Notification{static isSupported(){return true;}constructor(input){this.input=input;notifications.push(this);}on(name,callback){this[name]=callback;}show(){this.shown=true;}}
  const notifier=new CompletionNotifier({Notification,window:{isMinimized:()=>true,restore:()=>actions.push('restore'),show:()=>actions.push('show'),focus:()=>actions.push('focus')},send:item=>sent.push(item)});
  notifier.done({projectId:'fixture'});assert.equal(notifications[0].shown,true);notifications[0].click();assert.equal(sent.at(-1).open,true);assert.deepEqual(actions,['restore','show','focus']);
  const details=identity(directory);assert.equal(details.appId,APP_ID);assert.equal(details.relaunchDisplayName,'SanduBAH');assert.match(details.relaunchCommand,/SanduBAH\.exe/);assert.doesNotMatch(details.relaunchCommand,/electron\.exe/);
});
