'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {DesktopController,createValidator}=require('../../src/sandubah-desktop/backend.cjs');
const Ajv=require('../../build/sandubah/gui/vendor/node_modules/ajv');
const catalog=require('../../build/sandubah/gui/catalog.json');
const runtime=require('../../build/sandubah/gui/runtime.json');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'history-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
function fixture(confirm=async()=>true){
  const repositoryRoot=mkdtempSync(join(directory,'project-'));
  writeFileSync(join(repositoryRoot,'AGENTS.md'),'# Agentes');writeFileSync(join(repositoryRoot,'README.md'),'# Guia');
  const mcp=new EventEmitter();mcp.ready=true;mcp.toolNames=new Set();mcp.connect=async()=>{};mcp.close=()=>{};mcp.request=async()=>({content:[]});
  const app=new DesktopController({repositoryRoot,runtime,catalog,confirm,validator:createValidator(Ajv),mcpClient:mcp});
  const project=app.projects.create({name:'Loja Aurora',goal:'Vitrine de cadernos artesanais'});
  const workspace=app.projects.workspace(project.id);mkdirSync(workspace,{recursive:true});
  return {app,project,workspace,id:project.id};
}
const save=(app,id,input)=>app.historyAction({action:'save',id,input});

test('salvar versões registra mensagem no padrão, nota e linhas adicionadas/removidas',async()=>{
  const {app,id,workspace}=fixture();
  writeFileSync(join(workspace,'index.html'),'<h1>Aurora</h1>\n');
  assert.deepEqual((await app.historyAction({action:'status',id})).changes,[{path:'index.html',state:'new'}]);
  let result=await save(app,id,{type:'feat',summary:'cria a vitrine inicial',note:'Primeira tela para a feira.'});
  assert.equal(result.saved.number,1);assert.equal(result.saved.subject,'feat: cria a vitrine inicial');assert.equal(result.saved.note,'Primeira tela para a feira.');assert.equal(result.changes.length,0);
  writeFileSync(join(workspace,'index.html'),'<h1>Aurora</h1>\n<p>Cadernos</p>\n');writeFileSync(join(workspace,'style.css'),'body{margin:0}\n');
  result=await save(app,id,{type:'style',summary:'adiciona estilo da vitrine'});
  assert.equal(result.saved.number,2);assert.equal(result.saved.added,2);assert.equal(result.saved.removed,0);assert.deepEqual(result.saved.files.map(file=>file.path).sort(),['index.html','style.css']);
  assert.deepEqual(result.versions.map(version=>version.number),[2,1]);
  const shown=await app.historyAction({action:'show',id,hash:result.saved.hash});assert.match(shown.diff,/\+<p>Cadernos<\/p>/);assert.equal(shown.truncated,false);
});

test('o repositório fica fora do workspace e nada é salvo sem mudança, sem resumo ou com credencial',async()=>{
  const {app,id,workspace}=fixture();
  await assert.rejects(save(app,id,{type:'feat',summary:'vazio'}),/Nada mudou/);
  writeFileSync(join(workspace,'app.js'),'console.log(1)\n');
  await assert.rejects(save(app,id,{type:'outro',summary:'tipo inválido'}),/tipo/);
  await assert.rejects(save(app,id,{type:'feat',summary:'x'}),/3 a 72/);await assert.rejects(save(app,id,{type:'feat',summary:'linha\nquebrada'}),/3 a 72/);
  writeFileSync(join(workspace,'config.js'),'const api_key="abcdefghijklmnop1234"\n');
  await assert.rejects(save(app,id,{type:'feat',summary:'adiciona config'}),/credencial em config\.js/);
  assert.equal((await app.historyAction({action:'status',id})).versions.length,0);
  assert.ok(existsSync(join(app.projects.location(id),'history.git','HEAD')));assert.equal(existsSync(join(workspace,'.git')),false);
  rmSync(join(workspace,'config.js'));mkdirSync(join(workspace,'.git'));
  await assert.rejects(save(app,id,{type:'feat',summary:'cria app'}),/\.git próprio/);
});

test('voltar a uma versão exige confirmação, árvore limpa e pode ser registrada como nova versão',async()=>{
  let answer=false;const {app,id,workspace}=fixture(async request=>{assert.equal(request.entry.kind,'version-restore');assert.equal(request.arguments.version,1);return answer;});
  writeFileSync(join(workspace,'index.html'),'v1\n');const first=(await save(app,id,{type:'feat',summary:'primeira versão'})).saved;
  writeFileSync(join(workspace,'index.html'),'v2\n');writeFileSync(join(workspace,'extra.js'),'x\n');await save(app,id,{type:'feat',summary:'segunda versão'});
  assert.equal((await app.historyAction({action:'restore',id,hash:first.hash})).cancelled,true);assert.equal(readFileSync(join(workspace,'index.html'),'utf8'),'v2\n');
  writeFileSync(join(workspace,'index.html'),'rascunho sem versão\n');answer=true;
  await assert.rejects(app.historyAction({action:'restore',id,hash:first.hash}),/mudanças sem versão/);assert.equal(readFileSync(join(workspace,'index.html'),'utf8'),'rascunho sem versão\n');
  writeFileSync(join(workspace,'index.html'),'v2\n');
  const restored=await app.historyAction({action:'restore',id,hash:first.hash});
  assert.equal(readFileSync(join(workspace,'index.html'),'utf8'),'v1\n');assert.equal(existsSync(join(workspace,'extra.js')),false);
  assert.deepEqual(restored.changes.map(change=>change.state).sort(),['deleted','modified']);
  const back=(await save(app,id,{type:'chore',summary:'volta para a versão 1'})).saved;assert.equal(back.number,3);
  await assert.rejects(app.historyAction({action:'restore',id,hash:'0'.repeat(40)}),/fora do histórico/);
  await assert.rejects(app.historyAction({action:'show',id,hash:'HEAD'}),/inválida/);
});

test('o prompt refinado entra no workspace ao salvar e o histórico respeita um worker por vez',async()=>{
  const {app,id,workspace}=fixture();
  app.projects.write(join(app.projects.location(id),'PROMPT.md'),'# Prompt refinado — Loja Aurora\n');
  const result=await save(app,id,{type:'docs',summary:'registra o prompt refinado'});
  assert.equal(result.promptSynced,true);assert.equal(readFileSync(join(workspace,'PROMPT.md'),'utf8'),'# Prompt refinado — Loja Aurora\n');assert.deepEqual(result.saved.files.map(file=>file.path),['PROMPT.md']);
  app.active={label:'outra operação'};
  await assert.rejects(save(app,id,{type:'docs',summary:'durante o worker'}),/Aguarde/);
  assert.equal((await app.historyAction({action:'status',id})).versions.length,1);app.active=null;
});

const {spawnSync}=require('node:child_process');
const {ProjectHistory,githubRemote,githubVisibility}=require('../../src/sandubah-desktop/project-history.cjs');
const {secretPattern}=require('../../src/sandubah-desktop/knowledge.cjs');
const git=(cwd,...args)=>spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});
// Remoto fictício: um repositório bare local no lugar do GitHub. Só o teste libera o transporte file.
function withLocalRemote(app,visibility='private-or-missing'){
  const bare=mkdtempSync(join(directory,'remote-'));assert.equal(git(bare,'init','--bare','--quiet','--initial-branch=main').status,0);
  app.versionHistory=new ProjectHistory({projects:app.projects,secretPattern,validateRemote:url=>({url,owner:'teste',repo:'loja-aurora',web:'github.com/teste/loja-aurora'}),protocols:['file'],visibility:async()=>visibility});
  return bare;
}
const remoteHead=bare=>git(bare,'rev-parse','--verify','--quiet','refs/heads/main').stdout.trim();

test('só endereços do GitHub são aceitos e a visibilidade vem da consulta pública',async()=>{
  assert.equal(githubRemote('https://github.com/lgsMangolt/SanduBAH').url,'https://github.com/lgsMangolt/SanduBAH.git');
  assert.equal(githubRemote('git@github.com:lgsMangolt/SanduBAH.git').web,'https://github.com/lgsMangolt/SanduBAH');
  for(const url of ['ext::sh -c touch% x','file:///C:/repo','https://gitlab.com/a/b','https://evil.com/github.com/a/b','https://github.com/a/..','https://github.com/a/b?x=1',''])assert.throws(()=>githubRemote(url),/repositório do GitHub/);
  const fake=status=>async()=>({status});
  assert.equal(await githubVisibility({owner:'a',repo:'b'},fake(200)),'public');assert.equal(await githubVisibility({owner:'a',repo:'b'},fake(404)),'private-or-missing');
  assert.equal(await githubVisibility({owner:'a',repo:'b'},fake(500)),'unknown');assert.equal(await githubVisibility({owner:'a',repo:'b'},async()=>{throw new Error('offline');}),'unknown');
  const {app,id}=fixture();
  await assert.rejects(app.historyAction({action:'set-remote',id,url:'ext::sh -c x'}),/repositório do GitHub/);assert.equal((await app.historyAction({action:'status',id})).remote.url,null);
  await assert.rejects(app.historyAction({action:'push',id}),/Configure o repositório/);
});

test('enviar ao GitHub pede confirmação com repositório, visibilidade e versões, e só então envia',async()=>{
  let answer=false,request=null;const {app,id,workspace}=fixture(async value=>{request=value;return answer;});const bare=withLocalRemote(app,'public');
  writeFileSync(join(workspace,'index.html'),'<h1>Aurora</h1>\n');await save(app,id,{type:'feat',summary:'cria a vitrine inicial'});
  writeFileSync(join(workspace,'style.css'),'body{}\n');await save(app,id,{type:'style',summary:'adiciona estilo'});
  let status=await app.historyAction({action:'set-remote',id,url:bare});assert.equal(status.remote.pending.length,2);assert.equal(status.remote.pushed,false);
  assert.equal((await app.historyAction({action:'push',id})).cancelled,true);assert.equal(remoteHead(bare),'');
  assert.equal(request.entry.kind,'github-push');assert.equal(request.entry.visibility,'public');assert.match(request.arguments.visibilidade,/PÚBLICO/);
  assert.deepEqual(request.arguments.versoes,['style: adiciona estilo','feat: cria a vitrine inicial']);
  answer=true;const result=await app.historyAction({action:'push',id});
  assert.equal(result.sent,2);assert.equal(result.remote.pending.length,0);assert.equal(result.remote.pushed,true);assert.equal(remoteHead(bare),result.versions[0].hash);
  assert.equal(git(bare,'ls-tree','--name-only','main').stdout.split('\n').filter(Boolean).sort().join(','),'index.html,style.css');
  await assert.rejects(app.historyAction({action:'push',id}),/já foram enviadas/);
  writeFileSync(join(workspace,'index.html'),'<h1>Aurora 2</h1>\n');await save(app,id,{type:'fix',summary:'corrige o título'});
  status=await app.historyAction({action:'status',id});assert.deepEqual(status.remote.pending.map(item=>item.subject),['fix: corrige o título']);
  assert.equal((await app.historyAction({action:'push',id})).sent,1);assert.equal(remoteHead(bare),(await app.historyAction({action:'status',id})).versions[0].hash);
});

test('o envio nunca sobrescreve commits que já estão no GitHub',async()=>{
  const first=fixture();const bare=withLocalRemote(first.app);
  writeFileSync(join(first.workspace,'README.md'),'# Criado no site\n');await save(first.app,first.id,{type:'docs',summary:'readme criado no site'});
  await first.app.historyAction({action:'set-remote',id:first.id,url:bare});await first.app.historyAction({action:'push',id:first.id});const before=remoteHead(bare);
  const second=fixture();second.app.versionHistory=new ProjectHistory({projects:second.app.projects,secretPattern,validateRemote:url=>({url,owner:'teste',repo:'loja-aurora'}),protocols:['file'],visibility:async()=>'unknown'});
  writeFileSync(join(second.workspace,'index.html'),'<h1>Outro projeto</h1>\n');await save(second.app,second.id,{type:'feat',summary:'outro começo'});
  await second.app.historyAction({action:'set-remote',id:second.id,url:bare});
  await assert.rejects(second.app.historyAction({action:'push',id:second.id}),/Nada foi sobrescrito/);assert.equal(remoteHead(bare),before);
  const disconnected=await second.app.historyAction({action:'remove-remote',id:second.id});assert.equal(disconnected.remote.url,null);assert.equal(remoteHead(bare),before);
});

test('o envio padrão recusa transportes fora de https e ssh, mesmo com remoto gravado à mão',async()=>{
  const {app,id,workspace}=fixture();const bare=mkdtempSync(join(directory,'remote-'));git(bare,'init','--bare','--quiet','--initial-branch=main');
  writeFileSync(join(workspace,'index.html'),'x\n');await save(app,id,{type:'feat',summary:'primeira versão'});
  app.versionHistory.run(id,['remote','add','origin',bare]);
  await assert.rejects(app.versionHistory.push(id),/repositório do GitHub/);
  app.versionHistory.validateRemote=url=>({url});
  await assert.rejects(app.versionHistory.push(id),/transport|protocol|not allowed/i);assert.equal(remoteHead(bare),'');
});
