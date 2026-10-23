'use strict';

const {createHash,randomUUID}=require('node:crypto');
const {existsSync,readFileSync,statSync}=require('node:fs');
const {join}=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const hash=value=>createHash('sha256').update(value).digest('hex');
const forbidden=new Set(['__proto__','constructor','prototype']);
const labels=Object.freeze({review:'Candidato apto à revisão',baseline:'Manter a base atual',reject:'Recusar os dois resultados',blocked:'Candidato bloqueado'});
function parseJson(content){
  if(typeof content!=='string'||Buffer.byteLength(content)>64000)throw new Error('Use JSON de até 64 KB; nada será cortado.');
  let value;try{value=JSON.parse(content);}catch{throw new Error('Arquivo JSON inválido.');}
  function visit(item,depth=0){if(depth>16)throw new Error('JSON aninhado demais.');if(typeof item==='number'&&!Number.isFinite(item))throw new Error('Número JSON fora do limite.');if(item&&typeof item==='object')for(const [key,child]of Object.entries(item)){if(forbidden.has(key))throw new Error('Chave de protótipo não permitida.');visit(child,depth+1);}}
  visit(value);return value;
}
function contractFrom(content){
  const value=parseJson(content);
  if(!value||!Array.isArray(value.checks)||value.checks.length<1||value.checks.length>50)throw new Error('Defina de 1 a 50 critérios no campo checks.');
  const ids=new Set();
  for(const check of value.checks){
    if(!check||typeof check.id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(check.id)||ids.has(check.id)||typeof check.path!=='string'||!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(check.path)||check.path.split('.').some(part=>forbidden.has(part))||typeof check.critical!=='boolean'||!Object.hasOwn(check,'expected'))throw new Error('Cada critério precisa de id único, path, expected e critical booleano.');
    if(check.path.length>200)throw new Error('Caminho de critério muito longo.');ids.add(check.id);
  }
  if(!value.checks.some(check=>check.critical))throw new Error('Marque ao menos um critério crítico.');
  return {checks:value.checks.map(({id,path,expected,critical})=>({id,path,expected,critical}))};
}
function lookup(value,path){for(const part of path.split('.')){if(!value||typeof value!=='object'||!Object.hasOwn(value,part))return {present:false};value=value[part];}return {present:true,value};}
function compareValues(contract,baseline,candidate){
  const checks=contract.checks.map(check=>{const before=lookup(baseline,check.path),after=lookup(candidate,check.path);return {...check,baseline:before.present&&isDeepStrictEqual(before.value,check.expected),candidate:after.present&&isDeepStrictEqual(after.value,check.expected),baselinePresent:before.present,candidatePresent:after.present};});
  const baselinePassed=checks.filter(check=>check.baseline).length,candidatePassed=checks.filter(check=>check.candidate).length;
  const gains=checks.filter(check=>!check.baseline&&check.candidate).length,regressions=checks.filter(check=>check.baseline&&!check.candidate).length;
  const baselineSafe=checks.every(check=>!check.critical||check.baseline),candidateSafe=checks.every(check=>!check.critical||check.candidate);
  const decision=candidateSafe&&!regressions&&gains?'review':baselineSafe?'baseline':candidateSafe?'blocked':'reject';
  return {checks,total:checks.length,baselinePassed,candidatePassed,gains,regressions,decision,label:labels[decision],adopted:false};
}
function compareArtifacts(projects,id,input){
  projects.get(id);
  if(!input||typeof input.baseline!=='string'||typeof input.candidate!=='string'||typeof input.contract!=='string'||new Set([input.baseline,input.candidate,input.contract]).size!==3)throw new Error('Selecione três arquivos distintos: critérios, base e candidato.');
  const files={};for(const key of ['contract','baseline','candidate']){
    if(!/\.json$/i.test(input[key]))throw new Error('A comparação local aceita somente resultados JSON do workspace.');
    const artifact=projects.artifact(id,input[key]);files[key]={path:artifact.path,sha256:artifact.version,content:artifact.content};
  }
  const contract=contractFrom(files.contract.content),result=compareValues(contract,parseJson(files.baseline.content),parseJson(files.candidate.content));
  const sources=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,{path:file.path,sha256:file.sha256}]));
  return {schema:1,projectId:id,...result,sources,fingerprint:hash(JSON.stringify({id,sources,contract})),workerLimit:1,modelCalls:0,usage:null,scope:'Validação determinística dos arquivos JSON selecionados. Não executa o app, não verifica a origem das saídas nem mede qualidade de LLM. Mesma tarefa/modelo/força e procedência dos resultados exigem revisão humana.',learning:'Proposta apenas; não promovida ao Cérebro.'};
}
function receipts(projects,id){
  projects.get(id);const filename=join(projects.location(id),'x-tudo-receipts.json');projects.guard(filename);
  if(!existsSync(filename))return [];
  if(statSync(filename).size>512000)throw new Error('Histórico X-Tudo maior que o limite.');
  const values=JSON.parse(readFileSync(filename,'utf8'));if(!Array.isArray(values)||values.length>40)throw new Error('Histórico X-Tudo inválido.');return values;
}
function saveComparison(projects,id,input,fingerprint){
  const result=compareArtifacts(projects,id,input);
  if(result.fingerprint!==fingerprint)throw new Error('Os arquivos mudaram após a revisão. Compare novamente; nada foi salvo.');
  const history=receipts(projects,id),existing=history.find(item=>item.fingerprint===fingerprint);
  if(existing)return {...existing,reused:true};
  if(history.length>=40)throw new Error('Limite de 40 comparações por projeto; os recibos anteriores foram preservados.');
  const receipt={...result,id:randomUUID(),createdAt:new Date().toISOString()};
  const content=JSON.stringify([receipt,...history],null,2)+'\n';if(Buffer.byteLength(content)>512000)throw new Error('Histórico X-Tudo atingiu 512 KB; nada foi removido ou cortado.');
  projects.write(join(projects.location(id),'x-tudo-receipts.json'),content);return receipt;
}
async function confirmedComparison({projects,id,input,confirm,isBusy=()=>false}){
  if(isBusy())throw new Error('Aguarde o worker antes de comparar.');
  const preview=compareArtifacts(projects,id,input);
  if(!await confirm(preview))return {cancelled:true};
  if(isBusy())throw new Error('Um worker iniciou durante a revisão. Aguarde e compare novamente.');
  return saveComparison(projects,id,input,preview.fingerprint);
}
module.exports={labels,parseJson,contractFrom,compareValues,compareArtifacts,receipts,saveComparison,confirmedComparison};
