'use strict';
const fs=require('node:fs');
const {join,resolve,relative,isAbsolute,dirname,sep}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function safePath(root,path){
  const absolute=resolve(root,path),inside=relative(resolve(root),absolute);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw new Error('Destino fora da instalação.');
  for(let cursor=absolute;cursor!==dirname(cursor);cursor=dirname(cursor)){if(fs.existsSync(cursor)){const info=fs.lstatSync(cursor);if(info.isSymbolicLink()||(info.isFile()&&info.nlink>1))throw new Error('Links não são aceitos na instalação.');}}
  return absolute;
}
function codePath(path){
  if(typeof path!=='string'||path.length>700||/[\\\x00-\x1f<>:"|?*]/.test(path))return false;
  const parts=path.split('/');if(parts.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)))return false;
  if(parts.some(part=>/^\.env(?:\.|$)|^(?:\.git|\.codex|\.agents|\.swarm|\.harness|__tests__|fixtures|coverage)$/i.test(part)))return false;
  return /^(?:src\/sandubah-desktop\/|node_modules\/|v3\/@claude-flow\/cli\/(?:dist\/|bin\/|node_modules\/|\.claude\/helpers\/|package\.json$)|\.claude\/helpers\/|build\/sandubah\/gui\/vendor\/node_modules\/)/.test(path)||['package.json','LICENSE','README.txt','build/sandubah/gui/catalog.json'].includes(path)||/^scripts\/(?:sandubah-mcp\.cjs|sandubah-qwen-worker\.py|sandubah-config\.py|sandubah-memory\.py|download-sandubah-model\.py|download-sandubah-qwen\.py)$/.test(path);
}
function atomic(root,path,bytes){const destination=safePath(root,path);fs.mkdirSync(dirname(destination),{recursive:true});const temporary=safePath(root,path+'.'+randomUUID()+'.tmp');fs.writeFileSync(temporary,bytes,{flag:'wx'});safePath(root,path);fs.renameSync(temporary,destination);}
function validateManifest(manifest){
  if(manifest?.schema!==1||!/^\d+\.\d+\.\d+$/.test(manifest.version)||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>50000)throw new Error('Imagem do aplicativo inválida.');
  const seen=new Set();for(const entry of manifest.files){const canonical=entry.path?.toLowerCase();if(!codePath(entry.path)||seen.has(canonical)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('Arquivo fora da lista segura do aplicativo.');seen.add(canonical);}return manifest;
}
function* materializeSteps({image,workspace}){
  fs.mkdirSync(workspace,{recursive:true});const markerPath='.sandubah-image.json',journalPath='.sandubah-image-transaction.json';
  const load=path=>JSON.parse(fs.readFileSync(safePath(workspace,path),'utf8'));
  function recover(){
    if(!fs.existsSync(join(workspace,journalPath)))return;
    const transaction=load(journalPath);if(!/^[a-f0-9-]{36}$/.test(transaction.id)||!Array.isArray(transaction.files))throw new Error('A recuperação da instalação precisa de revisão.');
    for(const entry of [...transaction.files].reverse()){
      if(!codePath(entry.path))throw new Error('Caminho inválido na recuperação.');const destination=safePath(workspace,entry.path);
      if(fs.existsSync(destination)){const current=digest(fs.readFileSync(destination));if(current!==entry.nextHash&&current!==entry.previousHash)throw new Error('Um arquivo foi personalizado durante a atualização. Ele foi preservado.');}
      if(entry.previousHash){const backup=fs.readFileSync(safePath(workspace,`.sandubah-image-backups/${transaction.id}/${entry.path}`));if(digest(backup)!==entry.previousHash)throw new Error('Backup da instalação inválido.');atomic(workspace,entry.path,backup);}
      else if(fs.existsSync(destination))fs.unlinkSync(destination);
    }
    if(transaction.previousMarker)atomic(workspace,markerPath,JSON.stringify(transaction.previousMarker));else if(fs.existsSync(join(workspace,markerPath)))fs.unlinkSync(safePath(workspace,markerPath));
    fs.unlinkSync(safePath(workspace,journalPath));
  }
  recover();
  const manifest=validateManifest(JSON.parse(fs.readFileSync(join(image,'image-manifest.json'),'utf8'))),manifestHash=digest(Buffer.from(JSON.stringify(manifest)));
  const previous=fs.existsSync(join(workspace,markerPath))?load(markerPath):null;
  if(previous?.manifestHash===manifestHash)return {changed:false,version:manifest.version};
  if(previous)validateManifest(previous.manifest);
  const prior=new Map((previous?.manifest.files||[]).map(entry=>[entry.path,entry]));const changes=[];
  let checked=0;for(const entry of manifest.files){
    if(checked++%100===0)yield {phase:'verifying',completed:checked,total:manifest.files.length};
    const bytes=fs.readFileSync(safePath(image,entry.path));if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error('A imagem do aplicativo falhou na verificação de integridade.');
    const destination=safePath(workspace,entry.path),old=prior.get(entry.path);prior.delete(entry.path);
    if(fs.existsSync(destination)){
      const current=digest(fs.readFileSync(destination));if(current===entry.sha256)continue;
      if(!old||current!==old.sha256)throw new Error('Há código personalizado nesta instalação. Nada foi substituído; preserve a cópia antes de atualizar.');
    }else if(old)throw new Error('Um arquivo instalado está ausente. Revise a instalação antes de atualizar.');
    changes.push({path:entry.path,nextHash:entry.sha256,previousHash:old?.sha256||null,bytes});
  }
  for(const old of prior.values()){const destination=safePath(workspace,old.path);if(fs.existsSync(destination)&&digest(fs.readFileSync(destination))!==old.sha256)throw new Error('Arquivo antigo personalizado foi preservado.');changes.push({path:old.path,nextHash:null,previousHash:fs.existsSync(destination)?old.sha256:null,bytes:null});}
  const transaction={id:randomUUID(),previousMarker:previous,files:changes.map(({bytes,...entry})=>entry)};
  let saved=0;for(const entry of changes){if(entry.previousHash)atomic(workspace,`.sandubah-image-backups/${transaction.id}/${entry.path}`,fs.readFileSync(safePath(workspace,entry.path)));if(saved++%100===0)yield {phase:'backup',completed:saved,total:changes.length};}
  atomic(workspace,journalPath,JSON.stringify(transaction));
  try{
    let written=0;for(const entry of changes){if(entry.bytes)atomic(workspace,entry.path,entry.bytes);else if(fs.existsSync(join(workspace,entry.path)))fs.unlinkSync(safePath(workspace,entry.path));if(written++%25===0)yield {phase:'preparing',completed:written,total:changes.length};}
    atomic(workspace,markerPath,JSON.stringify({schema:1,manifestHash,manifest}));fs.unlinkSync(safePath(workspace,journalPath));
  }catch(error){recover();throw error;}
  return {changed:true,version:manifest.version,files:changes.length};
}
function materialize(options){const steps=materializeSteps(options);let next=steps.next();while(!next.done)next=steps.next();return next.value;}
async function materializeAsync(options,onProgress=()=>{}){const steps=materializeSteps(options);let next=steps.next();while(!next.done){onProgress(next.value);await new Promise(resolve=>setImmediate(resolve));next=steps.next();}return next.value;}
module.exports={materialize,materializeAsync,validateManifest,codePath,safePath,atomic,digest};
