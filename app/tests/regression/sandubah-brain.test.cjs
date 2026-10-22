'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,realpathSync,linkSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {KnowledgeLibrary,assessKnowledge}=require('../../src/sandubah-desktop/knowledge.cjs');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {prepareMvp,CRITERIA}=require('../../scripts/plan-commerce-mvp.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'brain-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(join(directory,'repo-'));const notes=mkdtempSync(join(directory,'notes-'));
  const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:path=>assertLocalWritePath(root,path),readLocal:path=>join(root,path)});
  const library=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(path,content)=>projects.write(path,content),catalog:()=>({entries:[{id:'skill:rag',name:'RAG local',kind:'skill',description:'pesquisa RAG documentos'},{id:'skill:board',name:'ar-board',kind:'skill',description:'quadro'}]}),roots:[{name:'Notas de teste',path:notes}]});projects.knowledgeLibrary=library;
  return {root,notes,projects,library};
}

test('respostas parciais preservam outras caixas e permitem limpar uma resposta sem executar',()=>{
  const {projects,library}=fixture();const project=projects.create({name:'Entrevista',goal:'Planejar'}),id='harness:'+project.id;
  library.saveBrief(id,{goal:'Integrar WhatsApp',audience:'Minha equipe'});library.saveBrief(id,{data:'API documentada'});
  assert.deepEqual(library.snapshot().briefs[id].answers,{goal:'Integrar WhatsApp',audience:'Minha equipe',data:'API documentada'});
  library.saveBrief(id,{data:''});assert.equal(library.snapshot().briefs[id].answers.data,undefined);
  assert.throws(()=>library.saveBrief(id,{constraints:' '.repeat(2001)}));
  assert.throws(()=>library.saveBrief(id,{constraints:'sk-'+'A'.repeat(24)}));
  assert.equal(projects.get(project.id).missions.length,0);
});

test('100% de missões não declara produto pronto',()=>{
  const {projects,library}=fixture(),project=projects.create({name:'Protótipo',goal:'Uma missão não é o produto'});
  project.missions.push({id:'fixture',title:'Protótipo',status:'done',tool:'fixture'});projects.save(project);
  const row=library.projectRows().find(candidate=>candidate.harnessId===project.id);
  assert.equal(row.progress,100);assert.equal(row.progressBasis,'missions');assert.match(row.status,/produto não avaliado/);
  assert.equal(row.lifecycle.progress,0);assert.equal(row.lifecycle.currentStage,null);assert.equal(row.lifecycle.total,12);
});

test('etapas de produto são persistentes e independentes das missões e de outros projetos',()=>{
  const {root,notes,projects,library}=fixture(),project=projects.create({name:'Etapas',goal:'Produto'}),id='harness:'+project.id;
  const before=JSON.stringify(projects.get(project.id));let document=library.lifecycle(id);
  assert.deepEqual(document.stages.map(stage=>stage.title),['Planejamento','Protótipo','MVP','Produção']);
  for(const item of document.stages[0].items)document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:'planning',itemId:item.id,done:true,evidence:'PLANNING.md: critério revisado no teste.'});
  assert.equal(document.summary.currentStage,'prototype');assert.equal(document.summary.stages[1].status,'pending');
  document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:'prototype',itemId:'flow',done:true,evidence:'Prévia executada com dados fictícios.'});
  assert.equal(document.summary.currentStage,'prototype');assert.equal(document.summary.progress,33);assert.equal(document.summary.done,4);assert.equal(JSON.stringify(projects.get(project.id)),before);
  const other=projects.create({name:'Outro',goal:'Separar dados'});assert.equal(library.lifecycle('harness:'+other.id).revision,0);
  const restored=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(path,content)=>projects.write(path,content),catalog:()=>({entries:[]}),roots:[{name:'Notas',path:notes}]});
  assert.equal(restored.lifecycle(id).revision,4);assert.equal(restored.lifecycle(id).summary.currentStage,'prototype');assert.match(restored.modeContext(id),/Etapas do produto/);
});

test('critérios exigem evidência, revisão atual e etapas anteriores sem perder dados na falha',()=>{
  const {projects,library}=fixture(),project=projects.create({name:'Proteções',goal:'Checklist'}),id='harness:'+project.id;
  for(const input of [{revision:1,operation:'check',stageId:'planning',itemId:'purpose',done:true,evidence:'Teste com evidência'},{revision:0,operation:'check',stageId:'production',itemId:'deployment',done:true,evidence:'Teste com evidência'},{revision:0,operation:'check',stageId:'planning',itemId:'purpose',done:true,evidence:''},{revision:0,operation:'check',stageId:'planning',itemId:'purpose',done:true,evidence:'sk-'+'A'.repeat(24)},{revision:0,operation:'add',stageId:'unknown',title:'Critério'},{revision:0,operation:'add',stageId:'planning',title:'x'.repeat(241)}])assert.throws(()=>library.updateLifecycle(id,input));
  assert.equal(library.lifecycle(id).revision,0);
  const original=library.lifecycleStore.write;library.lifecycleStore.write=()=>{throw new Error('Disco indisponível');};assert.throws(()=>library.updateLifecycle(id,{revision:0,operation:'check',stageId:'planning',itemId:'purpose',done:true,evidence:'Documento de teste revisado'}),/Disco/);library.lifecycleStore.write=original;assert.equal(library.lifecycle(id).revision,0);
  const updated=library.updateLifecycle(id,{revision:0,operation:'add',stageId:'planning',title:'Critério próprio do cliente'});assert.equal(updated.stages[0].items.length,4);assert.equal(updated.summary.total,13);assert.equal(updated.history.length,1);
});

test('aceite do protótipo inicia apenas o planejamento do MVP, sem completar critérios nem alterar missões',()=>{
  const {root,notes,projects,library}=fixture(),project=projects.create({name:'Aurora',goal:'Planejar MVP'}),id='harness:'+project.id;
  const before=JSON.stringify(projects.get(project.id));let document=library.lifecycle(id);
  assert.throws(()=>prepareMvp({library,projectId:project.id,approval:''}),/aceite|aprovação/i);assert.equal(library.lifecycle(id).revision,0);
  for(const stage of document.stages.slice(0,2))for(const item of stage.items.filter(candidate=>candidate.id!=='review'))document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:stage.id,itemId:item.id,done:true,evidence:'Protótipo fictício revisado em teste isolado.'});
  const approval='Aceite explícito de teste: aprovo apenas o protótipo local com dados fictícios.';
  document=prepareMvp({library,projectId:project.id,approval});
  assert.equal(document.summary.currentStage,'mvp');assert.equal(document.summary.stages[2].status,'pending');
  assert.equal(document.stages[1].items.find(item=>item.id==='review').evidence,approval);
  assert.equal(document.summary.stages[1].done,3);assert.equal(document.stages[2].items.length,12);assert.equal(CRITERIA.length,9);
  assert.ok(document.stages.slice(2).every(stage=>stage.items.every(item=>!item.done)));
  assert.equal(document.summary.done,6);assert.equal(document.summary.total,21);assert.equal(JSON.stringify(projects.get(project.id)),before);
  const revision=document.revision,history=JSON.stringify(document.history);
  assert.equal(prepareMvp({library,projectId:project.id,approval}).revision,revision);assert.equal(JSON.stringify(library.lifecycle(id).history),history);
  const restored=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(path,content)=>projects.write(path,content),catalog:()=>({entries:[]}),roots:[{name:'Notas',path:notes}]});
  assert.equal(restored.lifecycle(id).revision,revision);assert.equal(restored.lifecycle(id).summary.currentStage,'mvp');assert.match(restored.modeContext(id),/MVP-PLAN\.md/);
});

test('planejamento do MVP não reaplica um aceite reaberto nem aceita protótipo ainda sem evidência',()=>{
  const {projects,library}=fixture(),project=projects.create({name:'Aurora',goal:'Preservar revisão humana'}),id='harness:'+project.id;
  const approval='Aceite explícito de teste restrito ao protótipo local.';
  assert.throws(()=>prepareMvp({library,projectId:project.id,approval}));assert.equal(library.lifecycle(id).revision,0);
  let document=library.lifecycle(id);
  for(const stage of document.stages.slice(0,2))for(const item of stage.items.filter(candidate=>candidate.id!=='review'))document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:stage.id,itemId:item.id,done:true,evidence:'Evidência sintética do protótipo isolado.'});
  document=prepareMvp({library,projectId:project.id,approval});
  document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:'prototype',itemId:'review',done:false,evidence:'Aceite reaberto para revisão do responsável.'});
  assert.throws(()=>prepareMvp({library,projectId:project.id,approval}),/reaberto|antiga/i);
  assert.equal(library.lifecycle(id).revision,document.revision);assert.equal(library.lifecycle(id).summary.currentStage,'prototype');assert.equal(projects.get(project.id).missions.length,0);
});

test('reabrir critério anterior bloqueia promoção sem apagar evidências e vínculo compartilha etapas',()=>{
  const {notes,library}=fixture();writeFileSync(join(notes,'Inicio.md'),'# Projeto\nUm objetivo documentado.');const id=library.refresh().sources[0].id;
  let document=library.lifecycle(id);for(const stage of document.stages)for(const item of stage.items)document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:stage.id,itemId:item.id,done:true,evidence:'Documento revisado e resultado de teste.'});
  assert.equal(document.summary.currentStage,'production');assert.equal(document.summary.progress,100);
  const continued=library.continueProject(id),harnessId='harness:'+continued.harnessId;assert.equal(library.lifecycle(harnessId).revision,12);
  document=library.updateLifecycle(harnessId,{revision:12,operation:'check',stageId:'planning',itemId:'purpose',done:false,evidence:'Reabrir: objetivo precisa de revisão.'});
  assert.equal(document.summary.currentStage,'planning');assert.equal(document.summary.stages[1].status,'blocked');assert.equal(document.stages[3].items[0].done,true);assert.equal(library.lifecycle(id).revision,13);
});

test('modos são independentes, persistentes e restritos ao projeto sem ampliar permissões',()=>{
  const {root,notes,projects,library}=fixture();
  const first=projects.create({name:'Primeiro',goal:'Planejar'}),second=projects.create({name:'Segundo',goal:'Planejar'}),id='harness:'+first.id;
  assert.deepEqual(library.projectModes(id),{grillMe:true,vibewase:false});
  library.saveModes(id,{grillMe:false});library.saveModes(id,{vibewase:true});library.saveBrief(id,{goal:'Meta preservada'});
  const restored=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(path,content)=>projects.write(path,content),catalog:()=>({entries:[]}),roots:[{name:'Notas',path:notes}]});
  assert.deepEqual(restored.snapshot().modes[id],{grillMe:false,vibewase:true});assert.deepEqual(restored.projectModes('harness:'+second.id),{grillMe:true,vibewase:false});
  for(const invalid of [null,[],{},'ligado',{grillMe:'false'},{vibewase:1},{skipConfirmation:true}])assert.throws(()=>restored.saveModes(id,invalid));
  assert.throws(()=>restored.saveModes('harness:inexistente',{grillMe:false}));assert.equal(projects.get(first.id).missions.length,0);
});

test('modos acompanham a continuação e salvamento do briefing não perde vínculo nem conversa',()=>{
  const {notes,projects,library}=fixture();writeFileSync(join(notes,'Projeto.md'),'# Projeto');const id=library.refresh().sources[0].id;
  library.saveModes(id,{grillMe:false,vibewase:true});library.saveConversation(id,'Quero criar conversando, com fontes.');
  const first=library.continueProject(id);library.saveBrief(id,{goal:'Novo objetivo'});
  assert.equal(library.continueProject(id).harnessId,first.harnessId);
  const harness='harness:'+first.harnessId;assert.deepEqual(library.projectModes(harness),{grillMe:false,vibewase:true});
  library.saveModes(harness,{grillMe:true});assert.equal(library.projectModes(id).grillMe,true);
  library.saveModes(id,{vibewase:false});assert.equal(library.projectModes(harness).vibewase,false);
  assert.match(projects.document('MEMORY.md',first.harnessId).content,/Quero criar conversando/);assert.equal(library.state.briefs[id].conversation,'Quero criar conversando, com fontes.');
  assert.throws(()=>library.saveConversation(id,'Desligado'));library.saveModes(id,{vibewase:true});assert.throws(()=>library.saveConversation(id,'sk-'+'A'.repeat(24)));assert.throws(()=>library.saveConversation(id,'x'.repeat(8001)));
});

test('quatro combinações orientam missões pendentes e contexto sem remover revisão humana',()=>{
  const {projects,library}=fixture();const original=projects.create({name:'Modos',goal:'Planejar sem executar'}),id='harness:'+original.id;
  for(const grillMe of [true,false])for(const vibewase of [true,false]){
    library.saveModes(id,{grillMe,vibewase});if(vibewase)library.saveConversation(id,'Ideia livre para este projeto.');
    if(!grillMe){const count=projects.get(original.id).missions.length;assert.throws(()=>library.grill(id),/desligado/);assert.equal(projects.get(original.id).missions.length,count);}
    const result=library.plan(id),project=projects.get(result.harnessId),mission=project.missions.at(-1);
    assert.equal(mission.status,'pending');assert.equal(mission.engine,'codex');assert.match(mission.instructions,/confirmações de ações protegidas/);
    assert.match(mission.instructions,grillMe?/GRILL-ME.md/:/PLAN.md/);assert.match(mission.instructions,vibewase?/Vibewase ligado/:/Vibewase desligado/);
    const prompt=projects.codexPrompt(project,mission,project.agents[0]);assert.match(prompt,grillMe?/Grill-me ligado/:/Grill-me desligado/);assert.match(prompt,/não ampliam escopo/);
    assert.match(projects.plannerContext(project),/Modos do projeto/);
  }
});
test('dez estilos e fallback clássico têm preferências limitadas e geometria válida',async()=>{
  const {brainStyles,brainPreferences,brainPositions}=await import('../../src/sandubah-desktop/brain-layouts.mjs');
  assert.equal(brainStyles.length,11);assert.equal(new Set(brainStyles.map(style=>style.id)).size,11);
  assert.equal(brainPreferences(null,true).motion,false);assert.equal(brainPreferences({style:'injetado',speed:Infinity}).style,'orbit');assert.equal(brainPreferences({speed:5}).speed,1.5);
  for(const style of brainStyles)for(const count of [1,5,25]){const points=brainPositions(style.id,count,3);assert.equal(points.length,count);assert.ok(points.flat().every(Number.isFinite));assert.equal(new Set(points.map(point=>JSON.stringify(point))).size,count);}
  assert.throws(()=>brainPositions('orbit',26));assert.throws(()=>brainPositions('orbit',5,NaN));
});

test('fine-tuning salva preparação com fontes e exemplos sem iniciar treino ou pesquisa',()=>{
  const {library,projects}=fixture();const input={topic:'Suporte local',question:'Compare RAG e fine-tuning',sources:'https://example.com/paper',notes:'Notas humanas ainda precisam de checagem.',examples:JSON.stringify({messages:[{role:'user',content:'Olá'},{role:'assistant',content:'Como posso ajudar?'}]}),evaluation:'Separar conjunto de teste'};
  library.saveFineTuning(undefined,input);assert.equal(library.snapshot().fineTuning.general.examplesCount,1);assert.equal(projects.list().length,0);
  const result=library.prepareFineTuning();const project=projects.get(result.harnessId);assert.equal(project.missions[0].status,'pending');assert.match(project.missions[0].instructions,/Não treine pesos/);assert.match(readFileSync(join(projects.workspace(project.id),'RESEARCH.md'),'utf8'),/registro manual/);
  assert.equal(new URL(library.perplexitySearch('RAG & treino')).searchParams.get('q'),'RAG & treino');assert.throws(()=>library.perplexitySearch('sk-'+'A'.repeat(24)));
  for(const invalid of [{sources:'file:///secret'},{sources:'https://user:password@example.com'},{examples:'not JSON'},{notes:'sk-'+'A'.repeat(24)}])assert.throws(()=>library.saveFineTuning(undefined,{...input,...invalid}));
});
test('índice lê notas reais, preserva originais, resolve links e conta apenas checklists',()=>{
  const {notes,library}=fixture();writeFileSync(join(notes,'Inicio.md'),'# Início\n\n[[Detalhes]]\n\n- [x] Feito\n- [ ] Pendente\n');writeFileSync(join(notes,'Detalhes.md'),'# Detalhes\n\nDecisão: usar um worker.\n'.repeat(4));
  const original=readFileSync(join(notes,'Inicio.md'),'utf8');const result=library.refresh();assert.equal(result.scan.documents,2);
  const entry=library.entries().find(item=>item.title==='Início');const doc=library.document(entry.path);assert.equal(doc.editable,false);assert.equal(doc.links.length,1);assert.match(library.document(doc.links[0].path).content,/Detalhes/);
  assert.equal(result.projects[0].progress,50);assert.equal(readFileSync(join(notes,'Inicio.md'),'utf8'),original);assert.throws(()=>library.document('../secret'));
});
test('segredos, dependências e hard links ficam fora do cérebro',()=>{
  const {notes,library}=fixture();writeFileSync(join(notes,'Token.md'),'sk-'+'A'.repeat(30));writeFileSync(join(notes,'normal.md'),'# Nota pública');linkSync(join(notes,'normal.md'),join(notes,'alias.md'));
  mkdirSync(join(notes,'node_modules'));writeFileSync(join(notes,'node_modules/dependency.md'),'# Ignorar');const result=library.refresh();assert.equal(result.scan.documents,0);assert.ok(result.scan.warnings.length>0);
  assert.equal(assessKnowledge('sk-'+'B'.repeat(24)).decision,'rejected');
});
test('briefing, recomendações e continuação persistem sem executar agentes',()=>{
  const {notes,projects,library}=fixture();writeFileSync(join(notes,'RAG.md'),'# RAG\n\nCritério de pesquisa com fontes e avaliação.');const snapshot=library.refresh();const id=snapshot.sources[0].id;
  library.saveBrief(id,{goal:'Criar pesquisa RAG local',success:'Teste com fontes'});assert.equal(library.recommendations(id).skills[0].name,'RAG local');assert.equal(library.recommendations(id).arBoard[0].name,'ar-board');
  const first=library.continueProject(id),second=library.continueProject(id);assert.equal(first.harnessId,second.harnessId);const project=projects.get(first.harnessId);assert.equal(project.missions.length,0);assert.equal(project.context.length,1);assert.match(projects.document('MEMORY.md',project.id).content,/Teste com fontes/);
  assert.throws(()=>library.saveBrief('../outside',{goal:'x'}));assert.throws(()=>library.saveBrief(id,{goal:'sk-'+'A'.repeat(24)}));
});
test('estudo vira missão pendente, com fonte escolhida, sem pesquisa fingida ou side effect em pedido inválido',()=>{
  const {notes,projects,library}=fixture();writeFileSync(join(notes,'Fonte.md'),'# Fonte\n\nUma referência local para estudo.');const snapshot=library.refresh();
  assert.throws(()=>library.study('RAG','fonte-inexistente'));assert.equal(projects.list().length,0);
  const result=library.study('RAG em farmácias',snapshot.sources[0].id);const project=projects.get(result.harnessId);assert.equal(project.context.length,1);assert.equal(project.missions[0].status,'pending');assert.equal(project.missions[0].engine,'codex');assert.match(project.missions[0].instructions,/fontes suficientes/);assert.equal(project.workerLimit,1);
});
test('triagem automática guarda procedência, rejeita segredos e não promove resultado grande',()=>{
  const {library}=fixture();library.capture('Teste real','Resultado: decisão documentada com evidências e critérios verificáveis. '.repeat(3));assert.equal(library.state.learning[0].decision,'accepted');assert.ok(library.entries().some(item=>item.path.startsWith('learning:')));
  library.capture('Segredo','sk-'+'A'.repeat(24));assert.equal(library.state.learning[0].decision,'rejected');assert.equal(library.state.learning[0].content,null);
  library.capture('Grande','Resultado: '+'x'.repeat(17000));assert.equal(library.state.learning[0].decision,'review');assert.equal(library.state.learning[0].content,null);
  const size=library.state.learning.length;library.state.autoAssess=false;library.capture('Não registrar','Resultado: referência longa'.repeat(10));assert.equal(library.state.learning.length,size);
});

test('continuar harness existente anexa briefing sem substituir memória anterior nem duplicar',()=>{
  const {library,projects}=fixture();const project=projects.create({name:'Projeto em andamento',goal:'Preservar o trabalho'});const id='harness:'+project.id;
  const before=projects.document('MEMORY.md',project.id).content;library.saveBrief(id,{goal:'Nova meta clara',constraints:'Não alterar o gateway'});
  library.continueProject(id);const content=projects.document('MEMORY.md',project.id).content;assert.ok(content.startsWith(before));assert.match(content,/Nova meta clara/);
  library.continueProject(id);assert.equal(projects.document('MEMORY.md',project.id).content,content);
});

test('catálogo de projetos abre apenas pastas conhecidas e progresso vem do quadro local',()=>{
  const {root,projects,library}=fixture();const projectDirectory=join(root,'Documents','Meu projeto');mkdirSync(projectDirectory,{recursive:true});writeFileSync(join(projectDirectory,'BOARD.md'),'# Missões\n- [x] Pronto\n- [ ] Próximo\n');
  projects.write(join(root,'build/sandubah/gui/brain/projects.json'),JSON.stringify({version:1,projects:[{id:'fora',name:'Fora',directory:'C:/Windows'},{id:'known',name:'Meu projeto',directory:projectDirectory}]}));
  const rows=library.registeredProjects();assert.equal(rows.length,1);assert.equal(rows[0].directory,projectDirectory);assert.equal(rows[0].progress,50);assert.throws(()=>library.project('known'));
});

test('aprofundamento grill-me prepara Codex real sem executá-lo e inclui briefing no contexto',()=>{
  const {library,projects}=fixture();const project=projects.create({name:'Meu projeto',goal:'Organizar conhecimento'});const id='harness:'+project.id;
  library.saveBrief(id,{goal:'Aprender RAG com evidências'});const result=library.grill(id);const updated=projects.get(result.harnessId);const mission=updated.missions[0];
  assert.equal(mission.status,'pending');assert.equal(mission.engine,'codex');assert.match(mission.instructions,/árvore de decisões/);assert.match(mission.instructions,/AR Board/);assert.match(projects.document('MEMORY.md',project.id).content,/Aprender RAG/);
});

test('artefato de estudo entra na triagem com caminho e hash, sem alterar a origem',()=>{
  const {library,projects}=fixture();const project=projects.create({name:'Estudo',goal:'Aprender com fontes'});const content='# Estudo\n\n## Decisão e evidência\n'+('Referências locais, limites e critérios para revisar o resultado. '.repeat(3));
  projects.write(join(projects.workspace(project.id),'STUDY.md'),content);
  const {DesktopController}=require('../../src/sandubah-desktop/backend.cjs');DesktopController.prototype.assessStudyArtifacts.call({projects,knowledge:library,emit:()=>{}},project);
  assert.equal(library.state.learning[0].decision,'accepted');assert.match(library.state.learning[0].provenance,/SHA-256/);assert.equal(projects.artifact(project.id,'STUDY.md').content,content);
});
