'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,unlinkSync,linkSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const root=resolve(__dirname,'../..');
const backend=require('../../src/sandubah-desktop/backend.cjs');
const Ajv=require('../../build/sandubah/gui/vendor/node_modules/ajv');
const catalog=require('../../build/sandubah/gui/catalog.json');
const runtime=require('../../build/sandubah/gui/runtime.json');
const testRoot=mkdtempSync(join(root,'build/sandubah/gui/tmp/unit-'));
test.after(()=>{assert.ok(realpathSync(testRoot).startsWith(realpathSync(join(root,'build/sandubah/gui/tmp'))+'\\'));rmSync(testRoot,{recursive:true,force:true});});

function controller(confirm=async()=>false){
  const mcp=new EventEmitter();mcp.ready=true;mcp.toolNames=new Set(catalog.entries.filter(entry=>entry.kind==='mcp').map(entry=>entry.name));mcp.connect=async()=>{};mcp.close=()=>{};mcp.calls=[];
  mcp.request=async(method,params)=>{mcp.calls.push({method,params});return {content:[{type:'text',text:'{"success":true}'}]};};
  return new backend.DesktopController({repositoryRoot:testRoot,runtime,catalog,confirm,validator:backend.createValidator(Ajv),mcpClient:mcp});
}

test('catálogo completo sem fallback, schemas reais e IDs únicos',()=>{
  assert.equal(new Set(catalog.entries.map(entry=>entry.id)).size,catalog.entries.length);
  assert.equal(catalog.unavailable.length,0);
  for(const kind of ['mcp','cli','skill','agent','plugin'])assert.equal(catalog.entries.filter(entry=>entry.kind===kind).length,catalog.counts[kind]);
  assert.ok(catalog.entries.some(entry=>entry.id==='cli:memory search'));
  assert.ok(catalog.entries.some(entry=>entry.id==='mcp:agent_list'&&entry.inputSchema.properties.domain));
  assert.ok(runtime.nodeExecutable.startsWith(root));assert.ok(runtime.electronExecutable.startsWith(root));
});
test('busca sem acento, categorias, favoritos e formatação segura',async()=>{
  const model=await import(pathToFileURL(join(root,'src/sandubah-desktop/ui-model.mjs')));
  const entries=[{id:'1',name:'Memória',description:'ação local',kind:'mcp',category:'memory'},{id:'2',name:'Outro',kind:'cli',category:'system'}];
  assert.equal(model.filterEntries(entries,{search:'memoria acao'}).length,1);
  assert.equal(model.filterEntries(entries,{kind:'cli',category:'memory'}).length,0);
  assert.equal(model.filterEntries(entries,{favoritesOnly:true,favorites:['2']})[0].id,'2');
  assert.equal(model.summarizeCategories(entries).length,2);
  assert.deepEqual(model.initialArguments({properties:{limit:{default:10},status:{type:'string'}}}),{limit:10});
  assert.equal(model.formatResult({content:[{type:'text',text:'<img src=x onerror=alert(1)>'}]}),'<img src=x onerror=alert(1)>');
});
test('política libera memória com confirmação, preserva serviços e configuração ampla',async()=>{
  const app=controller();
  for(const id of ['mcp:terminal_execute','mcp:agent_execute','mcp:config_set','cli:memory search','missing'])await assert.rejects(app.execute({id,arguments:{}}));
  assert.equal((await app.execute({id:'mcp:memory_stats',arguments:{}})).cancelled,true);
  assert.equal(app.mcp.calls.length,0);
});
test('confirmação nativa cancelada não envia a chamada',async()=>{
  const app=controller();const result=await app.execute({id:'mcp:swarm_health',arguments:{}});
  assert.equal(result.cancelled,true);assert.equal(app.mcp.calls.length,0);assert.equal(app.history[0].status,'cancelada');
});
test('consulta permitida passa pelo MCP e pelos schemas',async()=>{
  const app=controller();
  await app.execute({id:'mcp:agent_list',arguments:{domain:'backend',includeTerminated:false}});
  assert.equal(app.mcp.calls[0].method,'tools/call');assert.equal(app.mcp.calls[0].params.name,'agent_list');
  await assert.rejects(app.execute({id:'mcp:agent_status',arguments:{}}),/inválidos/);
  await assert.rejects(app.execute({id:'mcp:task_list',arguments:{limit:201}}),/200/);
  await assert.rejects(app.execute({id:'mcp:mcp_status',arguments:{confirmed:true}}),/não declarado/);
});

test('planejador libera seu MCP ocioso e a próxima ferramenta reconecta sob a trava única',async()=>{
  const app=controller();let connections=0;
  app.mcp.close=()=>{app.mcp.ready=false;};
  app.mcp.connect=async()=>{connections++;app.mcp.ready=true;};
  app.planner={run:async()=>{assert.equal(app.mcp.ready,false);return {answer:'Fixture de planejamento'};},cancel:()=>{}};
  await app.planWithQwen({prompt:'Planejar'});
  assert.equal(app.mcp.ready,false);assert.equal(app.status().busy,false);
  await app.execute({id:'mcp:agent_list',arguments:{domain:'backend',includeTerminated:false}});
  assert.equal(connections,1);assert.equal(app.mcp.ready,true);assert.equal(app.mcp.calls.length,1);app.close();
});
test('limites JSON, protótipos e leitura externa são rejeitados',()=>{
  assert.throws(()=>backend.serializeArguments([]));
  assert.throws(()=>backend.serializeArguments({x:'x'.repeat(65536)}));
  assert.throws(()=>backend.assertSafeArguments(JSON.parse('{"__proto__":{}}')));
  assert.doesNotThrow(()=>backend.assertSafeArguments({command:'texto para análise, não execução'}));
  assert.throws(()=>backend.localPath(root,'../package.json'));
  assert.throws(()=>backend.localPath(root,'C:\\Windows\\win.ini'));
  assert.equal(backend.redact({apiKey:'private',result:'{"password":"private"}'}).apiKey,'[segredo oculto]');
});
test('caminhos de auditoria externos e junctions não são executados',()=>{
  assert.throws(()=>backend.assertExecutionPlacement(testRoot,{RUFLO_MCP_AUDIT_LOG_PATH:join(root,'outside.jsonl')}));
  const sandbox=mkdtempSync(join(testRoot,'paths-'));mkdirSync(join(sandbox,'.harness'));
  writeFileSync(join(sandbox,'.harness/mcp-policy.json'),JSON.stringify({auditLogPath:'../../outside'}));
  assert.throws(()=>backend.assertExecutionPlacement(sandbox,{}));
  const linked=mkdtempSync(join(testRoot,'junction-'));const external=mkdtempSync(join(testRoot,'external-'));symlinkSync(external,join(linked,'.swarm'),'junction');
  try{assert.throws(()=>backend.assertExecutionPlacement(linked,{}),/link/i);}finally{unlinkSync(join(linked,'.swarm'));}
});
test('hard links e junctions aninhadas não podem redirecionar gravações',()=>{
  const sandbox=mkdtempSync(join(testRoot,'nested-'));mkdirSync(join(sandbox,'.claude-flow/logs'),{recursive:true});
  const target=join(testRoot,'external-audit');writeFileSync(target,'preserve');linkSync(target,join(sandbox,'.claude-flow/logs/mcp-audit.jsonl'));assert.throws(()=>backend.assertExecutionPlacement(sandbox,{}),/hard link/);
  const nested=mkdtempSync(join(testRoot,'nested-home-'));mkdirSync(join(nested,'build/sandubah/gui/home'),{recursive:true});symlinkSync(testRoot,join(nested,'build/sandubah/gui/home/.config'),'junction');
  try{assert.throws(()=>backend.assertExecutionPlacement(nested,{}),/link/i);}finally{unlinkSync(join(nested,'build/sandubah/gui/home/.config'));}
});
test('builder e exportador recusam links antes de sobrescrever arquivos',()=>{
  const sandbox=mkdtempSync(join(testRoot,'writes-'));const target=join(sandbox,'preserve');writeFileSync(target,'unchanged');linkSync(target,join(sandbox,'runtime.json'));
  assert.throws(()=>backend.assertLocalWriteTree(root,sandbox),/link/i);
  const internal=mkdtempSync(join(testRoot,'internal-'));symlinkSync(sandbox,join(internal,'project'),'junction');try{assert.throws(()=>backend.assertLocalWritePath(root,join(internal,'project/catalog.json')),/link/i);}finally{unlinkSync(join(internal,'project'));}
  assert.throws(()=>backend.assertExecutionPlacement(root,{RUFLO_MCP_AUDIT_LOG_PATH:join(root,'.claude-flow/audit')},join(root,'build/sandubah/gui/project')),/fora/);
});
test('build cancelado não executa TypeScript e MCP usa estado separado',async()=>{
  const app=controller();const result=await app.development({action:'build'});assert.equal(result.cancelled,true);assert.equal(app.mcp.calls.length,0);assert.ok(app.stateDirectory.endsWith(join('build','sandubah','gui','project')));
});
test('um worker impede operações concorrentes e registra erros reais',async()=>{
  const app=controller();let finish;
  const pending=app.single('primeira',()=>new Promise(resolvePromise=>{finish=resolvePromise;}));
  await assert.rejects(app.single('segunda',async()=>{}),/um worker/);finish({success:false});await pending;
  assert.equal(app.history[0].status,'erro');assert.equal(app.status().workerLimit,1);
});
test('processos recebem argv literal, sem shell, e HOME/TEMP ficam na cópia',async()=>{
  const app=controller();
  const literal='& echo NEVER; "quoted" | > x';
  const result=await app.single('literal',()=>app.runProcess(runtime.nodeExecutable,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))',literal]));
  assert.deepEqual(JSON.parse(result.output),[literal]);
  const env=backend.localEnvironment(root,runtime.nodeExecutable,{});assert.ok(env.HOME.startsWith(root));assert.ok(env.TEMP.startsWith(root));assert.equal(env.RUFLO_MCP_SKIP_NPX,'1');
});
test('timeout de processo não é declarado sucesso',async()=>{
  const app=controller();await assert.rejects(app.single('timeout',()=>app.runProcess(runtime.nodeExecutable,['-e','setTimeout(()=>{},10000)'],{timeoutMs:50})),/desconhecido/);
});
for(const mode of ['normal','timeout','oversize','invalid','exit'])test(`transporte MCP isolado: ${mode}`,async()=>{
  const client=new backend.LocalMcpClient({nodeExecutable:runtime.nodeExecutable,launcher:join(__dirname,'fixtures/sandubah-mcp.cjs'),cwd:testRoot,env:{...process.env,SANDUBAH_FIXTURE_MODE:mode},timeoutMs:3000});
  try{
    await client.connect();assert.equal(client.ready,true);assert.ok(client.toolNames.has('mcp_status'));
    // O limite curto vale só para a chamada: a partida do processo pode passar de 150 ms com a CPU ocupada.
    if(mode==='timeout')client.options.timeoutMs=150;
    if(mode==='normal'){const result=await client.request('tools/call',{name:'mcp_status',arguments:{}});assert.equal(JSON.parse(result.content[0].text).pid,client.child.pid);}
    else await assert.rejects(client.request('tools/call',{name:'mcp_status',arguments:{}}),mode==='timeout'?/Tempo esgotado/:undefined);
  }finally{client.close();assert.equal(client.pending.size,0);assert.equal(client.child,null);}
});
