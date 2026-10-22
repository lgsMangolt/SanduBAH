'use strict';
const fs=require('node:fs');
const {join,resolve,dirname}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {privatePattern}=require('./build-sandubah-installer.cjs');
const root=resolve(__dirname,'..'),directory=join(root,'build/sandubah/distribution'),source=join(root,'build/sandubah/gui/vendor/node_modules/playwright-core');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function prepare(){
  const files=[];function walk(path){const filename=join(source,path),info=fs.lstatSync(filename);if(info.isSymbolicLink())throw new Error('A test dependency contains a link.');if(info.isDirectory()){for(const name of fs.readdirSync(filename).sort())walk(path?path+'/'+name:name);return;}if(!info.isFile())throw new Error('Invalid test dependency file.');const bytes=fs.readFileSync(filename);if(privatePattern.test(path)||/\.(?:cjs|mjs|js|json|html|css|txt|md|svg|map)$|(?:^|\/)(?:LICENSE|NOTICE)$/i.test(path)&&privatePattern.test(bytes.toString('utf8')))throw new Error('Private data found in test dependency.');files.push({path,sha256:hash(bytes)});}
  for(const path of ['package.json','index.js','index.mjs','LICENSE','NOTICE','browsers.json','lib'])if(fs.existsSync(join(source,path)))walk(path);
  const filename=join(directory,'SanduBAH-test-controller.zip'),auditFile=join(directory,'test-controller-audit.json'),sourceHash=hash(Buffer.from(JSON.stringify(files)));
  if(fs.existsSync(filename)&&fs.existsSync(auditFile)){const audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));if(audit.sourceHash===sourceHash&&hash(fs.readFileSync(filename))===audit.sha256)return {filename,name:'SanduBAH-test-controller.zip',sha256:audit.sha256,bytes:fs.statSync(filename).size};throw new Error('The staged test controller changed; do not overwrite its audit.');}
  const stage=join(directory,'test-controller-'+randomUUID());for(const entry of files){const destination=join(stage,'node_modules/playwright-core',entry.path);fs.mkdirSync(dirname(destination),{recursive:true});fs.copyFileSync(join(source,entry.path),destination);}
  const cache=join(process.env.LOCALAPPDATA,'electron-builder/Cache/7zip@1.0.0'),sevenZip=fs.readdirSync(cache).map(name=>join(cache,name,'bin/7za.exe')).find(path=>fs.existsSync(path));if(!sevenZip)throw new Error('The local archive tool is unavailable.');const result=spawnSync(sevenZip,['a','-tzip','-mx=1',filename,'node_modules'],{cwd:stage,encoding:'utf8',windowsHide:true,timeout:60000});if(result.status!==0)throw new Error('Could not stage the audited test controller.');const sha256=hash(fs.readFileSync(filename));fs.writeFileSync(auditFile,JSON.stringify({passed:true,sourceHash,sha256,files:files.length,privateDataIncluded:false,temporaryDraftAssetOnly:true},null,2));return {filename,name:'SanduBAH-test-controller.zip',sha256,bytes:fs.statSync(filename).size};
}
if(require.main===module)console.log(JSON.stringify(prepare()));module.exports={prepare};
