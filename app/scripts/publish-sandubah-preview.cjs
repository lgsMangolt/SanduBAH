'use strict';
const {spawnSync}=require('node:child_process');
const {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync}=require('node:fs');
const {join,resolve,dirname,sep}=require('node:path');
const {createHash}=require('node:crypto');
const {privatePattern}=require('./build-sandubah-installer.cjs');
const root=resolve(__dirname,'..'),source=join(root,'src/sandubah-public-preview'),stage=join(root,'build/sandubah/public-preview'),receiptPath=join(root,'build/sandubah/gui/publication-audit.json'),checkpointPath=join(root,'build/sandubah/gui/publication-github.json');
const owner='lgsMangolt',name='SanduBAH',repository=`${owner}/${name}`;
const files=['index.html','style.css','app.mjs','prototype.html','prototype.css','README.md','SECURITY.md','LICENSE','.gitignore','.nojekyll','assets/sandubah.png','assets/office.png'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function cleanPng(bytes){
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Imagem inválida.');
  const chunks=[bytes.subarray(0,8)],keep=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','sRGB','gAMA','cHRM','pHYs']);let offset=8;
  while(offset<bytes.length){const length=bytes.readUInt32BE(offset),end=offset+12+length,type=bytes.toString('ascii',offset+4,offset+8);if(end>bytes.length)throw new Error('PNG inválido.');if(keep.has(type))chunks.push(bytes.subarray(offset,end));offset=end;}
  return Buffer.concat(chunks);
}
function prepare(){
  mkdirSync(stage,{recursive:true});const manifest=[];
  for(const path of files){const original=join(source,path),info=lstatSync(original);if(info.isSymbolicLink()||!info.isFile()||info.nlink>1||!realpathSync(original).startsWith(realpathSync(source)+sep))throw new Error('Arquivo fora da lista de publicação.');
    let bytes=readFileSync(original);if(path.endsWith('.png'))bytes=cleanPng(bytes);else{
      const content=bytes.toString('utf8');if(privatePattern.test(content)||/[a-z]:[\\/]Users[\\/]|Obsidian/i.test(content))throw new Error(`Possível dado privado em ${path}; nada será publicado.`);
    }
    const target=join(stage,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);manifest.push({path,bytes:bytes.length,sha256:hash(bytes)});
  }
  const audit={passed:true,preparedAt:new Date().toISOString(),repository,files:manifest,onlyAllowlistedFiles:true,noPrivateProjectFiles:true,pngMetadataRemoved:true,personalCommitIdentity:false};writeFileSync(receiptPath,JSON.stringify(audit,null,2));return audit;
}
function verifyAudit(){const audit=JSON.parse(readFileSync(receiptPath));if(!audit.passed||audit.repository!==repository||audit.files.length!==files.length)throw new Error('Auditoria inválida.');for(const entry of audit.files)if(!files.includes(entry.path)||hash(readFileSync(join(stage,entry.path)))!==entry.sha256)throw new Error('A prévia mudou após a auditoria.');return audit;}
function gitBlobHash(bytes){return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');}
function publicationPlan(base,previous,staged){
  if(base.truncated||previous?.truncated)throw new Error('Árvore remota incompleta; publicação bloqueada.');
  const owned=new Set(staged.map(entry=>entry.path)),old=new Map((previous?.tree||[]).filter(entry=>entry.type!=='tree').map(entry=>[entry.path,entry])),current=new Map(base.tree.filter(entry=>entry.type!=='tree').map(entry=>[entry.path,entry]));
  for(const entry of staged){const remote=current.get(entry.path),prior=old.get(entry.path);if(!remote){if(prior)throw new Error('Arquivo publicado foi removido externamente; nada será sobrescrito.');continue;}if(remote.type!=='blob'||remote.mode!=='100644'||remote.sha!==entry.sha&&remote.sha!==prior?.sha)throw new Error('Arquivo publicado mudou externamente; nada será sobrescrito.');}
  return {changed:staged.some(entry=>current.get(entry.path)?.sha!==entry.sha),preserved:base.tree.filter(entry=>entry.type!=='tree'&&!owned.has(entry.path)).map(({path,mode,type,sha})=>({path,mode,type,sha}))};
}
function verifyRemoteTree(remote,staged,preserved){
  if(remote.truncated)throw new Error('Árvore remota incompleta.');const entries=remote.tree.filter(entry=>entry.type!=='tree'),expected=[...staged,...preserved];
  if(entries.length!==expected.length||expected.some(entry=>!entries.some(candidate=>candidate.path===entry.path&&candidate.sha===entry.sha&&candidate.mode===entry.mode&&candidate.type===entry.type)))throw new Error('A publicação não preservou a árvore auditada.');
}
async function publish(){
  const audit=verifyAudit(),validation=JSON.parse(readFileSync(join(root,'build/sandubah/gui/public-preview-validation.json')));
  if(!validation.passed||!validation.publicDemoTested||!validation.publicPreviewHashes||audit.files.some(entry=>validation.publicPreviewHashes[entry.path]!==entry.sha256))throw new Error('A versão auditada ainda não passou no teste de interface.');
  const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GIT_TRACE:'0',GIT_TRACE_CURL:'0',GCM_TRACE:'0'}});
  const credentials=Object.fromEntries((result.stdout||'').split(/\r?\n/).filter(line=>line.includes('=')).map(line=>{const position=line.indexOf('=');return [line.slice(0,position),line.slice(position+1)];}));
  if(result.status!==0||!credentials.password||credentials.username?.toLowerCase()!==owner.toLowerCase())throw new Error('Login GitHub esperado indisponível. Nenhuma credencial foi exibida ou gravada.');
  async function api(method,path,body,optional=false){const response=await fetch('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+credentials.password,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'SanduBAH-Public-Preview'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});if(optional&&(response.status===404||response.status===409&&path.includes('/git/ref/heads/')))return null;if(!response.ok)throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}.`);return response.status===204?{}:response.json();}
  const account=await api('GET','/user');if(account.login.toLowerCase()!==owner.toLowerCase())throw new Error('Conta GitHub diferente da autorizada.');
  let repo=await api('GET','/repos/'+repository,undefined,true),checkpoint=existsSync(checkpointPath)?JSON.parse(readFileSync(checkpointPath)):null;
  if(repo&&(!checkpoint||checkpoint.repositoryId!==repo.id))throw new Error('O repositório já existe e não é uma criação registrada desta publicação. Não será sobrescrito.');
  if(!repo){repo=await api('POST','/user/repos',{name,description:'Prévia interativa do SanduBAH: projetos, Cérebro Markdown, agentes e escritório. Somente dados fictícios; sem conexão com IA.',private:false,auto_init:false,has_issues:true,has_wiki:false,has_projects:false});checkpoint={repository,repositoryId:repo.id,createdAt:new Date().toISOString()};writeFileSync(checkpointPath,JSON.stringify(checkpoint,null,2));}
  if(repo.private)throw new Error('Visibilidade inesperada.');const identity={name:'SanduBAH Preview',email:'preview@users.noreply.github.com'};
  const branch=repo.default_branch||'main';let head=await api('GET',`/repos/${repository}/git/ref/heads/${branch}`,undefined,true);
  if(!head){const initial=await api('PUT',`/repos/${repository}/contents/README.md`,{message:'Introduce the sanitized SanduBAH preview',content:readFileSync(join(stage,'README.md')).toString('base64'),author:identity,committer:identity});head={object:{sha:initial.commit.sha}};checkpoint.initialSha=initial.commit.sha;writeFileSync(checkpointPath,JSON.stringify(checkpoint,null,2));}
  const baseCommit=await api('GET',`/repos/${repository}/git/commits/${head.object.sha}`),base=await api('GET',`/repos/${repository}/git/trees/${baseCommit.tree.sha}?recursive=1`),previous=checkpoint.tree?await api('GET',`/repos/${repository}/git/trees/${checkpoint.tree}?recursive=1`):null;
  const staged=audit.files.map(entry=>({path:entry.path,mode:'100644',type:'blob',sha:gitBlobHash(readFileSync(join(stage,entry.path)))})),plan=publicationPlan(base,previous,staged);
  if(plan.changed){
    if(!checkpoint.commit&&checkpoint.initialSha&&head.object.sha!==checkpoint.initialSha)throw new Error('A branch mudou. Publicação interrompida sem sobrescrever.');
    const entries=[];for(const entry of audit.files){const blob=await api('POST',`/repos/${repository}/git/blobs`,{content:readFileSync(join(stage,entry.path)).toString('base64'),encoding:'base64'});entries.push({path:entry.path,mode:'100644',type:'blob',sha:blob.sha});}
    const tree=await api('POST',`/repos/${repository}/git/trees`,{base_tree:baseCommit.tree.sha,tree:entries});const commit=await api('POST',`/repos/${repository}/git/commits`,{message:'Add audited desktop download and provider setup tutorial',tree:tree.sha,parents:[head.object.sha],author:identity,committer:identity});
    await api('PATCH',`/repos/${repository}/git/refs/heads/${branch}`,{sha:commit.sha,force:false});checkpoint.commit=commit.sha;checkpoint.tree=tree.sha;checkpoint.branch=branch;checkpoint.files=audit.files;writeFileSync(checkpointPath,JSON.stringify(checkpoint,null,2));
  }else{checkpoint.commit=head.object.sha;checkpoint.tree=baseCommit.tree.sha;checkpoint.branch=branch;}
  const remote=await api('GET',`/repos/${repository}/git/trees/${checkpoint.tree}?recursive=1`);verifyRemoteTree(remote,staged,plan.preserved);checkpoint.preservedFiles=plan.preserved;
  for(const entry of audit.files){const bytes=readFileSync(join(stage,entry.path)),gitHash=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');if(remote.tree.find(candidate=>candidate.path===entry.path)?.sha!==gitHash)throw new Error('Conteúdo remoto diferente do arquivo auditado.');}
  let pages=await api('GET',`/repos/${repository}/pages`,undefined,true);if(!pages)pages=await api('POST',`/repos/${repository}/pages`,{build_type:'legacy',source:{branch,path:'/'}});
  checkpoint.publishedAt=new Date().toISOString();checkpoint.url=repo.html_url;checkpoint.pages=pages.html_url;checkpoint.visibility=repo.visibility;checkpoint.files=audit.files;checkpoint.noPersonalCommitIdentity=true;writeFileSync(checkpointPath,JSON.stringify(checkpoint,null,2));console.log(JSON.stringify({published:true,url:checkpoint.url,pages:checkpoint.pages,commit:checkpoint.commit,files:files.length,privateDataIncluded:false}));
}
module.exports={prepare,verifyAudit,files,gitBlobHash,publicationPlan,verifyRemoteTree};
if(require.main===module){
  if(process.argv.includes('--prepare')){const audit=prepare();console.log(JSON.stringify({prepared:true,files:audit.files.length,bytes:audit.files.reduce((sum,entry)=>sum+entry.bytes,0),pngMetadataRemoved:true}));}
  else if(process.argv.includes('--publish'))publish().catch(error=>{console.error(error.message);process.exitCode=1;});
  else throw new Error('Use --prepare para auditoria local ou --publish após validação.');
}
