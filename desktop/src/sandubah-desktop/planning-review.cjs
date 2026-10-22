'use strict';
const {randomUUID}=require('node:crypto');

function planningReview(request,parameters){
  const selection=request.arguments.selection,provider=selection.provider==='codex'?'Codex':'Claude';
  const model=selection.model.replace(/^gpt-[\d.]+-/,'').replace(/^claude-/,'').replace(/-/g,' ').replace(/(\d) (\d)/g,'$1.$2').replace(/\b\w/g,letter=>letter.toUpperCase());
  const effort={low:'Baixa',medium:'Média',high:'Alta',xhigh:'Extra',max:'Máxima'}[selection.effort]||'Automática';
  return {title:`Planejar com ${provider}?`,provider,model,effort,projectOptions:request.arguments.planningOptions,project:request.projectName||'Nova ideia',prompt:request.arguments.prompt,history:request.arguments.history||[],context:request.arguments.context||'',attachments:request.arguments.attachments||[],sources:request.contextInfo?.included||[],mode:request.contextInfo?.mode==='complete'?'Completo':request.contextInfo?.mode==='economic'?'Econômico':'Contexto do projeto',notice:`Sua mensagem, documentos e anexos listados serão enviados à sua conta ${provider}. Esta conversa pode consumir sua cota${selection.model.includes('fable')?' ou créditos extras':''}.`,parameters};
}

class PlanningReview{
  constructor(send){this.send=send;this.pending=null;}
  ask(review){
    if(this.pending)throw new Error('Já existe uma confirmação aguardando sua escolha.');
    return new Promise((resolve,reject)=>{
      const id=randomUUID();this.pending={id,resolve};
      try{this.send({...review,id});}catch(error){this.pending=null;reject(error);}
    });
  }
  respond(payload){
    if(!this.pending||payload?.id!==this.pending.id||typeof payload.approved!=='boolean')throw new Error('Esta confirmação não está mais disponível.');
    const pending=this.pending;this.pending=null;pending.resolve(payload.approved);return {accepted:true};
  }
  cancel(){if(this.pending){const pending=this.pending;this.pending=null;pending.resolve(false);}}
}
function executionReview(request,parameters){
  const missions=request.arguments.missions;
  return {title:'Construir e testar este projeto?',intro:'O agente vai trabalhar no projeto aqui mesmo. Você acompanha arquivos, etapas e a prévia ao lado da conversa.',approvalLabel:'Construir e testar',provider:'Codex',model:missions[0].model,effort:'Do executor',project:request.projectName||request.entry.name,prompt:missions.map(mission=>mission.title).join('\n'),history:[],context:missions.map(mission=>mission.instructions).join('\n\n'),attachments:request.arguments.attachments||[],sources:[],mode:'Markdown do projeto',notice:'Usa sua conta Codex e pode consumir cota. O agente pode criar, alterar e remover arquivos apenas no workspace privado deste projeto, com um worker. Não altera gateway, configurações globais, Corel ou impressão. Nenhuma execução é repetida automaticamente.',parameters};
}
module.exports={PlanningReview,planningReview,executionReview};
