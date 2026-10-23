'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,rmSync,realpathSync,existsSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {REFERENCE,REVIEW_TITLE,referenceDocument,reviewStatus}=require('../../src/sandubah-desktop/harness-refinement.cjs');

const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'refinement-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});

function fixture(defaults){
  const root=mkdtempSync(join(directory,'repo-'));
  const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:filename=>assertLocalWritePath(root,filename),readLocal:filename=>join(root,filename)});
  const library=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(filename,content)=>projects.write(filename,content),catalog:()=>({entries:[]}),roots:[]});projects.knowledgeLibrary=library;
  const project=projects.create({name:'Loja Aurora',goal:'Organizar pedidos com dados fictícios.'});
  if(defaults){project.executorDefaults=defaults;projects.save(project);}
  return {root,projects,library,project};
}

test('referência pequena, imutável e citável não carrega o acervo ou faz busca externa',()=>{
  const {library}=fixture(),document=library.document(REFERENCE.id);
  assert.equal(document.content,referenceDocument().content);assert.equal(document.editable,false);
  assert.ok(document.content.length<5000);assert.match(document.version,/^[a-f0-9]{64}$/);
  assert.match(document.content,new RegExp(REFERENCE.commit));assert.match(document.content,/sandbox desativado/);
  assert.equal(library.scanReport,null);assert.equal(library.entries().filter(item=>item.path===REFERENCE.id).length,1);
  assert.deepEqual(library.searchDocument(REFERENCE.id),document);
  assert.equal(library.sharedDocuments('').length,0);
});

test('prompt usa o Node do runtime mesmo quando o projeto está em outra raiz',()=>{
  const {root,projects,project}=fixture();
  const executable=join(root,'runtime-independente','node.exe');
  const isolated=new ProjectWorkspace({repositoryRoot:root,nodeExecutable:executable,catalog:{entries:[]},guard:projects.guard,readLocal:filename=>join(root,filename)});
  const prompt=isolated.codexPrompt(project,{title:'Teste',instructions:'Validar dados fictícios',files:[]},{name:'Executor',role:'developer'});
  assert.ok(prompt.includes('Node local: '+executable));
  assert.ok(!prompt.includes('Node local: '+join(root,'build/sandubah/gui/node/node.exe')));
});

test('revisão cria só missão pendente no mesmo projeto e preserva Markdown e preferências',()=>{
  const defaults={engine:'codex',model:'gpt-6-luna',effort:'medium'}, {root,projects,library,project}=fixture(defaults);
  const originals=Object.fromEntries(['HARNESS.md','MEMORY.md'].map(file=>[file,readFileSync(join(projects.location(project.id),file),'utf8')]));
  const result=library.prepareHarnessReview(project.id,{provider:'claude',model:'outro'}),saved=projects.get(project.id),mission=saved.missions[0];
  assert.equal(result.harnessId,project.id);assert.equal(result.missionId,mission.id);assert.equal(result.refinement.queued,true);
  assert.equal(saved.workerLimit,1);assert.equal(projects.list().length,1);assert.equal(saved.agents.length,1);
  assert.equal(mission.status,'pending');assert.equal(mission.engine,'codex');assert.equal(mission.model,'gpt-6-luna');assert.equal(mission.effort,'medium');
  assert.deepEqual(saved.executorDefaults,defaults);assert.deepEqual(mission.files,[]);
  for(const [file,content]of Object.entries(originals))assert.equal(readFileSync(join(projects.location(project.id),file),'utf8'),content);
  assert.match(result.report,/^HARNESS2-REVIEW-[a-f0-9-]{36}\.md$/);assert.ok(!existsSync(join(projects.workspace(project.id),result.report)));
  assert.equal(library.state.learning.length,0);assert.equal(library.track(project.id).steps.find(item=>item.id==='prototypes').status,'pending');
  assert.ok(!existsSync(join(root,'.env')));
});

test('cliques repetidos e estado desconhecido não duplicam nem reenviam revisão',()=>{
  const {projects,library,project}=fixture({engine:'codex',model:'gpt-6-luna'});
  const first=library.prepareHarnessReview(project.id);
  assert.equal(library.prepareHarnessReview(project.id).reused,true);
  let saved=projects.get(project.id);saved.missions[0].status='unknown';projects.save(saved);
  const next=library.prepareHarnessReview(project.id);
  assert.equal(next.missionId,first.missionId);assert.equal(next.reused,true);assert.equal(projects.get(project.id).missions.length,1);
  saved=projects.get(project.id);saved.missions[0].status='done';projects.save(saved);
  const again=library.prepareHarnessReview(project.id);assert.notEqual(again.report,first.report);assert.equal(projects.get(project.id).agents.length,1);
});

test('estado prefere revisão ainda pendente em vez de outra revisão concluída',()=>{
  const status=reviewStatus({missions:[{id:'pending',title:REVIEW_TITLE,status:'pending'},{id:'done',title:REVIEW_TITLE,status:'done'}]});
  assert.equal(status.mission.id,'pending');assert.equal(status.queued,true);
});

test('Claude e IA local mantêm executor e modelo; selecionar não executa nem treina',()=>{
  for(const defaults of [{engine:'claude',model:'claude-haiku-5-5',effort:'low'},{engine:'local',model:'qwen-2b'}]){
    const {projects,library,project}=fixture(defaults);library.prepareHarnessReview(project.id);
    const saved=projects.get(project.id);assert.deepEqual(saved.executorDefaults,defaults);assert.equal(saved.missions[0].engine,defaults.engine);assert.equal(saved.missions[0].status,'pending');
  }
});

test('sem preferência usa escolha atual explicitamente, sem fallback silencioso',()=>{
  const {projects,library,project}=fixture();
  assert.throws(()=>library.prepareHarnessReview(project.id),/Escolha/);assert.equal(projects.get(project.id).agents.length,0);
  library.prepareHarnessReview(project.id,{provider:'codex',model:'gpt-6-luna',effort:'low'});
  assert.equal(projects.get(project.id).missions[0].model,'gpt-6-luna');
});

test('limites e configuração inválida recusam sem acrescentar papéis ou missões',()=>{
  for(const defaults of [{engine:'mcp'},{engine:'claude'},{engine:'codex',model:'modelo/inválido'},{engine:'local',model:'qwen',effort:'high'}]){
    const {projects,library,project}=fixture(defaults);const before=JSON.stringify(projects.get(project.id));
    assert.throws(()=>library.prepareHarnessReview(project.id));assert.equal(JSON.stringify(projects.get(project.id)),before);
  }
  const {projects,library,project}=fixture({engine:'codex'});project.missions=Array.from({length:60},()=>({title:'Outra',status:'done'}));projects.save(project);
  assert.throws(()=>library.prepareHarnessReview(project.id),/Limite/);assert.equal(projects.get(project.id).agents.length,0);
});

test('instruções delimitam ensaio futuro, evidências e confirmações, sem falsa métrica',()=>{
  const {projects,library,project}=fixture({engine:'codex'});library.prepareHarnessReview(project.id);
  const instructions=projects.get(project.id).missions[0].instructions;
  for(const pattern of [/BASE ATUAL/,/PROPOR/,/PLANO DE ENSAIO/,/COMPOR/,/APRENDIZADO PROPOSTO/,/comparação pendente/,/Não execute testes/,/não equivale à execução do framework/,/Não invente tokens/,/confirmação humana/,/Corel/,/impressão/])assert.match(instructions,pattern);
  assert.ok(instructions.length<16000);
});

test('botão prepara a revisão pelo IPC existente sem executar a fila',async()=>{
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};this.isConnected=true;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(name,listener){this.events[name]=listener;}
    get childElementCount(){return this.children.length;}
  }
  const originalDocument=global.document,originalStorage=global.localStorage;
  global.document={createElement:tag=>new Element(tag)};global.localStorage={getItem:()=>null,setItem:()=>{}};
  try{
    const {createProjectTrack}=await import('../../src/sandubah-desktop/project-track.mjs');
    const {library,project}=fixture({engine:'codex',model:'gpt-6-luna'}),calls=[];
    let changed=0;
    const api={knowledge:async request=>{calls.push(request);return request.action==='track'?library.track(request.id):library.prepareHarnessReview(request.id);}};
    const section=createProjectTrack({api,projectId:project.id,run:action=>()=>action(),notify:()=>{},onProjectChanged:async()=>{changed++;},openPrompt:()=>{}});
    await new Promise(resolvePromise=>setImmediate(resolvePromise));
    const flatten=element=>[element,...element.children.flatMap(flatten)];
    const prepare=flatten(section).find(element=>element.textContent==='Preparar revisão X-Tudo Harness²');
    assert.ok(prepare);assert.equal(prepare.disabled,false);await prepare.events.click();
    assert.deepEqual(calls.map(request=>request.action),['track','prepare-harness-review']);assert.equal(changed,1);
    assert.equal(library.track(project.id).refinement.queued,true);
    const queued=createProjectTrack({api,projectId:project.id,run:action=>()=>action(),notify:()=>{},onProjectChanged:async()=>{},openPrompt:()=>{}});
    await new Promise(resolvePromise=>setImmediate(resolvePromise));
    assert.equal(flatten(queued).find(element=>element.textContent==='Revisão já está na fila').disabled,true);
  }finally{if(originalDocument===undefined)delete global.document;else global.document=originalDocument;if(originalStorage===undefined)delete global.localStorage;else global.localStorage=originalStorage;}
});
