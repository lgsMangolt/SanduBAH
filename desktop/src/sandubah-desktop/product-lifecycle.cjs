'use strict';
const {existsSync,lstatSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const DEFINITIONS=[
  {id:'planning',title:'Planejamento',items:[['purpose','Objetivo, público e problema definidos'],['scope','Escopo e critérios de aceite documentados'],['flow','Fluxo, dados e integrações mapeados']]},
  {id:'prototype',title:'Protótipo',items:[['flow','Fluxo principal demonstrável com dados de teste'],['tests','Testes do protótipo aprovados com evidências'],['review','Protótipo revisado e aceito pelo responsável']]},
  {id:'mvp',title:'MVP',items:[['data','Persistência, autenticação e permissões validadas'],['integrations','Integrações essenciais testadas em ambiente controlado'],['acceptance','Fluxo mínimo validado por usuários e critérios de aceite']]},
  {id:'production',title:'Produção',items:[['deployment','Implantação e configuração revisadas'],['recovery','Segurança, backups e recuperação testados'],['operations','Monitoramento, operação e aprovação de produção registrados']]},
];
const text=(value,maximum)=>typeof value==='string'&&value.trim().length>0&&value.length<=maximum&&!value.includes('\0');
function validate(document,key){
  if(!document||document.version!==1||document.projectKey!==key||!Number.isSafeInteger(document.revision)||document.revision<0||!Array.isArray(document.stages)||document.stages.length!==4||!Array.isArray(document.history)||document.history.length>200)throw new Error('Checklist de produto inválido. Os dados salvos foram preservados.');
  for(const [index,definition]of DEFINITIONS.entries()){
    const stage=document.stages[index];
    if(stage?.id!==definition.id||stage.title!==definition.title||!Array.isArray(stage.items)||stage.items.length<1||stage.items.length>40)throw new Error('Etapa de produto inválida.');
    const ids=new Set();
    for(const item of stage.items){
      if(!item||!text(item.id,80)||ids.has(item.id)||!text(item.title,240)||typeof item.done!=='boolean'||typeof item.evidence!=='string'||item.evidence.length>2000||(item.done&&(!text(item.evidence,2000)||item.evidence.trim().length<8||!Number.isFinite(Date.parse(item.checkedAt)))))throw new Error('Critério ou evidência inválida.');
      ids.add(item.id);
    }
  }
  return document;
}
function summary(document){
  let prerequisites=true,current=null;
  const stages=document.stages.map(stage=>{
    const done=stage.items.filter(item=>item.done).length,total=stage.items.length,available=prerequisites;
    if(available)current=stage;
    const status=!available?'blocked':done===total?'done':done?'active':'pending';
    prerequisites=prerequisites&&done===total;
    return {id:stage.id,title:stage.title,done,total,progress:Math.round(done/total*100),status};
  });
  const done=stages.reduce((sum,stage)=>sum+stage.done,0),total=stages.reduce((sum,stage)=>sum+stage.total,0);
  return {revision:document.revision,reviewed:document.revision>0,currentStage:document.revision>0?current?.id||'planning':null,currentLabel:document.revision>0?current?.title||'Planejamento':'Etapa ainda não revisada',done,total,progress:Math.round(done/total*100),stages};
}
class ProductLifecycle{
  constructor({directory,guard,write,hasSecret=()=>false}){this.directory=directory;this.guard=guard;this.write=write;this.hasSecret=hasSecret;}
  filename(key){if(!text(key,200))throw new Error('Projeto inválido.');const filename=join(this.directory,'lifecycle',createHash('sha256').update(key).digest('hex')+'.json');this.guard(filename);return filename;}
  read(key){
    const filename=this.filename(key);
    if(!existsSync(filename))return {version:1,projectKey:key,revision:0,updatedAt:null,stages:DEFINITIONS.map(stage=>({id:stage.id,title:stage.title,items:stage.items.map(([id,title])=>({id,title,done:false,evidence:'',checkedAt:null}))})),history:[]};
    const info=lstatSync(filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink>1||info.size>256000)throw new Error('Checklist local indisponível; nada foi substituído.');
    const saved=JSON.parse(readFileSync(filename,'utf8'));if(this.hasSecret(JSON.stringify(saved)))throw new Error('Possível segredo no checklist; leitura bloqueada.');return validate(saved,key);
  }
  update(key,input){
    const current=this.read(key);
    if(!input||input.revision!==current.revision)throw new Error('O checklist mudou em outra janela. Reabra as etapas antes de salvar.');
    if(current.revision>=Number.MAX_SAFE_INTEGER||current.history.length>=200)throw new Error('O histórico chegou ao limite. Preserve e revise os registros antes de continuar.');
    const next=JSON.parse(JSON.stringify(current)),stage=next.stages.find(candidate=>candidate.id===input.stageId);
    if(!stage)throw new Error('Etapa desconhecida.');
    const timestamp=new Date().toISOString();let item;
    if(input.operation==='add'){
      if(stage.items.length>=40||!text(input.title,240)||this.hasSecret(input.title))throw new Error('Use um critério sem segredos, até 240 caracteres; limite de 40 por etapa.');
      item={id:randomUUID(),title:input.title.trim(),done:false,evidence:'',checkedAt:null};stage.items.push(item);
    }else if(input.operation==='check'){
      item=stage.items.find(candidate=>candidate.id===input.itemId);
      if(!item||typeof input.done!=='boolean'||typeof input.evidence!=='string'||input.evidence.length>2000||input.evidence.includes('\0')||this.hasSecret(input.evidence)||(input.done&&input.evidence.trim().length<8))throw new Error('Inclua uma evidência de pelo menos 8 caracteres, sem segredos, para concluir o critério.');
      const stageIndex=next.stages.indexOf(stage);
      if(input.done&&next.stages.slice(0,stageIndex).some(previous=>previous.items.some(criterion=>!criterion.done)))throw new Error('Conclua os critérios das etapas anteriores antes de avançar.');
      item.done=input.done;item.evidence=input.evidence.trim();item.checkedAt=input.done?timestamp:null;
    }else throw new Error('Operação de checklist inválida.');
    next.revision++;next.updatedAt=timestamp;next.history.push({at:timestamp,stageId:stage.id,itemId:item.id,operation:input.operation,done:item.done,evidence:item.evidence});
    validate(next,key);const serialized=JSON.stringify(next,null,2);if(Buffer.byteLength(serialized)>256000)throw new Error('Checklist maior que 256 KB; nenhum conteúdo foi cortado.');
    this.write(this.filename(key),serialized);return this.present(next);
  }
  present(document){return {...document,summary:summary(document)};}
  get(key){return this.present(this.read(key));}
  context(key){
    const document=this.read(key),state=summary(document);
    return `Etapas do produto (separadas das missões): ${state.currentLabel}. ${state.done}/${state.total} critérios marcados após revisão; não é estimativa de prazo nem autorização de execução.\n`+document.stages.map(stage=>`## ${stage.title}\n`+stage.items.map(item=>`- [${item.done?'x':' '}] ${item.title}${item.evidence?' — Evidência registrada: '+item.evidence:''}`).join('\n')).join('\n');
  }
}
module.exports={ProductLifecycle,summary};
