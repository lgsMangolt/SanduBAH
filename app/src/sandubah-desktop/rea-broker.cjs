'use strict';
const {createInterface}=require('node:readline');
const {writeFileSync}=require('node:fs');
const {join}=require('node:path');
const {loadManifest,executeAnalysis,TOOL,VERSION}=require('./rea-executor.cjs');
function createBroker(filename,digest,analyze=executeAnalysis){
  const manifest=loadManifest(filename,digest);let cached=null,calls=0;
  return async request=>{
    const response=result=>({jsonrpc:'2.0',id:request.id,result});
    const failure=(code,message)=>({jsonrpc:'2.0',id:request.id,error:{code,message}});
    if(request.id===undefined)return null;
    if(request.method==='initialize')return response({protocolVersion:request.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'sandubah-rea-scoped',version:VERSION}});
    if(request.method==='ping')return response({});
    if(request.method==='tools/list')return response({tools:[{name:TOOL,description:'REA estático para o único artefato aprovado nesta missão. Não executa o app. Máximo uma análise; repetições devolvem a mesma evidência. input_path deve ser o alvo relativo aprovado: '+manifest.target,inputSchema:{type:'object',properties:{input_path:{type:'string',enum:[manifest.target]}},required:['input_path'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}]});
    if(request.method!=='tools/call')return failure(-32601,'Operação fora do escopo REA desta missão.');
    const args=request.params?.arguments;
    if(request.params?.name!==TOOL||!args||Object.keys(args).length!==1||args.input_path!==manifest.target)return failure(-32602,'Somente o alvo e a ferramenta aprovados são permitidos.');
    try{
      loadManifest(filename,digest);
      if(!cached){if(calls>=manifest.callLimit)throw new Error('Limite de análise atingido; nenhuma repetição automática.');calls++;const result=await analyze(manifest);writeFileSync(join(manifest.runDirectory,'rea-evidence.json'),JSON.stringify({at:new Date().toISOString(),version:VERSION,tool:TOOL,target:manifest.target,targetHash:manifest.targetHash,calls,evidence:result.evidence},null,2));cached={content:[{type:'text',text:result.raw}]};}
      return response(cached);
    }catch(error){return response({isError:true,content:[{type:'text',text:error.message}]});}
  };
}
module.exports={createBroker};
if(require.main===module){
  try{
    const dispatch=createBroker(process.argv[2],process.argv[3]),input=createInterface({input:process.stdin,crlfDelay:Infinity});let chain=Promise.resolve();
    input.on('line',line=>{chain=chain.then(async()=>{if(Buffer.byteLength(line)>64000)throw new Error('Pedido REA maior que 64 KB.');let request;try{request=JSON.parse(line);}catch{return;}const response=await dispatch(request);if(response)process.stdout.write(JSON.stringify(response)+'\n');}).catch(error=>{process.stderr.write(error.message+'\n');input.close();process.exitCode=1;});});
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
