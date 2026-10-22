'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PlanningReview,planningReview,executionReview}=require('../../src/sandubah-desktop/planning-review.cjs');

test('approval is single-use, explicit and bound to the pending request',async()=>{
  let sent;const broker=new PlanningReview(review=>{sent=review;});
  const result=broker.ask({title:'Planejar?'});
  assert.throws(()=>broker.ask({}),/aguardando/);
  assert.throws(()=>broker.respond({id:'other',approved:true}));
  assert.throws(()=>broker.respond({id:sent.id,approved:'true'}));
  broker.respond({id:sent.id,approved:true});assert.equal(await result,true);
  assert.throws(()=>broker.respond({id:sent.id,approved:true}));
});
test('closing or navigating cancels and stale approvals cannot approve the next request',async()=>{
  let sent;const broker=new PlanningReview(review=>{sent=review;});
  const first=broker.ask({});const oldId=sent.id;broker.cancel();assert.equal(await first,false);
  const next=broker.ask({});assert.throws(()=>broker.respond({id:oldId,approved:true}));
  broker.respond({id:sent.id,approved:false});assert.equal(await next,false);
});
test('delivery failure leaves no pending approval',async()=>{
  const broker=new PlanningReview(()=>{throw new Error('closed');});
  await assert.rejects(broker.ask({}),/closed/);assert.equal(broker.pending,null);
});
test('friendly summary retains complete context and history for review',()=>{
  const context='Markdown completo\n'.repeat(4000)+'FINAL';
  const history=[{role:'user',content:'Histórico integral'}];
  const review=planningReview({projectName:'SanduBAH',arguments:{selection:{provider:'claude',model:'claude-opus-5-5'},prompt:'Planejar',context,history},contextInfo:{mode:'complete',included:[{citation:'S1',label:'MEMORY.md'}]}},'{"technical":true}');
  assert.equal(review.title,'Planejar com Claude?');assert.equal(review.model,'Opus 5.5');assert.equal(review.mode,'Completo');assert.equal(review.context,context);assert.deepEqual(review.history,history);assert.equal(review.sources.length,1);
});

test('code execution review states side effects and retains the protected execution gate',()=>{
  const review=executionReview({entry:{name:'Projeto de teste'},arguments:{missions:[{title:'Construir página',model:'Luna',instructions:'Criar arquivos e testar'}]}},'{"workerLimit":1}');
  assert.equal(review.approvalLabel,'Construir e testar');assert.match(review.notice,/criar, alterar e remover/);assert.match(review.notice,/workspace privado/);assert.equal(review.context,'Criar arquivos e testar');assert.equal(review.parameters,'{"workerLimit":1}');
});
