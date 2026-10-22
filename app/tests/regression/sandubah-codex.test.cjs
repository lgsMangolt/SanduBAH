'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {mkdtempSync,writeFileSync,readFileSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,relative}=require('node:path');
const {CodexWorker,codexSettings,workerArguments,workerEnvironment,hashFile}=require('../../src/sandubah-desktop/codex-worker.cjs');
const runtime=require('../../build/sandubah/gui/runtime.json');
const root=resolve(__dirname,'../..');
const temp=mkdtempSync(join(root,'build/sandubah/gui/tmp/codex-'));
test.after(()=>{assert.ok(!relative(realpathSync(join(root,'build/sandubah/gui/tmp')),realpathSync(temp)).startsWith('..'));rmSync(temp,{recursive:true,force:true});});
const settings=()=>{const home=mkdtempSync(join(temp,'profile-'));writeFileSync(join(home,'config.toml'),'model = "local-test"\nmodel_reasoning_effort = "low"\n[mcp_servers.other]\ncommand = "unchanged"\n');return codexSettings({CODEX_HOME:home});};
const message={type:'item.completed',item:{type:'agent_message',text:JSON.stringify({status:'completed',summary:'Executado',files:['result.js'],tests:['node --test: passed']})}};
const completed=[{type:'thread.started',thread_id:'fixture-thread'},message,{type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}];
function fakeWorker(events=completed,{code=0,wait=false,timeoutMs=5000,beforeClose}={}){
  let child,invocation,prompt='';
  const worker=new CodexWorker({runtime,codexHome:temp,timeoutMs,spawnProcess:(command,args,options)=>{
    invocation={command,args,options};child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;child.pid=12345;child.killed=false;
    child.stdin.on('data',chunk=>{prompt+=chunk;});child.stdin.on('finish',()=>{if(wait)return;for(const event of events)child.stdout.write(typeof event==='string'?event:JSON.stringify(event)+'\n');beforeClose?.();child.exitCode=code;child.emit('close',code,null);});
    return child;
  },killProcess:process=>{if(process.exitCode!==null)return;process.exitCode=1;queueMicrotask(()=>process.emit('close',1,null));}});
  return {worker,getInvocation:()=>invocation,getPrompt:()=>prompt};
}
test('invocação literal, um worker, sandbox, sem perfis herdados nem gateway',()=>{
  const profile=settings();const args=workerArguments({workspace:temp,outputPath:join(temp,'last-message.txt'),settings:profile});
  assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--no-daemon'));assert.ok(args.includes('--ephemeral'));assert.ok(args.includes('workspace-write'));assert.ok(args.includes('multi_agent'));assert.ok(args.includes('plugins'));assert.equal(args.at(-1),'-');assert.ok(!args.join(' ').includes('dangerously'));
  const env=workerEnvironment(runtime,profile,{PATH:'original',OPENAI_BASE_URL:'http://127.0.0.1:8082',HTTP_PROXY:'http://127.0.0.1:8082',ANTHROPIC_BASE_URL:'blocked',NODE_OPTIONS:'bad',CODEX_THREAD_ID:'other'});
  assert.equal(env.OPENAI_BASE_URL,undefined);assert.equal(env.HTTP_PROXY,undefined);assert.equal(env.ANTHROPIC_BASE_URL,undefined);assert.equal(env.CODEX_THREAD_ID,undefined);assert.equal(env.NODE_OPTIONS,'');assert.equal(env.CODEX_HOME,profile.home);
});
test('provedor customizado falha fechado, sem reescrever configuração',()=>{
  const profile=settings();writeFileSync(profile.configPath,'model_provider = "custom"\n');const before=hashFile(profile.configPath);assert.throws(()=>codexSettings({CODEX_HOME:profile.home}),/provedor/);assert.equal(hashFile(profile.configPath),before);
});
test('stdin fecha, cwd correto e sucesso exige turno e relatório',async()=>{
  const fixture=fakeWorker();const profile=settings();let events=0;
  const result=await fixture.worker.run({workspace:temp,runDirectory:temp,prompt:'Contexto português\nsem cópia manual',settings:profile,onEvent:()=>events++});
  assert.equal(result.success,true);assert.equal(result.threadId,'fixture-thread');assert.equal(events,3);assert.match(fixture.getPrompt(),/português/);assert.equal(fixture.getInvocation().options.cwd,temp);assert.equal(fixture.getInvocation().options.shell,false);assert.equal(hashFile(profile.configPath),profile.configHash);
});

test('referências visuais do executor precisam estar no workspace privado',async()=>{
  const fixture=fakeWorker(),photo=join(temp,'foto.png');writeFileSync(photo,Buffer.from([137,80,78,71,13,10,26,10]));
  await fixture.worker.run({workspace:temp,runDirectory:temp,prompt:'Implemente a referência visual',images:[photo],settings:settings()});
  const args=fixture.getInvocation().args;assert.equal(args[args.indexOf('--image')+1],photo);assert.equal(args.at(-1),'-');
  await assert.rejects(fixture.worker.run({workspace:temp,runDirectory:temp,prompt:'Negar',images:[join(root,'AGENTS.md')],settings:settings()}),/fora do workspace/);
});
for(const [name,events,code]of [['saída zero sem conclusão',[message],0],['erro de turno',[{type:'turn.failed',error:{message:'falhou'}}],0],['exit diferente de zero',completed,1],['JSONL inválido',['not-json\n'],0],['relatório bloqueado',[{...message,item:{...message.item,text:JSON.stringify({status:'blocked',summary:'sem acesso',files:[],tests:[]})}},completed[2]],0],['relatório não JSON',[{...message,item:{...message.item,text:'feito'}},completed[2]],0]]){
  test(name+' não conclui missão',async()=>{const fixture=fakeWorker(events,{code});const result=await fixture.worker.run({workspace:temp,runDirectory:temp,prompt:'test',settings:settings()});assert.equal(result.success,false);});
}
test('cancelamento aguarda saída e impede segundo worker',async()=>{
  const fixture=fakeWorker([],{wait:true});const request={workspace:temp,runDirectory:temp,prompt:'test',settings:settings()};const pending=fixture.worker.run(request);await assert.rejects(fixture.worker.run(request),/execução/);fixture.worker.cancel();const result=await pending;assert.equal(result.interrupted,true);assert.equal(result.cancelled,true);assert.equal(fixture.worker.child,null);
});
test('timeout interrompe sem sucesso',async()=>{const fixture=fakeWorker([],{wait:true,timeoutMs:20});const result=await fixture.worker.run({workspace:temp,runDirectory:temp,prompt:'test',settings:settings()});assert.equal(result.timedOut,true);assert.equal(result.success,false);});
test('mudança externa de config interrompe sem desfazer a mudança',async()=>{
  const profile=settings();const fixture=fakeWorker(completed,{beforeClose:()=>writeFileSync(profile.configPath,'model = "externally-updated"')});const result=await fixture.worker.run({workspace:temp,runDirectory:temp,prompt:'test',settings:profile});assert.equal(result.configPreserved,false);assert.equal(result.success,false);assert.match(readFileSync(profile.configPath,'utf8'),/externally-updated/);
});
