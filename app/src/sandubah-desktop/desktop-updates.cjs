'use strict';
const fs=require('node:fs');
const https=require('node:https');
const {join}=require('node:path');
const {EventEmitter}=require('node:events');
const {createHash,verify,randomUUID}=require('node:crypto');
const {assertLocalWriteTree}=require('./backend.cjs');
const REPOSITORY='lgsMangolt/SanduBAH';
const FEED=`https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MAX_INSTALLER=1500*1024*1024;
function assetUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.hostname!=='github.com'||!url.pathname.startsWith(`/${REPOSITORY}/releases/download/`)||url.pathname.includes('..'))throw new Error('Fonte da atualização não autorizada.');return url.href;}
function allowedUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port)throw new Error('Conexão de atualização inválida.');if(url.href===FEED||['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))return url;if(url.hostname==='github.com'){assetUrl(value);return url;}throw new Error('Redirecionamento da atualização não autorizado.');}
async function* request(value,redirects=0){
  const url=allowedUrl(value);if(redirects>4)throw new Error('Muitos redirecionamentos na atualização.');
  const response=await new Promise((resolve,reject)=>{const connection=https.get(url,{headers:{'User-Agent':'SanduBAH-desktop','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},timeout:30000},resolve);connection.on('timeout',()=>connection.destroy(new Error('Tempo de conexão esgotado.')));connection.on('error',reject);});
  if([301,302,303,307,308].includes(response.statusCode)){response.resume();yield* request(new URL(response.headers.location,url).href,redirects+1);return;}
  if(response.statusCode!==200){response.resume();const error=new Error(`Servidor de versões respondeu ${response.statusCode}.`);error.status=response.statusCode;throw error;}
  response.setTimeout(30000,()=>response.destroy(new Error('Download sem resposta.')));yield* response;
}
async function readLimited(transport,url,limit){const chunks=[];let size=0;for await(const chunk of transport(url)){size+=chunk.length;if(size>limit)throw new Error('Resposta de atualização maior que o permitido.');chunks.push(chunk);}return Buffer.concat(chunks);}
function compareVersions(left,right){const pattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;if(!pattern.test(left)||!pattern.test(right))throw new Error('Versão de atualização inválida.');const first=left.split('.').map(Number),second=right.split('.').map(Number);for(let index=0;index<3;index++)if(first[index]!==second[index])return first[index]>second[index]?1:-1;return 0;}
function validateRelease(bytes,signature,key,release){
  if(!verify(null,bytes,key,signature))throw new Error('A assinatura desta atualização não é válida.');
  const manifest=JSON.parse(bytes.toString('utf8')),installer=manifest?.installer;
  compareVersions(manifest.version,'0.0.0');
  if(manifest.schema!==1||manifest.appId!=='br.sandubah.desktop'||manifest.platform!=='win32'||manifest.arch!=='x64'||release.tag_name!==`v${manifest.version}`||!installer||installer.name!==`SanduBAH-Setup-${manifest.version}-x64.exe`||!Number.isSafeInteger(installer.bytes)||installer.bytes<1||installer.bytes>MAX_INSTALLER||!/^[a-f0-9]{64}$/.test(installer.sha256)||!Array.isArray(manifest.notes)||manifest.notes.length>12||manifest.notes.some(note=>typeof note!=='string'||note.length>1500))throw new Error('Pacote de atualização incompatível.');
  if(assetUrl(installer.url)!==`https://github.com/${REPOSITORY}/releases/download/v${manifest.version}/${installer.name}`||!release.assets.some(asset=>asset.name===installer.name&&asset.browser_download_url===installer.url&&asset.size===installer.bytes))throw new Error('O instalador não corresponde à versão assinada.');return manifest;
}
class DesktopUpdates extends EventEmitter{
  constructor({root,version,publicKey,confirm,isBusy,launch,transport=request}){super();this.root=root;this.version=version;this.publicKey=publicKey;this.confirm=confirm;this.isBusy=isBusy;this.launch=launch;this.transport=transport;this.active=false;this.prepared=null;this.manifest=null;this.state={phase:publicKey?'idle':'unconfigured',version,message:publicKey?'A versão será verificada ao abrir.':'Esta cópia de desenvolvimento ainda não tem um canal de atualização configurado.'};}
  snapshot(){return {...this.state,notes:this.state.notes?[...this.state.notes]:[]};}
  update(state){this.state={version:this.version,...state};this.emit('state',this.snapshot());return this.snapshot();}
  async exclusive(action){if(this.active||this.isBusy())throw new Error('Aguarde a tarefa atual antes de atualizar.');this.active=true;try{return await action();}finally{this.active=false;}}
  async check(){return this.exclusive(async()=>{
    if(!this.publicKey)return this.snapshot();this.update({phase:'checking',message:'Procurando uma nova versão…'});
    try{
      const release=JSON.parse((await readLimited(this.transport,FEED,256*1024)).toString('utf8'));
      if(release.draft||release.prerelease||!Array.isArray(release.assets)||release.assets.length>100)throw new Error('Versão pública inválida.');
      const metadata=release.assets.find(asset=>asset.name==='SanduBAH-update.json'),signature=release.assets.find(asset=>asset.name==='SanduBAH-update.sig');
      if(!metadata||!signature)return this.update({phase:'not-published',message:'Ainda não há um instalador desktop assinado publicado. A prévia web é separada.',checkedAt:new Date().toISOString()});
      if(metadata.size>256*1024||signature.size>4096)throw new Error('Metadados de atualização inválidos.');
      const bytes=await readLimited(this.transport,assetUrl(metadata.browser_download_url),256*1024),signed=await readLimited(this.transport,assetUrl(signature.browser_download_url),4096);
      const manifest=validateRelease(bytes,signed,this.publicKey,release);
      if(compareVersions(manifest.version,this.version)<=0)return this.update({phase:'current',message:'Você já tem a versão disponível neste canal.',checkedAt:new Date().toISOString()});
      this.manifest=manifest;this.signed={bytes,signature:signed,release};return this.update({phase:'available',message:'Há uma nova versão. Nada será baixado sem sua confirmação.',availableVersion:manifest.version,bytes:manifest.installer.bytes,notes:manifest.notes,checkedAt:new Date().toISOString()});
    }catch(error){return this.update({phase:error.status===404?'not-published':'error',message:error.status===404?'Ainda não há uma versão desktop publicada. Seu SanduBAH continua funcionando.':'Não foi possível verificar uma versão confiável agora. Tente novamente mais tarde.',checkedAt:new Date().toISOString()});}
  });}
  async download(){return this.exclusive(async()=>{
    if(!this.manifest||!['available','error'].includes(this.state.phase))throw new Error('Verifique as atualizações antes de baixar.');const manifest=this.manifest;
    if(!await this.confirm({stage:'download',version:manifest.version,bytes:manifest.installer.bytes,notes:manifest.notes}))return {cancelled:true};
    if(this.isBusy())throw new Error('Aguarde a tarefa atual antes de baixar.');
    const directory=join(this.root,'build/sandubah/gui/updates');assertLocalWriteTree(this.root,directory);fs.mkdirSync(directory,{recursive:true});
    const temporary=join(directory,randomUUID()+'.part'),destination=join(directory,manifest.installer.name);assertLocalWriteTree(this.root,temporary);
    const hash=createHash('sha256');let received=0,handle;
    try{
      handle=fs.openSync(temporary,'wx');this.update({phase:'downloading',message:'Baixando o instalador verificado…',availableVersion:manifest.version,bytes:manifest.installer.bytes,received:0});
      for await(const chunk of this.transport(manifest.installer.url)){received+=chunk.length;if(received>manifest.installer.bytes)throw new Error('Tamanho inesperado no instalador.');hash.update(chunk);let offset=0;while(offset<chunk.length)offset+=fs.writeSync(handle,chunk,offset,chunk.length-offset);this.update({phase:'downloading',message:'Baixando o instalador verificado…',availableVersion:manifest.version,bytes:manifest.installer.bytes,received});}
      fs.closeSync(handle);handle=undefined;if(received!==manifest.installer.bytes||hash.digest('hex')!==manifest.installer.sha256)throw new Error('A integridade do download não foi confirmada.');
      assertLocalWriteTree(this.root,destination);fs.renameSync(temporary,destination);this.prepared=destination;
      return this.update({phase:'ready',message:'Download conferido. Você decide quando fechar e instalar.',availableVersion:manifest.version,bytes:received,received,notes:manifest.notes});
    }catch(error){if(handle!==undefined)fs.closeSync(handle);if(fs.existsSync(temporary)){assertLocalWriteTree(this.root,temporary);fs.unlinkSync(temporary);}this.update({phase:'error',message:'O download não pôde ser validado. Nada foi instalado.',availableVersion:manifest.version});throw error;}
  });}
  async install(){return this.exclusive(async()=>{
    if(this.state.phase!=='ready'||!this.prepared)throw new Error('Baixe e valide uma atualização antes de instalar.');
    if(!await this.confirm({stage:'install',version:this.manifest.version,notes:this.manifest.notes}))return {cancelled:true};
    if(this.isBusy())throw new Error('Aguarde a tarefa atual antes de instalar.');
    validateRelease(this.signed.bytes,this.signed.signature,this.publicKey,this.signed.release);
    assertLocalWriteTree(this.root,this.prepared);const info=fs.lstatSync(this.prepared);if(!info.isFile()||info.size!==this.manifest.installer.bytes)throw new Error('O instalador mudou depois do download.');
    const hash=createHash('sha256');for await(const chunk of fs.createReadStream(this.prepared))hash.update(chunk);if(hash.digest('hex')!==this.manifest.installer.sha256)throw new Error('O instalador mudou depois do download.');
    if(this.isBusy())throw new Error('Aguarde a tarefa atual antes de instalar.');await this.launch(this.prepared);return this.update({phase:'installing',message:'Assistente de instalação aberto. Seus dados ficam fora da pasta do programa.'});
  });}
}
module.exports={DesktopUpdates,FEED,assetUrl,allowedUrl,compareVersions,validateRelease,readLimited};
