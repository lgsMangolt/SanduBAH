'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,existsSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {prepareTech,techSnapshot}=require('../../src/sandubah-desktop/tech-lab.cjs');
const {parseJson,contractFrom,compareValues,compareArtifacts,receipts,confirmedComparison}=require('../../src/sandubah-desktop/x-tudo.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'tech-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
const request={type:'source',intent:'mod',target:'https://github.com/example/sample',goal:'Planejar um quadro de tarefas com código próprio.',rights:'Referência fictícia; conferir licença antes de reutilizar.',authorized:true};
function fixture(){
  const root=mkdtempSync(join(directory,'repo-'));
  const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:filename=>assertLocalWritePath(root,filename),readLocal:filename=>join(root,filename)});
  const library=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(filename,content)=>projects.write(filename,content),catalog:()=>({entries:[]}),roots:[]});projects.knowledgeLibrary=library;
  const project=projects.create({name:'Oficina Aurora',goal:'Experimento com dados fictícios.'});project.executorDefaults={engine:'codex',model:'gpt-6-luna',effort:'low'};projects.save(project);
  return {projects,project,library};
}
function comparisonFixture(){
  const fixtureValues=fixture(),{projects,project}=fixtureValues;
  const checks=[{id:'total',path:'order.total',expected:85.15,critical:true},{id:'status',path:'order.state',expected:'paid',critical:false}];
  const input={contract:'checks.json',baseline:'before.json',candidate:'after.json'};
  const put=(path,value)=>projects.write(join(projects.workspace(project.id),path),JSON.stringify(value));
  put(input.contract,{checks});put(input.baseline,{order:{total:105.25,state:'paid'}});put(input.candidate,{order:{total:85.15,state:'paid'}});
  return {...fixtureValues,input,checks,put};
}
test('Tech prepara uma análise, preserva projeto/modelo e não conta como protótipo',()=>{
  const {projects,project,library}=fixture(),original=readFileSync(join(projects.location(project.id),'HARNESS.md'),'utf8');
  const result=prepareTech(projects,project.id,request,{provider:'claude',model:'other'}),saved=projects.get(project.id),mission=saved.missions[0];
  assert.equal(result.harnessId,project.id);assert.equal(saved.workerLimit,1);assert.equal(projects.list().length,1);
  assert.equal(mission.model,'gpt-6-luna');assert.equal(mission.effort,'low');assert.equal(mission.status,'pending');assert.equal(mission.tech.skill,null);assert.deepEqual(mission.files,[]);
  assert.equal(readFileSync(join(projects.location(project.id),'HARNESS.md'),'utf8'),original);assert.equal(library.track(project.id).steps.find(step=>step.id==='prototypes').status,'pending');
  assert.equal(existsSync(join(projects.workspace(project.id),result.report)),false);assert.equal(library.state.learning.length,0);
  for(const pattern of [/reverse-engineer-anything/,/leitura normal/,/não alegue que executou REA/,/Evidence IDs/,/implementação é outra missão/,/Claude e IA local/,/Corel/,/impressão/])assert.match(mission.instructions,pattern);
});
test('análise pendente ou desconhecida não duplica e preferências Claude/local permanecem',()=>{
  for(const defaults of [{engine:'claude',model:'claude-opus-5-5',effort:'high'},{engine:'local',model:'qwen-2b'}]){
    const {projects,project}=fixture();project.executorDefaults=defaults;projects.save(project);
    const first=prepareTech(projects,project.id,request);const saved=projects.get(project.id);saved.missions[0].status='unknown';projects.save(saved);
    assert.equal(prepareTech(projects,project.id,request).missionId,first.missionId);assert.equal(projects.get(project.id).missions.length,1);assert.deepEqual(projects.get(project.id).executorDefaults,defaults);
  }
});
test('skill encontrada é anexada ao papel sem instalar REA nem presumir tools',()=>{
  const {projects,project}=fixture(),source='docs/reverse-engineer-anything/SKILL.md';projects.write(join(projects.root,source),'# reverse-engineer-anything\nReferência fictícia.');projects.documents=new Map([[source,{path:source,title:'reverse-engineer-anything'}]]);
  assert.equal(techSnapshot(projects,project.id).skill,source);prepareTech(projects,project.id,request);assert.equal(projects.get(project.id).agents[0].source,source);assert.match(projects.get(project.id).missions[0].instructions,/não existir no executor/);
});
test('sem autorização, tipo inválido, credenciais ou excesso não cria papéis/missões',()=>{
  for(const extra of [{authorized:false},{type:'__proto__'},{intent:'constructor'},{target:'https://user:pass@example.test'},{target:'https://example.test/?token=private'},{goal:'x'.repeat(2501)},{rights:''}]){
    const {projects,project}=fixture(),before=JSON.stringify(projects.get(project.id));assert.throws(()=>prepareTech(projects,project.id,{...request,...extra}));assert.equal(JSON.stringify(projects.get(project.id)),before);
  }
});
test('vídeo YouTube é normalizado; URL não equivale a vídeo visto ou download',()=>{
  const {projects,project}=fixture();prepareTech(projects,project.id,{...request,type:'video',intent:'video',target:'https://www.youtube.com/watch?v=zn2RMbMGVIY'});
  const mission=projects.get(project.id).missions[0];assert.equal(mission.tech.target,'https://youtu.be/zn2RMbMGVIY');assert.match(mission.instructions,/não provam que assistiu/);assert.match(mission.instructions,/Não baixar mídia/);
});
test('X-Tudo compara dados de verdade, salva recibo com hashes e não duplica',async()=>{
  const {projects,project,input}=comparisonFixture();const preview=compareArtifacts(projects,project.id,input);assert.equal(preview.baselinePassed,1);assert.equal(preview.candidatePassed,2);assert.equal(preview.decision,'review');assert.equal(preview.adopted,false);
  let confirmations=0;const confirm=async value=>{confirmations++;assert.equal(value.fingerprint,preview.fingerprint);return true;};
  const first=await confirmedComparison({projects,id:project.id,input,confirm});const second=await confirmedComparison({projects,id:project.id,input,confirm});
  assert.equal(confirmations,2);assert.equal(first.id,second.id);assert.equal(second.reused,true);assert.equal(receipts(projects,project.id).length,1);assert.equal(first.modelCalls,0);assert.equal(first.usage,null);
  assert.match(first.sources.baseline.sha256,/^[a-f0-9]{64}$/);assert.match(first.scope,/não verifica a origem/);
});
test('ganho líquido não esconde regressão; critério crítico bloqueia candidato',()=>{
  const checks=[{id:'safety',path:'safe',expected:true,critical:true},...['one','two','three'].map(id=>({id,path:id,expected:true,critical:false}))];
  const result=compareValues({checks},{safe:true,one:false,two:false,three:false},{safe:false,one:true,two:true,three:true});
  assert.equal(result.gains,3);assert.equal(result.regressions,1);assert.equal(result.candidatePassed,3);assert.equal(result.decision,'baseline');assert.equal(result.adopted,false);
  const noncritical=compareValues({checks},{safe:true,one:true,two:false,three:false},{safe:true,one:false,two:true,three:true});assert.equal(noncritical.decision,'baseline');
});
test('pode recusar ambos, conservar empate e distinguir null de campo ausente',()=>{
  const contract={checks:[{id:'safety',path:'safe',expected:null,critical:true}]};
  assert.equal(compareValues(contract,{},{}).decision,'reject');assert.equal(compareValues(contract,{safe:null},{safe:null}).decision,'baseline');assert.equal(compareValues(contract,{}, {safe:null}).decision,'review');
});
test('cancelar ou iniciar outro worker não salva; arquivo alterado após revisão recusa',async()=>{
  const {projects,project,input,put}=comparisonFixture();
  assert.deepEqual(await confirmedComparison({projects,id:project.id,input,confirm:async()=>false}),{cancelled:true});assert.deepEqual(receipts(projects,project.id),[]);
  await assert.rejects(confirmedComparison({projects,id:project.id,input,confirm:async()=>true,isBusy:()=>true}),/worker/);
  let busy=false;await assert.rejects(confirmedComparison({projects,id:project.id,input,confirm:async()=>{busy=true;return true;},isBusy:()=>busy}),/worker iniciou/);
  await assert.rejects(confirmedComparison({projects,id:project.id,input,confirm:async()=>{put(input.candidate,{order:{total:0}});return true;}}),/mudaram/);assert.deepEqual(receipts(projects,project.id),[]);
});
test('JSON rejeita chaves perigosas, números infinitos, profundidade e cortes',()=>{
  for(const content of ['{','{"__proto__":{}}','{"x":1e1000}','['.repeat(18)+'0'+']'.repeat(18),' '.repeat(64001)])assert.throws(()=>parseJson(content));
  for(const checks of [[],[{id:'x',path:'constructor.x',expected:0,critical:true}],[{id:'x',path:'x',expected:0,critical:false}],[{id:'x',path:'x',critical:true}]])assert.throws(()=>contractFrom(JSON.stringify({checks})));
});
test('comparação só lê três JSON distintos do workspace e isola projetos',()=>{
  const {projects,project,input}=comparisonFixture();for(const extra of [{candidate:input.baseline},{candidate:'../other.json'},{baseline:'result.js'}])assert.throws(()=>compareArtifacts(projects,project.id,{...input,...extra}));
  const other=projects.create({name:'Outro projeto fictício',goal:'Isolamento.'});assert.throws(()=>compareArtifacts(projects,other.id,input));assert.deepEqual(receipts(projects,other.id),[]);
});
test('X-Tudo instrui custos reais, condições iguais, rollback e revisão de memória',()=>{
  const {projects,project,library}=fixture();library.prepareHarnessReview(project.id);const instructions=projects.get(project.id).missions[0].instructions;
  for(const pattern of [/X-Tudo/,/regressão bloqueia/,/mesma tarefa, dados, modelo e força/,/recibo real do provedor/,/rollback/,/não promova a memória sem revisão/])assert.match(instructions,pattern);
});
test('triagem da fila não promove propostas Tech/X-Tudo como aprendizado aprovado',()=>{
  const {projects,project,library}=fixture();prepareTech(projects,project.id,request);library.capture('Fila do harness',{success:true,project:projects.get(project.id)});
  assert.equal(library.state.learning[0].decision,'review');assert.equal(library.entries().filter(item=>item.path.startsWith('learning:')).length,0);
});
