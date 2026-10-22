'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {mkdirSync,mkdtempSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {resolve,join,sep}=require('node:path');
const {ModelManager}=require('../../src/sandubah-desktop/model-manager.cjs');
const {MODELS,modelById,modelDirectory}=require('../../src/sandubah-desktop/model-catalog.cjs');

function fixture(){
  const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
  const root=mkdtempSync(join(parent,'models-test-'));
  const python=join(root,'python.exe');writeFileSync(python,'fixture, never executed');
  const ready=new Set(),children=[],calls=[];let busy=false;
  const planner={python,modelId:'qwen-2b',select(id){this.modelId=id;},status:id=>({ready:ready.has(id),message:'fixture'})};
  const manager=new ModelManager({root,guard:filename=>{assert.ok(filename.startsWith(root+sep));return filename;},planner,isBusy:()=>busy,
    execute:async(_label,operation)=>{assert.equal(busy,false);busy=true;try{return await operation();}finally{busy=false;}},
    launch:(command,args,options)=>{const child=new EventEmitter();Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough()});children.push(child);calls.push({command,args,options});return child;},terminate:child=>child?.emit('close',1)});
  return {manager,root,planner,children,calls,ready,setBusy:value=>{busy=value;},close(){manager.close();assert.ok(realpathSync(root).startsWith(realpathSync(parent)+sep));rmSync(root,{recursive:true,force:true});}};
}
const tick=()=>new Promise(resolvePromise=>setImmediate(resolvePromise));
function finish(child,ok=true){child.stdout.write(JSON.stringify({type:'result',ok})+'\n');child.emit('close',ok?0:1);}

test('catálogo tem três níveis, fontes oficiais e bloqueio explícito do Kimi',()=>{
  assert.deepEqual(MODELS.map(model=>model.tier),['Leve','Médio','Alto']);
  for(const model of MODELS){assert.match(model.url,/^https:\/\/huggingface.co\//);assert.ok(model.ram&&model.vram&&model.disk);}
  assert.equal(modelById('kimi-k3').supported,false);assert.throws(()=>modelById('../../config'));
  assert.notEqual(modelDirectory('root','qwen-0.8b'),modelDirectory('root','qwen-2b'));
});

test('pipeline usa processos sequenciais e ambiente sem segredos (children fixture)',async()=>{
  const fixtureValue=fixture();const {manager,children,calls,ready}=fixtureValue;
  try{
    manager.enqueue('qwen-0.8b');manager.enqueue('qwen-2b');assert.equal(children.length,1);
    assert.throws(()=>manager.enqueue('qwen-0.8b'),/fila/);
    assert.throws(()=>manager.select('qwen-2b'),/Aguarde/);
    assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.windowsHide,true);assert.equal(calls[0].options.env.HF_TOKEN,undefined);
    children[0].stdout.write(JSON.stringify({type:'progress',message:'Baixando fixture',percent:37})+'\n');assert.equal(manager.snapshot().tasks[0].percent,37);
    finish(children[0]);await tick();assert.equal(children.length,2);assert.ok(calls[1].args.includes('prepare'));
    finish(children[1]);await tick();assert.equal(children.length,3);assert.ok(calls[2].args.includes('smoke'));
    ready.add('qwen-0.8b');finish(children[2]);await tick();assert.equal(children.length,4);
    assert.equal(manager.snapshot().tasks[0].state,'done');assert.equal(manager.snapshot().tasks[1].state,'running');
    const second=manager.snapshot().tasks[1];manager.cancel(second.id);await tick();assert.equal(second.state,'running');assert.equal(manager.snapshot().tasks[1].state,'cancelled');
  }finally{fixtureValue.close();}
});

test('fila espera outro trabalho e permite remover pendências sem iniciar processo',async()=>{
  const fixtureValue=fixture();try{fixtureValue.setBusy(true);const task=fixtureValue.manager.enqueue('qwen-0.8b');assert.equal(fixtureValue.children.length,0);fixtureValue.manager.cancel(task.id);fixtureValue.setBusy(false);await fixtureValue.manager.pump();assert.equal(fixtureValue.children.length,0);}finally{fixtureValue.close();}
});

test('falha na preparação não inicia teste e nunca libera o modelo',async()=>{
  const fixtureValue=fixture();try{fixtureValue.manager.enqueue('qwen-0.8b');finish(fixtureValue.children[0]);await tick();finish(fixtureValue.children[1],false);await tick();assert.equal(fixtureValue.children.length,2);assert.equal(fixtureValue.manager.snapshot().tasks[0].state,'error');assert.equal(fixtureValue.manager.snapshot().models[0].ready,false);}finally{fixtureValue.close();}
});

test('Kimi e ações desconhecidas não podem iniciar downloads pelo backend',()=>{
  const fixtureValue=fixture();try{assert.throws(()=>fixtureValue.manager.enqueue('kimi-k3'),/3,9/);assert.throws(()=>fixtureValue.manager.enqueue('qwen-2b','exec'));assert.equal(fixtureValue.children.length,0);}finally{fixtureValue.close();}
});

test('seleção persiste somente na cópia local e modelo desconhecido é recusado',()=>{
  const fixtureValue=fixture();try{fixtureValue.manager.select('qwen-0.8b');assert.equal(fixtureValue.manager.snapshot().selected,'qwen-0.8b');assert.throws(()=>fixtureValue.manager.select('foreign'));assert.equal(fixtureValue.manager.snapshot().selected,'qwen-0.8b');}finally{fixtureValue.close();}
});

test('IA incompatível não substitui o planejador e seleção antiga incompatível é ignorada',()=>{
  const fixtureValue=fixture();
  try{
    assert.throws(()=>fixtureValue.manager.select('kimi-k3'),/incompatível/);
    assert.equal(fixtureValue.planner.modelId,'qwen-2b');
    mkdirSync(join(fixtureValue.root,'build/sandubah/airllm'),{recursive:true});
    writeFileSync(join(fixtureValue.root,'build/sandubah/airllm/model-selection.json'),JSON.stringify({selected:'kimi-k3'}));
    const restored=new ModelManager({root:fixtureValue.root,guard:filename=>filename,planner:fixtureValue.planner,isBusy:()=>false});
    assert.equal(restored.snapshot().selected,'qwen-2b');restored.close();
  }finally{fixtureValue.close();}
});

test('cancelar durante download impede instalação automática posterior',async()=>{
  const fixtureValue=fixture();try{const task=fixtureValue.manager.enqueue('qwen-0.8b');fixtureValue.manager.cancel(task.id);await tick();assert.equal(fixtureValue.children.length,1);assert.equal(fixtureValue.manager.snapshot().tasks[0].state,'cancelled');}finally{fixtureValue.close();}
});

test('falha nativa mostra etapa, código e diagnóstico, sem atribuir tudo à RAM',async()=>{
  const fixtureValue=fixture();
  try{
    fixtureValue.manager.enqueue('qwen-0.8b');
    fixtureValue.children[0].stderr.write('Traceback fixture\nModuleNotFoundError: fixture\n');
    fixtureValue.children[0].emit('close',1);await tick();
    const task=fixtureValue.manager.snapshot().tasks[0];
    assert.equal(task.state,'error');assert.match(task.error,/download encerrou com código 1/);
    assert.match(task.error,/ModuleNotFoundError: fixture/);assert.doesNotMatch(task.error,/bloqueada por memória/);
    assert.equal(fixtureValue.children.length,1);
  }finally{fixtureValue.close();}
});
