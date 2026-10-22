'use strict';

// Histórico de versões do workspace com git local.
// O repositório fica fora do workspace (history.git no harness): o agente escreve no workspace e não pode
// plantar hooks, config ou um .git que o git executaria no próximo commit. Só o envio ao GitHub usa rede,
// sempre por ação confirmada, sem force push e apenas pelos transportes https e ssh.
const {spawn,spawnSync}=require('node:child_process');
const {existsSync,mkdirSync,readFileSync,statSync}=require('node:fs');
const {join}=require('node:path');
const TYPES=['feat','fix','docs','style','refactor','test','chore'];
const EXCLUDE='node_modules/\ndist/\nbuild/\n.env\n.env.*\n*.log\n.codex/\n';
const DIFF_LIMIT=200000;
const BRANCH='main';

// Aceita só repositórios do GitHub e devolve a forma canônica para exibir e consultar.
function githubRemote(url){
  const value=typeof url==='string'?url.trim():'';
  const match=/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(value);
  if(!match||match[2]==='.'||match[2]==='..')throw new Error('Use o endereço de um repositório do GitHub, como https://github.com/usuario/projeto.git.');
  const [,owner,repo]=match;
  return {url:value.startsWith('git@')?`git@github.com:${owner}/${repo}.git`:`https://github.com/${owner}/${repo}.git`,owner,repo,web:`https://github.com/${owner}/${repo}`};
}

// Consulta pública e sem login: 200 indica repositório público; 404, privado ou inexistente.
async function githubVisibility({owner,repo},fetchImpl=globalThis.fetch){
  try{
    const response=await fetchImpl(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,{headers:{'User-Agent':'SanduBAH','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(6000)});
    if(response.status===200)return 'public';
    if(response.status===404)return 'private-or-missing';
    return 'unknown';
  }catch{return 'unknown';}
}

class ProjectHistory{
  constructor({projects,secretPattern,git='git',validateRemote=githubRemote,protocols=['https','ssh'],visibility=githubVisibility}){this.projects=projects;this.secretPattern=secretPattern;this.git=git;this.validateRemote=validateRemote;this.protocols=protocols;this.visibility=visibility;}
  paths(id){const base=this.projects.location(id),gitDir=join(base,'history.git'),hooks=join(base,'history-hooks'),workspace=this.projects.workspace(id);for(const path of [gitDir,hooks])this.projects.guard(path);return {base,gitDir,hooks,workspace};}
  invocation(id,args){
    const {gitDir,hooks,workspace}=this.paths(id),env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',LC_ALL:'C'};
    for(const name of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_CONFIG','GIT_CONFIG_PARAMETERS'])delete env[name];
    const protocols=['-c','protocol.allow=never',...this.protocols.flatMap(name=>['-c',`protocol.${name}.allow=always`])];
    return {args:['-c',`core.hooksPath=${hooks}`,'-c','core.longpaths=true','-c','core.fsmonitor=false','-c','core.autocrlf=false','-c','core.quotepath=false',...protocols,'--git-dir',gitDir,'--work-tree',workspace,...args],options:{cwd:workspace,env,windowsHide:true,shell:false}};
  }
  run(id,args,{allowFail=false}={}){
    const call=this.invocation(id,args);
    const result=spawnSync(this.git,call.args,{...call.options,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
    if(result.error)throw new Error(result.error.code==='ENOENT'?'Git não encontrado. Instale o Git para Windows para usar o histórico.':`Git falhou: ${result.error.message}`);
    if(result.status!==0&&!allowFail){const message=(result.stderr||result.stdout||'').trim();throw new Error(/tell me who you are|user\.email/i.test(message)?'Configure seu nome e e-mail no git (git config --global user.name / user.email) para salvar versões.':`Git: ${message.slice(0,600)}`);}
    return result;
  }
  initialized(id){return existsSync(join(this.paths(id).gitDir,'HEAD'));}
  ensure(id){
    const {gitDir,hooks,workspace}=this.paths(id);mkdirSync(workspace,{recursive:true});mkdirSync(hooks,{recursive:true});
    if(existsSync(join(workspace,'.git')))throw new Error('O workspace tem um .git próprio. Revise e remova antes de usar o histórico; nada foi salvo.');
    if(this.initialized(id))return;
    // Sem modelo: não copia hooks de exemplo (os hooks ficam desligados) e evita caminhos longos no Windows.
    const init=spawnSync(this.git,['-c','core.longpaths=true','init','--bare','--quiet','--template=','--initial-branch=main',gitDir],{encoding:'utf8',timeout:30000,windowsHide:true,shell:false});
    if(init.error||init.status!==0)throw new Error(init.error?.code==='ENOENT'?'Git não encontrado. Instale o Git para Windows para usar o histórico.':`Git: ${(init.stderr||'').trim().slice(0,600)}`);
    this.projects.write(join(gitDir,'info','exclude'),EXCLUDE);
  }
  changes(id){
    if(!this.initialized(id)){let files=[];try{files=this.projects.artifacts(id);}catch{}return files.map(file=>({path:file.path,state:'new'}));}
    const output=this.run(id,['status','--porcelain=v1','-z','--untracked-files=all']).stdout.split('\0');const changes=[];
    for(let index=0;index<output.length;index++){
      const entry=output[index];if(!entry)continue;const code=entry.slice(0,2),path=entry.slice(3);
      if(/[RC]/.test(code))index++;
      changes.push({path,state:code==='??'||code.includes('A')?'new':code.includes('D')?'deleted':'modified'});
    }
    return changes;
  }
  versions(id){
    if(!this.initialized(id))return [];
    const log=this.run(id,['log','--reverse','--no-color','--format=%x1e%H%x1f%aI%x1f%an%x1f%s%x1f%b%x1f','--numstat'],{allowFail:true});
    if(log.status!==0)return [];
    return log.stdout.split('\x1e').filter(Boolean).map((chunk,index)=>{
      const [hash,date,author,subject,body,stats='']=chunk.split('\x1f');
      const files=stats.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const [added,removed,...path]=line.split('\t');return {path:path.join('\t'),added:added==='-'?null:Number(added),removed:removed==='-'?null:Number(removed)};});
      return {number:index+1,hash,short:hash.slice(0,7),date,author,subject,note:body.replace(/\n*Versão \d+ · SanduBAH\s*$/,'').trim(),files,added:files.reduce((sum,file)=>sum+(file.added||0),0),removed:files.reduce((sum,file)=>sum+(file.removed||0),0)};
    }).reverse();
  }
  status(id){return {initialized:this.initialized(id),changes:this.changes(id),versions:this.versions(id),remote:this.remote(id)};}
  remote(id){
    if(!this.initialized(id))return {url:null,branch:BRANCH,pending:[],pushed:false};
    const url=this.run(id,['config','--get','remote.origin.url'],{allowFail:true}).stdout.trim()||null;
    if(!url)return {url:null,branch:BRANCH,pending:[],pushed:false};
    let web=null;try{web=this.validateRemote(url).web||null;}catch{}
    const pushed=this.run(id,['rev-parse','--verify','--quiet',`refs/remotes/origin/${BRANCH}`],{allowFail:true}).status===0;
    const range=pushed?[`refs/remotes/origin/${BRANCH}..HEAD`]:['HEAD'];
    const log=this.run(id,['log','--format=%H%x1f%s',...range],{allowFail:true});
    const pending=log.status===0?log.stdout.split('\n').filter(Boolean).map(line=>{const [hash,subject]=line.split('\x1f');return {hash,subject};}):[];
    return {url,web,branch:BRANCH,pending,pushed};
  }
  setRemote(id,url){
    const remote=this.validateRemote(url);this.ensure(id);
    const exists=this.run(id,['config','--get','remote.origin.url'],{allowFail:true}).status===0;
    this.run(id,exists?['remote','set-url','origin',remote.url]:['remote','add','origin',remote.url]);
    return this.status(id);
  }
  removeRemote(id){if(this.remote(id).url)this.run(id,['remote','remove','origin']);return this.status(id);}
  async pushPlan(id){
    const remote=this.remote(id);
    if(!remote.url)throw new Error('Configure o repositório do GitHub antes de enviar.');
    if(!this.versions(id).length)throw new Error('Salve uma versão antes de enviar.');
    if(!remote.pending.length)throw new Error('Todas as versões já foram enviadas.');
    return {...remote,visibility:await this.visibility(this.validateRemote(remote.url)),unsaved:this.changes(id).length};
  }
  async push(id,{timeoutMs=180000}={}){
    const remote=this.remote(id);this.validateRemote(remote.url);
    // Refspec sem "+": o git recusa sobrescrever commits do GitHub. Nunca usa --force.
    const call=this.invocation(id,['push','--porcelain','origin',`HEAD:refs/heads/${BRANCH}`]);
    return new Promise((resolvePromise,rejectPromise)=>{
      const child=spawn(this.git,call.args,call.options);let output='';
      const collect=chunk=>{output=(output+chunk).slice(-20000);};
      child.stdout.setEncoding('utf8').on('data',collect);child.stderr.setEncoding('utf8').on('data',collect);
      const timer=setTimeout(()=>{child.kill();rejectPromise(new Error('O envio demorou demais e foi interrompido. Confira o login do GitHub e tente de novo; nada foi sobrescrito.'));},timeoutMs);
      child.on('error',error=>{clearTimeout(timer);rejectPromise(new Error(error.code==='ENOENT'?'Git não encontrado.':`Git falhou: ${error.message}`));});
      child.on('close',code=>{
        clearTimeout(timer);
        if(code===0){resolvePromise({...this.status(id),sent:remote.pending.length});return;}
        const message=/rejected|non-fast-forward|fetch first/i.test(output)?'O GitHub tem commits que não estão neste projeto (por exemplo, um README criado no site). Nada foi sobrescrito: use um repositório vazio, sem README, ou combine as versões manualmente.':/not found|does not exist/i.test(output)?'Repositório não encontrado ou sem acesso para esta conta. Confira o endereço e o login do GitHub.':/authentication|could not read username|permission denied|403/i.test(output)?'O GitHub recusou o login. Entre com a sua conta pelo Git Credential Manager e tente de novo.':`Git: ${output.trim().slice(-600)}`;
        rejectPromise(new Error(message));
      });
    });
  }
  commit(id,hash){
    if(typeof hash!=='string'||!/^[a-f0-9]{40}$/.test(hash))throw new Error('Versão inválida.');
    if(!this.versions(id).some(version=>version.hash===hash))throw new Error('Versão fora do histórico deste projeto.');
    return hash;
  }
  show(id,hash){
    this.commit(id,hash);const diff=this.run(id,['show','--no-color','--format=','--patch','--stat=120',hash]).stdout;
    return {hash,diff:diff.length>DIFF_LIMIT?diff.slice(0,DIFF_LIMIT):diff,truncated:diff.length>DIFF_LIMIT,bytes:diff.length};
  }
  syncPrompt(id){
    if(!this.projects.hasOptional(id,'PROMPT.md'))return false;
    const content=readFileSync(join(this.projects.location(id),'PROMPT.md'),'utf8'),target=join(this.paths(id).workspace,'PROMPT.md');this.projects.guard(target);
    if(existsSync(target)&&readFileSync(target,'utf8')===content)return false;
    this.projects.write(target,content);return true;
  }
  save(id,{type,summary,note=''}={}){
    if(!TYPES.includes(type))throw new Error('Escolha o tipo da mudança.');
    if(typeof summary!=='string'||summary.trim().length<3||summary.length>72||/[\r\n]/.test(summary))throw new Error('Resuma a mudança em uma linha de 3 a 72 caracteres.');
    if(typeof note!=='string'||note.length>500)throw new Error('A nota pode ter até 500 caracteres.');
    this.ensure(id);const promptSynced=this.syncPrompt(id),changes=this.changes(id);
    if(!changes.length)throw new Error('Nada mudou desde a última versão.');
    if(changes.length>1000)throw new Error('Mais de 1.000 arquivos mudaram. Revise o workspace antes de salvar.');
    const {workspace}=this.paths(id);
    for(const change of changes.filter(change=>change.state!=='deleted')){
      const filename=join(workspace,change.path);this.projects.guard(filename);
      if(!existsSync(filename)||statSync(filename).size>512000)continue;
      const content=readFileSync(filename);if(content.includes(0))continue;
      if(this.secretPattern.test(content.toString('utf8')))throw new Error(`Possível credencial em ${change.path}. Remova antes de salvar; nada foi salvo.`);
    }
    const number=this.versions(id).length+1,message=`${type}: ${summary.trim()}`;
    this.run(id,['add','--all','--',':/']);
    this.run(id,['commit','--quiet','-m',message,'-m',`${note.trim()?note.trim()+'\n\n':''}Versão ${number} · SanduBAH`]);
    return {...this.status(id),saved:this.versions(id)[0],promptSynced};
  }
  restore(id,hash){
    this.commit(id,hash);
    if(this.changes(id).length)throw new Error('Há mudanças sem versão. Salve uma versão antes de restaurar; nada foi alterado.');
    this.run(id,['restore','--source',hash,'--staged','--worktree','--',':/']);
    return {...this.status(id),restored:hash};
  }
}

module.exports={ProjectHistory,TYPES,BRANCH,githubRemote,githubVisibility};
