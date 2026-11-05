'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {ClientVideos,clientVideoAction}=require('../../src/sandubah-desktop/client-videos.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {secretPattern}=require('../../src/sandubah-desktop/knowledge.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'client-videos-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(join(directory,'repo-')),catalog={entries:[]};const projects=new ProjectWorkspace({repositoryRoot:root,catalog,guard:path=>assertLocalWritePath(root,path),readLocal:path=>join(root,path)});
  const options={directory:join(root,'clients-videos'),projects,catalog:()=>catalog,guard:path=>projects.guard(path),write:(path,content)=>projects.write(path,content),secretPattern};
  const library=new ClientVideos(options),project=projects.create({name:'Projeto fictício',goal:'Vídeo fictício'});project.executorDefaults={engine:'codex',model:'modelo-teste',effort:'low'};projects.save(project);
  return {library,options,projects,project,catalog,root};
}
const videoInput={title:'Vídeo fictício',brief:'Apresentar uma oficina fictícia em trinta segundos.',format:'9:16',stage:'idea',skills:['video:brief','video:storyboard']};

test('clientes, vídeos e vínculos persistem; vínculo de vídeo não muda o do projeto',()=>{
  const {library,options,project,projects}=fixture(),client=library.saveClient({name:'Cliente Aurora',contact:'contato fictício'}),other=library.saveClient({name:'Cliente Brisa'});
  const before=readFileSync(join(projects.location(project.id),'harness.json'),'utf8');
  library.linkProject(project.id,client.id,null);const video=library.saveVideo({...videoInput,projectId:project.id,clientId:other.id});
  const reopened=new ClientVideos(options).snapshot();assert.equal(reopened.clients.length,2);assert.equal(reopened.videos[0].clientId,other.id);assert.equal(reopened.links[0].clientId,client.id);
  assert.equal(readFileSync(join(projects.location(project.id),'harness.json'),'utf8'),before);
  library.saveVideo({...video,clientId:null,projectId:null});library.linkProject(project.id,null,client.id);assert.equal(library.snapshot().links.length,0);assert.equal(library.snapshot().videos[0].clientId,null);
});

test('validação, referências e versões impedem perda de dados e gravação de credenciais',()=>{
  const {library,project}=fixture(),client=library.saveClient({name:'Aurora'}),video=library.saveVideo(videoInput);
  const before=readFileSync(library.filename,'utf8');
  for(const input of [{name:''},{name:'X',contact:'password: abcdefghijklmnop'},{name:'X',notes:'a'.repeat(1501)}])assert.throws(()=>library.saveClient(input));
  assert.throws(()=>library.saveClient({...client,revision:0,name:'Mudança'}),/mudou/);
  for(const changes of [{clientId:'inexistente'},{projectId:'inexistente'},{format:'4:3'},{stage:'fake'},{skills:['mcp:execute']},{skills:['video:brief','video:brief']}])assert.throws(()=>library.saveVideo({...video,...changes}));
  assert.equal(readFileSync(library.filename,'utf8'),before);
  library.linkProject(project.id,client.id,null);assert.throws(()=>library.linkProject(project.id,null,null),/mudou/);
  const updated=library.saveClient({...client,name:'Aurora atualizada'});assert.equal(updated.revision,2);assert.throws(()=>library.saveClient(client),/mudou/);
});

test('exclusão exige confirmação, não remove projetos e bloqueia cliente vinculado',async()=>{
  const {library,project,projects}=fixture(),client=library.saveClient({name:'Aurora'});library.linkProject(project.id,client.id,null);
  const payload={action:'delete',collection:'clients',id:client.id,revision:client.revision};let confirmations=0;
  assert.deepEqual(await clientVideoAction(library,payload,{confirm:async()=>{confirmations++;return false;}}),{cancelled:true});assert.equal(library.snapshot().clients.length,1);
  await assert.rejects(clientVideoAction(library,payload,{confirm:async()=>true}),/Desvincule/);
  library.linkProject(project.id,null,client.id);const video=library.saveVideo({...videoInput,clientId:client.id});await assert.rejects(clientVideoAction(library,payload,{confirm:async()=>true}),/Desvincule/);
  library.saveVideo({...video,clientId:null});assert.deepEqual(await clientVideoAction(library,payload,{confirm:async()=>true}),{removed:true});assert.equal(projects.get(project.id).id,project.id);assert.equal(confirmations,1);
});

test('worker ocupado bloqueia gravações e corrida durante confirmação',async()=>{
  const {library}=fixture(),client=library.saveClient({name:'Aurora'});let busy=true;
  await assert.rejects(clientVideoAction(library,{action:'client-save',input:{name:'Outro'}},{isBusy:()=>busy}),/worker/);
  assert.equal((await clientVideoAction(library,{action:'snapshot'},{isBusy:()=>busy})).clients.length,1);
  busy=false;await assert.rejects(clientVideoAction(library,{action:'delete',collection:'clients',id:client.id,revision:client.revision},{isBusy:()=>busy,confirm:async()=>{busy=true;return true;}}),/worker/);assert.equal(library.snapshot().clients.length,1);
});

test('skills viram missão pendente idempotente, sem dados privados nem alteração de executor',()=>{
  const {library,projects,project}=fixture(),client=library.saveClient({name:'CLIENTE_PRIVADO',contact:'CONTATO_PRIVADO',notes:'NOTAS_PRIVADAS'});
  library.linkProject(project.id,client.id,null);const video=library.saveVideo({...videoInput,projectId:project.id,clientId:client.id});
  const result=library.prepare(video.id,video.revision),again=library.prepare(video.id,video.revision),saved=projects.get(project.id),mission=saved.missions[0];
  assert.equal(result.missionId,again.missionId);assert.equal(again.reused,true);assert.equal(saved.missions.length,1);assert.equal(mission.status,'pending');assert.equal(mission.engine,'codex');assert.equal(mission.model,'modelo-teste');assert.equal(mission.effort,'low');
  assert.deepEqual(saved.executorDefaults,project.executorDefaults);assert.match(mission.instructions,/ROTEIRO\.md/);assert.match(mission.instructions,/STORYBOARD\.md/);assert.doesNotMatch(JSON.stringify(saved),/CLIENTE_PRIVADO|CONTATO_PRIVADO|NOTAS_PRIVADAS/);assert.equal(mission.video.sources.length,2);assert.equal(library.snapshot().videos[0].stage,'idea');
});

test('skills ausentes ou grandes e briefing vazio bloqueiam sem cortes nem missão parcial',()=>{
  const {library,projects,project,catalog,root}=fixture();
  const noBrief=library.saveVideo({...videoInput,brief:'',projectId:project.id});assert.throws(()=>library.prepare(noBrief.id,noBrief.revision),/briefing/);
  const missingProject=library.saveVideo(videoInput);assert.throws(()=>library.prepare(missingProject.id,missingProject.revision),/Vincule/);
  writeFileSync(join(root,'VIDEO.md'),'# Video\n'+'texto '.repeat(3000));catalog.entries.push({id:'skill:video-test',kind:'skill',title:'Video test',sourcePath:'VIDEO.md'});
  const large=library.saveVideo({...videoInput,projectId:project.id,skills:['skill:video-test']});assert.throws(()=>library.prepare(large.id,large.revision),/Nada foi cortado/);assert.equal(projects.get(project.id).missions.length,0);assert.equal(projects.get(project.id).agents.length,0);
  catalog.entries=[];assert.throws(()=>library.prepare(large.id,large.revision),/Skill removida/);assert.equal(projects.get(project.id).missions.length,0);
});

test('arquivo inválido não é substituído silenciosamente por cadastro vazio',()=>{
  const {library}=fixture();library.saveClient({name:'Aurora'});writeFileSync(library.filename,'{quebrado');assert.throws(()=>library.saveClient({name:'Outro'}));assert.equal(readFileSync(library.filename,'utf8'),'{quebrado');
});

test('abas, vínculo no projeto e IPC estão conectados ao fluxo principal',()=>{
  const source=path=>readFileSync(resolve(__dirname,'../../src/sandubah-desktop',path),'utf8');
  for(const view of ['clients','videos']){assert.match(source('index.html'),new RegExp(`data-view="${view}"`));assert.match(source('index.html'),new RegExp(`id="${view}-view"`));}
  assert.match(source('preload.cjs'),/clientVideos:payload=>invoke\('sandubah:client-videos'/);assert.match(source('main.cjs'),/handle\('sandubah:client-videos',payload=>clientVideoAction/);
  assert.match(source('app.mjs'),/clientVideos\?\.show\(view\)/);assert.match(source('world.mjs'),/createProjectClientLink\(\{api,projectId/);
  assert.match(source('index.html'),/id="planner-client-link"/);assert.match(source('app.mjs'),/slot\.append\(createProjectClientLink/);
});
