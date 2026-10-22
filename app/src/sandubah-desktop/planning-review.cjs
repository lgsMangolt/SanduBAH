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
function gauchoReview(request,parameters){
  const review=planningReview(request,parameters),lessons=request.arguments.lessons||{};
  const omitted=lessons.lessonsOmitted?` ${lessons.lessonsOmitted} lição(ões) mais antiga(s) ficaram de fora por limite de tamanho.`:'';
  return {...review,title:`Conversar com ${request.projectName}?`,intro:`${lessons.lessonsIncluded||0} de ${lessons.lessonsTotal||0} lições e ${lessons.documents||0} documento(s) da base dele entram nesta mensagem, cerca de ${(lessons.estimatedTokens||0).toLocaleString('pt-BR')} tokens estimados.${omitted}`,approvalLabel:'Enviar ao gauchinho',projectOptions:null,mode:'Lições e base do gauchinho',contextLabel:`${lessons.lessonsIncluded||0} lições · ${lessons.documents||0} documento(s) da base`,notice:`Sua mensagem, as lições e os trechos listados serão enviados à sua conta ${review.provider}. Pode consumir cota. Nada do Cérebro entra sem importação.`};
}
function gauchoTaskReview(request,parameters){
  const review=gauchoReview(request,parameters),lessons=request.arguments.lessons||{};
  return {...review,title:`Dar esta tarefa a ${request.projectName}?`,intro:`${lessons.lessonsIncluded||0} de ${lessons.lessonsTotal||0} lições e ${lessons.documents||0} documento(s) inteiros da tarefa vão junto, cerca de ${(lessons.estimatedTokens||0).toLocaleString('pt-BR')} tokens estimados.${lessons.lessonsOmitted?` ${lessons.lessonsOmitted} lição(ões) mais antiga(s) ficaram de fora por limite de tamanho.`:''} A entrega é só texto: nada é executado nem alterado.`,approvalLabel:'Enviar a tarefa',contextLabel:`${lessons.lessonsIncluded||0} lições · ${lessons.documents||0} documento(s) da tarefa`};
}
function gauchoToolsReview(request,parameters){
  const review=gauchoTaskReview(request,parameters),rules=request.arguments.rules||{},skills=request.arguments.skills||[];
  const access=rules.mode==='write'?'ler e escrever na pasta dele':'só ler a pasta dele';
  return {...review,title:`Deixar ${request.projectName} trabalhar com ferramentas?`,intro:`Ele vai ${access}, numa cópia de ensaio, pelo Codex com sandbox e sem rede, por até ${rules.timeoutMinutes} minuto(s) e mudando no máximo ${rules.maxFiles} arquivo(s)${rules.blockExecutables?', sem criar executáveis':''}. ${skills.length?`Skills liberadas: ${skills.join(', ')}. `:''}Nada chega à pasta dele sem a sua revisão; se passar de um limite, o ensaio é descartado.`,approvalLabel:'Começar o ensaio',mode:'Ferramentas supervisionadas',contextLabel:`${rules.mode==='write'?'Ler e escrever':'Só leitura'} · ${skills.length} skill(s)`,notice:`Usa sua conta Codex e pode consumir cota. O pedido, as lições, os documentos e as skills listadas vão para o Codex. Configurações globais, gateway e credenciais não são alterados.`};
}
module.exports={PlanningReview,planningReview,executionReview,gauchoReview,gauchoTaskReview,gauchoToolsReview};
