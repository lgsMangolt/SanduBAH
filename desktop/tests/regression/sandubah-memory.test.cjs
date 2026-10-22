'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {join,resolve}=require('node:path');
const {readFileSync}=require('node:fs');
const {MemoryMonitor,normalizeMemory}=require('../../src/sandubah-desktop/memory-monitor.cjs');
const GIB=1024**3;
const sample={ram:{total:16*GIB,free:5*GIB,commitTotal:32*GIB,commitFree:8*GIB},gpu:{total:6*GIB,free:6*GIB-1e9,used:1e9}};
const view=()=>import('../../src/sandubah-desktop/memory.mjs');

function fixture(options={}){
  const calls=[],children=[];let now=100000;
  const root=resolve(__dirname,'../../');
  const monitor=new MemoryMonitor({root,python:join(root,'build/sandubah/airllm/venv/Scripts/python.exe'),guard:filename=>filename,now:()=>now,readRam:()=>null,...options,
    launch:(command,args,settings)=>{const child=new EventEmitter();Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),kill(){child.killed=true;child.emit('close',1);}});calls.push({command,args,settings});children.push(child);return child;}});
  return {monitor,calls,children,advance:()=>{now+=6000;},finish(value=sample){children.at(-1).stdout.write(JSON.stringify(value));children.at(-1).emit('close',0);}};
}

test('normalização mantém zero real e recusa números inválidos sem fingir memória livre',()=>{
  assert.deepEqual(normalizeMemory(null,1),{sampledAt:1,ram:null,gpu:null});
  for(const free of [-1,NaN,Infinity,'1',17*GIB])assert.equal(normalizeMemory({ram:{...sample.ram,free}},1).ram,null);
  assert.equal(normalizeMemory({ram:{...sample.ram,free:0}},1).ram.free,0);
  assert.equal(normalizeMemory({ram:{...sample.ram,commitFree:100*GIB}},1).ram.commitFree,null);
  assert.equal(normalizeMemory({gpu:{...sample.gpu,used:Infinity}},1).gpu,null);
});

test('sondagem coalesce chamadas, aplica cache e não carrega modelo nem herda credenciais',async()=>{
  const fixtureValue=fixture();const {monitor,calls}=fixtureValue;
  const first=monitor.status(),second=monitor.status();assert.equal(first,second);assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args.slice(0,2),['-I','-B']);assert.match(calls[0].args[2],/sandubah-memory\.py$/);
  assert.equal(calls[0].settings.shell,false);assert.equal(calls[0].settings.windowsHide,true);
  assert.deepEqual(Object.keys(calls[0].settings.env).filter(key=>!['SystemRoot','WINDIR','PYTHONIOENCODING'].includes(key)),[]);
  fixtureValue.finish();assert.equal((await first).ram.free,5*GIB);
  await monitor.status();assert.equal(calls.length,1);fixtureValue.advance();const next=monitor.status();assert.equal(calls.length,2);fixtureValue.finish();await next;monitor.close();
});

test('falha descarta leitura anterior e timeout encerra somente a sondagem',async()=>{
  const fixtureValue=fixture({timeoutMs:15});const {monitor,children}=fixtureValue;
  const first=monitor.status();fixtureValue.finish();await first;fixtureValue.advance();
  const failed=await monitor.status();assert.equal(children.at(-1).killed,true);assert.equal(failed.ram,null);assert.equal(failed.gpu,null);monitor.close();
});

test('limite de protocolo, erro de processo e fechamento não geram nova sondagem',async()=>{
  const fixtureValue=fixture();const {monitor,children,calls}=fixtureValue;
  const first=monitor.status();children[0].stdout.write('x'.repeat(8193));assert.equal((await first).ram,null);assert.equal(children[0].killed,true);
  fixtureValue.advance();const second=monitor.status();children[1].emit('error',new Error('indisponível'));assert.equal((await second).gpu,null);
  fixtureValue.advance();const third=monitor.status();monitor.close();await third;await monitor.status();assert.equal(calls.length,3);assert.equal(children[2].killed,true);
});

test('falha do Python mantém RAM do sistema, sem inventar VRAM ou memória comprometível',async()=>{
  const fixtureValue=fixture({readRam:()=>({total:16*GIB,free:5*GIB})});
  const pending=fixtureValue.monitor.status();
  fixtureValue.children[0].stderr.write('Traceback fixture\nModuleNotFoundError: fixture\n');
  fixtureValue.children[0].emit('close',1);
  const snapshot=await pending;
  assert.equal(snapshot.ram.free,5*GIB);assert.equal(snapshot.ram.commitFree,null);assert.equal(snapshot.gpu,null);
  assert.match(snapshot.error,/código 1: ModuleNotFoundError/);
  const {describeMemory}=await view();assert.equal(describeMemory(snapshot,100000).ram.state,'unknown');
  fixtureValue.monitor.close();
});

test('barras indicam folga e déficit de RAM, incluindo memória comprometível',async()=>{
  const {describeMemory}=await view();
  const healthy=describeMemory(normalizeMemory(sample,100),100);assert.equal(healthy.ram.state,'good');assert.match(healthy.ram.detail,/Folga de 1,00 GiB/);
  const low=describeMemory(normalizeMemory({ram:{...sample.ram,free:3*GIB,commitFree:5*GIB}},100),100);assert.equal(low.ram.state,'low');assert.match(low.ram.detail,/Faltam 1,00 GiB de RAM/);assert.match(low.ram.detail,/faltam 1,00 GiB de memória comprometível/);
  assert.equal(describeMemory(normalizeMemory({ram:{...sample.ram,free:4*GIB,commitFree:6*GIB}},100),100).ram.state,'good');
  assert.equal(describeMemory(normalizeMemory({ram:{...sample.ram,commitFree:null}},100),100).ram.state,'unknown');
});

test('VRAM física livre não ignora teto global de 3,9 GB e reserva inicial de 1,85 GB',async()=>{
  const {describeMemory}=await view();
  const describe=used=>describeMemory(normalizeMemory({gpu:{...sample.gpu,used,free:sample.gpu.total-used}},100),100).gpu;
  assert.equal(describe(1e9).state,'good');assert.match(describe(1e9).detail,/Folga de 2,90 GB/);
  assert.equal(describe(2.05e9).state,'good');assert.equal(describe(2.05e9+1).state,'low');
  assert.match(describe(3e9).detail,/Faltam 0,95 GB/);assert.match(describe(4e9).detail,/Teto excedido em 0,10 GB/);
});

test('leitura ausente, antiga ou futura não aparece verde nem como zero',async()=>{
  const {describeMemory}=await view();
  for(const sampleValue of [null,normalizeMemory(sample,1),normalizeMemory(sample,1000000)]){
    const result=describeMemory(sampleValue,100000);assert.equal(result.ram.state,'unknown');assert.equal(result.gpu.percent,null);assert.equal(result.gpu.value,'Indisponível');
  }
});

test('sonda separada não importa Torch, worker, modelos nem abre rede',()=>{
  const source=readFileSync(resolve(__dirname,'../../scripts/sandubah-memory.py'),'utf8');
  assert.doesNotMatch(source,/torch|transformers|airllm|sandubah-qwen-worker|urllib|requests|socket/);
  assert.match(source,/GlobalMemoryStatusEx/);assert.match(source,/nvmlDeviceGetHandleByIndex\(0\)/);
});
