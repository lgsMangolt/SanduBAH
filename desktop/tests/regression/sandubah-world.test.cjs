'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,linkSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {DesktopController,createValidator,policyFor,localPath,localEnvironment,assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {scopeArguments,resultFailed}=require('../../src/sandubah-desktop/execution-policy.cjs');
const Ajv=require('../../build/sandubah/gui/vendor/node_modules/ajv');
const catalog=require('../../build/sandubah/gui/catalog.json');
const runtime=require('../../build/sandubah/gui/runtime.json');
const root=resolve(__dirname,'../..');
const directory=mkdtempSync(join(root,'build/sandubah/gui/tmp/world-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(join(root,'build/sandubah/gui/tmp'))+'\\'));rmSync(directory,{recursive:true,force:true});});
function fixture(confirm=async()=>true){
  const repositoryRoot=mkdtempSync(join(directory,'project-'));
  writeFileSync(join(repositoryRoot,'AGENTS.md'),'# Agentes\n\n[Guia](README.md)\n[[README]]\n<script>window.xss=true</script>');
  writeFileSync(join(repositoryRoot,'README.md'),'# Guia local\n\nObjetivo em português.');
  const mcp=new EventEmitter();mcp.ready=true;mcp.toolNames=new Set(catalog.entries.filter(entry=>entry.kind==='mcp').map(entry=>entry.name));mcp.connect=async()=>{};mcp.close=()=>{};mcp.calls=[];
  mcp.request=async(method,params)=>{mcp.calls.push({method,params});return {content:[{type:'text',text:'{"success":true}'}]};};
  const app=new DesktopController({repositoryRoot,runtime,catalog,confirm,validator:createValidator(Ajv),mcpClient:mcp});app.createProjectClient=()=>mcp;
  return app;
}
function projectWithMission(app,tool='mcp_status',args={}){
  let project=app.projectAction({action:'create',input:{name:'Meu laboratório',goal:'Modificar a cópia local'}});
  project=app.projectAction({action:'agent',id:project.id,input:{name:'Pesquisador',role:'researcher',source:'AGENTS.md'}});
  return app.projectAction({action:'mission',id:project.id,input:{title:'Primeira missão',agentId:project.agents[0].id,tool,arguments:args}});
}

test('desligar Grill-me e Vibewase não contorna confirmação da execução protegida',async()=>{
  const app=fixture(async()=>false);
  try{
    const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
    const project=projectWithMission(app);
    app.knowledge=new KnowledgeLibrary({repositoryRoot:app.repositoryRoot,home:app.repositoryRoot,appData:app.repositoryRoot,projects:app.projects,write:(path,content)=>app.projects.write(path,content),catalog:()=>app.getCatalog(),roots:[]});app.projects.knowledgeLibrary=app.knowledge;
    app.knowledge.saveModes('harness:'+project.id,{grillMe:false,vibewase:false});
    const result=await app.runProject({id:project.id});assert.equal(result.cancelled,true);assert.equal(app.mcp.calls.length,0);assert.equal(app.projects.get(project.id).missions[0].status,'pending');
  }finally{app.close();}
});

test('busca seletiva fica no escopo do harness e contexto mudado bloqueia antes do worker',async()=>{
  const app=fixture(async()=>false);try{
    const project=projectWithMission(app);writeFileSync(join(app.repositoryRoot,'docs.md'),'# Orçamento\nDecisão de orçamento: 125 reais.\n# Esporte\n'+('campeonato '.repeat(1000)));
    app.projects.documents=null;app.projects.catalog={...app.projects.catalog,entries:[...app.projects.catalog.entries,{id:'doc',kind:'skill',sourcePath:'docs.md'}]};app.projects.update(project.id,'context',{path:'docs.md'});
    const request={projectId:project.id,prompt:'orçamento',contextMode:'economic'},preview=app.plannerContextPreview(request);assert.equal(preview.blocked,false);assert.match(preview.context,/125 reais/);assert.doesNotMatch(preview.context,/campeonato/);
    assert.equal(preview.included.filter(item=>item.kind==='obrigatório').length,6);assert.throws(()=>app.plannerContextPreview({...request,retrievalSourceId:'outside'}),/fora do índice/);
    writeFileSync(join(app.repositoryRoot,'docs.md'),'# Orçamento\nDecisão nova: 150 reais.');let called=false;app.planner.run=async()=>{called=true;};await assert.rejects(app.planWithQwen({...request,contextFingerprint:preview.fingerprint}),/documentos mudaram/);assert.equal(called,false);
    const current=app.plannerContextPreview(request);app.cloud.select=()=>{};app.cloud.selection={provider:'codex',model:'gpt-6-luna'};app.cloud.run=async()=>{called=true;};const result=await app.planWithCloud(request);assert.equal(result.cancelled,true);assert.equal(called,false);
  }finally{app.close();}
});
test('Codex recebe contexto atualizado, executa serial e preserva a origem até confirmação',async()=>{
  const app=fixture();mkdirSync(join(app.repositoryRoot,'src'));writeFileSync(join(app.repositoryRoot,'src/example.js'),'original');
  let project=projectWithMission(app);project.missions=[];app.projects.save(project);
  project=app.projectAction({action:'context',id:project.id,input:{path:'README.md'}});
  project=app.projectAction({action:'mission',id:project.id,input:{engine:'codex',title:'Criar código',instructions:'Modificar o exemplo e testar.',files:['src/example.js'],agentId:project.agents[0].id}});
  project=app.projectAction({action:'mission',id:project.id,input:{engine:'codex',title:'Revisar',instructions:'Verifique o resultado anterior.',agentId:project.agents[0].id,dependsOn:project.missions[0].id}});
  let calls=0;app.createCodexWorker=()=>({run:async request=>{calls++;assert.match(request.prompt,/Objetivo em português/);assert.match(request.prompt,/Modificar|Verifique/);assert.equal(request.workspace,app.projects.workspace(project.id));assert.notEqual(request.workspace,app.projects.location(project.id));if(calls===2)assert.match(request.prompt,/primeiro resultado/);await assert.rejects(app.runProject({id:project.id}),/worker/);writeFileSync(join(request.workspace,'src/example.js'),'alterado');request.onEvent({type:'thread.started',thread_id:'fixture'});return {success:true,finalMessage:'primeiro resultado'};}});
  const result=await app.runProject({id:project.id});assert.equal(result.success,true);assert.equal(calls,2);assert.equal(readFileSync(join(app.repositoryRoot,'src/example.js'),'utf8'),'original');
  const artifact=app.projects.artifact(project.id,'src/example.js');assert.equal(artifact.canApply,true);assert.equal(artifact.conflict,false);
  app.confirm=async()=>false;assert.equal((await app.applyArtifact({id:project.id,path:artifact.path,version:artifact.version})).cancelled,true);assert.equal(readFileSync(join(app.repositoryRoot,'src/example.js'),'utf8'),'original');
  app.confirm=async()=>true;const applied=await app.applyArtifact({id:project.id,path:artifact.path,version:artifact.version});assert.equal(readFileSync(applied.backup,'utf8'),'original');assert.equal(readFileSync(join(app.repositoryRoot,'src/example.js'),'utf8'),'alterado');
});
test('Codex bloqueia caminhos privados, importações binárias e conflitos',()=>{
  const app=fixture();const project=projectWithMission(app);mkdirSync(join(app.repositoryRoot,'src'));writeFileSync(join(app.repositoryRoot,'src/example.js'),'original');writeFileSync(join(app.repositoryRoot,'src/image.bin'),Buffer.from([0,1,2]));
  for(const source of ['../escape','.codex/config.toml','src/../../escape','src/file:ads','src/image.bin','build/file'])assert.throws(()=>app.projects.validateFiles([source]));
  const prepared=app.projects.prepareCodex(project,{title:'test',instructions:'test',files:['src/example.js']},project.agents[0]);writeFileSync(join(prepared.workspace,'src/example.js'),'result');const artifact=app.projects.artifact(project.id,'src/example.js');writeFileSync(join(app.repositoryRoot,'src/example.js'),'Claude change');
  assert.throws(()=>app.projects.applyArtifact({id:project.id,path:artifact.path,version:artifact.version}),/origem mudou/);assert.equal(readFileSync(join(app.repositoryRoot,'src/example.js'),'utf8'),'Claude change');mkdirSync(join(prepared.workspace,'.codex'));assert.throws(()=>app.projects.prepareCodex(project,{files:[]},project.agents[0]),/configuração Codex/);
});
test('worker interrompido não conclui e dependência permanece pendente',async()=>{
  const app=fixture();let project=projectWithMission(app);project.missions=[];app.projects.save(project);
  for(const title of ['primeiro','segundo'])project=app.projectAction({action:'mission',id:project.id,input:{engine:'codex',title,instructions:'test',agentId:project.agents[0].id}});
  app.createCodexWorker=()=>({run:async()=>({success:false,interrupted:true})});const result=await app.runProject({id:project.id});assert.equal(result.success,false);assert.deepEqual(result.project.missions.map(mission=>mission.status),['unknown','pending']);
});
test('ações protegidas locais são liberadas com schema e uma confirmação',async()=>{
  let confirmations=0;const app=fixture(async request=>{confirmations++;assert.equal(request.entry.name,'task_create');return true;});
  const args={type:'research',description:'Entender a memória\nsem alterar o gateway.'};
  await app.execute({id:'mcp:task_create',arguments:args});assert.equal(confirmations,1);assert.equal(app.mcp.calls.length,1);assert.deepEqual(app.mcp.calls[0].params.arguments,args);
  for(const name of ['memory_store','agent_spawn','swarm_init','guidance_brain','task_complete'])assert.equal(policyFor({kind:'mcp',name}).mode,'confirm');
});
test('cancelar não persiste missão executada nem envia registro ou ferramenta',async()=>{
  const app=fixture(async()=>false);const project=projectWithMission(app);
  const result=await app.runProject({id:project.id});assert.equal(result.cancelled,true);assert.equal(app.mcp.calls.length,0);assert.equal(app.projects.get(project.id).missions[0].status,'pending');
});
test('Markdown real, links relativos/wiki e originais somente leitura',()=>{
  const app=fixture();assert.ok(app.projects.index().some(document=>document.path==='AGENTS.md'));
  const source=app.projects.document('AGENTS.md');assert.equal(source.links.length,2);assert.equal(source.links[0].path,'README.md');assert.equal(source.editable,false);assert.match(source.content,/<script>/);
  assert.throws(()=>app.projects.document('../AGENTS.md'));assert.throws(()=>app.projects.document('missing.md'));
});
test('criar harness persiste arquivos e editar memória usa controle de versão',()=>{
  const app=fixture();const project=projectWithMission(app);const source=app.projects.document('MEMORY.md',project.id);
  assert.equal(source.editable,true);const edited=app.projects.edit({projectId:project.id,path:'MEMORY.md',version:source.version,content:'# Aprendizado\n\nSem gateway.'});assert.match(edited.content,/Sem gateway/);
  assert.throws(()=>app.projects.edit({projectId:project.id,path:'MEMORY.md',version:source.version,content:'stale'}),/mudou/);
  assert.throws(()=>app.projects.edit({projectId:project.id,path:'AGENTS.md',version:'x',content:'x'}),/somente/);
  assert.equal(app.projects.list().length,1);assert.equal(app.projects.get(project.id).agents.length,1);assert.equal(app.projects.document('HARNESS.md',project.id).links.length,4);
});
test('contexto anexado é limitado e disponível para handoff explícito',()=>{
  const app=fixture();let project=projectWithMission(app);project=app.projectAction({action:'context',id:project.id,input:{path:'README.md'}});
  assert.match(app.projects.context(project,project.agents[0]),/Objetivo em português/);assert.match(app.projects.document('CONTEXT.md',project.id).content,/README.md/);
});
test('fila serial registra agente uma vez e conclui somente resultado verdadeiro',async()=>{
  const app=fixture();let project=projectWithMission(app);
  project=app.projectAction({action:'mission',id:project.id,input:{title:'Segunda',agentId:project.agents[0].id,tool:'agent_list',arguments:{},dependsOn:project.missions[0].id}});
  const result=await app.runProject({id:project.id});assert.equal(result.success,true);assert.deepEqual(app.mcp.calls.map(call=>call.params.name),['agent_spawn','mcp_status','agent_list']);assert.ok(app.projects.get(project.id).missions.every(mission=>mission.status==='done'));
  assert.equal(app.mcp.calls[0].params.arguments.model,'sonnet');assert.equal(app.mcp.calls[0].params.arguments.task,undefined);
});
test('erro lógico para a fila e não vira conclusão',async()=>{
  const app=fixture();let project=projectWithMission(app);project=app.projectAction({action:'mission',id:project.id,input:{title:'Não executar',agentId:project.agents[0].id,tool:'task_list',arguments:{}}});
  app.mcp.request=async(_method,params)=>({content:[{type:'text',text:params.name==='mcp_status'?'{"error":"falhou"}':'{"success":true}'}]});
  const result=await app.runProject({id:project.id});assert.equal(result.success,false);assert.deepEqual(app.projects.get(project.id).missions.map(mission=>mission.status),['error','pending']);
  assert.equal(resultFailed({content:[{type:'text',text:'{"success":false}'}]}),true);
});
test('parar fila aguarda missão atual e não dispara próxima',async()=>{
  const app=fixture();let project=projectWithMission(app);project=app.projectAction({action:'mission',id:project.id,input:{title:'Futura',agentId:project.agents[0].id,tool:'task_list',arguments:{}}});
  const request=app.mcp.request;app.mcp.request=async(method,params)=>{if(params.name==='mcp_status')app.stopQueue();return request(method,params);};
  const result=await app.runProject({id:project.id});assert.equal(result.stopped,true);assert.deepEqual(result.project.missions.map(mission=>mission.status),['done','pending']);
});
test('interrupção persistida é desconhecida, nunca repetida automaticamente',()=>{
  const app=fixture();const project=projectWithMission(app);project.missions[0].status='running';app.projects.save(project);assert.equal(app.projects.get(project.id).missions[0].status,'unknown');
});
test('path, UNC, ADS e hardlink não escapam do projeto',async()=>{
  const app=fixture();for(const value of ['../../escape','C:\\Windows\\file','\\\\server\\share','C:relative','memory.json:stream'])assert.throws(()=>scopeArguments({outputPath:value},app.stateDirectory,()=>{}));
  const scoped=scopeArguments({outputPath:'data.json',value:{path:'texto armazenado'}},app.stateDirectory,()=>{});assert.equal(scoped.outputPath,join(app.stateDirectory,'data.json'));assert.equal(scoped.value.path,'texto armazenado');
  const project=projectWithMission(app);const memory=join(app.projects.location(project.id),'MEMORY.md');const preserved=join(app.repositoryRoot,'preserved.md');writeFileSync(preserved,'preserve');
  const other=join(app.projects.location(project.id),'alias.md');linkSync(preserved,other);assert.throws(()=>app.projects.write(other,'overwrite'),/link/);assert.equal(readFileSync(preserved,'utf8'),'preserve');assert.ok(localPath(app.repositoryRoot,'README.md'));
  assert.throws(()=>app.projects.location('../'));assert.ok(memory.endsWith('MEMORY.md'));
});
test('manifesto adulterado não permite executar ferramenta fora do escopo',async()=>{
  const app=fixture();const project=projectWithMission(app);project.missions[0].tool='terminal_execute';app.projects.save(project);await assert.rejects(app.runProject({id:project.id}),/shell/);assert.equal(app.mcp.calls.length,0);
});
test('memória aponta para diretório e DB distinto; COW externo nunca chega ao MCP',async()=>{
  const app=fixture();const environment=localEnvironment(app.repositoryRoot,runtime.nodeExecutable,{},app.stateDirectory);
  assert.equal(environment.CLAUDE_FLOW_MEMORY_PATH,join(app.stateDirectory,'.swarm'));assert.equal(environment.CLAUDE_FLOW_DB_PATH,join(app.stateDirectory,'.swarm/memory.db'));
  assert.equal(environment.CLAUDE_FLOW_ROUTER_TRAJECTORY,'0');assert.equal(environment.CLAUDE_FLOW_ROUTER_PARALLEL_LOG,'0');assert.equal(environment.CLAUDE_FLOW_RUN_TRANSCRIPTS,'0');
  const registry=join(app.stateDirectory,'.claude-flow/swarm');mkdirSync(registry,{recursive:true});writeFileSync(join(registry,'cow-branches.json'),JSON.stringify({branches:{unsafe:{branchPath:join(directory,'outside')}}}));
  await assert.rejects(app.execute({id:'mcp:agent_terminate',arguments:{agentId:'unsafe'}}),/projeto privado/);assert.equal(app.mcp.calls.length,0);
  await assert.rejects(app.execute({id:'mcp:agent_spawn',arguments:{agentType:'coder',memoryBase:'base.rvf'}}),/COW/);
});
test('casing Windows não trava validação e leitura ativa mantém running',()=>{
  const app=fixture();assertLocalWritePath(app.repositoryRoot,join(app.repositoryRoot,'inside.txt').toLowerCase());
  const project=projectWithMission(app);project.missions[0].status='running';app.projects.save(project);app.active={projectId:project.id};assert.equal(app.projects.get(project.id).missions[0].status,'running');app.active=null;assert.equal(app.projects.get(project.id).missions[0].status,'unknown');
});
