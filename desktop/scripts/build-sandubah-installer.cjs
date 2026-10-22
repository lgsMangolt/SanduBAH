'use strict';
const fs=require('node:fs');
const {join,resolve,dirname,relative}=require('node:path');
const {createRequire}=require('node:module');
const {createHash,generateKeyPairSync,createPrivateKey,createPublicKey,sign,randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {codePath,validateManifest,safePath}=require('../src/sandubah-distribution/workspace-image.cjs');
const root=resolve(__dirname,'..'),version='0.1.0',build=join(root,'build/sandubah/distribution');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=(filename,bytes)=>{fs.mkdirSync(dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);};
const userDirectory=require('node:path').basename(require('node:os').homedir());
const escapedUser=userDirectory.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
const privatePattern=new RegExp([/[a-z]:[\\/]Users[\\/]|sk-[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.source,...(userDirectory.length>=5?[escapedUser]:[])].join('|'),'i');
function cleanPng(bytes){
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('PNG inválido.');const chunks=[bytes.subarray(0,8)],keep=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','sRGB','gAMA','cHRM','pHYs']);let offset=8;
  while(offset<bytes.length){const length=bytes.readUInt32BE(offset),end=offset+12+length,type=bytes.toString('ascii',offset+4,offset+8);if(end>bytes.length)throw new Error('PNG incompleto.');if(keep.has(type))chunks.push(bytes.subarray(offset,end));offset=end;}return Buffer.concat(chunks);
}
function dpapi(bytes,unprotect=false){
  const script=`Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${unprotect?'Unprotect':'Protect'}($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error('Não foi possível proteger a chave exclusiva de publicação no Windows.');return Buffer.from(result.stdout.trim(),'base64');
}
function publisherKey(){
  const directory=join(root,'build/sandubah/publisher'),filename=join(directory,'signing-key.dpapi');safePath(root,relative(root,filename));
  if(fs.existsSync(filename))return createPrivateKey({key:dpapi(fs.readFileSync(filename),true),format:'der',type:'pkcs8'});
  const {privateKey}=generateKeyPairSync('ed25519');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(filename,dpapi(privateKey.export({format:'der',type:'pkcs8'})),{flag:'wx'});return privateKey;
}
function prepare(){
  const stage=join(build,`${version}-${randomUUID()}`),image=join(stage,'app-image'),app=join(stage,'application');fs.mkdirSync(image,{recursive:true});fs.mkdirSync(app,{recursive:true});
  const files=[],dependencies=[],omitted=[];
  function put(path,bytes){
    if(!codePath(path))throw new Error(`Caminho fora da lista: ${path}`);
    if(/\.(?:png)$/i.test(path))bytes=cleanPng(bytes);else if(!/\.(?:wasm|node|exe|dll|ico|zip|gz|br|bin|dat|woff2?|ttf|webp|jpe?g)$/i.test(path)&&privatePattern.test(bytes.toString('utf8')))throw new Error(`Dado privado detectado em ${path}; pacote bloqueado.`);
    write(join(image,path),bytes);files.push({path,bytes:bytes.length,sha256:digest(bytes)});
  }
  function copy(source,target,{packageFiles=false}={}){
    const info=fs.lstatSync(source);if(info.isSymbolicLink())throw new Error(`Link de origem não permitido: ${target}`);
    if(info.isDirectory()){for(const item of fs.readdirSync(source,{withFileTypes:true})){
      if(packageFiles&&(item.name.startsWith('.')||/^(?:node_modules|__tests__|tests?|testdata|fixtures|examples?|docs?|coverage|benchmarks?)$/i.test(item.name)||/\.(?:map|tsbuildinfo|d\.ts)$/i.test(item.name)))continue;
      copy(join(source,item.name),target+'/'+item.name,{packageFiles});
    }}else if(info.isFile()){put(target,fs.readFileSync(source));}
  }
  function locate(name,source){
    const local=join(root,'v3',name,'package.json');if(name.startsWith('@claude-flow/')&&fs.existsSync(local))return dirname(local);
    const requireFrom=createRequire(join(source,'package.json'));try{return dirname(requireFrom.resolve(name+'/package.json'));}catch{
      let cursor=dirname(requireFrom.resolve(name));while(cursor!==dirname(cursor)){const filename=join(cursor,'package.json');if(fs.existsSync(filename)&&JSON.parse(fs.readFileSync(filename,'utf8')).name===name)return cursor;cursor=dirname(cursor);}throw new Error(`Dependência ausente: ${name}`);
    }
  }
  const installed=new Map();
  function install(name,source,consumer){
    const actual=fs.realpathSync(locate(name,source));let target='node_modules/'+name;
    if(installed.has(target)&&installed.get(target)!==actual)target=consumer+'/node_modules/'+name;
    if(installed.has(target)){if(installed.get(target)!==actual)throw new Error('Conflito de dependências.');return;}
    if(installed.size>1000)throw new Error('Grafo de dependências muito grande.');installed.set(target,actual);const pkg=JSON.parse(fs.readFileSync(join(actual,'package.json'),'utf8'));
    dependencies.push({name:pkg.name,version:pkg.version,license:pkg.license||'consulte LICENSE',path:target});
    if(name==='sql.js'){for(const filename of ['package.json','dist/sql-wasm.js','dist/sql-wasm.wasm','LICENSE','README.md'])if(fs.existsSync(join(actual,filename)))copy(join(actual,filename),target+'/'+filename,{packageFiles:true});}
    else if(name.startsWith('@claude-flow/')){put(target+'/package.json',Buffer.from(JSON.stringify(pkg,null,2)));for(const directory of ['dist','bin'])if(fs.existsSync(join(actual,directory)))copy(join(actual,directory),target+'/'+directory,{packageFiles:true});for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt','NOTICE','README.md'])if(fs.existsSync(join(actual,filename)))copy(join(actual,filename),target+'/'+filename,{packageFiles:true});}
    else copy(actual,target,{packageFiles:true});
    for(const dependency of Object.keys(pkg.dependencies||{})){if(pkg.optionalDependencies?.[dependency]){omitted.push(dependency);continue;}install(dependency,actual,target);}
    for(const dependency of Object.keys(pkg.optionalDependencies||{}))omitted.push(dependency);
    if(installed.size%25===0)console.log(JSON.stringify({phase:'dependencies',packages:installed.size}));
  }
  copy(join(root,'src/sandubah-desktop'),'src/sandubah-desktop');
  for(const filename of ['sandubah-mcp.cjs','sandubah-qwen-worker.py','sandubah-config.py','sandubah-memory.py','download-sandubah-model.py','download-sandubah-qwen.py'])copy(join(root,'scripts',filename),'scripts/'+filename);
  const cli=join(root,'v3/@claude-flow/cli'),cliPackage=JSON.parse(fs.readFileSync(join(cli,'package.json'),'utf8'));
  put('v3/@claude-flow/cli/package.json',Buffer.from(JSON.stringify(cliPackage,null,2)));for(const directory of ['dist','bin'])copy(join(cli,directory),'v3/@claude-flow/cli/'+directory,{packageFiles:true});
  for(const source of ['.claude/helpers','v3/@claude-flow/cli/.claude/helpers'])if(fs.existsSync(join(root,source)))for(const item of fs.readdirSync(join(root,source),{withFileTypes:true}))if(item.isFile()&&/\.(?:cjs|mjs|js|sh)$/.test(item.name))copy(join(root,source,item.name),source+'/'+item.name);
  for(const name of Object.keys(cliPackage.dependencies)){if(cliPackage.optionalDependencies?.[name]){omitted.push(name);continue;}install(name,cli,'v3/@claude-flow/cli');}
  const ajv=join(root,'build/sandubah/gui/vendor/node_modules/ajv');copy(ajv,'build/sandubah/gui/vendor/node_modules/ajv',{packageFiles:true});const ajvPackage=JSON.parse(fs.readFileSync(join(ajv,'package.json'),'utf8'));for(const name of Object.keys(ajvPackage.dependencies))install(name,ajv,'build/sandubah/gui/vendor/node_modules/ajv');
  const original=JSON.parse(fs.readFileSync(join(root,'build/sandubah/gui/catalog.json'),'utf8'));const entries=original.entries.filter(entry=>['cli','mcp'].includes(entry.kind));
  const catalog={name:'SanduBAH',version:original.version,generatedAt:new Date().toISOString(),repositoryRoot:null,entries,unavailable:[],globalOptions:original.globalOptions,counts:{cli:entries.filter(entry=>entry.kind==='cli').length,mcp:entries.filter(entry=>entry.kind==='mcp').length,skill:0,agent:0,plugin:0},sourceHashes:{}};
  put('build/sandubah/gui/catalog.json',Buffer.from(JSON.stringify(catalog)));put('package.json',Buffer.from(JSON.stringify({name:'sandubah-runtime',version,type:'module',private:true})));
  copy(join(root,'LICENSE'),'LICENSE');put('README.txt',Buffer.from('SanduBAH desktop\nDados pessoais não acompanham o instalador. Codex e Claude exigem CLI e autenticação próprias. Modelos locais e Python/AirLLM não estão incluídos. Integrações opcionais podem precisar de preparação adicional.\nLicença do Ruflo e das dependências preservada junto ao código.\n'));
  files.sort((left,right)=>left.path.localeCompare(right.path));const manifest=validateManifest({schema:1,version,files});write(join(image,'image-manifest.json'),JSON.stringify(manifest,null,2));
  const key=publisherKey(),publicKey=createPublicKey(key).export({type:'spki',format:'pem'});const config={version,publicKey,repository:'lgsMangolt/SanduBAH'};write(join(stage,'update-public.json'),JSON.stringify(config,null,2));write(join(build,'update-public.json'),JSON.stringify(config,null,2));
  for(const filename of ['bootstrap.cjs','workspace-image.cjs','loading-preload.cjs','loading.html'])write(join(app,filename),fs.readFileSync(join(root,'src/sandubah-distribution',filename)));
  write(join(app,'package.json'),JSON.stringify({name:'sandubah-desktop',version,productName:'SanduBAH',main:'bootstrap.cjs',private:true,description:'Ambiente local para planejar e construir com agentes',author:'SanduBAH contributors',license:'MIT'}));
  write(join(app,'package-lock.json'),JSON.stringify({name:'sandubah-desktop',version,lockfileVersion:3,packages:{'':{name:'sandubah-desktop',version}}}));
  write(join(stage,'dependency-audit.json'),JSON.stringify({dependencies,optionalNotBundled:[...new Set(omitted)].sort(),privateDataIncluded:false,files:files.length,bytes:files.reduce((total,file)=>total+file.bytes,0)},null,2));
  return {stage,image,app,key,config};
}
async function main(){
  const reuse=process.argv.indexOf('--reuse-image');let prepared;
  if(reuse!==-1){const stage=resolve(process.argv[reuse+1]||'');safePath(build,relative(build,stage));if(dirname(stage)!==build||!/^0\.1\.0-[a-f0-9-]{36}$/.test(stage.split(/[\\/]/).at(-1)))throw new Error('Imagem de construção fora da pasta segura.');const image=join(stage,'app-image'),manifest=validateManifest(JSON.parse(fs.readFileSync(join(image,'image-manifest.json'),'utf8')));for(const entry of manifest.files)if(digest(fs.readFileSync(safePath(image,entry.path)))!==entry.sha256)throw new Error('Imagem de construção alterada.');prepared={stage,image,app:join(stage,'application'),key:publisherKey(),config:JSON.parse(fs.readFileSync(join(stage,'update-public.json'),'utf8'))};if(createPublicKey(prepared.key).export({type:'spki',format:'pem'})!==prepared.config.publicKey)throw new Error('A chave desta imagem não corresponde ao publicador.');}
  else prepared=prepare();console.log(JSON.stringify({phase:'image-prepared',files:JSON.parse(fs.readFileSync(join(prepared.image,'image-manifest.json'))).files.length}));
  if(process.argv.includes('--prepare-only')){console.log(prepared.stage);return;}
  for(const name of Object.keys(process.env))if(/^(?:CSC_|WIN_CSC_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|AWS_|AZURE_|GOOGLE_APPLICATION_CREDENTIALS$)/i.test(name))delete process.env[name];process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
  const requireBuilder=createRequire(join(root,'../package.json')),{build:packageApp,Platform,Arch}=requireBuilder('electron-builder');
  const archive=join(prepared.stage,'app-image.asar');await requireBuilder('@electron/asar').createPackage(prepared.image,archive);
  const cleanRuntime=join(prepared.stage,'electron-runtime'),runtimeSource=join(root,'build/sandubah/gui/runtime'),runtimeFiles=['chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','electron.exe','ffmpeg.dll','icudtl.dat','LICENSE','LICENSES.chromium.html','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','version','vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll'];
  fs.mkdirSync(join(cleanRuntime,'resources'),{recursive:true});fs.mkdirSync(join(cleanRuntime,'locales'),{recursive:true});const runtimeAudit=[];
  for(const name of [...runtimeFiles,...fs.readdirSync(join(runtimeSource,'locales')).filter(name=>/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?\.pak$/.test(name)).map(name=>'locales/'+name)]){const source=join(runtimeSource,name),info=fs.lstatSync(source);if(!info.isFile()||info.isSymbolicLink())throw new Error('Arquivo de runtime inválido.');const bytes=fs.readFileSync(source);if(/\.(?:json|html)$/.test(name)&&privatePattern.test(bytes.toString('utf8')))throw new Error('Dado privado no runtime.');write(join(cleanRuntime,name),bytes);runtimeAudit.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}write(join(prepared.stage,'runtime-audit.json'),JSON.stringify(runtimeAudit,null,2));
  write(join(prepared.app,'package-lock.json'),JSON.stringify({name:'sandubah-desktop',version,lockfileVersion:3,packages:{'':{name:'sandubah-desktop',version}}}));
  const output=join(prepared.stage,'output');await packageApp({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),publish:'never',projectDir:prepared.app,config:{appId:'br.sandubah.desktop',productName:'SanduBAH',electronVersion:'44.7.0',electronDist:cleanRuntime,directories:{app:prepared.app,output,buildResources:prepared.app},files:['package.json','bootstrap.cjs','workspace-image.cjs','loading-preload.cjs','loading.html'],extraResources:[{from:archive,to:'app-image.asar'},{from:join(root,'build/sandubah/gui/node/node.exe'),to:'node/node.exe'},{from:join(prepared.stage,'update-public.json'),to:'update-public.json'}],asar:true,beforeBuild:()=>false,npmRebuild:true,nodeGypRebuild:false,compression:'store',forceCodeSigning:false,win:{icon:join(root,'build/sandubah/gui/SanduBAH.ico'),target:['nsis'],artifactName:'SanduBAH-Setup-${version}-${arch}.exe',signAndEditExecutable:true},nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:false,deleteAppDataOnUninstall:false,differentialPackage:false,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'SanduBAH',runAfterFinish:false}}});
  const name=`SanduBAH-Setup-${version}-x64.exe`,installer=join(output,name),info=fs.statSync(installer),hash=createHash('sha256');for await(const chunk of fs.createReadStream(installer))hash.update(chunk);
  const manifest={schema:1,appId:'br.sandubah.desktop',version,platform:'win32',arch:'x64',installer:{name,bytes:info.size,sha256:hash.digest('hex'),url:`https://github.com/lgsMangolt/SanduBAH/releases/download/v${version}/${name}`},notes:['Primeira edição independente para Windows.','Verificação ao abrir; download e instalação somente após confirmação.','Projetos e credenciais ficam separados da pasta do aplicativo.']};const bytes=Buffer.from(JSON.stringify(manifest,null,2));write(join(output,'SanduBAH-update.json'),bytes);write(join(output,'SanduBAH-update.sig'),sign(null,bytes,prepared.key));
  const receipt={preparedAt:new Date().toISOString(),version,stage:prepared.stage,output,installer,sha256:manifest.installer.sha256,bytes:info.size,published:false,windowsCodeSigned:false,privateDataIncluded:false,workerLimit:1,publicKeyFingerprint:digest(Buffer.from(prepared.config.publicKey))};write(join(build,'latest-build.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare,cleanPng,privatePattern};
