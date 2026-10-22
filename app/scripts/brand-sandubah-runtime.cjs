'use strict';
const fs=require('node:fs');
const {join,resolve,dirname}=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash,randomUUID}=require('node:crypto');
const {assertLocalWriteTree}=require('../src/sandubah-desktop/backend.cjs');
function brandRuntime(root){
  if(process.platform!=='win32')throw new Error('A identidade do executável é preparada no Windows.');
  root=resolve(root);const gui=join(root,'build/sandubah/gui'),executable=join(gui,'runtime/electron.exe'),icon=join(gui,'SanduBAH.ico'),editor=join(root,'../node_modules/electron-winstaller/vendor/rcedit.exe');
  for(const filename of [executable,icon]){assertLocalWriteTree(root,filename);const info=fs.lstatSync(filename);if(!info.isFile()||info.nlink!==1)throw new Error('Arquivo local inválido para identidade.');}
  if(!fs.existsSync(editor))throw new Error('Instale electron-winstaller nas dependências de build; nenhum editor será baixado automaticamente.');
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),before=digest(fs.readFileSync(executable)),backup=join(gui,'runtime-branding',`original-${before}.exe`),temporary=join(gui,'runtime',`brand-${randomUUID()}.exe`);
  for(const filename of [backup,temporary])assertLocalWriteTree(root,filename);
  fs.mkdirSync(dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(executable,backup,fs.constants.COPYFILE_EXCL);fs.copyFileSync(executable,temporary,fs.constants.COPYFILE_EXCL);
  try{
    const edited=spawnSync(editor,[temporary,'--set-version-string','ProductName','SanduBAH','--set-version-string','FileDescription','SanduBAH','--set-icon',icon],{windowsHide:true,encoding:'utf8',timeout:30000});
    if(edited.status!==0)throw new Error('Não foi possível preparar o nome e o ícone do runtime local.');
    const inspect=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',`$v=(Get-Item -LiteralPath '${temporary.replaceAll("'","''")}').VersionInfo; @{product=$v.ProductName;description=$v.FileDescription;version=$v.ProductVersion}|ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8',timeout:30000});
    const metadata=inspect.status===0?JSON.parse(inspect.stdout):null;if(metadata?.product!=='SanduBAH'||metadata?.description!=='SanduBAH')throw new Error('Identidade do executável não foi confirmada.');
    fs.renameSync(temporary,executable);
    const bootstrap=join(gui,'runtime/resources/app/main.cjs'),manifest=join(dirname(bootstrap),'package.json');for(const filename of [bootstrap,manifest])assertLocalWriteTree(root,filename);fs.mkdirSync(dirname(bootstrap),{recursive:true});
    fs.writeFileSync(bootstrap,"'use strict';\nrequire(require('node:path').resolve(__dirname,'../../../../../../src/sandubah-desktop/main.cjs'));\n");fs.writeFileSync(manifest,JSON.stringify({name:'sandubah-local',productName:'SanduBAH',private:true,main:'main.cjs'}));
    return {product:metadata.product,description:metadata.description,version:metadata.version,before,sha256:digest(fs.readFileSync(executable)),backup:true,coldStart:true};
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
module.exports={brandRuntime};
if(require.main===module){try{console.log(JSON.stringify(brandRuntime(resolve(__dirname,'..'))));}catch(error){console.error(error.message);process.exitCode=1;}}
