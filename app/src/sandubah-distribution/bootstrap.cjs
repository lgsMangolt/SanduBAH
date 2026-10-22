'use strict';
const {app,BrowserWindow,dialog,protocol}=require('electron');
const fs=require('node:fs');
const {join,resolve,dirname,basename}=require('node:path');
const {homedir,tmpdir}=require('node:os');
const {materializeAsync,safePath,atomic}=require('./workspace-image.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'sandubah-media',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}},{scheme:'sandubah-preview',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
function findCodex(home){
  const candidates=[join(home,'.local/bin/codex.exe'),join(home,'AppData/Local/Microsoft/WindowsApps/codex.exe')];
  const directory=join(home,'AppData/Local/OpenAI/Codex/bin');if(fs.existsSync(directory))for(const entry of fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory()))candidates.push(join(directory,entry.name,'codex.exe'));
  return candidates.reverse().find(path=>fs.existsSync(path)&&fs.lstatSync(path).isFile())||'';
}
async function start(){
  app.setName('SanduBAH');const resources=process.resourcesPath,test=process.argv.includes('--sandubah-installation-test');
  let dataRoot=join(process.env.LOCALAPPDATA||join(homedir(),'AppData/Local'),'SanduBAH/workspace');
  if(test){const supplied=resolve(process.env.SANDUBAH_INSTALLATION_TEST_ROOT||'');if(dirname(supplied)!==resolve(tmpdir())||!/^sandubah-installation-test-[a-f0-9-]{36}$/.test(basename(supplied)))throw new Error('Pasta de teste da instalação inválida.');dataRoot=join(supplied,'workspace');}
  fs.mkdirSync(dataRoot,{recursive:true});const profile=safePath(dataRoot,'build/sandubah/gui/'+(test?'test-profile':'profile'));fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
  if(!test&&!app.requestSingleInstanceLock()){app.quit();}else{
    app.on('second-instance',()=>{const window=BrowserWindow.getAllWindows()[0];if(window){if(window.isMinimized())window.restore();window.focus();}});
    await app.whenReady();let loading,mainStarted=false;
    if(!test){loading=new BrowserWindow({width:520,height:300,resizable:false,autoHideMenuBar:true,title:'Preparando SanduBAH',backgroundColor:'#f7f8f2',webPreferences:{preload:join(__dirname,'loading-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});loading.on('closed',()=>{if(!mainStarted)app.quit();});loading.webContents.setWindowOpenHandler(()=>({action:'deny'}));loading.webContents.on('will-navigate',event=>event.preventDefault());await loading.loadFile(join(__dirname,'loading.html'));}
    const installed=await materializeAsync({image:join(resources,'app-image.asar'),workspace:dataRoot},progress=>{if(loading&&!loading.isDestroyed()){const percent=Math.min(99,Math.round(100*progress.completed/progress.total));loading.setProgressBar(percent/100);loading.webContents.send('sandubah:loading',`${progress.phase==='verifying'?'Conferindo arquivos':progress.phase==='backup'?'Protegendo a versão anterior':'Preparando seu espaço'} · ${percent}%`);}});
    const updateConfig=JSON.parse(fs.readFileSync(join(resources,'update-public.json'),'utf8'));
    for(const directory of ['home/AppData/Roaming','home/AppData/Local','home/.cache','home/.config','project','tmp','logs'])fs.mkdirSync(safePath(dataRoot,'build/sandubah/gui/'+directory),{recursive:true});
    const runtime={nodeExecutable:join(resources,'node/node.exe'),electronExecutable:process.execPath,stateDirectory:join(dataRoot,'build/sandubah/gui/project'),codexExecutable:test?'':findCodex(homedir()),distribution:{version:installed.version,launcher:process.execPath,installed:true,testing:test},updateConfig};
    atomic(dataRoot,'build/sandubah/gui/runtime.json',JSON.stringify(runtime,null,2));
    if(test&&!process.argv.includes('--sandubah-test'))process.argv.push('--sandubah-test');
    if(loading)app.once('browser-window-created',(_event,window)=>{mainStarted=true;window.webContents.once('did-finish-load',()=>{if(!loading.isDestroyed())loading.destroy();});});
    require(join(dataRoot,'src/sandubah-desktop/main.cjs'));
  }
}
start().catch(error=>{if(process.argv.includes('--sandubah-installation-test')){process.stderr.write(String(error.stack)+'\n');app.exit(1);}else app.whenReady().then(()=>{dialog.showErrorBox('Não foi possível abrir o SanduBAH',String(error.message));app.quit();});});
