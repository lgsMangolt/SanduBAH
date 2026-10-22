'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync,realpathSync,linkSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const tools=require('../../src/sandubah-desktop/gaucho-tools.cjs');
const {DesktopController,createValidator}=require('../../src/sandubah-desktop/backend.cjs');
const {GauchoLibrary}=require('../../src/sandubah-desktop/gaucho.cjs');
const {gauchoToolsReview}=require('../../src/sandubah-desktop/planning-review.cjs');
const {secretPattern}=require('../../src/sandubah-desktop/knowledge.cjs');
const Ajv=require('../../build/sandubah/gui/vendor/node_modules/ajv');
const catalog=require('../../build/sandubah/gui/catalog.json');
const runtime=require('../../build/sandubah/gui/runtime.json');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'tools-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
const codex={provider:'codex',model:'gpt-teste'};
const report=summary=>JSON.stringify({status:'completed',summary,files:[],tests:['nenhum teste automatizado']});

function fixture(confirm=async()=>true){
  const repositoryRoot=mkdtempSync(join(directory,'project-'));writeFileSync(join(repositoryRoot,'AGENTS.md'),'# Agentes');writeFileSync(join(repositoryRoot,'README.md'),'# Guia');
  const mcp=new EventEmitter();mcp.ready=false;mcp.toolNames=new Set();mcp.connect=async()=>{};mcp.close=()=>{};mcp.request=async()=>({content:[]});
  const app=new DesktopController({repositoryRoot,runtime,catalog,confirm,validator:createValidator(Ajv),mcpClient:mcp});
  app.gauchos=new GauchoLibrary({directory:join(repositoryRoot,'gauchos'),guard:path=>app.projects.guard(path),write:(path,content)=>app.projects.write(path,content),secretPattern});
  app.cloud={status:()=>({providers:[{id:'codex',installed:true,models:[{id:'gpt-teste',effortLevels:[]}]},{id:'claude',installed:true,models:[{id:'claude-teste',effortLevels:[]}]}]})};
  app.readSource=id=>({title:`Skill ${id.slice(6)}`,content:'Sempre entregue uma tabela no final.'});
  const runs=[];app.createCodexWorker=()=>{const worker={timeoutMs:0,cancel(){},run:async request=>{runs.push({...request,timeoutMs:worker.timeoutMs});return worker.behavior(request);}};worker.behavior=app.behavior;return worker;};
  const {id}=app.gauchos.create({name:'Tchê Planilhas',selection:codex});
  const workspace=app.gauchos.workspaceDir(id);mkdirSync(workspace,{recursive:true});writeFileSync(join(workspace,'vendas.csv'),'item,qtd\ncaderno,40\n');
  return {app,library:app.gauchos,id,workspace,runs};
}
const task=(library,id,tools=true)=>library.createTask(id,{title:'Relatório de vendas',instructions:'Crie relatorio.md com o total de vendas.',tools}).taskList.at(-1).id;

test('permissões começam em só texto e são validadas',()=>{
  assert.deepEqual(tools.permissions({}),tools.DEFAULTS);
  for(const value of [{mode:'tudo'},{timeoutMinutes:0},{timeoutMinutes:16},{maxFiles:0},{maxFiles:201},{blockExecutables:'sim'},{skills:Array(6).fill('skill:x')},{skills:['agent:x']}])assert.throws(()=>tools.permissions(value));
  const {library,id}=fixture();assert.equal(library.get(id).permissions.mode,'none');
  assert.throws(()=>task(library,id),/Libere ferramentas/);
  const updated=library.setPermissions(id,{mode:'write',maxFiles:3,skills:['skill:tabelas']});assert.equal(updated.permissions.mode,'write');assert.equal(updated.permissions.timeoutMinutes,5);assert.deepEqual(updated.permissions.skills,['skill:tabelas']);
});

test('comparação e limites: executáveis, arquivos demais, leitura que escreveu e vínculo físico',()=>{
  const base=mkdtempSync(join(directory,'base-')),work=mkdtempSync(join(directory,'work-')),guard=()=>{};
  writeFileSync(join(base,'a.txt'),'a');writeFileSync(join(base,'b.txt'),'b');tools.copyTree(base,work,guard);
  writeFileSync(join(work,'a.txt'),'A');rmSync(join(work,'b.txt'));mkdirSync(join(work,'sub'));writeFileSync(join(work,'sub','run.bat'),'echo oi');mkdirSync(join(work,'node_modules'));writeFileSync(join(work,'node_modules','x.js'),'x');
  const changes=tools.diffTrees(base,work,guard);
  assert.deepEqual(changes.map(change=>`${change.state}:${change.path}`),['modified:a.txt','deleted:b.txt','new:sub/run.bat']);
  const rules=tools.permissions({mode:'write',maxFiles:2});const reasons=tools.violations(changes,rules);
  assert.equal(reasons.length,2);assert.match(reasons.join(' '),/3 arquivos mudaram; o limite deste gauchinho é 2/);assert.match(reasons.join(' '),/executável bloqueado: sub\/run\.bat/);
  assert.match(tools.violations(changes,tools.permissions({mode:'read',maxFiles:10,blockExecutables:false})).join(' '),/só de leitura/);
  assert.deepEqual(tools.violations(changes,tools.permissions({mode:'write',maxFiles:10,blockExecutables:false})),[]);
  tools.applyChanges(base,work,changes,guard);assert.equal(readFileSync(join(base,'a.txt'),'utf8'),'A');assert.equal(existsSync(join(base,'b.txt')),false);assert.ok(existsSync(join(base,'sub','run.bat')));
  linkSync(join(base,'a.txt'),join(base,'link.txt'));assert.throws(()=>tools.listFiles(base,guard),/vínculo físico/);
});

test('com ferramentas: confirmação, ensaio numa cópia, revisão e aplicação confirmada',async()=>{
  const answers=[];let request=null;const {app,library,id,workspace,runs}=fixture(async value=>{request=value;return answers.shift();});
  library.setPermissions(id,{mode:'write',timeoutMinutes:3,skills:['skill:tabelas']});const taskId=task(library,id);
  app.behavior=async ({workspace:work})=>{writeFileSync(join(work,'relatorio.md'),'# Total\n40 cadernos\n');return {success:true,finalMessage:report('Criei relatorio.md'),usage:{inputTokens:900,outputTokens:60}};};
  answers.push(false);assert.equal((await app.runGauchoTask({id,taskId})).cancelled,true);assert.equal(runs.length,0);assert.equal(readdirSync(join(library.folder(id),'runs')).length,0);
  assert.equal(request.entry.kind,'gaucho-tools');assert.equal(request.arguments.rules.mode,'write');assert.deepEqual(request.arguments.skills,['Skill tabelas']);
  answers.push(true);const result=await app.runGauchoTask({id,taskId});
  assert.equal(runs.length,1);assert.equal(runs[0].sandbox,'workspace-write');assert.equal(runs[0].timeoutMs,180000);assert.notEqual(runs[0].workspace,workspace);
  assert.match(runs[0].prompt,/Pasta de ensaio: .*work/);assert.match(runs[0].prompt,/mude no máximo 20 arquivo/);assert.match(runs[0].prompt,/Sempre entregue uma tabela no final\./);assert.match(runs[0].prompt,/não crie executáveis/);
  assert.equal(result.task.status,'review');assert.deepEqual(result.task.run.changes.map(change=>change.path),['relatorio.md']);assert.equal(existsSync(join(workspace,'relatorio.md')),false);
  await assert.rejects(app.runGauchoTask({id,taskId}),/esperando revisão/);
  answers.push(false);assert.equal((await app.applyGauchoRun({id,taskId})).cancelled,true);assert.equal(existsSync(join(workspace,'relatorio.md')),false);assert.equal(request.entry.kind,'gaucho-apply');assert.deepEqual(request.arguments.arquivos,['novo · relatorio.md']);
  answers.push(true);const applied=await app.applyGauchoRun({id,taskId});
  assert.equal(readFileSync(join(workspace,'relatorio.md'),'utf8'),'# Total\n40 cadernos\n');const done=applied.taskList.find(item=>item.id===taskId);assert.equal(done.status,'done');assert.equal(done.run.applied,true);
  assert.equal(existsSync(join(library.folder(id),'runs',done.run.id,'work')),false);
  assert.equal(library.evaluateTask(id,{taskId,score:5,feedback:'Perfeito.'}).lessons,1);
});

test('limites estourados descartam o ensaio sem tocar na pasta; ler só lê; tempo esgotado bloqueia',async()=>{
  const {app,library,id,workspace,runs}=fixture();
  library.setPermissions(id,{mode:'write',maxFiles:1});let taskId=task(library,id);
  app.behavior=async ({workspace:work})=>{writeFileSync(join(work,'instala.ps1'),'Write-Host oi');writeFileSync(join(work,'b.md'),'b');return {success:true,finalMessage:report('Fiz')};};
  let result=await app.runGauchoTask({id,taskId});assert.equal(result.task.status,'blocked');assert.match(result.task.error,/2 arquivos mudaram/);assert.match(result.task.error,/instala\.ps1/);
  assert.equal(existsSync(join(workspace,'instala.ps1')),false);assert.equal(existsSync(join(library.folder(id),'runs',result.task.run.id,'work')),false);
  library.setPermissions(id,{mode:'read'});taskId=task(library,id);
  app.behavior=async ({workspace:work})=>{writeFileSync(join(work,'escondido.md'),'x');return {success:true,finalMessage:report('Li e escrevi')};};
  result=await app.runGauchoTask({id,taskId});assert.equal(runs.at(-1).sandbox,'read-only');assert.equal(result.task.status,'blocked');assert.match(result.task.error,/só de leitura/);
  app.behavior=async ()=>({success:false,timedOut:true,finalMessage:''});taskId=task(library,id);
  result=await app.runGauchoTask({id,taskId});assert.equal(result.task.status,'blocked');assert.match(result.task.error,/tempo limite de 5 minuto/);
  app.behavior=async ()=>({success:true,finalMessage:report('Só analisei: 40 cadernos.')});taskId=task(library,id);
  result=await app.runGauchoTask({id,taskId});assert.equal(result.task.status,'done');assert.equal(result.task.result,'Só analisei: 40 cadernos.');assert.deepEqual(result.task.run.changes,[]);
});

test('mudança na pasta depois do ensaio impede aplicar; descartar mantém a pasta; Claude não usa ferramentas',async()=>{
  const {app,library,id,workspace}=fixture();library.setPermissions(id,{mode:'write'});let taskId=task(library,id);
  app.behavior=async ({workspace:work})=>{writeFileSync(join(work,'vendas.csv'),'item,qtd\ncaderno,41\n');return {success:true,finalMessage:report('Corrigi')};};
  await app.runGauchoTask({id,taskId});writeFileSync(join(workspace,'outro.md'),'mudança de fora');
  await assert.rejects(app.applyGauchoRun({id,taskId}),/mudou desde o ensaio/);assert.equal(readFileSync(join(workspace,'vendas.csv'),'utf8'),'item,qtd\ncaderno,40\n');
  const discarded=library.discardToolRun(id,taskId).taskList.find(item=>item.id===taskId);assert.equal(discarded.status,'done');assert.equal(discarded.run.applied,false);assert.equal(readFileSync(join(workspace,'vendas.csv'),'utf8'),'item,qtd\ncaderno,40\n');
  library.update(id,{selection:{provider:'claude',model:'claude-teste'}});taskId=task(library,id);
  await assert.rejects(app.runGauchoTask({id,taskId}),/só funcionam com o Codex/);
  const review=gauchoToolsReview({projectName:'Tchê',arguments:{selection:codex,prompt:'x',lessons:{},rules:{mode:'read',timeoutMinutes:5,maxFiles:20,blockExecutables:true},skills:['Skill A']},contextInfo:{included:[]}},'{}');
  assert.equal(review.title,'Deixar Tchê trabalhar com ferramentas?');assert.match(review.intro,/só ler a pasta dele, numa cópia de ensaio, pelo Codex com sandbox e sem rede/);assert.match(review.intro,/Skills liberadas: Skill A/);assert.equal(review.approvalLabel,'Começar o ensaio');
});
