'use strict';
const {join,resolve,relative,isAbsolute,dirname}=require('node:path');
const {existsSync,readdirSync,renameSync,lstatSync,mkdirSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const APP_ID='br.sandubah.desktop';
const TOAST_CLSID='{8D58E096-87B5-4B03-94EF-B966AE4EB901}';
function identity(root){const launcher=join(root,'build/sandubah/gui/SanduBAH.exe'),icon=join(root,'build/sandubah/gui/SanduBAH.ico');return {appId:APP_ID,appIconPath:icon,appIconIndex:0,relaunchCommand:`"${launcher}"`,relaunchDisplayName:'SanduBAH',launcher,icon};}
function archiveLegacyShortcut({root,appData,shell}){
  const filename=resolve(appData,'Microsoft/Windows/Start Menu/Programs/Electron.lnk');if(!existsSync(filename))return false;
  const stat=lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)return false;
  let previous;try{previous=shell.readShortcutLink(filename);}catch{return false;}
  const target=resolve(previous.target).toLowerCase(),owned=[identity(root).launcher,join(root,'build/sandubah/gui/runtime/electron.exe')].map(path=>resolve(path).toLowerCase());
  if(previous.appUserModelId!==APP_ID||!owned.includes(target))return false;
  const backup=resolve(root,'build/sandubah/gui/identity-backups',`Electron-${randomUUID()}.lnk`),part=relative(resolve(root),backup);if(isAbsolute(part)||part==='..'||part.startsWith('..\\')||part.startsWith('../'))throw new Error('Backup de identidade fora do workspace.');
  for(let cursor=backup;;cursor=dirname(cursor)){if(existsSync(cursor)&&lstatSync(cursor).isSymbolicLink())throw new Error('Backup de identidade com link não permitido.');if(cursor===dirname(cursor))break;}
  mkdirSync(dirname(backup),{recursive:true});renameSync(filename,backup);return true;
}
function configureIdentity({app,window,shell,root,hidden=false,distribution=null}){
  const info=distribution?.installed?{appId:APP_ID,launcher:distribution.launcher,icon:distribution.launcher,relaunchCommand:`"${distribution.launcher}"`}:identity(root);if(process.platform!=='win32')return info;
  app.setAppUserModelId(APP_ID);window.setAppDetails({appId:info.appId,appIconPath:info.icon,appIconIndex:0,relaunchCommand:info.relaunchCommand,relaunchDisplayName:'SanduBAH'});
  if(hidden||distribution?.installed||!existsSync(info.launcher))return info;
  const details={target:info.launcher,cwd:root,icon:info.icon,iconIndex:0,description:'SanduBAH',appUserModelId:APP_ID,toastActivatorClsid:TOAST_CLSID,args:''};
  const menu=join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs/SanduBAH.lnk');shell.writeShortcutLink(menu,'create',details);
  archiveLegacyShortcut({root,appData:app.getPath('appData'),shell});
  const pinned=join(app.getPath('appData'),'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar');
  if(existsSync(pinned))for(const name of readdirSync(pinned).filter(name=>name.endsWith('.lnk'))){const filename=join(pinned,name);try{const previous=shell.readShortcutLink(filename),target=resolve(previous.target).toLowerCase();if(![resolve(info.launcher).toLowerCase(),resolve(join(root,'build/sandubah/gui/runtime/electron.exe')).toLowerCase()].includes(target))continue;shell.writeShortcutLink(filename,'update',details);if(name!=='SanduBAH.lnk'&&!existsSync(join(pinned,'SanduBAH.lnk')))renameSync(filename,join(pinned,'SanduBAH.lnk'));}catch{}}
  return info;
}
module.exports={APP_ID,TOAST_CLSID,identity,configureIdentity,archiveLegacyShortcut};
