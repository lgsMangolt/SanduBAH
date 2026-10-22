'use strict';
const CRITERIA=[
  'Persistência · SQLite transacional para pedidos, itens, entregas, fechamentos e migrações',
  'Persistência · reabrir e repetir operações sem perder dados nem duplicar pedidos ou acertos',
  'Persistência · backup e restauração validados em cópia temporária, sem tocar em dados originais',
  'Permissões · autenticação local, sessão expirada e negação de acesso por padrão',
  'Permissões · administrador, operador e entregador com escopo validado no backend',
  'Permissões · auditoria sem segredos e confirmação para ações sensíveis',
  'WhatsApp · adaptador oficial e fixtures de webhook com validação de assinatura',
  'WhatsApp · reentregas e eventos fora de ordem não duplicam pedidos nem regridem estados',
  'WhatsApp · número oficial de teste e envios somente após nova autorização explícita',
];
function prepareMvp({library,projectId,approval}){
  if(typeof approval!=='string'||approval.trim().length<8)throw new Error('O aceite explícito precisa estar registrado.');
  const id='harness:'+projectId;let document=library.lifecycle(id);
  const prototype=document.stages.find(stage=>stage.id==='prototype'),review=prototype.items.find(item=>item.id==='review');
  if(!review.done){
    if(document.history.some(entry=>entry.stageId==='prototype'&&entry.itemId==='review'&&entry.done))throw new Error('O aceite foi reaberto. Não reutilize uma aprovação antiga.');
    document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:'prototype',itemId:'review',done:true,evidence:approval});
  }
  for(const title of CRITERIA)if(!document.stages.find(stage=>stage.id==='mvp').items.some(item=>item.title===title))document=library.updateLifecycle(id,{revision:document.revision,operation:'add',stageId:'mvp',title});
  for(const [itemId,section]of [['data','Persistência e permissões'],['integrations','WhatsApp oficial'],['acceptance','Aceite do MVP']]){
    const item=document.stages.find(stage=>stage.id==='mvp').items.find(candidate=>candidate.id===itemId);
    if(!item.evidence&&!item.done)document=library.updateLifecycle(id,{revision:document.revision,operation:'check',stageId:'mvp',itemId,done:false,evidence:`Planejado, não implementado nem validado: workspace/MVP-PLAN.md — ${section}.`});
  }
  return document;
}
module.exports={prepareMvp,CRITERIA};
