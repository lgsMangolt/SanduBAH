'use strict';
const fs=require('node:fs');
const {join,resolve,dirname}=require('node:path');
const {homedir}=require('node:os');
const {createHash}=require('node:crypto');
const root=resolve(__dirname,'..'),home=resolve(process.env.CODEX_HOME||join(homedir(),'.codex')),destination=join(home,'skills/leis-brasil');
const sources=[['src/sandubah-legal-skill/SKILL.md','SKILL.md'],['src/sandubah-legal-skill/scripts/consultar.cjs','scripts/consultar.cjs'],['src/sandubah-desktop/legal-reference.cjs','legal-reference.cjs']];
function guard(path){for(let current=path;;current=dirname(current)){if(fs.existsSync(current)){const info=fs.lstatSync(current);if(info.isSymbolicLink()||info.isFile()&&info.nlink>1)throw new Error('Destino com link: instalação interrompida.');}if(current===dirname(current))break;}}
function install(){
  const staged=sources.map(([source,path])=>({path:join(destination,path),bytes:fs.readFileSync(join(root,source))}));
  for(const entry of staged){guard(entry.path);if(fs.existsSync(entry.path)&&!fs.readFileSync(entry.path).equals(entry.bytes))throw new Error('Skill já existente com conteúdo diferente; nada será sobrescrito.');}
  for(const entry of staged)if(!fs.existsSync(entry.path)){fs.mkdirSync(dirname(entry.path),{recursive:true});fs.writeFileSync(entry.path,entry.bytes,{flag:'wx'});}
  return {installed:true,destination,files:staged.map(entry=>({path:entry.path,sha256:createHash('sha256').update(entry.bytes).digest('hex')})),globalConfigChanged:false,fullRepositoryDownloaded:false};
}
module.exports={install};
if(require.main===module)try{console.log(JSON.stringify(install(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
