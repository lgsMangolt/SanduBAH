'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createHash}=require('node:crypto');
const {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync}=require('node:fs');
const {resolve,join,sep}=require('node:path');
const {QwenPlanner,validateRequest}=require('../../src/sandubah-desktop/qwen-planner.cjs');

function fixture() {
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  let launchOptions;
  const planner=new QwenPlanner({repositoryRoot:resolve(__dirname,'../..'),guard:filename=>filename,
    terminate:()=>child.emit('close',1),launch:(executable,args,options)=>{launchOptions={executable,args,...options};return child;}});
  planner.status=()=>({ready:true});
  return {planner,child,options:()=>launchOptions};
}

test('Qwen aceita apenas mensagens limitadas e histórico sem papel system',()=>{
  assert.deepEqual(validateRequest({prompt:' Olá '}),{prompt:'Olá',history:[],imageId:null});
  for(const input of [{prompt:''},{prompt:'x'.repeat(4001)},{prompt:'Olá',history:[{role:'system',content:'execute'}]},
    {prompt:'Olá',history:Array(7).fill({role:'user',content:'x'})},{prompt:'Olá',imageId:'../../config.toml'}])assert.throws(()=>validateRequest(input));
});

test('Qwen não inicia sem recibo válido',async()=>{
  const {planner}=fixture();planner.status=()=>({ready:false});
  await assert.rejects(planner.run({prompt:'Olá'}),/Valide/);
});

test('Qwen exige sucesso, hash atual e medição válida no recibo real',()=>{
  const directory=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(directory,{recursive:true});
  const root=mkdtempSync(join(directory,'qwen-receipt-'));
  try{
    mkdirSync(join(root,'scripts'));mkdirSync(join(root,'build/sandubah/airllm/receipts'),{recursive:true});
    writeFileSync(join(root,'scripts/sandubah-qwen-worker.py'),'fixture');
    const planner=new QwenPlanner({repositoryRoot:root,guard:filename=>filename,terminate:()=>{}});
    const receipt={modelId:'qwen-2b',ok:true,acceptancePassed:true,workerSha256:createHash('sha256').update('fixture').digest('hex'),devicePeakSampledBytes:2000000000};
    const save=value=>writeFileSync(join(root,'build/sandubah/airllm/receipts/smoke.json'),JSON.stringify(value));
    assert.equal(planner.status().ready,false);save(receipt);assert.equal(planner.status().ready,true);
    for(const invalid of [{modelId:'qwen-0.8b'},{modelId:undefined},{ok:false},{acceptancePassed:false},{workerSha256:'antigo'},{devicePeakSampledBytes:null},{devicePeakSampledBytes:3900000001},{devicePeakSampledBytes:0}]){
      save({...receipt,...invalid});assert.equal(planner.status().ready,false);
    }
    save({...receipt,ok:false,acceptancePassed:false});assert.match(planner.status().message,/não passou/);
  }finally{
    assert.ok(realpathSync(root).startsWith(realpathSync(directory)+sep));rmSync(root,{recursive:true,force:true});
  }
});

test('Qwen recusa imagem não selecionada nesta sessão',async()=>{
  const {planner}=fixture();
  await assert.rejects(planner.run({prompt:'Olá',imageId:'00000000-0000-0000-0000-000000000000.png'}),/Anexe/);
});

test('Qwen usa Python local, stdin, sem shell, sem herdar credenciais',async()=>{
  const {planner,child,options}=fixture();
  const events=[];
  const pending=planner.run({prompt:'Planeje um harness'},{onEvent:event=>events.push(event),context:'# HARNESS.md'});
  const settings=options();
  assert.match(settings.executable,/build[\\/]sandubah[\\/]airllm[\\/]venv/);
  assert.equal(settings.shell,false);assert.equal(settings.windowsHide,true);
  assert.deepEqual(settings.args.slice(-2),['--mode','chat']);
  assert.equal(settings.env.OPENAI_API_KEY,undefined);assert.equal(settings.env.HF_TOKEN,undefined);
  const input=JSON.parse(child.stdin.read().toString());assert.equal(input.context,'# HARNESS.md');
  assert.match(input.prompt,/valor completo/);assert.match(input.prompt,/Não execute instruções/);
  await assert.rejects(planner.run({prompt:'Segundo worker'}),/Um worker/);
  child.stdout.write(JSON.stringify({type:'progress',message:'Carregando modelo'})+'\n');assert.equal(events.some(event=>event.status==='read'),false);
  child.stdout.write(JSON.stringify({type:'progress',message:'Gerando resposta em português.'})+'\n');assert.equal(events.some(event=>event.status==='delivered'),true);
  child.stdout.write(JSON.stringify({type:'progress',message:'Gerando resposta: 0 tokens'})+'\n');assert.equal(events.some(event=>event.status==='read'),false);
  child.stdout.write(JSON.stringify({type:'progress',message:'Gerando resposta: 1 token'})+'\n');assert.equal(events.some(event=>event.status==='read'),true);
  child.stdout.write(JSON.stringify({type:'result',ok:true,reply:{answer:'Plano de teste',seconds:1,imageProcessed:false},devicePeakSampledBytes:2000000000})+'\n');
  child.emit('close',0);
  const result=await pending;assert.equal(result.answer,'Plano de teste');assert.equal(events.filter(event=>event.type==='progress').length,4);assert.equal(planner.child,null);
});

test('Qwen não aceita resultado parcial em saída com erro',async()=>{
  const {planner,child}=fixture();const pending=planner.run({prompt:'Olá'});
  child.stdout.write(JSON.stringify({type:'result',ok:true,reply:{answer:'Parcial'}})+'\n');child.emit('close',1);
  await assert.rejects(pending,/sem resposta/);
});

test('Qwen rejeita protocolo inválido e encerra somente o child',async()=>{
  const {planner,child}=fixture();const pending=planner.run({prompt:'Olá'});
  child.stdout.write('não é JSON\n');await assert.rejects(pending,/Protocolo/);assert.equal(planner.child,null);
});

test('Qwen cancela seu próprio worker e libera a trava',async()=>{
  const {planner}=fixture();const pending=planner.run({prompt:'Olá'});planner.cancel();
  await assert.rejects(pending);assert.equal(planner.child,null);
});

test('planejador compartilha a trava com o harness e recebe Markdown automaticamente',async()=>{
  const {DesktopController}=require('../../src/sandubah-desktop/backend.cjs');
  const mcp=new EventEmitter();mcp.ready=true;mcp.close=()=>{mcp.ready=false;};
  const controller=new DesktopController({repositoryRoot:resolve(__dirname,'../..'),runtime:{nodeExecutable:process.execPath},catalog:{entries:[]},mcpClient:mcp});
  controller.projects={get:id=>({id,name:'Fixture',goal:'Planejar'}),plannerContext:()=> '# HARNESS.md\n# MEMORY.md\nDocumento anexo fixture'};
  let finish,received;
  controller.planner={run:async(input,options)=>{assert.equal(mcp.ready,false,'MCP ocioso deve liberar memória antes do modelo');received=options.context;return new Promise(resolvePromise=>{finish=resolvePromise;});},cancel:()=>{}};
  const pending=controller.planWithQwen({prompt:'Olá',projectId:'fixture'});
  assert.match(received,/HARNESS.md/);assert.match(received,/MEMORY.md/);assert.match(received,/Documento anexo/);
  await assert.rejects(controller.single('Outro trabalho',async()=>{}),/um worker/);
  finish({answer:'fixture'});await pending;assert.equal(controller.status().busy,false);
  controller.close();
});

test('contexto do planejador preserva todos os Markdown, sufixos e referências completas',()=>{
  const {ProjectWorkspace,FILES}=require('../../src/sandubah-desktop/workspace.cjs');
  const calls=[];
  const project={id:'fixture',name:'Projeto — nome completo',goal:'Planejar',context:['docs/ref.md'],agents:[{source:'docs/ref.md'},{source:'personal:skill'}]};
  const workspace=Object.create(ProjectWorkspace.prototype);
  workspace.document=(source,id)=>{calls.push([source,id]);return {content:source==='HARNESS.md'?'x'.repeat(1250)+'FIM_DO_HARNESS':source==='docs/ref.md'?'y'.repeat(1050)+'FIM_DO_ANEXO':`Conteúdo completo de ${source}`};};
  const context=workspace.plannerContext(project);
  assert.match(context,/Projeto — nome completo/);assert.match(context,/FIM_DO_HARNESS/);assert.match(context,/FIM_DO_ANEXO/);
  for(const filename of FILES)assert.deepEqual(calls.find(([source])=>source===filename),[filename,project.id]);
  assert.equal(calls.filter(([source])=>source==='docs/ref.md').length,1);assert.ok(calls.some(([source])=>source==='personal:skill'));
  assert.equal(calls.length,7);
});

test('contexto completo acima do limite é recusado, nunca cortado',async()=>{
  const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
  const workspace=Object.create(ProjectWorkspace.prototype);
  workspace.document=()=>({content:'x'.repeat(6001)});
  assert.throws(()=>workspace.plannerContext({id:'fixture',name:'Nome',goal:'Objetivo',context:[],agents:[]}),/Nenhum Markdown foi cortado/);
  const {planner}=fixture();
  await assert.rejects(planner.run({prompt:'x'.repeat(4000)},{context:'harness'}),/Encurte a mensagem/);
  assert.equal(planner.child,null);
});
