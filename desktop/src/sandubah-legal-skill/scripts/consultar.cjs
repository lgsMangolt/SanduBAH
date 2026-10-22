'use strict';
const {homedir}=require('node:os');
const {join,resolve,dirname,relative,isAbsolute}=require('node:path');
const {existsSync,lstatSync,mkdirSync,writeFileSync,renameSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {LegalReference}=require('../legal-reference.cjs');
async function main(){
  const argumentsList=process.argv.slice(2),queryPosition=argumentsList.indexOf('--query'),limitPosition=argumentsList.indexOf('--limit');
  if(queryPosition<0||!argumentsList[queryPosition+1]||argumentsList.some((value,index)=>index!==queryPosition+1&&index!==limitPosition+1&&!['--query','--limit'].includes(value)))throw new Error('Use --query "temas do app/site" e, opcionalmente, --limit 3500 (1800–12000).');
  const query=argumentsList[queryPosition+1],maximum=limitPosition<0?3500:Number(argumentsList[limitPosition+1]);if(query.length>4000||!Number.isInteger(maximum)||maximum<1800||maximum>12000)throw new Error('Consulta ou limite inválido.');
  const directory=resolve(join(homedir(),'.cache/sandubah-legal'));
  function guard(filename){const resolved=resolve(filename),inside=relative(directory,resolved);if(inside==='..'||inside.startsWith('..\\')||inside.startsWith('../')||isAbsolute(inside))throw new Error('Cache fora da pasta autorizada.');for(let current=resolved;;current=dirname(current)){if(existsSync(current)){const info=lstatSync(current);if(info.isSymbolicLink()||info.isFile()&&info.nlink>1)throw new Error('Links não são permitidos no cache.');}if(current===dirname(current))break;}}
  const write=(filename,content)=>{guard(filename);mkdirSync(dirname(filename),{recursive:true});const temporary=filename+'.'+randomUUID()+'.tmp';writeFileSync(temporary,content,{flag:'wx',mode:0o600});renameSync(temporary,filename);};
  const legal=new LegalReference({directory,guard,write});await legal.prepare(query);const result=legal.context(query,maximum);process.stdout.write(JSON.stringify(result||{content:'Nenhuma norma do catálogo inicial correspondeu aos temas. Verifique a jurisdição e normas setoriais; isso não significa ausência de obrigações.',included:[],excluded:[]},null,2)+'\n');
}
main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
