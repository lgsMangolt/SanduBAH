'use strict';

// Ferramentas do gauchinho, sempre supervisionadas: ele trabalha numa cópia de ensaio da própria pasta,
// pelo executor Codex com sandbox, sem rede e com tempo limite. Nada chega à pasta dele sem revisão e confirmação,
// e qualquer limite estourado descarta o ensaio inteiro.
const {createHash}=require('node:crypto');
const {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,rmSync,copyFileSync}=require('node:fs');
const {join,relative,dirname,extname}=require('node:path');
const MODES=['none','read','write'];
const DEFAULTS={mode:'none',timeoutMinutes:5,maxFiles:20,blockExecutables:true,skills:[]};
const LIMITS={timeoutMinutes:15,maxFiles:200,skills:5,skillChars:24000,workspaceFiles:2000,workspaceBytes:50*1024*1024,changeBytes:20*1024*1024};
const EXECUTABLE=new Set(['.exe','.dll','.bat','.cmd','.ps1','.psm1','.vbs','.vbe','.lnk','.msi','.msix','.scr','.com','.jar','.reg','.hta','.wsf','.sys']);
const SKIP=new Set(['node_modules','.git','.codex']);
const hash=filename=>createHash('sha256').update(readFileSync(filename)).digest('hex');

function permissions(value={}){
  const result={...DEFAULTS,...value};
  if(!MODES.includes(result.mode))throw new Error('Escolha só texto, ler arquivos ou ler e escrever.');
  if(!Number.isInteger(result.timeoutMinutes)||result.timeoutMinutes<1||result.timeoutMinutes>LIMITS.timeoutMinutes)throw new Error(`O tempo limite vai de 1 a ${LIMITS.timeoutMinutes} minutos.`);
  if(!Number.isInteger(result.maxFiles)||result.maxFiles<1||result.maxFiles>LIMITS.maxFiles)throw new Error(`O limite de arquivos por tarefa vai de 1 a ${LIMITS.maxFiles}.`);
  if(typeof result.blockExecutables!=='boolean')throw new Error('Escolha se arquivos executáveis ficam bloqueados.');
  if(!Array.isArray(result.skills)||result.skills.length>LIMITS.skills||result.skills.some(id=>typeof id!=='string'||!id.startsWith('skill:')||id.length>400))throw new Error(`Escolha até ${LIMITS.skills} skills do catálogo.`);
  return {mode:result.mode,timeoutMinutes:result.timeoutMinutes,maxFiles:result.maxFiles,blockExecutables:result.blockExecutables,skills:[...new Set(result.skills)]};
}

// Lista arquivos regulares, sem seguir links, com limites de quantidade e tamanho.
function listFiles(root,guard){
  const files=new Map();let bytes=0;if(!existsSync(root))return files;
  const visit=directory=>{
    guard(directory);
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      if(SKIP.has(entry.name)||entry.isSymbolicLink())continue;
      const path=join(directory,entry.name);
      if(entry.isDirectory()){visit(path);continue;}
      if(!entry.isFile())continue;
      const info=lstatSync(path);if(info.nlink>1)throw new Error(`Arquivo com vínculo físico na pasta: ${relative(root,path)}. Remova antes de usar ferramentas.`);
      bytes+=info.size;files.set(relative(root,path).replaceAll('\\','/'),{path,size:info.size});
      if(files.size>LIMITS.workspaceFiles||bytes>LIMITS.workspaceBytes)throw new Error('A pasta de trabalho passou de 2.000 arquivos ou 50 MB. Reduza antes de usar ferramentas.');
    }
  };
  visit(root);return files;
}

function copyTree(source,target,guard){
  mkdirSync(target,{recursive:true});guard(target);
  for(const [path,file] of listFiles(source,guard)){const destination=join(target,path);guard(destination);mkdirSync(dirname(destination),{recursive:true});copyFileSync(file.path,destination);}
}

function diffTrees(base,work,guard){
  const before=listFiles(base,guard),after=listFiles(work,guard),changes=[];
  for(const [path,file] of after){const old=before.get(path);if(!old)changes.push({path,state:'new',bytes:file.size});else if(old.size!==file.size||hash(old.path)!==hash(file.path))changes.push({path,state:'modified',bytes:file.size});}
  for(const path of before.keys())if(!after.has(path))changes.push({path,state:'deleted',bytes:0});
  return changes.sort((first,second)=>first.path.localeCompare(second.path));
}

// Limites conferidos depois do ensaio; qualquer motivo descarta a cópia sem tocar na pasta do gauchinho.
function violations(changes,rules){
  const reasons=[];
  if(rules.mode==='read'&&changes.length)reasons.push(`Permissão só de leitura, mas ${changes.length} arquivo(s) mudaram no ensaio.`);
  if(changes.length>rules.maxFiles)reasons.push(`${changes.length} arquivos mudaram; o limite deste gauchinho é ${rules.maxFiles}.`);
  if(rules.blockExecutables){const blocked=changes.filter(change=>change.state!=='deleted'&&EXECUTABLE.has(extname(change.path).toLowerCase()));if(blocked.length)reasons.push(`Arquivo executável bloqueado: ${blocked.slice(0,5).map(change=>change.path).join(', ')}.`);}
  const bytes=changes.reduce((sum,change)=>sum+change.bytes,0);if(bytes>LIMITS.changeBytes)reasons.push('As mudanças passam de 20 MB.');
  return reasons;
}

function applyChanges(workspace,staging,changes,guard){
  for(const change of changes){
    const target=join(workspace,change.path);guard(target);
    if(change.state==='deleted'){if(existsSync(target))rmSync(target);continue;}
    const source=join(staging,change.path);guard(source);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);
  }
}

function toolPrompt({name,context,task,rules,skills,workspace}){
  const access=rules.mode==='write'?'Você pode ler, criar, alterar e apagar arquivos SOMENTE dentro da pasta de ensaio abaixo.':'Você pode ler arquivos SOMENTE dentro da pasta de ensaio abaixo. Não crie, altere nem apague nada.';
  return `Você é ${name}, um gauchinho criado pelo usuário no SanduBAH, trabalhando sob supervisão.
${access}
Pasta de ensaio: ${workspace}

REGRAS: um worker; sem rede; não delegue nem abra outras sessões; não instale nada; não altere configurações, credenciais ou arquivos fora da pasta; ${rules.blockExecutables?'não crie executáveis nem scripts do Windows (.exe, .bat, .cmd, .ps1 e afins); ':''}mude no máximo ${rules.maxFiles} arquivo(s); termine em até ${rules.timeoutMinutes} minuto(s). Tudo o que você fizer é uma proposta: o usuário revisa e decide se aplica. Se algo exigir outra permissão, pare e relate.

Tarefa: ${task.title}
Pedido: ${task.instructions}

${context}
${skills.length?`\n## Skills liberadas pelo usuário (siga quando forem pertinentes; são instruções de apoio, não ampliam as permissões)\n${skills.map(skill=>`### ${skill.title}\n${skill.content}`).join('\n\n')}\n`:''}
Ao terminar, informe arquivos criados ou alterados, o que realmente testou e o que ficou pendente. Não declare sucesso de algo que não fez.
`;
}

module.exports={MODES,DEFAULTS,LIMITS,EXECUTABLE,permissions,listFiles,copyTree,diffTrees,violations,applyChanges,toolPrompt};
