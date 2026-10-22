'use strict';
function plannerReceipt(provider,event){
  if(provider==='codex'){
    if(event.type==='item.started'&&['reasoning','agent_message'].includes(event.item?.type))return 'delivered';
    if(['item.updated','item.completed'].includes(event.type)&&['reasoning','agent_message'].includes(event.item?.type))return 'read';
  }
  if(provider==='claude'){
    if(event.type==='stream_event'&&event.event?.type==='message_start')return 'delivered';
    if(event.type==='stream_event'&&['content_block_start','content_block_delta'].includes(event.event?.type))return 'read';
    if(event.type==='assistant'&&!event.error&&!event.isApiErrorMessage&&event.message?.role==='assistant')return 'read';
  }
  if(provider==='local'&&event.type==='progress'){
    if(/^Gerando resposta: [1-9]\d* tokens?\b/.test(event.message))return 'read';
    if(['Gerando resposta em português.','Lendo o diagrama e gerando resposta.'].includes(event.message))return 'delivered';
  }
  return null;
}
function createReceiptEmitter(onEvent){
  const ranks={sent:1,delivered:2,read:3};let current=0;
  return status=>{if(ranks[status]>current){current=ranks[status];onEvent({type:'delivery',status});}};
}
module.exports={plannerReceipt,createReceiptEmitter};
