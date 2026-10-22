'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, lstatSync, realpathSync } = require('node:fs');
const { join, dirname, delimiter, resolve, relative, isAbsolute } = require('node:path');
const hashFile = filename => existsSync(filename) ? createHash('sha256').update(readFileSync(filename)).digest('hex') : null;

function codexSettings(environment=process.env) {
  const home=environment.CODEX_HOME || join(environment.USERPROFILE || environment.HOME,'.codex');
  const configPath=join(home,'config.toml');
  const source=existsSync(configPath)?readFileSync(configPath,'utf8'):'';
  const top=source.split(/^\s*\[/m)[0];
  const model=top.match(/^model\s*=\s*["']([a-zA-Z0-9._/-]+)["']\s*$/m)?.[1];
  const effort=top.match(/^model_reasoning_effort\s*=\s*["'](low|medium|high|xhigh|max|ultra)["']\s*$/m)?.[1];
  if(top.match(/^model_provider\s*=\s*["'](?!openai["'])/m))throw new Error('Este perfil usa um provedor personalizado. A integração não troca nem acessa seu gateway; escolha um perfil separado antes de executar.');
  return {home,configPath,configHash:hashFile(configPath),model,effort};
}

function workerArguments({workspace,outputPath,settings,sandbox='workspace-write'}) {
  if(!['workspace-write','read-only'].includes(sandbox))throw new Error('Sandbox inválido.');
  const args=['--no-daemon','-a','never','exec','--json','--color','never','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox',sandbox,'-C',workspace,'--output-last-message',outputPath,'--output-schema',join(dirname(outputPath),'result-schema.json')];
  for(const feature of ['multi_agent','multi_agent_v2','plugins','hooks','apps','browser_use','computer_use','skill_mcp_dependency_install'])args.push('--disable',feature);
  for(const config of ['windows.sandbox="unelevated"','project_root_markers=[]','sandbox_workspace_write.network_access=false','web_search="disabled"','features.skip_host_skill_discovery=true'])args.push('-c',config);
  if(settings.model)args.push('-m',settings.model);
  if(settings.effort)args.push('-c',`model_reasoning_effort=${JSON.stringify(settings.effort)}`);
  args.push('-');return args;
}

function workerEnvironment(runtime,settings,environment=process.env) {
  const result={...environment,CODEX_HOME:settings.executionHome || settings.home,HOME:settings.executionHome || settings.home,USERPROFILE:settings.executionHome || settings.home,NODE_OPTIONS:'',NODE_PATH:'',PATH:[dirname(runtime.nodeExecutable),environment.PATH || ''].join(delimiter)};
  for(const name of ['ELECTRON_RUN_AS_NODE','CODEX_THREAD_ID','CODEX_INTERNAL_ORIGINATOR_OVERRIDE','OPENAI_BASE_URL','OPENAI_API_BASE','OPENAI_API_KEY','CODEX_API_KEY'])delete result[name];
  for(const name of Object.keys(result))if(/^(?:https?_proxy|all_proxy|no_proxy|anthropic_.*)$/i.test(name))delete result[name];
  return result;
}

class CodexWorker {
  constructor({runtime,codexHome,spawnProcess=spawn,killProcess,timeoutMs=900000}) {
    this.runtime=runtime;this.codexHome=codexHome;this.spawnProcess=spawnProcess;this.timeoutMs=timeoutMs;this.child=null;this.cancelled=false;
    this.killProcess=killProcess || (child=>{
      if(!child||child.exitCode!==null||child.killed||!Number.isInteger(child.pid))return;
      if(process.platform==='win32')spawnSync(join(process.env.SystemRoot || 'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore',timeout:5000});
      if(child.exitCode===null&&!child.killed)child.kill();
    });
  }
  cancel(){this.cancelled=true;this.killProcess(this.child);}
  async run({workspace,runDirectory,prompt,images=[],onEvent=()=>{},settings=codexSettings(),sandbox='workspace-write'}) {
    if(this.child)throw new Error('O worker Codex já está em execução.');
    if(!this.codexHome||this.codexHome.toLowerCase()===settings.home.toLowerCase())throw new Error('O executor exige perfil privado, separado do Codex global.');
    if(!existsSync(this.runtime.codexExecutable))throw new Error('Codex local não encontrado. Atualize o runtime local, sem instalar pacotes da rede.');
    this.cancelled=false;
    const args=workerArguments({workspace,outputPath:join(runDirectory,'last-message.txt'),settings,sandbox});
    if(!Array.isArray(images)||images.length>16)throw new Error('Use até 16 imagens por execução.');
    for(const image of images){const filename=resolve(image),inside=relative(realpathSync(workspace),realpathSync(filename)),info=lstatSync(filename);if(inside.startsWith('..')||isAbsolute(inside)||!info.isFile()||info.isSymbolicLink()||info.nlink>1||info.size>10*1024*1024)throw new Error('Imagem fora do workspace privado.');args.splice(args.length-1,0,'--image',filename);}
    return new Promise((resolvePromise,rejectPromise)=>{
      let buffer='',completed=false,failure='',timedOut=false,threadId=null,finalMessage='',stderr='',eventCount=0,usage=null,protocolFailure=false;
      const child=this.spawnProcess(this.runtime.codexExecutable,args,{cwd:workspace,env:workerEnvironment(this.runtime,{...settings,executionHome:this.codexHome}),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
      this.child=child;
      const timer=setTimeout(()=>{timedOut=true;this.killProcess(child);},this.timeoutMs);
      const receive=line=>{
        if(!line.trim())return;
        let event;try{event=JSON.parse(line);}catch{protocolFailure=true;failure='Resposta JSONL inválida do Codex.';this.killProcess(child);return;}
        if(++eventCount>20000){protocolFailure=true;failure='Limite de eventos excedido.';this.killProcess(child);return;}
        if(event.type==='thread.started')threadId=event.thread_id;
        if(event.type==='turn.completed'){completed=true;usage=event.usage || null;}
        if(event.type==='turn.failed')failure=event.error?.message || 'O turno Codex falhou.';
        if(event.type==='error')failure=event.message || event.error?.message || 'Erro do Codex.';
        if(event.type==='item.completed'&&event.item?.type==='agent_message')finalMessage=String(event.item.text || '').slice(-32000);
        try{onEvent(event);}catch(error){protocolFailure=true;failure=error.message;this.killProcess(child);}
      };
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',chunk=>{buffer+=chunk;if(Buffer.byteLength(buffer)>2000000){protocolFailure=true;failure='Evento do Codex excedeu 2 MiB.';this.killProcess(child);return;}let newline;while((newline=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);receive(line);}});
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
      child.stdin.on('error',error=>{failure=error.message;});
      child.once('error',error=>{clearTimeout(timer);this.child=null;rejectPromise(error);});
      child.once('close',(exitCode,signal)=>{
        clearTimeout(timer);this.child=null;if(buffer.trim())receive(buffer);
        let configPreserved=false;try{configPreserved=hashFile(settings.configPath)===settings.configHash;}catch{failure='Não foi possível verificar a configuração após a execução.';}
        const interrupted=this.cancelled||timedOut||Boolean(signal)||exitCode===null||protocolFailure;
        let report;try{report=JSON.parse(finalMessage);}catch{}
        const validReport=report&&['completed','blocked'].includes(report.status)&&typeof report.summary==='string'&&Array.isArray(report.files)&&report.files.every(file=>typeof file==='string')&&Array.isArray(report.tests)&&report.tests.every(value=>typeof value==='string');
        const success=!interrupted&&!failure&&completed&&exitCode===0&&configPreserved&&validReport&&report.status==='completed';
        resolvePromise({success:Boolean(success),interrupted,cancelled:this.cancelled,timedOut,exitCode,threadId,usage,configPreserved,message:!configPreserved?'A configuração mudou durante a execução. A fila foi interrompida sem restaurá-la.':failure||(!completed?'O Codex não confirmou a conclusão do turno.':!validReport?'Relatório final inválido. Revise os arquivos.':report.status==='blocked'?'O executor relatou uma limitação.':null),finalMessage,diagnostic:success?'':stderr});
      });
      child.stdin.end(prompt);
    });
  }
}

module.exports={CodexWorker,codexSettings,workerArguments,workerEnvironment,hashFile};
