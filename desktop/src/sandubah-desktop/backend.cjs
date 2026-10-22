'use strict';

const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } = require('node:fs');
const { basename, delimiter, dirname, isAbsolute, join, relative, resolve } = require('node:path');
const { canRunLocally, scopeArguments, resultFailed } = require('./execution-policy.cjs');
const { ProjectWorkspace, FILES } = require('./workspace.cjs');
const { CodexWorker, codexSettings } = require('./codex-worker.cjs');
const { QwenPlanner } = require('./qwen-planner.cjs');
const { ModelManager } = require('./model-manager.cjs');
const { MemoryMonitor } = require('./memory-monitor.cjs');
const { CloudPlanner } = require('./cloud-planner.cjs');
const { BrainSearch } = require('./brain-search.cjs');
const { contextLimit } = require('./context-limits.cjs');
const { ProjectHistory } = require('./project-history.cjs');
const { gauchoInstruction, gauchoTaskInstruction } = require('./gaucho.cjs');
const { secretPattern } = require('./knowledge.cjs');

const MAX_ARGUMENT_BYTES = 65536;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const READ_TOOLS = new Set(['mcp_status', 'agent_list', 'agent_status', 'task_list', 'task_status']);

function terminateOwnedChild(child) {
  if(!child || child.exitCode!==null || child.killed || !Number.isInteger(child.pid))return;
  if(process.platform==='win32')spawnSync(join(process.env.SystemRoot || 'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore',timeout:5000});
  if(child.exitCode===null && !child.killed)child.kill();
}

function assertLocalWritePath(repositoryRoot, destination) {
  const root=realpathSync(repositoryRoot);
  const candidate=resolve(root,destination);
  const inside=relative(root,candidate);
  if(inside.startsWith('..')||isAbsolute(inside))throw new Error('Gravação fora da cópia local bloqueada.');
  for(let cursor=candidate;relative(root,cursor)!=='';cursor=dirname(cursor)){
    if(cursor===dirname(cursor))throw new Error('Raiz de gravação inválida.');
    let info;
    try{info=lstatSync(cursor);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(info.isSymbolicLink()||(info.isFile()&&info.nlink>1))throw new Error('Link ou hard link em destino privado não é permitido.');
  }
  return candidate;
}

function assertLocalWriteTree(repositoryRoot, destination) {
  let visited=0;
  function visit(filename){
    assertLocalWritePath(repositoryRoot,filename);
    if(!existsSync(filename)||!lstatSync(filename).isDirectory())return;
    for(const entry of readdirSync(filename)){if(++visited>20000)throw new Error('Diretório de build grande demais para validar.');visit(join(filename,entry));}
  }
  visit(resolve(repositoryRoot,destination));
}

function serializeArguments(value) {
  const serialized = JSON.stringify(value);
  if (!serialized || Buffer.byteLength(serialized) > MAX_ARGUMENT_BYTES) throw new Error('Parâmetros excedem o limite de 64 KiB.');
  const cloned = JSON.parse(serialized);
  if (!cloned || Array.isArray(cloned) || typeof cloned !== 'object') throw new Error('Os parâmetros precisam ser um objeto JSON.');
  return cloned;
}

function assertSafeArguments(value, depth = 0) {
  if (depth > 25) throw new Error('Parâmetros aninhados demais.');
  for (const [name, child] of Object.entries(value || {})) {
    if (['__proto__', 'prototype', 'constructor'].includes(name)) throw new Error(`O parâmetro ${name} não é permitido pela proteção desta sessão.`);
    if (child && typeof child === 'object') assertSafeArguments(child, depth + 1);
  }
}

function policyFor(entry) {
  if (entry.kind !== 'mcp') return { mode: 'inspect', label: entry.kind === 'cli' ? 'Ajuda local' : 'Biblioteca local', reason: 'Consulte o conteúdo e prepare uma chamada, sem executar código automaticamente.' };
  if (READ_TOOLS.has(entry.name)) return { mode: 'read', label: 'Consulta local', reason: 'Consulta auditada. O motor registra sua trilha de política dentro do ambiente isolado da cópia.' };
  if (canRunLocally(entry.name)) return { mode:'confirm', label:'Confirmar execução', reason:'Executa a ferramenta da cópia local após confirmação dos parâmetros e do projeto. A política original do Ruflo continua valendo.' };
  return { mode:'blocked', label:'Fora do escopo local', reason:'Esta função controla shell, provedores, serviços, navegador, instalações ou configuração/importação ampla. Consulte e copie a chamada para revisão; esta interface preserva o gateway e as configurações existentes.' };
}

function redact(value, depth = 0) {
  if (depth > 30) return '[limite de profundidade]';
  if (typeof value === 'string') {
    try { return JSON.stringify(redact(JSON.parse(value), depth + 1), null, 2); } catch { return value.replace(/\b(?:sk|rk|ghp|gho)[-_][A-Za-z0-9_-]{16,}\b/g, '[segredo oculto]'); }
  }
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, /(?:api[_-]?key|password|secret|authorization|access[_-]?token|refresh[_-]?token|credential)/i.test(name) ? '[segredo oculto]' : redact(item, depth + 1)]));
  return value;
}

function localPath(repositoryRoot, sourcePath) {
  if (typeof sourcePath !== 'string' || isAbsolute(sourcePath) || sourcePath.includes('\0')) throw new Error('Caminho de origem inválido.');
  const root = realpathSync(repositoryRoot);
  const candidate = resolve(root, sourcePath);
  const inside = relative(root, candidate);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('O arquivo precisa pertencer à cópia local.');
  const physical = realpathSync(candidate);
  const physicalInside = relative(root, physical);
  if (physicalInside.startsWith('..') || isAbsolute(physicalInside) || !lstatSync(physical).isFile()) throw new Error('Links para fora da cópia não são permitidos.');
  return physical;
}

function localEnvironment(repositoryRoot, nodeExecutable, environment = process.env, projectDirectory = repositoryRoot) {
  const home=join(repositoryRoot,'build/sandubah/gui/home');
  return {
    ...environment,
    PATH: [dirname(nodeExecutable), join(repositoryRoot, 'v3/node_modules/.pnpm/node_modules/.bin'), join(environment.SystemRoot || 'C:\\Windows','System32')].join(delimiter),
    CLAUDE_FLOW_CWD: projectDirectory, CLAUDE_FLOW_AUTO_UPDATE: 'false', RUFLO_HELPERS_LOCKED: 'true',
    RUFLO_DAEMON_AUTOSTART: '0', RUFLO_MCP_SKIP_NPX: '1', CLAUDE_FLOW_MCP_TRANSPORT: 'stdio',
    RUFLO_MCP_CLI_OVERRIDE: join(repositoryRoot, 'v3/@claude-flow/cli/bin/cli.js'),
    HOME:home,USERPROFILE:home,APPDATA:join(home,'AppData/Roaming'),LOCALAPPDATA:join(home,'AppData/Local'),XDG_CACHE_HOME:join(home,'.cache'),XDG_CONFIG_HOME:join(home,'.config'),
    TEMP:join(repositoryRoot,'build/sandubah/gui/tmp'),TMP:join(repositoryRoot,'build/sandubah/gui/tmp'),
    CLAUDE_FLOW_MEMORY_PATH:join(projectDirectory,'.swarm'),CLAUDE_FLOW_DB_PATH:join(projectDirectory,'.swarm/memory.db'),CLAUDE_FLOW_NO_COW_MEMORY:'1',
    CLAUDE_FLOW_SWARM_DIR:join(projectDirectory,'.swarm'),CLAUDE_FLOW_ROUTER_TRAJECTORY:'0',CLAUDE_FLOW_ROUTER_PARALLEL_LOG:'0',CLAUDE_FLOW_RUN_TRANSCRIPTS:'0',
    CLAUDE_FLOW_ROUTER_TRAJECTORY_PATH:join(projectDirectory,'.swarm/router-trajectory.jsonl'),CLAUDE_FLOW_ROUTER_PARALLEL_LOG_PATH:join(projectDirectory,'.swarm/router-parallel.jsonl'),CLAUDE_FLOW_RUN_TRANSCRIPTS_PATH:join(projectDirectory,'.swarm/run-transcripts.jsonl'),
    HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',NODE_OPTIONS:'',NODE_PATH:'',CI:'true',
  };
}

function assertExecutionPlacement(repositoryRoot, environment=process.env, projectDirectory=repositoryRoot) {
  const root=realpathSync(repositoryRoot);
  const validateDestination=(destination,boundary=root)=>{
    const absolute=resolve(root,destination);
    assertLocalWritePath(root,absolute);
    const inside=relative(resolve(boundary),absolute);
    if(inside.startsWith('..')||isAbsolute(inside))throw new Error('Um caminho de estado/auditoria aponta para fora da cópia local. Execução bloqueada.');
    let ancestor=absolute;
    while(!existsSync(ancestor)&&dirname(ancestor)!==ancestor)ancestor=dirname(ancestor);
    const physicalInside=relative(root,realpathSync(ancestor));
    if(physicalInside.startsWith('..')||isAbsolute(physicalInside))throw new Error('Um link de estado aponta para fora da cópia. Execução bloqueada.');
    if(existsSync(absolute)&&statSync(absolute).isFile()&&statSync(absolute).nlink>1)throw new Error('Arquivo de estado com hard link não é permitido.');
  };
  validateDestination(projectDirectory);
  for(const directory of ['.claude-flow','.harness','.swarm','.claude-flow/agents/store.json','.claude-flow/agents.json','.claude-flow/tasks/store.json','.claude-flow/swarm/swarm-state.json'])validateDestination(resolve(projectDirectory,directory),projectDirectory);
  for(const directory of ['build/sandubah/gui/home','build/sandubah/gui/tmp'])validateDestination(directory);
  for(const name of ['state.json','state.lock','state.lock.reclaim','receipts.ledger.jsonl','ledger-anchors.json','claude-code.json'])validateDestination(resolve(projectDirectory,`.claude-flow/policy/${name}`),projectDirectory);
  const inspectDirectory=(directory,depth=0)=>{
    validateDestination(directory);
    const absolute=resolve(root,directory);
    if(!existsSync(absolute))return;
    if(depth>8)throw new Error('Estado local aninhado demais.');
    const entries=readdirSync(absolute,{withFileTypes:true});
    if(entries.length>2000)throw new Error('Diretório de estado grande demais para validar.');
    for(const entry of entries){const filename=join(directory,entry.name);validateDestination(filename);if(entry.isDirectory()&&!entry.isSymbolicLink())inspectDirectory(filename,depth+1);}
  };
  inspectDirectory('build/sandubah/gui/home/.config/ruflo/policy-trust');
  for(const name of ['RUFLO_MCP_AUDIT_LOG_PATH','CLAUDE_FLOW_MEMORY_PATH','CLAUDE_FLOW_DB_PATH'])if(environment[name])validateDestination(resolve(projectDirectory,environment[name]),projectDirectory);
  const policy=join(projectDirectory,'.harness/mcp-policy.json');
  let auditPath=environment.RUFLO_MCP_AUDIT_LOG_PATH || '.claude-flow/logs/mcp-audit.jsonl';
  if(existsSync(policy)){
    validateDestination(policy);
    if(statSync(policy).size>1000000)throw new Error('Arquivo de política grande demais.');
    const content=readFileSync(policy,'utf8');
    if(content.length>1000000)throw new Error('Arquivo de política grande demais.');
    const parsed=JSON.parse(content);
    if(parsed.auditLogPath)auditPath=parsed.auditLogPath;
  }
  auditPath=resolve(projectDirectory,auditPath);
  validateDestination(auditPath,projectDirectory);validateDestination(`${auditPath}.lock`,projectDirectory);
  for(let index=1;index<=100;index++)validateDestination(`${auditPath}.${index}`,projectDirectory);
}

class LocalMcpClient extends EventEmitter {
  constructor({ nodeExecutable, launcher, cwd, env, timeoutMs = 30000 }) {
    super();
    this.options = { nodeExecutable, launcher, cwd, env, timeoutMs };
    this.pending = new Map();
    this.nextId = 1;
    this.child = null;
    this.ready = false;
    this.connecting = null;
  }
  async connect() {
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.start().catch(error => { this.close(error); throw error; }).finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async start() {
    const { nodeExecutable, launcher, cwd, env } = this.options;
    if (!existsSync(nodeExecutable) || !existsSync(launcher)) throw new Error('O runtime ou o launcher local não existe. Não há fallback para npm.');
    const child = spawn(nodeExecutable, [launcher], { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child=child;
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      if(this.child!==child)return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) { this.close(new Error('Resposta MCP excedeu 4 MiB.')); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { this.receive(JSON.parse(line)); } catch { this.close(new Error('O MCP enviou uma mensagem inválida.')); return; }
      }
    });
    this.child.stderr.on('data', chunk => this.emit('diagnostic', chunk.toString().slice(0,2000)));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', () => { if(this.child===child){this.ready = false; this.fail(new Error('O processo MCP local foi encerrado.')); this.emit('disconnected');} });
    await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sandubah-desktop', version: '1.0.0' } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const catalog = await this.request('tools/list');
    this.toolNames = new Set((catalog.tools || []).map(tool => tool.name));
    this.ready = true;
  }
  receive(message) {
    if (message.method && message.id !== undefined) {
      this.child?.stdin.write(JSON.stringify({ jsonrpc:'2.0', id:message.id, error:{ code:-32601, message:'O cliente não autoriza solicitações do servidor.' } }) + '\n');
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(String(message.error.message || 'Falha MCP')));
    else pending.resolve(message.result);
  }
  request(method, params = {}) {
    if (!this.child || this.child.exitCode !== null || this.child.killed) return Promise.reject(new Error('MCP local desconectado.'));
    if (this.pending.size >= 2) return Promise.reject(new Error('Aguarde a operação atual.'));
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.close(new Error('Tempo esgotado. O resultado pode ser desconhecido; a operação não será repetida automaticamente.'));
      }, this.options.timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc:'2.0', id, method, params }) + '\n');
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
  close(error = new Error('Cliente encerrado.')) {
    this.ready = false;
    this.fail(error);
    terminateOwnedChild(this.child);
    this.child=null;
  }
}

class DesktopController extends EventEmitter {
  constructor({ repositoryRoot, runtime, catalog, confirm, validator, mcpClient, personalLibrary = null }) {
    super();
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.runtime = runtime;
    this.stateDirectory = join(this.repositoryRoot,'build/sandubah/gui/project');
    this.catalog = catalog;
    this.personalLibrary = personalLibrary;
    this.entries = new Map(catalog.entries.map(entry => [entry.id, entry]));
    this.confirm = confirm;
    this.validator = validator;
    this.active = null;
    this.brainSearch=new BrainSearch();
    this.cloud=new CloudPlanner({repositoryRoot:this.repositoryRoot,runtime,guard:destination=>assertLocalWritePath(this.repositoryRoot,destination),write:(filename,content)=>this.projects.write(filename,content),getCodexHome:()=>this.createCodexWorker().codexHome,terminate:terminateOwnedChild});
    this.history = [];
    this.planner = new QwenPlanner({repositoryRoot:this.repositoryRoot,guard:destination=>assertLocalWritePath(this.repositoryRoot,destination),terminate:terminateOwnedChild});
    this.memory = new MemoryMonitor({root:this.repositoryRoot,guard:destination=>assertLocalWritePath(this.repositoryRoot,destination),python:this.planner.python});
    this.models = new ModelManager({root:this.repositoryRoot,guard:destination=>assertLocalWritePath(this.repositoryRoot,destination),planner:this.planner,isBusy:()=>Boolean(this.active),execute:(label,operation)=>this.single(label,operation),terminate:terminateOwnedChild});
    this.models.on('change',snapshot=>this.emit('models',snapshot));
    this.projects = new ProjectWorkspace({repositoryRoot:this.repositoryRoot,catalog,personalLibrary,guard:destination=>assertLocalWritePath(this.repositoryRoot,destination),readLocal:source=>localPath(this.repositoryRoot,source),isRunning:id=>this.active?.projectId===id});
    this.versionHistory = new ProjectHistory({projects:this.projects,secretPattern});
    this.queueStopped = false;
    this.mcp = mcpClient || new LocalMcpClient({ nodeExecutable:runtime.nodeExecutable, launcher:join(this.repositoryRoot,'scripts/sandubah-mcp.cjs'), cwd:this.stateDirectory, env:localEnvironment(this.repositoryRoot,runtime.nodeExecutable,process.env,this.stateDirectory) });
    this.mcp.on('disconnected', () => this.emit('state', this.status()));
  }
  status() { return { connected:this.mcp.ready, busy:Boolean(this.active), active:this.active?.label || null, history:this.history.slice(0,30), workerLimit:1 }; }
  plannerStatus() {
    const cloud=this.cloud.status(),selected=cloud.providers.find(provider=>provider.id===cloud.selection.provider),model=selected?.models.find(model=>model.id===cloud.selection.model);
    if(cloud.selection.provider!=='local')return {ready:Boolean(selected?.installed&&selected?.authenticated&&model),model:model?.name||'Modelo indisponível',message:'Planejamento na nuvem: envia mensagem e Markdown selecionados à sua conta após confirmação. Não usa VRAM local; cotas e acesso ao modelo dependem da conta.',projects:this.projects.list(),cloud};
    return {...this.planner.status(),projects:this.projects.list(),cloud};
  }
  legalQuery(payload){return [payload?.projectId?this.projects.get(payload.projectId).goal:'',payload?.prompt||''].join('\n');}
  async prepareLegalContext(payload){if(!payload||typeof payload.prompt!=='string'||payload.prompt.length>4000)throw new Error('Pergunta inválida.');if(this.legal)await this.legal.prepare(this.legalQuery(payload));}
  plannerContextPreview(payload){
    if(!payload||typeof payload.prompt!=='string')throw new Error('Pergunta inválida.');
    const mode=payload.contextMode||'complete',limit=contextLimit(this.cloud.selection.provider,mode),mandatory=[],references=new Set();
    if(payload.projectId){
      const project=this.projects.get(payload.projectId);
      mandatory.push({id:'project:'+project.id,label:'Metadados e modos do projeto',title:project.name,content:JSON.stringify({id:project.id,name:project.name,goal:project.goal})+'\n'+(this.knowledge?.modeContext('harness:'+project.id)||'')});
      for(const name of FILES){const document=this.projects.document(name,project.id);mandatory.push({id:project.id+'/'+name,label:`harness/${name}`,title:name,content:document.content});}
      for(const source of [...project.context,...project.agents.map(agent=>agent.source).filter(Boolean)])references.add(source);
    }
    if(!payload.projectId&&this.knowledge?.state.briefs['planner:new'])mandatory.push({id:'planner:preferences',label:'Opções da nova ideia',title:'Preferências de planejamento',content:this.knowledge.modeContext('planner:new')});
    if(payload.retrievalSourceId){
      this.knowledge?.ensureIndex();
      if(!this.knowledge?.sources.some(source=>source.id===payload.retrievalSourceId))throw new Error('Fonte de busca fora do índice. Atualize a varredura ou use somente os anexos.');
      for(const record of this.knowledge.documents.values())if(record.sourceId===payload.retrievalSourceId)references.add(record.id);
    }
    const legal=this.legal?.context(this.legalQuery(payload));if(legal)mandatory.push(legal);
    const shared=this.knowledge?.sharedDocuments?.(payload.projectId)||[];let sharedSelection;
    if(shared.length){sharedSelection=this.brainSearch.build({query:payload.prompt,mode:'economic',documents:shared,limit:Math.min(4000,Math.floor(limit/3))});if(sharedSelection.included.length)mandatory.push({id:'central:selected',label:'Central · trechos relevantes revisados pela triagem',title:'Conhecimento compartilhado',content:sharedSelection.context.replace(/\[S(\d+)\]/g,'[C$1]').replace('IDs S','IDs C')});}
    const documents=[...references].map(source=>{try{const document=source.startsWith('knowledge:')||source.startsWith('learning:')?this.knowledge.searchDocument(source):this.projects.document(source);return {id:source,label:document.sourceLabel||source,title:document.title||source,content:document.content};}catch{return {id:source,label:source,error:true};}});
    const report=this.brainSearch.build({query:payload.prompt,mode,mandatory,documents,limit});report.scanWarnings=payload.retrievalSourceId?this.knowledge.scanReport?.warnings||[]:[];
    if(report.scanWarnings.length)report.message+=' O índice tem avisos de cobertura; consulte os detalhes.';
    if(legal){const {content,...details}=legal;report.legalReference=details;report.message+=' Leis: seleção externa não exaustiva; Completo não significa carregar o acervo jurídico inteiro.';}
    if(sharedSelection){const {context,...details}=sharedSelection;report.sharedReference=details;report.message+=' Central: somente trechos relevantes, inclusive no modo Completo.';}
    return report;
  }
  selectedPlannerContext(payload){
    const report=this.plannerContextPreview(payload);if(report.blocked)throw new Error(report.message);
    if(payload.contextFingerprint&&payload.contextFingerprint!==report.fingerprint)throw new Error('Os documentos mudaram durante a busca. Envie novamente para usar a versão atual; nada foi enviado.');
    const {context,...contextInfo}=report;return {context,contextInfo};
  }
  gauchoSelection(gaucho){
    const selection=gaucho.selection;if(!selection)throw new Error('Escolha o Codex ou o Claude para este gauchinho antes de conversar.');
    if(!this.cloud.status().providers.find(item=>item.id===selection.provider)?.installed)throw new Error(`${selection.provider==='codex'?'Codex':'Claude'} não encontrado neste PC. Instale e entre na CLI oficial.`);
    return selection;
  }
  async trainGauchoField(payload){
    // Treino local na CPU: não envia dados nem chama modelos, mas ocupa o worker até terminar ou bater no limite.
    return this.single('Treinar no campo · um worker',async()=>this.gauchos.trainField(payload?.id,{course:payload?.course,episodes:payload?.episodes}));
  }
  async runGauchoTask(payload){
    return this.single('Tarefa do gauchinho · um worker',async()=>{
      const gaucho=this.gauchos.profile(payload?.id),selection=this.gauchoSelection(gaucho);
      const {task,context,info}=this.gauchos.taskContext(gaucho.id,payload?.taskId);
      if(task.tools)return this.runGauchoTools(gaucho,task,{selection,context,info});
      if(!await this.confirm({entry:{name:`tarefa para ${gaucho.name}`,kind:'gaucho-task'},project:this.gauchos.folder(gaucho.id),projectName:gaucho.name,contextInfo:{included:info.knowledgeSources},arguments:{selection,prompt:`${task.title}

${task.instructions}`,history:[],context,attachments:[],lessons:info}}))return {cancelled:true};
      if(this.mcp.ready)this.mcp.close();this.active.worker=this.cloud;
      let response;
      try{response=await this.cloud.run({prompt:task.instructions},{context,selection,instruction:gauchoTaskInstruction(gaucho.name)});}
      catch(error){this.gauchos.finishTask(gaucho.id,task.id,{error:error.message});throw error;}
      const finished=this.gauchos.finishTask(gaucho.id,task.id,{result:response.answer,usage:response.usage,provider:response.provider,model:response.model});
      return {...this.gauchos.get(gaucho.id),task:finished,usage:response.usage,info};
    });
  }
  gauchoSkills(ids){
    return ids.map(id=>{const document=this.readSource(id);let name=null;try{name=this.entry(id).name;}catch{}return {id,title:name||document.title||document.name||id,content:String(document.content||'')};});
  }
  // Tarefa com ferramentas: ensaio numa cópia, pelo Codex com sandbox e sem rede; nada chega à pasta dele sem revisão.
  async runGauchoTools(gaucho,task,{selection,context,info}){
    if(selection.provider!=='codex')throw new Error('Ferramentas só funcionam com o Codex, que tem sandbox. Troque o modelo em Ajustes ou desmarque ferramentas.');
    const rules=this.gauchos.permissions(gaucho.id),skills=this.gauchoSkills(rules.skills);
    const prepared=this.gauchos.prepareToolRun(gaucho.id,task.id,{context,skills});
    if(!await this.confirm({entry:{name:`tarefa com ferramentas para ${gaucho.name}`,kind:'gaucho-tools'},project:prepared.work,projectName:gaucho.name,contextInfo:{included:info.knowledgeSources},arguments:{selection,prompt:`${task.title}\n\n${task.instructions}`,history:[],context:prepared.prompt,attachments:[],lessons:info,rules,skills:skills.map(skill=>skill.title)}})){rmSync(prepared.runDirectory,{recursive:true,force:true});return {cancelled:true};}
    if(this.mcp.ready)this.mcp.close();
    const worker=this.createCodexWorker();worker.timeoutMs=rules.timeoutMinutes*60000;this.active.worker=worker;
    let result;
    try{result=await worker.run({workspace:prepared.work,runDirectory:prepared.runDirectory,prompt:prepared.prompt,settings:{...codexSettings(),model:selection.model,effort:selection.effort||undefined},sandbox:rules.mode==='write'?'workspace-write':'read-only'});}
    catch(error){this.gauchos.finishToolRun(gaucho.id,task.id,{runId:prepared.runId,result:{success:false,message:error.message}});throw error;}
    const finished=this.gauchos.finishToolRun(gaucho.id,task.id,{runId:prepared.runId,result});
    return {...this.gauchos.get(gaucho.id),task:finished,usage:result.usage,info};
  }
  async applyGauchoRun(payload){
    return this.single('Aplicar ensaio do gauchinho',async()=>{
      const gaucho=this.gauchos.profile(payload?.id),task=this.gauchos.task(gaucho.id,payload?.taskId);
      if(task.status!=='review')throw new Error('Não há ensaio esperando revisão nesta tarefa.');
      if(!await this.confirm({entry:{name:`aplicar o ensaio de ${gaucho.name}`,kind:'gaucho-apply'},project:this.gauchos.workspaceDir(gaucho.id),arguments:{tarefa:task.title,arquivos:task.run.changes.map(change=>`${{new:'novo',modified:'alterado',deleted:'removido'}[change.state]} · ${change.path}`)}}))return {cancelled:true};
      return this.gauchos.applyToolRun(gaucho.id,task.id);
    });
  }
  async chatGaucho(payload){
    return this.single('Conversar com gauchinho · um worker',async()=>{
      const gaucho=this.gauchos.profile(payload?.id),prompt=typeof payload?.prompt==='string'?payload.prompt.trim():'';
      if(!prompt||prompt.length>4000)throw new Error('Escreva uma mensagem de até 4.000 caracteres.');
      const selection=this.gauchoSelection(gaucho);
      const {context,info}=this.gauchos.context(gaucho.id,prompt),history=this.gauchos.history(gaucho.id);
      if(!await this.confirm({entry:{name:`conversar com ${gaucho.name}`,kind:'gaucho-chat'},project:this.gauchos.folder(gaucho.id),projectName:gaucho.name,contextInfo:{included:info.knowledgeSources},arguments:{selection,prompt,history,context,attachments:[],lessons:info}}))return {cancelled:true};
      if(this.mcp.ready)this.mcp.close();this.active.worker=this.cloud;
      const response=await this.cloud.run({prompt,history},{context,selection,instruction:gauchoInstruction(gaucho.name)});
      const reply=this.gauchos.record(gaucho.id,{prompt,answer:response.answer,provider:response.provider,model:response.model,usage:response.usage});
      return {...this.gauchos.get(gaucho.id),reply,usage:response.usage,info};
    });
  }
  async planWithCloud(payload){
    return this.single('Planejar na nuvem · um worker',async()=>{
      if(this.legal)await this.prepareLegalContext(payload);
      let context='',contextInfo;if(payload?.projectId){const project=this.projects.get(payload.projectId);this.active.projectId=project.id;context=payload.contextMode?null:this.projects.plannerContext(project,36000);}
      if(payload.contextMode||payload.retrievalSourceId||this.legal)({context,contextInfo}=this.selectedPlannerContext(payload));
      const selection={...this.cloud.selection};
      const planningOptions=this.knowledge?.plannerOptions?.(payload.projectId||'')||null;
      const images=payload.mediaScope&&this.media?this.media.images(payload.mediaScope):[],attachments=payload.mediaScope&&this.media?this.media.review(payload.mediaScope):[];
      if(!await this.confirm({entry:{name:`planejar com ${selection.provider} · ${selection.model}`,kind:'cloud-planning'},project:payload?.projectId?this.projects.location(payload.projectId):this.cloud.directory,projectName:payload?.projectId?this.projects.get(payload.projectId).name:'Nova ideia',contextInfo,arguments:{selection,planningOptions,prompt:payload.prompt,history:payload.history||[],context,attachments,notice:'Mensagem, histórico, Markdown e anexos listados serão enviados ao provedor. Vídeos são amostrados em até oito quadros; áudio não analisado. Pode consumir cota/créditos; limite Claude: US$ 1 quando aplicável. Nenhuma confirmação protegida é removida.'}}))return {cancelled:true};
      if(JSON.stringify(selection)!==JSON.stringify(this.cloud.selection))throw new Error('Seleção mudou durante a confirmação.');
      if(this.mcp.ready)this.mcp.close();this.active.worker=this.cloud;
      const response=await this.cloud.run({...payload,images},{context,planningOptions,onEvent:event=>this.emit('planner',event)});return {...response,contextInfo};
    });
  }
  async planWithQwen(payload) {
    return this.single('Planejar com Qwen · um worker',async()=>{
      if(this.legal)await this.prepareLegalContext(payload);
      if(payload.mediaScope&&this.media){const images=this.media.images(payload.mediaScope);if(images.length>1)throw new Error('O Qwen atual lê uma foto por vez. Use Codex ou Claude para vídeos e vários anexos.');if(images.length){const imported=this.planner.importImage(images[0].path);payload={...payload,imageId:imported.id};}}
      if(this.mcp.ready){this.mcp.close();this.emit('state',this.status());}
      let context='',contextInfo;
      if(payload?.projectId){
        const project=this.projects.get(payload.projectId);
        this.active.projectId=project.id;
        if(!payload.contextMode)context=this.projects.plannerContext(project);
      }
      if(payload.contextMode||payload.retrievalSourceId||this.legal)({context,contextInfo}=this.selectedPlannerContext(payload));
      this.active.worker=this.planner;
      const response=await this.planner.run(payload,{context,onEvent:event=>this.emit('planner',event)});return {...response,contextInfo};
    });
  }
  getCatalog() { return { ...this.catalog, entries:[...this.catalog.entries.map(entry => ({ ...entry, origin:'ruflo', policy:policyFor(entry) })), ...(this.personalLibrary?.entries() || [])] }; }
  async connect() { await this.mcp.connect(); this.emit('state',this.status()); return this.status(); }
  async single(label, operation) {
    if (this.active) throw new Error('Já existe uma operação em execução. O SanduBAH usa um worker por vez.');
    const startedAt = new Date().toISOString();
    this.active = { label };
    this.emit('state', this.status());
    try {
      const result = await operation();
      this.history.unshift({ label, startedAt, status:result?.cancelled?'cancelada':result?.stopped?'pausada':resultFailed(result)?'erro':'concluída' });
      if(!result?.cancelled)this.assessOperation(label,result,!resultFailed(result)&&!result?.stopped);
      return redact(result);
    } catch (error) {
      this.history.unshift({ label, startedAt, status:'erro', error:error.message });
      this.assessOperation(label,{error:error.message},false);
      throw error;
    } finally { this.active = null; this.emit('state',this.status()); queueMicrotask(()=>this.models.pump()); }
  }
  assessOperation(label,result,success){
    try{this.knowledge?.capture(label,redact(result),success);}catch{this.emit('output',{text:'A triagem do cérebro não pôde ser salva. O resultado da operação foi preservado.'});}
  }
  assessStudyArtifacts(project){
    if(!this.knowledge)return;
    try{
      for(const file of this.projects.artifacts(project.id).filter(file=>['STUDY.md','GRILL-ME.md'].includes(basename(file.path)))){
        const artifact=this.projects.artifact(project.id,file.path);
        this.knowledge.capture(`${project.name} · ${file.path}`,artifact.content,true,`Artefato de missão concluída: ${project.id}/${file.path}. SHA-256: ${artifact.version}. Conteúdo do agente é referência proposta, não fato comprovado.`);
      }
    }catch{this.emit('output',{text:'O estudo foi preservado no workspace, mas a triagem de seus artefatos precisa de revisão.'});}
  }
  entry(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('Função inexistente no catálogo local.');
    return entry;
  }
  prepare(id, rawArguments, projectDirectory = this.stateDirectory) {
    const entry = this.entry(id);
    const policy = policyFor(entry);
    if (!['read','confirm'].includes(policy.mode)) throw new Error(policy.reason);
    const argumentsValue = serializeArguments(rawArguments ?? {});
    assertSafeArguments(argumentsValue);
    if(Object.keys(argumentsValue).some(name=>!Object.hasOwn(entry.inputSchema?.properties || {},name)))throw new Error('Parâmetro não declarado no schema desta função.');
    if(entry.name==='task_list' && argumentsValue.limit>200)throw new Error('O limite máximo é 200.');
    if (!this.validator(entry.inputSchema,argumentsValue)) throw new Error('Parâmetros inválidos: ' + this.validator.errors());
    if(entry.name==='agent_spawn' && argumentsValue.memoryBase)throw new Error('Memória COW opcional não é ativada por este perfil Windows. Use memória local e registros de agentes sem memoryBase.');
    const scoped=scopeArguments(argumentsValue,projectDirectory,destination=>assertLocalWritePath(this.repositoryRoot,destination));
    return {entry,policy,arguments:scoped};
  }
  async execute({ id, arguments: rawArguments }) {
    const request=this.prepare(id,rawArguments);
    const {entry,policy,arguments:argumentsValue}=request;
    return this.single(entry.name, async () => {
      if (policy.mode === 'confirm' && !await this.confirm({ entry, arguments:argumentsValue, project:this.stateDirectory })) return { cancelled:true, message:'Execução cancelada; nada foi enviado ao MCP.' };
      return this.callTool(this.mcp,request,this.stateDirectory);
    });
  }
  async callTool(client, request, projectDirectory) {
    const environment=localEnvironment(this.repositoryRoot,this.runtime.nodeExecutable,process.env,projectDirectory);
    assertExecutionPlacement(this.repositoryRoot,environment,projectDirectory);
    assertLocalWriteTree(this.repositoryRoot,projectDirectory);
    for(const source of ['.claude-flow/config.json','.claude-flow/agents/store.json','.claude-flow/agents.json','.claude-flow/swarm/cow-branches.json']){
      const filename=join(projectDirectory,source);
      if(existsSync(filename)){
        if(statSync(filename).size>4000000)throw new Error('Estado do projeto excede o limite de validação.');
        const stored=JSON.parse(readFileSync(filename,'utf8'));
        scopeArguments(stored,projectDirectory,destination=>assertLocalWritePath(this.repositoryRoot,destination));
        if(request.entry.name==='agent_terminate' && /"memoryBranch"\s*:\s*(?!null|false|"")/.test(JSON.stringify(stored)))throw new Error('Este registro contém memória COW. A remoção exige revisão específica fora da interface.');
      }
    }
    for(const folder of [projectDirectory,join(projectDirectory,'.swarm')]){assertLocalWritePath(this.repositoryRoot,folder);mkdirSync(folder,{recursive:true});}
    await client.connect();
    if (!client.toolNames.has(request.entry.name)) throw new Error('A ferramenta não está disponível no processo MCP atual. Atualize o catálogo.');
    return client.request('tools/call',{name:request.entry.name,arguments:request.arguments});
  }
  projectAction({action,id,input={}}) {
    if(action==='list')return this.projects.list();
    if(action==='get')return {...this.projects.get(id),files:FILES,directory:this.projects.location(id)};
    if(this.active)throw new Error('Aguarde o worker antes de alterar o harness.');
    if(action==='create')return this.projects.create(input);
    if(['mission','configure-mission'].includes(action)){
      if(input.engine==='claude'&&!input.model)throw new Error('Escolha o modelo Claude desta etapa.');
      if((input.engine||'mcp')==='mcp')input={...input,arguments:this.prepare(`mcp:${input.tool}`,input.arguments,this.projects.location(id)).arguments};
      else if(['codex','claude'].includes(input.engine)&&input.model){const model=this.cloud.models(input.engine).find(item=>item.id===input.model);if(!model||input.effort&&!model.effortLevels.includes(input.effort))throw new Error('Modelo ou força não disponível no catálogo deste executor.');}
      else if(input.engine==='local'){const model=this.models.snapshot().models.find(item=>item.id===input.model&&item.supported);if(!model||input.effort)throw new Error('Modelo local inválido ou força não suportada por este adaptador.');}
    }
    return this.projects.update(id,action,input);
  }
  async runProject({id,missionId}) {
    return this.single('Fila do harness · um worker',async()=>{
      const project=this.projects.get(id);
      const directory=this.projects.location(id);
      this.active.projectId=id;
      const missions=project.missions.filter(mission=>mission.status==='pending'&&(!missionId||mission.id===missionId));
      if(this.legal)for(const mission of missions)if(mission.engine&&mission.engine!=='mcp')await this.legal.prepare(project.goal+'\n'+mission.instructions);
      if(!missions.length)throw new Error('Não há missões pendentes nesta seleção.');
      const plan=missions.map(mission=>{
        const agent=project.agents.find(item=>item.id===mission.agentId);
        if(!agent)throw new Error('Agente da missão não encontrado.');
        if(['claude','local'].includes(mission.engine)){
          if(typeof mission.instructions!=='string'||!mission.instructions.trim()||mission.instructions.length>16000)throw new Error('Pedido do agente inválido.');
          const provider=mission.engine==='claude'?this.cloud.status().providers.find(item=>item.id==='claude'):null;
          const model=provider?provider.models.find(item=>item.id===mission.model):this.models.snapshot().models.find(item=>item.id===mission.model);
          if(!model||provider&&(!provider.installed||!provider.authenticated)||!provider&&!model.ready)throw new Error('Executor indisponível: confira login ou validação do modelo local.');
          if(mission.effort&&(!provider||!model.effortLevels.includes(mission.effort)))throw new Error('Força não suportada pelo modelo selecionado.');
          const limit=mission.engine==='local'?6000:36000;
          const shared=this.projects.sharedContext(project,Math.min(4000,Math.floor(limit/3)));
          const context=this.projects.plannerContext(project,limit)+'\nPedido completo da etapa:\n'+mission.instructions+'\n'+(this.legal?.context(project.goal+'\n'+mission.instructions)?.content||'')+(shared?'\nCentral · seleção por objetivo, não autorização:\n'+shared.context:'');
          if(context.length>limit)throw new Error('Contexto do estudo excedeu o limite; nada foi cortado ou enviado.');
          return {mission,agent,analysis:{provider:mission.engine,model:mission.model,effort:mission.effort||null,context}};
        }
        if(mission.engine==='codex'){
          if(typeof mission.instructions!=='string'||!mission.instructions.trim()||mission.instructions.length>16000)throw new Error('Instruções Codex inválidas.');
          this.projects.validateFiles(mission.files || []);
          const settings=codexSettings();if(mission.model){const model=this.cloud.models('codex').find(model=>model.id===mission.model);if(!model||mission.effort&&!model.effortLevels.includes(mission.effort))throw new Error('Modelo executor ou força não disponível.');settings.model=mission.model;settings.effort=mission.effort||model.effortLevels.find(level=>level==='medium')||model.effortLevels[0];}return {mission,agent,settings};
        }
        if(mission.engine&&mission.engine!=='mcp')throw new Error('Executor inválido.');
        return {mission,agent,request:this.prepare(`mcp:${mission.tool}`,mission.arguments,directory)};
      });
      if(!await this.confirm({entry:{name:`${project.name}: ${plan.length} missão(ões)`,kind:'harness'},project:directory,arguments:{workerLimit:1,registerAgents:plan.filter(item=>!item.agent.registered).map(item=>({agentId:item.agent.id,agentType:item.agent.role})),missions:plan.map(item=>item.analysis?{title:item.mission.title,...item.analysis,notice:'Produz estudo/Markdown sem ferramentas ou comandos. Nuvem usa sua conta/cota; local mantém validação e teto de memória. Não instala skills.'}:item.settings?{title:item.mission.title,executor:'Codex instalado · usa sua conta e pode consumir créditos',model:item.settings.model||'padrão do Codex',workspace:this.projects.workspace(id),instructions:item.mission.instructions,files:item.mission.files,context:project.context,profile:'Configuração ignorada apenas neste processo. Login existente. Sem MCPs, plugins, gateway ou alterações no config.toml.'}:{title:item.mission.title,tool:item.request.entry.name,arguments:item.request.arguments})}}))return {cancelled:true};
      this.queueStopped=false;
      const client=this.createProjectClient(directory);
      this.active.client=client;
      try{
        for(const item of plan){
          if(this.queueStopped)break;
          const {mission,agent,request}=item;
          if(mission.dependsOn&&!project.missions.some(other=>other.id===mission.dependsOn&&other.status==='done'))throw new Error('Conclua a missão anterior antes desta etapa.');
          mission.status='running';mission.startedAt=new Date().toISOString();this.projects.save(project);this.emit('project',project);
          try{
            if(!agent.registered){
              const registration=await this.callTool(client,this.prepare('mcp:agent_spawn',{agentType:agent.role,agentId:agent.id,model:'sonnet'},directory),directory);
              if(resultFailed(registration))throw new Error(JSON.stringify(redact(registration)).slice(0,1500));
              agent.registered=true;
            }
            let result;
            if(item.analysis){
              const {provider,model,effort,context}=item.analysis;
              const previous=this.planner.modelId,images=this.media?.images('project:'+id)||[];let response;
              this.emit('worker',{projectId:id,missionId:mission.id,event:{type:'item.started',item:{id:'study-response',type:'agent_message',text:'Preparando estudo com '+provider+' · '+model}}});
              try{
                if(provider==='claude'){this.active.worker=this.cloud;response=await this.cloud.run({prompt:'Responda ao pedido completo da etapa presente no contexto. Produza síntese Markdown com fontes, lacunas e próximos passos; nenhuma instalação ou execução está autorizada.',images,history:[]},{context,selection:{provider:'claude',model,effort}});}
                else{if(images.length)throw new Error('Anexos locais neste fluxo ainda exigem o planejador de imagens; nenhum quadro foi descartado.');this.planner.select(model);this.active.worker=this.planner;response=await this.planner.run({prompt:'Produza síntese Markdown do pedido completo da etapa, com fontes e lacunas; não execute nem instale nada.'},{context});}
              }finally{if(provider==='local')this.planner.select(previous);this.active.worker=null;}
              const filename=this.knowledge?.state.studies.some(study=>study.id===id)?'STUDY.md':'MISSION-'+mission.id+'.md';this.projects.write(join(this.projects.workspace(id),filename),response.answer);
              result={success:true,provider,model,effort,usage:response.usage,report:{status:'completed',summary:response.answer,files:[filename],tests:[]}};mission.status='done';this.assessStudyArtifacts(project);
              this.emit('worker',{projectId:id,missionId:mission.id,event:{type:'item.completed',item:{id:'study-response',type:'agent_message',text:response.answer}}});
            }else if(item.settings){
              const prepared=this.projects.prepareCodex(project,mission,agent);
              if(this.media){prepared.images=this.media.prepareProject(project,prepared.workspace,(path,content)=>this.projects.write(path,content));if(prepared.images.length){prepared.prompt+='\nLeia MEDIA.md e examine as imagens fornecidas como referências visuais. Os vídeos foram amostrados; áudio não analisado.\n';this.projects.write(join(prepared.runDirectory,'context.md'),prepared.prompt);}}
              assertLocalWriteTree(this.repositoryRoot,prepared.workspace);
              mission.runId=prepared.runId;this.projects.save(project);
              const worker=this.createCodexWorker();this.active.worker=worker;
              let events=[];
              try{result=await worker.run({...prepared,settings:item.settings,onEvent:event=>{
                const safe=redact(event);
                if(event.type==='thread.started'){mission.threadId=event.thread_id;this.projects.save(project);}
                events.push(JSON.stringify(safe).slice(0,12000));events=events.slice(-150);
                this.emit('worker',{projectId:id,missionId:mission.id,event:safe});
              }});}finally{this.projects.write(join(prepared.runDirectory,'events.jsonl'),events.join('\n'));this.active.worker=null;}
              this.projects.write(join(prepared.runDirectory,'result.json'),JSON.stringify(redact(result),null,2));
              mission.status=result.interrupted?'unknown':result.success?'done':'error';
              if(mission.status==='done')this.assessStudyArtifacts(project);
            }else{
              result=await this.callTool(client,request,directory);
              mission.status=resultFailed(result)?'error':'done';
            }
            mission.result=JSON.stringify(redact(result),null,2).slice(0,24000);
          }catch(error){mission.status=/desconhecido|encerrado|interrompido|esgotado/i.test(error.message)?'unknown':'error';mission.result=String(error.message);}
          mission.finishedAt=new Date().toISOString();this.projects.save(project);this.emit('project',project);
          if(mission.status!=='done')break;
        }
      }finally{client.close();}
      return {success:!project.missions.some(mission=>['error','unknown'].includes(mission.status)),stopped:this.queueStopped,project};
    });
  }
  createProjectClient(directory){return new LocalMcpClient({nodeExecutable:this.runtime.nodeExecutable,launcher:join(this.repositoryRoot,'scripts/sandubah-mcp.cjs'),cwd:directory,env:localEnvironment(this.repositoryRoot,this.runtime.nodeExecutable,process.env,directory),timeoutMs:60000});}
  async buildProject(payload){
    const started=Date.now();
    if(this.active)throw new Error('Aguarde o worker atual.');
    if(typeof payload?.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>4000)throw new Error('Descreva o que construir em até 4.000 caracteres.');
    const history=payload.history||[];if(!Array.isArray(history)||history.length>6||history.some(item=>!['user','assistant'].includes(item.role)||typeof item.content!=='string'||item.content.length>16000))throw new Error('Histórico inválido.');
    let project=payload.projectId?this.projects.get(payload.projectId):this.projects.create({name:payload.prompt.replace(/[\r\n]+/g,' ').slice(0,100),goal:payload.prompt});
    if(!payload.projectId&&this.knowledge?.state.briefs['planner:new'])this.knowledge.savePlannerOptions(project.id,this.knowledge.plannerOptions(''));
    if(!project.agents.some(agent=>agent.role==='coder'))project=this.projects.update(project.id,'agent',{name:'Construtor SanduBAH',role:'coder'});
    const agent=project.agents.find(agent=>agent.role==='coder');
    if(payload.mediaScope&&this.media){this.media.copyScope(payload.mediaScope,'project:'+project.id);this.media.copyScope(payload.mediaScope,'planner:'+project.id);}
    this.projects.write(join(this.projects.workspace(project.id),'PLANNING.md'),'# Conversa e pedido de implementação\n\n'+history.map(item=>`## ${item.role}\n${item.content}`).join('\n\n')+'\n\n## Pedido atual\n'+payload.prompt);
    const existing=project.missions.findLast(mission=>mission.status==='pending'&&mission.fromChat&&mission.buildPrompt===payload.prompt);
    if(!existing)project=this.projects.update(project.id,'mission',{engine:'codex',agentId:agent.id,title:'Construir: '+payload.prompt.slice(0,90),instructions:'Implemente de verdade o pedido abaixo dentro deste projeto. Leia PLANNING.md e os Markdown do harness. Crie e altere arquivos, execute testes locais seriais e entregue o resultado aqui. Não devolva passos para o usuário criar pastas ou rodar comandos. Para interfaces web, entregue index.html funcional e arquivos locais, sem CDN ou downloads, para a prévia lateral. Para outros tipos de projeto, implemente os arquivos e testes adequados. Preserve todos os arquivos existentes que não precisem mudar.\n\nPedido: '+payload.prompt});
    const mission=existing||project.missions.at(-1);mission.fromChat=true;mission.buildPrompt=payload.prompt;if(this.cloud.selection.provider==='codex'){mission.model=this.cloud.selection.model;mission.effort=this.cloud.selection.effort;}this.projects.save(project);this.emit('project',project);this.emit('planner',{type:'project',projectId:project.id,name:project.name});
    const result=await this.runProject({id:project.id,missionId:mission.id});project=this.projects.get(project.id);if(result.cancelled)return {...result,projectId:project.id};
    const completed=project.missions.find(item=>item.id===mission.id);let report,outcome;try{outcome=JSON.parse(completed.result);report=JSON.parse(outcome.finalMessage);}catch{}
    const usage=outcome?.usage?{inputTokens:outcome.usage.input_tokens,outputTokens:outcome.usage.output_tokens,cachedInputTokens:outcome.usage.cached_input_tokens,source:'Codex · uso reportado pelo executor'}:null;
    return {projectId:project.id,success:completed.status==='done',answer:report?.summary||'A execução terminou com pontos para revisão. Confira as etapas e arquivos na lateral.',tests:report?.tests||[],provider:'codex',model:mission.model||'Codex executor',seconds:(Date.now()-started)/1000,usage};
  }
  createCodexWorker(){
    const codexHome=join(this.repositoryRoot,'build/sandubah/gui/codex-profile');
    assertLocalWriteTree(this.repositoryRoot,codexHome);mkdirSync(codexHome,{recursive:true});
    const auth=join(codexHome,'auth.json');
    if(!existsSync(auth)){
      const source=join(codexSettings().home,'auth.json');
      if(!existsSync(source)||statSync(source).size>512000)throw new Error('Login local não disponível. Entre no Codex antes de conectar o harness.');
      const credentials=readFileSync(source,'utf8');JSON.parse(credentials);
      this.projects.write(auth,credentials);
    }
    return new CodexWorker({runtime:this.runtime,codexHome});
  }
  interruptWorker(){if(!this.active?.worker)throw new Error('Não há agente ativo nesta janela.');this.queueStopped=true;this.active.worker.cancel();return {message:'Interrupção solicitada. Aguardando a saída do worker; revise os arquivos parciais.'};}
  async applyArtifact(payload){
    return this.single('Aplicar resultado revisado',async()=>{
      const artifact=this.projects.artifact(payload.id,payload.path);
      if(!artifact.canApply||artifact.conflict||artifact.version!==payload.version)throw new Error('Resultado não aplicável ou mudou. Reabra para revisar.');
      if(!await this.confirm({entry:{name:`aplicar ${payload.path}`,kind:'artifact'},project:this.repositoryRoot,arguments:{path:payload.path,version:payload.version,backup:true}}))return {cancelled:true};
      return this.projects.applyArtifact(payload);
    });
  }
  async restoreCheckpoint(payload){
    return this.single('Restaurar checkpoint',async()=>{
      const checkpoint=this.projects.checkpoint(payload.id,payload.checkpointId);
      if(!checkpoint.canRestore||checkpoint.currentVersion!==payload.version)throw new Error('Checkpoint não restaurável ou o arquivo mudou. Reabra para revisar.');
      if(!await this.confirm({entry:{name:`restaurar ${checkpoint.path}`,kind:'checkpoint'},project:this.repositoryRoot,arguments:{path:checkpoint.path,checkpoint:checkpoint.id,appliedAt:checkpoint.at,version:payload.version,safetyBackup:true}}))return {cancelled:true};
      return this.projects.restoreCheckpoint(payload);
    });
  }
  async historyAction(payload){
    const action=payload?.action;
    if(action==='status')return this.versionHistory.status(payload.id);
    if(action==='show')return this.versionHistory.show(payload.id,payload.hash);
    if(this.active)throw new Error('Aguarde a operação atual terminar antes de salvar ou restaurar versões.');
    if(action==='save')return this.versionHistory.save(payload.id,payload.input);
    if(action==='restore')return this.single('Restaurar versão',async()=>{
      const version=this.versionHistory.versions(payload.id).find(item=>item.hash===payload.hash);
      if(!version)throw new Error('Versão fora do histórico deste projeto.');
      if(!await this.confirm({entry:{name:`restaurar a versão ${version.number}`,kind:'version-restore'},project:this.repositoryRoot,arguments:{version:version.number,commit:version.short,subject:version.subject,savedAt:version.date}}))return {cancelled:true};
      return this.versionHistory.restore(payload.id,payload.hash);
    });
    if(action==='set-remote')return this.versionHistory.setRemote(payload.id,payload.url);
    if(action==='remove-remote')return this.versionHistory.removeRemote(payload.id);
    if(action==='push')return this.single('Enviar versões ao GitHub',async()=>{
      const plan=await this.versionHistory.pushPlan(payload.id);
      const visibility={public:'PÚBLICO: qualquer pessoa verá estes arquivos','private-or-missing':'privado ou ainda não criado (o GitHub não o mostra sem login)',unknown:'não foi possível verificar'}[plan.visibility];
      const approved=await this.confirm({entry:{name:`enviar ${plan.pending.length} ${plan.pending.length===1?'versão':'versões'} ao GitHub`,kind:'github-push',visibility:plan.visibility},project:this.repositoryRoot,arguments:{repositorio:plan.web||plan.url,visibilidade:visibility,branch:plan.branch,versoes:plan.pending.map(item=>item.subject),mudancasSemVersao:plan.unsaved?`${plan.unsaved} arquivo(s) fora deste envio`:'nenhuma'}});
      if(!approved)return {cancelled:true};
      return this.versionHistory.push(payload.id);
    });
    throw new Error('Ação de histórico inválida.');
  }
  stopQueue(){this.queueStopped=true;return {message:'A fila para após a missão atual. Nenhuma chamada será repetida.'};}
  readSource(id) {
    if (typeof id === 'string' && id.startsWith('personal:') && this.personalLibrary) return this.personalLibrary.document(id);
    const entry = this.entry(id);
    if (!['skill','agent','plugin'].includes(entry.kind) || !entry.sourcePath) throw new Error('Esta função não possui documento de biblioteca.');
    const filename = localPath(this.repositoryRoot,entry.sourcePath);
    if(statSync(filename).size>256000)throw new Error('Documento maior que 256 KiB. Abra-o no editor.');
    const content = readFileSync(filename,'utf8');
    if (Buffer.byteLength(content) > 256000) throw new Error('Documento maior que 256 KiB. Abra-o no editor.');
    return { path:entry.sourcePath, content };
  }
  async runProcess(command, args, { cwd = this.repositoryRoot, timeoutMs = 60000 } = {}) {
    if (args.some(argument => typeof argument !== 'string' || argument.includes('\0'))) throw new Error('Argumento inválido.');
    return new Promise((resolvePromise,rejectPromise) => {
      const child = spawn(command,args,{ cwd, env:localEnvironment(this.repositoryRoot,this.runtime.nodeExecutable,process.env,this.stateDirectory), shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'] });
      this.active.child = child;
      let output = '';
      let overflow = false;
      let timedOut = false;
      const append = chunk => {
        if (output.length + chunk.length > 1000000) { overflow=true; output=output.slice(-700000); }
        const text = chunk.toString();
        output += text;
        this.emit('output',String(redact(text)).slice(-8000));
      };
      child.stdout.on('data',append);
      child.stderr.on('data',append);
      const timer = setTimeout(() => { timedOut=true;terminateOwnedChild(child); },timeoutMs);
      child.on('error',error => {clearTimeout(timer);rejectPromise(error);});
      child.on('close',(exitCode,signal) => {
        clearTimeout(timer);
        if (timedOut || signal || exitCode === null) {rejectPromise(new Error('Processo interrompido. O resultado pode ser desconhecido.'));return;}
        resolvePromise({ exitCode, output, truncated:overflow, success:exitCode===0 });
      });
    });
  }
  async help(id) {
    const entry = this.entry(id);
    if (entry.kind !== 'cli' || !Array.isArray(entry.commandPath) || entry.commandPath.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) throw new Error('Comando inválido.');
    return this.single(`Ajuda: ${entry.name}`,() => this.runProcess(this.runtime.nodeExecutable,[join(this.repositoryRoot,'bin/cli.js'),...entry.commandPath,'--help','--no-update','--no-color']));
  }
  async development({ action, testPath }) {
    if (action === 'catalog') {
      return this.single('Atualizar catálogo local',async()=>{
        const result=await this.runProcess(this.runtime.nodeExecutable,[join(this.repositoryRoot,'scripts/export-sandubah-catalog.mjs')],{timeoutMs:120000});
        if(!result.success)throw new Error(result.output.slice(-3000));
        this.catalog=JSON.parse(readFileSync(join(this.repositoryRoot,'build/sandubah/gui/catalog.json'),'utf8'));
        this.entries=new Map(this.catalog.entries.map(entry=>[entry.id,entry]));
        return result;
      });
    }
    if (action === 'build') {
      return this.single('Compilar CLI local',async() => {
        if(!await this.confirm({entry:{name:'Compilar CLI local',kind:'development'},arguments:{action:'build'},project:this.repositoryRoot}))return {cancelled:true};
        const result=await this.runProcess(this.runtime.nodeExecutable,[join(this.repositoryRoot,'v3/@claude-flow/cli/node_modules/typescript/bin/tsc'),'-p',join(this.repositoryRoot,'v3/@claude-flow/cli/tsconfig.json')],{timeoutMs:300000});
        if(result.success){this.mcp.close();await this.mcp.connect();}
        return result;
      });
    }
    if (action !== 'test' || typeof testPath !== 'string' || !testPath.endsWith('.test.ts')) throw new Error('Selecione um arquivo de testes.');
    const filename = localPath(this.repositoryRoot,testPath);
    if (!testPath.startsWith('v3/') || !testPath.includes('/__tests__/')) throw new Error('O arquivo deve pertencer aos testes do workspace local.');
    const relativeTest = relative(join(this.repositoryRoot,'v3'),filename);
    return this.single(`Teste: ${basename(filename)}`,async() => {
      if(!await this.confirm({entry:{name:'Teste local com um worker',kind:'development'},arguments:{testPath},project:this.repositoryRoot}))return {cancelled:true};
      return this.runProcess(this.runtime.nodeExecutable,[join(this.repositoryRoot,'v3/node_modules/vitest/vitest.mjs'),'run',relativeTest,'--maxWorkers=1','--no-file-parallelism','--coverage.enabled=false'],{cwd:join(this.repositoryRoot,'v3'),timeoutMs:300000});
    });
  }
  close() {
    this.cloud.close();
    this.memory.close();
    this.models.close();
    this.active?.worker?.cancel();
    this.active?.client?.close();
    terminateOwnedChild(this.active?.child);
    this.mcp.close();
  }
}

function createValidator(Ajv) {
  const instance = new Ajv({ strict:false, allErrors:true, allowUnionTypes:true, logger:false });
  const compiled = new Map();
  let errors = '';
  const validate = (schema, value) => {
    const key = JSON.stringify(schema || { type:'object' });
    try {
      if (!compiled.has(key)) compiled.set(key,instance.compile(schema || { type:'object' }));
      const validator = compiled.get(key);
      const valid = validator(value);
      errors = (validator.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
      return valid;
    } catch { errors='O schema desta ferramenta exige revisão manual.'; return false; }
  };
  validate.errors = () => errors;
  return validate;
}

module.exports = { DesktopController, LocalMcpClient, createValidator, policyFor, serializeArguments, assertSafeArguments, assertExecutionPlacement, assertLocalWritePath, assertLocalWriteTree, localPath, localEnvironment, redact, MAX_MESSAGE_BYTES };
