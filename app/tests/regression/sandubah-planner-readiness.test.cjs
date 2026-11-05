'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DesktopController}=require('../../src/sandubah-desktop/backend.cjs');
const {executionReview}=require('../../src/sandubah-desktop/planning-review.cjs');
const selection={provider:'codex',model:'fixture-luna',effort:'low'};
const models=[{id:'fixture-luna',name:'Luna fictício',effortLevels:['low','medium']}];
function blockedController(current=selection,catalog=models){
  const controller=Object.create(DesktopController.prototype);
  controller.active=null;
  controller.cloud={selection:{...current},models:()=>catalog};
  controller.projects=new Proxy({}, {get(){throw new Error('Não deve acessar ou gravar projetos antes de validar a seleção.');}});
  return controller;
}

test('confirmação mostra a força efetiva sem presumir um valor ausente',()=>{
  const request={entry:{name:'Projeto fictício'},arguments:{missions:[{title:'Teste fictício',model:'fixture-luna',effort:'low',instructions:'Criar uma tela fictícia.'}]}};
  assert.equal(executionReview(request,'{}').effort,'Baixa');
  delete request.arguments.missions[0].effort;
  assert.match(executionReview(request,'{}').effort,/Não informada/);
  request.arguments.missions.push({effort:'medium'});
  assert.match(executionReview(request,'{}').effort,/Por missão/);
});

test('construção recusa Claude e local antes de criar projeto ou preparar arquivos',async()=>{
  for(const provider of ['claude','local']){
    const chosen={provider,model:'fixture',effort:null};
    await assert.rejects(blockedController(chosen).buildProject({prompt:'Protótipo fictício',selection:chosen}),/Selecione Codex explicitamente/);
  }
});

test('construção rejeita seleção ausente ou desatualizada sem tocar o projeto',async()=>{
  for(const chosen of [undefined,{},null,{...selection,provider:'claude'},{...selection,model:'outro'},{...selection,effort:'medium'}]){
    await assert.rejects(blockedController().buildProject({projectId:'fixture',prompt:'Protótipo fictício',selection:chosen}),/seleção da IA mudou|Confirme a seleção/i);
  }
});

test('construção rejeita modelo removido e força inválida sem tocar o projeto',async()=>{
  await assert.rejects(blockedController(selection,[]).buildProject({prompt:'Protótipo fictício',selection}),/Modelo executor ou força/);
  for(const effort of ['max',0,false,'']){
    const chosen={...selection,effort};
    await assert.rejects(blockedController(chosen).buildProject({prompt:'Protótipo fictício',selection:chosen}),/Modelo executor ou força/);
  }
});

test('primeiro uso distingue planejamento, construção e presença local de login',async()=>{
  const {plannerReadiness}=await import('../../src/sandubah-desktop/planner-readiness.mjs');
  const provider={id:'codex',installed:true,authenticated:true,models};
  const cloud={selection,providers:[provider]};
  const view=plannerReadiness({cloud,ready:true,action:'code',projectName:'Projeto fictício'});
  assert.equal(view.canSubmit,true);
  assert.match(view.title,/revisar e confirmar/i);
  assert.match(view.checks.find(item=>item.id==='account').detail,/não comprova/);
  assert.equal(view.checks.find(item=>item.id==='account').state,'unverified');
  assert.match(view.cost,/cota/);
  assert.match(view.scope,/não são publicação/);
  assert.equal(plannerReadiness({cloud,ready:true,action:'plan'}).canSubmit,true);
});

test('prontidão falha fechada para seleção incompatível, indisponível ou consulta falha',async()=>{
  const {plannerReadiness}=await import('../../src/sandubah-desktop/planner-readiness.mjs');
  const providers=[{id:'codex',installed:true,authenticated:true,models},{id:'claude',installed:true,authenticated:true,models}];
  for(const provider of ['claude','local']){
    const view=plannerReadiness({cloud:{selection:{...selection,provider},providers},ready:true,action:'code'});
    assert.equal(view.canSubmit,false);
    assert.match(view.reason,/escolha Codex explicitamente/);
  }
  for(const changed of [{installed:false},{authenticated:false},{models:[]}]){
    const cloud={selection,providers:[{...providers[0],...changed}]};
    assert.equal(plannerReadiness({cloud,ready:true,action:'code'}).canSubmit,false);
    assert.equal(plannerReadiness({cloud,ready:true,action:'plan'}).canSubmit,false);
  }
  const cloud={selection,providers};
  assert.equal(plannerReadiness({cloud,ready:true,statusError:'Falha de leitura',action:'code'}).canSubmit,false);
  assert.equal(plannerReadiness({ready:true,action:'code'}).canSubmit,false);
  assert.equal(plannerReadiness({cloud:{selection:{provider:'desconhecido'},providers},ready:true,action:'plan'}).canSubmit,false);
});

test('modelo local depende da validação e não promete IA gratuita ou análise integral de vídeos',async()=>{
  const {plannerReadiness}=await import('../../src/sandubah-desktop/planner-readiness.mjs');
  const cloud={selection:{provider:'local'},providers:[]};
  assert.equal(plannerReadiness({cloud,ready:false}).canSubmit,false);
  const view=plannerReadiness({cloud,ready:true});
  assert.equal(view.canSubmit,true);
  assert.match(view.cost,/hardware/);
  assert.match(view.media,/áudio não analisado/);
  assert.match(view.checks.find(item=>item.id==='account').detail,/memória/);
});
