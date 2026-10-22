const test=require('node:test');
const assert=require('node:assert/strict');
const {plannerReceipt,createReceiptEmitter}=require('../../src/sandubah-desktop/planner-events.cjs');
test('recebimento e leitura dependem de eventos do modelo, não de início do processo',()=>{
  assert.equal(plannerReceipt('claude',{type:'system',subtype:'init'}),null);
  assert.equal(plannerReceipt('claude',{type:'result',is_error:true}),null);
  assert.equal(plannerReceipt('codex',{type:'thread.started'}),null);
  assert.equal(plannerReceipt('codex',{type:'turn.started'}),null);
  assert.equal(plannerReceipt('codex',{type:'item.started',item:{type:'reasoning'}}),'delivered');
  assert.equal(plannerReceipt('codex',{type:'item.updated',item:{type:'reasoning'}}),'read');
  assert.equal(plannerReceipt('claude',{type:'stream_event',event:{type:'message_start'}}),'delivered');
  assert.equal(plannerReceipt('claude',{type:'stream_event',event:{type:'content_block_delta'}}),'read');
  assert.equal(plannerReceipt('claude',{type:'assistant',isApiErrorMessage:true,message:{role:'assistant'}}),null);
  assert.equal(plannerReceipt('local',{type:'progress',message:'Carregando modelo'}),null);
  assert.equal(plannerReceipt('local',{type:'progress',message:'Gerando resposta em português.'}),'delivered');
  assert.equal(plannerReceipt('local',{type:'progress',message:'Gerando resposta: 0 tokens · 1 s.'}),null);
  assert.equal(plannerReceipt('local',{type:'progress',message:'Gerando resposta: 1 tokens · 1 s.'}),'read');
});
test('eventos duplicados, atrasados ou desconhecidos não fazem os recibos retroceder',async()=>{
  const events=[],emit=createReceiptEmitter(event=>events.push(event));
  for(const status of ['sent','sent','delivered',null,'read','sent','read'])emit(status);
  assert.deepEqual(events.map(event=>event.status),['sent','delivered','read']);
  const {advanceReceipt,receiptView}=await import('../../src/sandubah-desktop/planner-receipts.mjs');
  assert.equal(advanceReceipt('read','sent'),'read');assert.equal(advanceReceipt('sent','inventado'),'sent');
  assert.equal(receiptView({receipt:'sent'}).ticks,1);assert.equal(receiptView({receipt:'delivered'}).ticks,2);assert.equal(receiptView({receipt:'delivered'}).blue,false);assert.equal(receiptView({receipt:'read'}).blue,true);
  assert.equal(receiptView({delivery:'cancelled'}).ticks,0);assert.equal(receiptView({delivery:'failed',receipt:'sent'}).blue,false);assert.match(receiptView({delivery:'failed',receipt:'read'}).note,/preservada/);
});
