'use strict';
const {existsSync,lstatSync,readdirSync,readFileSync,realpathSync,mkdirSync,writeFileSync}=require('node:fs');
const {join,resolve,relative,isAbsolute,dirname,sep}=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const VERSION='6.1.0',TOOL='analyze_javascript_application';
const hash=value=>createHash('sha256').update(value).digest('hex');
function installation(cache=join(process.env.LOCALAPPDATA||'','npm-cache/_npx')){
  if(!isAbsolute(cache)||!existsSync(cache))return null;
  for(const name of readdirSync(cache).sort()){
    const root=join(cache,name,'node_modules/rea-agents'),filename=join(root,'package.json'),entry=join(root,'scripts/rea.mjs');
    try{if(lstatSync(join(cache,name)).isSymbolicLink()||lstatSync(root).isSymbolicLink())continue;const metadata=JSON.parse(readFileSync(filename,'utf8'));if(metadata.name!=='rea-agents'||metadata.version!==VERSION||!lstatSync(entry).isFile())continue;return {root:realpathSync(root),entry:realpathSync(entry),version:VERSION,entryHash:hash(readFileSync(entry)),packageHash:hash(readFileSync(filename))};}catch{}
  }
  return null;
}
function targetFiles(projects,id,target){
  if(typeof target!=='string'||!target||isAbsolute(target)||target.includes('\\')||target.includes(':')||target.split('/').some(part=>!part||part.startsWith('.')))throw new Error('REA: use um caminho relativo do workspace, sem links ou travessia.');
  const workspace=projects.workspace(id),input=join(workspace,target);projects.guard(input);const info=lstatSync(input);
  if(!info.isDirectory()&&!target.endsWith('.asar'))throw new Error('REA: selecione um ASAR ou uma pasta de JavaScript extraído do workspace.');
  const files=[];let bytes=0;
  function visit(filename,path,depth){
    if(depth>12)throw new Error('REA: artefato aninhado demais.');projects.guard(filename);const stat=lstatSync(filename);
    if(stat.isSymbolicLink()||stat.nlink>1&&!stat.isDirectory())throw new Error('REA: links não são permitidos.');
    if(stat.isDirectory()){for(const name of readdirSync(filename).sort()){if(name.startsWith('.')||/^(node_modules|credentials|auth\.json)$/i.test(name))throw new Error('REA: remova configurações privadas e dependências do material selecionado.');visit(join(filename,name),path?path+'/'+name:name,depth+1);}return;}
    if(!stat.isFile())throw new Error('REA: tipo de arquivo não permitido.');bytes+=stat.size;if(bytes>8000000||files.length>=300)throw new Error('REA: limite de 300 arquivos / 8 MB; nada foi cortado.');
    const content=readFileSync(filename);if(/\.(?:js|mjs|cjs|json|map|html|css|md|txt)$/i.test(path)&&/\b(?:sk|rk|ghp|gho)[-_][A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S{16,}/.test(content.toString('utf8')))throw new Error('REA: possível credencial no artefato; análise bloqueada.');
    files.push({path,bytes:content.length,sha256:hash(content)});
  }
  visit(input,info.isDirectory()?'':'input.asar',0);if(!files.length)throw new Error('REA: artefato vazio.');
  return {target,input,format:info.isDirectory()?'directory':'asar',files,bytes,sha256:hash(JSON.stringify(files))};
}
function reviewTarget(projects,id,mission){
  if(!mission.tech?.useRea)return null;
  if(mission.engine!=='codex'||mission.tech.type!=='package')throw new Error('REA no executor exige Codex e um artefato local autorizado.');
  const installed=installation();if(!installed)throw new Error('REA 6.1.0 não encontrado localmente. Nenhum download foi iniciado.');
  const target=targetFiles(projects,id,mission.tech.target);
  return {tool:TOOL,version:VERSION,target:target.target,format:target.format,files:target.files.length,bytes:target.bytes,sha256:target.sha256,installation:installed,callLimit:1,scope:'Somente análise estática do snapshot aprovado; sem rede, execução do artefato, outros tools REA ou inspeção de aplicativos.'};
}
function prepareSession(projects,id,mission,prepared,review,runtime){
  const current=reviewTarget(projects,id,mission);
  if(!review||JSON.stringify(current)!==JSON.stringify(review))throw new Error('REA: alvo ou instalação mudou após a revisão. Confirme novamente.');
  const source=targetFiles(projects,id,current.target),base=join(prepared.runDirectory,'rea'),snapshot=join(base,'snapshot'),home=join(base,'home');
  for(const path of [base,snapshot,home]){projects.guard(path);mkdirSync(path,{recursive:true});}
  for(const file of source.files){const bytes=readFileSync(source.format==='directory'?join(source.input,file.path):source.input);if(hash(bytes)!==file.sha256)throw new Error('REA: material mudou durante a preparação.');projects.write(join(snapshot,file.path),bytes);}
  const manifest={schema:1,workspace:realpathSync(prepared.workspace),runDirectory:realpathSync(prepared.runDirectory),snapshot:realpathSync(snapshot),analysisPath:source.format==='directory'?realpathSync(snapshot):realpathSync(join(snapshot,'input.asar')),target:source.target,format:source.format,files:source.files,targetHash:source.sha256,installation:current.installation,nodeExecutable:runtime.nodeExecutable,home:realpathSync(home),tool:TOOL,callLimit:1};
  const filename=join(base,'manifest.json');projects.write(filename,JSON.stringify(manifest,null,2));
  return {manifest:filename,sha256:hash(readFileSync(filename)),target:source.target};
}
function loadManifest(filename,expected){
  if(!isAbsolute(filename)||lstatSync(filename).isSymbolicLink()||lstatSync(filename).size>256000)throw new Error('Manifesto REA inválido.');
  const bytes=readFileSync(filename);if(hash(bytes)!==expected)throw new Error('Manifesto REA alterado.');
  const manifest=JSON.parse(bytes);if(manifest.schema!==1||manifest.tool!==TOOL||manifest.callLimit!==1||!Array.isArray(manifest.files)||manifest.files.length>300||manifest.installation.version!==VERSION)throw new Error('Escopo REA inválido.');
  for(const file of manifest.files){const filename=join(manifest.snapshot,file.path),inside=relative(manifest.snapshot,filename);if(isAbsolute(inside)||inside.startsWith('..')||lstatSync(filename).isSymbolicLink()||lstatSync(filename).nlink>1||hash(readFileSync(filename))!==file.sha256)throw new Error('Snapshot REA alterado.');}
  for(const [filename,expected]of [[manifest.installation.entry,manifest.installation.entryHash],[join(manifest.installation.root,'package.json'),manifest.installation.packageHash]])if(hash(readFileSync(filename))!==expected)throw new Error('Instalação REA alterada.');
  return manifest;
}
function configuration({workspace,runDirectory,rea,runtime}){
  const manifest=loadManifest(rea.manifest,rea.sha256);
  if(realpathSync(workspace)!==manifest.workspace||realpathSync(runDirectory)!==manifest.runDirectory)throw new Error('REA pertence a outra execução.');
  return [`mcp_servers.sandubah_rea.command=${JSON.stringify(runtime.nodeExecutable)}`,`mcp_servers.sandubah_rea.args=${JSON.stringify([join(__dirname,'rea-broker.cjs'),rea.manifest,rea.sha256])}`,'mcp_servers.sandubah_rea.enabled_tools=["analyze_javascript_application"]','mcp_servers.sandubah_rea.startup_timeout_sec=30','mcp_servers.sandubah_rea.tool_timeout_sec=90'];
}
function executeAnalysis(manifest,invoke=spawnSync){
  const env={};for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT'])if(process.env[key])env[key]=process.env[key];Object.assign(env,{PATH:dirname(manifest.nodeExecutable),HOME:manifest.home,USERPROFILE:manifest.home,TEMP:manifest.home,TMP:manifest.home,LOCALAPPDATA:manifest.home,APPDATA:manifest.home,NODE_OPTIONS:'',NODE_PATH:''});
  const args=['--permission','--allow-fs-read='+dirname(manifest.installation.root),'--allow-fs-read='+manifest.snapshot,'--allow-fs-read='+manifest.home,'--allow-fs-write='+manifest.home,manifest.installation.entry,'analyze-javascript-application',manifest.analysisPath,'--json'];
  const result=invoke(manifest.nodeExecutable,args,{cwd:manifest.home,env,shell:false,windowsHide:true,timeout:60000,maxBuffer:4000000,encoding:'utf8'});
  if(result.error||result.status!==0)throw new Error('REA não concluiu a análise: '+String(result.error?.message||result.stderr||result.stdout).slice(0,2000));
  let evidence;try{evidence=JSON.parse(result.stdout);}catch{throw new Error('REA retornou saída inválida; nenhuma evidência foi inventada.');}
  if(evidence.operation!==TOOL||!/^ev_[a-f0-9]{64}$/.test(evidence.evidence_id||'')||!evidence.normalized_result)throw new Error('REA não retornou uma evidência de análise válida.');
  return {evidence,raw:result.stdout};
}
module.exports={VERSION,TOOL,installation,targetFiles,reviewTarget,prepareSession,loadManifest,configuration,executeAnalysis};
