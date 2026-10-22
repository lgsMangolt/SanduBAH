const ranks={queued:0,sent:1,delivered:2,read:3};
export function advanceReceipt(current='queued',next){return ranks[next]>ranks[current]?next:current;}
export function receiptView(message){
  const receipt=message.receipt||(message.delivery==='answered'?'read':'queued');
  const labels={queued:'Aguardando envio e confirmação',sent:'Enviada ao worker; aguardando recebimento pelo modelo',delivered:'Recebida pelo modelo',read:'Visualizada · o modelo iniciou a resposta'};
  const note={sending:'',failed:'Resposta não concluída · sua mensagem foi preservada.',cancelled:'Envio cancelado.'}[message.delivery]||'';
  return {receipt,ticks:receipt==='read'||receipt==='delivered'?2:receipt==='sent'?1:0,blue:receipt==='read',label:labels[receipt]||labels.queued,note};
}
