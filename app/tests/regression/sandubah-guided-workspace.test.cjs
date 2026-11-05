'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const selected={provider:'claude',model:'opus-ficticio'};
const cloud={selection:selected,providers:[{id:'codex',installed:true,authenticated:true},{id:'claude',installed:true,authenticated:true}]};
test('ação guiada distingue rascunho, conexão e implementação sem trocar IA',async()=>{
  const {nextProjectAction}=await import('../../src/sandubah-desktop/guided-workspace.mjs');
  assert.equal(nextProjectAction().action,'setup');assert.equal(nextProjectAction({ready:true}).action,'describe');assert.equal(nextProjectAction({ready:true,hasPlan:true,cloud}).action,'build');assert.deepEqual(cloud.selection,selected);
});
test('etapa pendente usa o executor próprio e mantém revisão antes de executar',async()=>{
  const {nextProjectAction}=await import('../../src/sandubah-desktop/guided-workspace.mjs');
  const project={missions:[{id:'primeira',title:'Conferir fontes',engine:'claude',model:'haiku-ficticio',status:'pending'}]};
  const result=nextProjectAction({project,cloud});assert.equal(result.action,'run');assert.equal(result.missionId,'primeira');assert.equal(result.executor,'claude');assert.equal(result.model,'haiku-ficticio');assert.match(result.label,/Revisar/);assert.deepEqual(cloud.selection,selected);
  assert.equal(nextProjectAction({project}).action,'setup');assert.equal(nextProjectAction({project,cloud,busy:true}).action,null);
  assert.equal(nextProjectAction({project,cloud:{}}).action,'setup');
});
test('resultado desconhecido exige revisar e não provoca repetição automática',async()=>{
  const {nextProjectAction}=await import('../../src/sandubah-desktop/guided-workspace.mjs');
  for(const status of ['error','unknown'])assert.equal(nextProjectAction({project:{missions:[{status},{status:'pending'}]},cloud}).action,'files');
  assert.equal(nextProjectAction({project:{missions:[{status:'done'}]},cloud}).action,'files');
  assert.equal(nextProjectAction({error:'Projeto indisponível.'}).action,'refresh');
});
test('prévia não aprova protótipo ou produção e usa critérios reais',async()=>{
  const {nextProjectAction}=await import('../../src/sandubah-desktop/guided-workspace.mjs');
  const project={missions:[]},preview={entry:'index.html'};
  const lifecycle={stages:[{id:'prototype',title:'Protótipo',items:[{done:false,title:'Aceitar o fluxo'}]}]};
  const result=nextProjectAction({project,preview,lifecycle});assert.equal(result.action,'check');assert.equal(result.stage,'prototype');assert.equal(lifecycle.stages[0].items[0].done,false);
  lifecycle.stages=[{id:'production',title:'Produção',items:[{done:false,title:'Revisar implantação'}]}];assert.equal(nextProjectAction({project,preview,lifecycle}).action,'check');
  lifecycle.stages[0].items[0].done=true;assert.equal(nextProjectAction({project,preview,lifecycle}).phase,'Produção');
});
test('próxima melhoria usa critério do MVP sem autorizar publicação ou descarte de arquivos',async()=>{
  const {nextProjectAction,implementationRequest}=await import('../../src/sandubah-desktop/guided-workspace.mjs');
  const project={goal:'Pedidos de demonstração',missions:[]},lifecycle={summary:{currentStage:'mvp'},stages:[{id:'mvp',title:'MVP',items:[{done:false,title:'Persistir sem duplicação'}]}]};
  assert.equal(nextProjectAction({project,preview:{entry:'index.html'},lifecycle}).action,'build');const prompt=implementationRequest({project,lifecycle});assert.match(prompt,/Persistir sem duplicação/);assert.match(prompt,/Preserve o projeto/);assert.match(prompt,/Não publique/);assert.match(prompt,/Não marque etapas/);assert.ok(prompt.length<4000);
});
