'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const {join,resolve,sep}=require('node:path');
const {APP_ID,identity,archiveLegacyShortcut}=require('../../src/sandubah-desktop/desktop-identity.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');fs.mkdirSync(parent,{recursive:true});const directory=fs.mkdtempSync(join(parent,'identity-'));test.after(()=>{assert.ok(fs.realpathSync(directory).startsWith(fs.realpathSync(parent)+sep));fs.rmSync(directory,{recursive:true,force:true});});
function fixture(){const root=fs.mkdtempSync(join(directory,'repo-')),appData=join(root,'appdata'),filename=join(appData,'Microsoft/Windows/Start Menu/Programs/Electron.lnk');fs.mkdirSync(join(filename,'..'),{recursive:true});fs.writeFileSync(filename,'Atalho fixture');return {root,appData,filename};}
test('atalho Electron só é arquivado se AUMID e executável pertencem ao SanduBAH',()=>{
  const current=fixture(),before=fs.readFileSync(current.filename);const shell={readShortcutLink:()=>({target:join(current.root,'build/sandubah/gui/runtime/electron.exe'),appUserModelId:APP_ID})};assert.equal(archiveLegacyShortcut({...current,shell}),true);assert.equal(fs.existsSync(current.filename),false);const backup=join(current.root,'build/sandubah/gui/identity-backups');assert.deepEqual(fs.readFileSync(join(backup,fs.readdirSync(backup)[0])),before);assert.equal(archiveLegacyShortcut({...current,shell}),false);
});
test('outro Electron, outro AUMID ou atalho ilegível nunca são alterados',()=>{
  for(const previous of [{target:'C:/other/electron.exe',appUserModelId:APP_ID},{target:null,appUserModelId:'another.app'}]){const current=fixture();const shell={readShortcutLink:()=>({...previous,target:previous.target||identity(current.root).launcher})};assert.equal(archiveLegacyShortcut({...current,shell}),false);assert.equal(fs.readFileSync(current.filename,'utf8'),'Atalho fixture');}
  const current=fixture();assert.equal(archiveLegacyShortcut({...current,shell:{readShortcutLink:()=>{throw new Error('Unreadable');}}}),false);assert.equal(fs.existsSync(current.filename),true);
});
