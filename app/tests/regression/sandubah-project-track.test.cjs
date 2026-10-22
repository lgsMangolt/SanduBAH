'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {buildTrack,refinedPrompt}=require('../../src/sandubah-desktop/project-track.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'track-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(join(directory,'repo-')),notes=mkdtempSync(join(directory,'notes-'));
  const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:path=>assertLocalWritePath(root,path),readLocal:path=>join(root,path)});
  const library=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(path,content)=>projects.write(path,content),catalog:()=>({entries:[]}),roots:[{name:'Notas',path:notes}]});projects.knowledgeLibrary=library;
  const project=projects.create({name:'Loja Aurora',goal:'Vitrine simples para vender cadernos artesanais.'});
  return {projects,library,project};
}
const status=track=>Object.fromEntries(track.steps.map(step=>[step.id,step.status]));

test('a trilha começa no prompt enxuto e não marca passos sem evidência',()=>{
  const {library,project}=fixture();
  assert.deepEqual(status(library.track(project.id)),{prompt:'done',grill:'pending',refined:'pending',draft:'pending',prototypes:'pending'});
  assert.equal(library.track(project.id).current,'grill');assert.equal(library.track(project.id).prompt,null);
});

test('o prompt refinado usa o briefing, marca pendências e entra no contexto dos agentes',()=>{
  const {projects,library,project}=fixture();
  library.saveBrief('harness:'+project.id,{audience:'Clientes da feira de artesanato',success:'Pedido de teste chega por e-mail'});
  assert.equal(status(library.track(project.id)).grill,'active');assert.equal(library.track(project.id).answered,2);
  const result=library.refinePrompt({id:project.id});
  assert.equal(status(result).refined,'done');assert.equal(result.backup,null);
  const prompt=result.prompt.content;
  assert.match(prompt,/^# Prompt refinado — Loja Aurora/);assert.match(prompt,/Vitrine simples para vender cadernos/);assert.match(prompt,/Clientes da feira de artesanato/);
  assert.match(prompt,/## Limites\nPendente — não presumir uma resposta\./);assert.match(prompt,/- Limites\n/);assert.match(prompt,/não autorização para executar/);
  const saved=projects.get(project.id);
  assert.match(projects.plannerContext(saved,36000),/## harness\/PROMPT\.md\n# Prompt refinado/);
  assert.match(projects.codexPrompt(saved,{title:'x',instructions:'x',files:[]},{name:'Teste',role:'tester'}),/## PROMPT\.md\n# Prompt refinado/);
  assert.equal(projects.document('PROMPT.md',project.id).editable,true);
});

test('gerar de novo exige a versão revisada e guarda a anterior no histórico',()=>{
  const {projects,library,project}=fixture();
  const first=library.refinePrompt({id:project.id}).prompt;
  const edited=projects.edit({projectId:project.id,path:'PROMPT.md',version:first.version,content:first.content+'\nNota minha: priorizar celular.\n'});
  assert.throws(()=>library.refinePrompt({id:project.id}),/nada foi sobrescrito/);assert.throws(()=>library.refinePrompt({id:project.id,version:first.version}),/nada foi sobrescrito/);
  assert.match(projects.document('PROMPT.md',project.id).content,/priorizar celular/);
  library.saveBrief('harness:'+project.id,{constraints:'Sem serviços pagos'});
  const again=library.refinePrompt({id:project.id,version:edited.version});
  assert.match(readFileSync(again.backup,'utf8'),/priorizar celular/);assert.match(again.prompt.content,/Sem serviços pagos/);
  assert.equal(readdirSync(join(projects.location(project.id),'prompt-history')).length,1);
});

test('rascunho só entra na fila depois do prompt refinado e uma vez por vez',()=>{
  const {projects,library,project}=fixture();
  assert.throws(()=>library.prepareDraft(project.id),/prompt refinado/);
  library.refinePrompt({id:project.id});
  const result=library.prepareDraft(project.id),saved=projects.get(project.id),mission=saved.missions.find(item=>item.id===result.missionId);
  assert.equal(mission.status,'pending');assert.equal(mission.engine,'codex');assert.match(mission.instructions,/Crie PLAN\.md/);assert.match(mission.instructions,/Não implemente/);
  assert.equal(status(result).draft,'active');assert.equal(status(result).prototypes,'pending');
  assert.throws(()=>library.prepareDraft(project.id),/Já existe/);assert.equal(projects.get(project.id).missions.length,1);
});

test('arquivos reais do workspace concluem Grill-me e rascunho; modo desligado aparece como desligado',()=>{
  const {projects,library,project}=fixture();
  const workspace=projects.workspace(project.id);mkdirSync(workspace,{recursive:true});
  writeFileSync(join(workspace,'GRILL-ME.md'),'# Rodada 1\n1. Qual o prazo?\n');writeFileSync(join(workspace,'PLAN.md'),'# Plano\n');
  let track=library.track(project.id);assert.equal(status(track).grill,'done');assert.equal(status(track).draft,'done');
  assert.match(library.refinePrompt({id:project.id}).prompt.content,/GRILL-ME\.md no workspace \(SHA-256 [a-f0-9]{12}\)/);
  library.saveModes('harness:'+project.id,{grillMe:false});track=library.track(project.id);assert.equal(status(track).grill,'skipped');
});

test('protótipos contam só missões fora do planejamento',()=>{
  const project={goal:'x',missions:[{title:'Rascunho: plano',status:'done'},{title:'Tela inicial',status:'done'},{title:'Carrinho',status:'pending'}]};
  const track=buildTrack({project,artifacts:[{path:'PLAN.md'}],promptExists:true});
  assert.equal(track.steps.find(step=>step.id==='prototypes').detail,'1/2 missões de protótipo concluídas');assert.equal(status(track).prototypes,'active');
  project.missions[2].status='done';assert.equal(status(buildTrack({project,artifacts:[],promptExists:true})).prototypes,'done');
  assert.doesNotMatch(refinedPrompt({project:{name:'x',goal:'y'},grillMe:false}),/briefing Grill-me/);
});
