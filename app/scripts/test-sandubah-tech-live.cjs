'use strict';
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync,realpathSync}=require('node:fs');
const {join,resolve,relative,isAbsolute}=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {DesktopController}=require('../src/sandubah-desktop/backend.cjs');
const {KnowledgeLibrary}=require('../src/sandubah-desktop/knowledge.cjs');
const {prepareTech}=require('../src/sandubah-desktop/tech-lab.cjs');
const {reviewTarget,prepareSession,loadManifest,executeAnalysis,installation}=require('../src/sandubah-desktop/rea-executor.cjs');
const {confirmedComparison}=require('../src/sandubah-desktop/x-tudo.cjs');
const {codexSettings,hashFile}=require('../src/sandubah-desktop/codex-worker.cjs');
const root=resolve(__dirname,'..'),build=join(root,'build/sandubah/gui'),runtime=require(join(build,'runtime.json'));
const outputParent=join(build,'tmp');mkdirSync(outputParent,{recursive:true});
const resumeIndex=process.argv.indexOf('--resume'),resume=resumeIndex>=0?realpathSync(process.argv[resumeIndex+1]):null;
if(resume){const inside=relative(realpathSync(outputParent),resume);assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside)&&/^tech-luna-/.test(inside));}
const fixture=resume||mkdtempSync(join(outputParent,'tech-luna-')),profile=codexSettings(),globalHash=profile.configHash;
const previous=resume?JSON.parse(readFileSync(join(fixture,'validation.json'),'utf8')):null;
const budgetIndex=process.argv.indexOf('--allowed-executions'),budget=budgetIndex>=0?Number(process.argv[budgetIndex+1]):3;assert.ok([3,4].includes(budget));
const hash=content=>createHash('sha256').update(content).digest('hex');
const protectedFiles=['execution-policy.cjs','cloud-planner.cjs','main.cjs'].map(name=>join(root,'src/sandubah-desktop',name));protectedFiles.push(join(root,'build/sandubah/source-publication/README.md'));const protectedHashes=protectedFiles.map(hashFile);
const controller=new DesktopController({repositoryRoot:fixture,runtime,catalog:{entries:[]},confirm:async()=>false});
const projects=controller.projects,library=new KnowledgeLibrary({repositoryRoot:fixture,home:fixture,appData:fixture,projects,write:(path,content)=>projects.write(path,content),catalog:()=>({entries:[]}),roots:[],includeParent:false});projects.knowledgeLibrary=library;controller.knowledge=library;
let project=previous?projects.get(previous.projectId):projects.create({name:'Tech e X-Tudo Harness² · ensaio fictício Luna',goal:'Analisar um app fictício extraído, revisar uma melhoria do harness e comparar o cálculo de pedidos com evidências reais; sem publicar ou alterar outros projetos.'});if(!previous){project.executorDefaults={engine:'codex',model:'gpt-6-luna',effort:'low'};projects.save(project);}
const workspace=projects.workspace(project.id),put=(name,content)=>projects.write(join(workspace,name),typeof content==='string'?content:JSON.stringify(content,null,2));
if(!previous){put('sample-app/package.json',{name:'fictional-orders-artifact',version:'1.0.0',main:'main.cjs'});
put('sample-app/orders.cjs','exports.totalOrders = rows => Math.round(rows.reduce((sum, row) => sum + row.total, 0) * 100) / 100;\n');
put('sample-app/main.cjs',"const {BrowserWindow,ipcMain}=require('electron');const {join}=require('node:path');const {totalOrders}=require('./orders.cjs');ipcMain.handle('orders:total',(_event,rows)=>totalOrders(rows));new BrowserWindow({webPreferences:{contextIsolation:true,nodeIntegration:false,preload:join(__dirname,'preload.cjs')}});\n");
put('sample-app/preload.cjs',"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('orders',{total:rows=>ipcRenderer.invoke('orders:total',rows)});\n");
put('orders.fixture.json',[{id:'fictitious-1',state:'paid',total:85.15},{id:'fictitious-2',state:'cancelled',total:20.10}]);
put('checks.json',{checks:[{id:'total-correto',path:'total',expected:85.15,critical:true},{id:'entrada-preservada',path:'inputPreserved',expected:true,critical:true}]});}
const fixtureHash=hash(readFileSync(join(workspace,'orders.fixture.json'))),contractHash=hash(readFileSync(join(workspace,'checks.json')));
const skill=join(process.env.USERPROFILE,'.agents/skills/reverse-engineer-anything/SKILL.md');
if(existsSync(skill)){const path='docs/reverse-engineer-anything/SKILL.md';projects.write(join(fixture,path),readFileSync(skill));projects.documents=new Map([[path,{path,title:'reverse-engineer-anything'}]]);}
const tech=previous?{missionId:project.missions.find(mission=>mission.tech).id}:prepareTech(projects,project.id,{type:'package',intent:'mod',target:'sample-app',goal:'Analise o artefato fictício extraído com a ferramenta REA conectada. Explique o canal IPC orders:total, seu handler e a falha de incluir pedidos cancelados no total. Cite Evidence IDs reais, SHA/caminhos e limites da análise estática. Somente relatório, sem executar Electron ou modificar a referência.',rights:'Artefato fictício criado exclusivamente para este teste autorizado.',authorized:true,useRea:true});
const receipt=previous||{schema:1,createdAt:new Date().toISOString(),fixture,projectId:project.id,model:'gpt-6-luna',effort:'low',workerLimit:1,executions:[],rea:null,comparison:null,published:false};
function save(){writeFileSync(join(fixture,'validation.json'),JSON.stringify(receipt,null,2));}
async function run(){
  if(!process.argv.includes('--probe')&&!process.argv.includes('--live'))throw new Error('Escolha --probe (sem IA) ou --live (três execuções Luna explicitamente autorizadas).');
  const mission=projects.get(project.id).missions.find(item=>item.id===tech.missionId),review=reviewTarget(projects,project.id,mission);
  if(process.argv.includes('--probe')){
    const agent=projects.get(project.id).agents.find(item=>item.id===mission.agentId),prepared=projects.prepareCodex(projects.get(project.id),mission,agent),session=prepareSession(projects,project.id,mission,prepared,review,runtime),manifest=loadManifest(session.manifest,session.sha256),result=executeAnalysis(manifest);
    writeFileSync(join(fixture,'rea-probe.json'),result.raw);console.log(JSON.stringify({probe:true,fixture,version:installation().version,evidenceKeys:Object.keys(result.evidence),prefix:result.raw.slice(0,1400)}));return;
  }
  if(!previous){const cancelled=await controller.runProject({id:project.id,missionId:tech.missionId});assert.equal(cancelled.cancelled,true);assert.equal(projects.get(project.id).missions[0].status,'pending');receipt.cancelledBeforeExecution=true;}
  let approvals=receipt.executions.length;const allowed=new Set();
  controller.confirm=async request=>{const expected=approvals<budget&&allowed.has(request.arguments?.missions?.[0]?.title)&&request.entry.kind==='harness'&&request.arguments.workerLimit===1&&request.arguments.missions.length===1&&request.arguments.missions[0].model==='gpt-6-luna'&&request.project===projects.location(project.id);if(expected){approvals++;console.log(JSON.stringify({humanScopeApproval:'explicit user authorization; bounded live executions',execution:approvals,budget,model:'gpt-6-luna',title:request.arguments.missions[0].title,rea:request.arguments.missions[0].rea}));}return expected;};
  const prepareAgents=()=>{const value=projects.get(project.id);for(const agent of value.agents)agent.registered=true;projects.save(value);};
  async function execute(id){
    let before=projects.get(project.id).missions.find(item=>item.id===id);if(before.status==='done')return before;if(approvals>=budget)throw new Error('Orçamento de execuções autorizadas atingido; próximo passo continua pendente.');if(['error','unknown'].includes(before.status)){projects.update(project.id,'retry',{missionId:id});before=projects.get(project.id).missions.find(item=>item.id===id);}allowed.add(before.title);prepareAgents();const events=[];
    const listen=({missionId,event})=>{if(missionId===id){events.push(event);if(['thread.started','turn.completed','turn.failed','error'].includes(event.type))console.log(JSON.stringify(event));}};controller.on('worker',listen);
    try{const result=await controller.runProject({id:project.id,missionId:id}),mission=projects.get(project.id).missions.find(item=>item.id===id);writeFileSync(join(fixture,id+'-events.json'),JSON.stringify(events,null,2));const data={id,title:mission.title,status:mission.status,runId:mission.runId,result:JSON.parse(mission.result||'{}')};receipt.executions.push(data);save();if(!result.success||mission.status!=='done')throw new Error('Execução Luna não concluída: '+mission.result);return mission;}finally{controller.off('worker',listen);allowed.delete(before.title);}
  }
  const techMission=await execute(tech.missionId),reaPath=join(projects.location(project.id),'runs',techMission.runId,'rea-evidence.json');assert.ok(existsSync(reaPath),'Luna deve chamar REA de verdade.');receipt.rea=JSON.parse(readFileSync(reaPath));assert.equal(receipt.rea.calls,1);save();
  const priorReview=projects.get(project.id).missions.find(mission=>mission.title==='Revisão Harness²: uma melhoria verificável');const refinement=priorReview?{missionId:priorReview.id}:library.prepareHarnessReview(project.id);await execute(refinement.missionId);
  project=projects.get(project.id);const agent=project.agents.find(item=>item.name==='Revisor do harness');
  const experiment=project.missions.find(mission=>mission.title==='Ensaio X-Tudo Harness²: calcular e comparar pedidos fictícios');
  if(!experiment)project=projects.update(project.id,'mission',{engine:'codex',model:'gpt-6-luna',effort:'low',agentId:agent.id,title:'Ensaio X-Tudo Harness²: calcular e comparar pedidos fictícios',instructions:'Ensaio autorizado com dados fictícios. Leia os relatórios TECH-*.md e HARNESS2-REVIEW-*.md existentes. Não altere sample-app/, orders.fixture.json ou checks.json. Crie candidate.cjs exportando totalOrders(rows), que some somente pedidos state=paid e arredonde a centavos sem modificar a entrada. Crie run-comparison.cjs: leia orders.fixture.json, execute a função baseline de sample-app/orders.cjs e a candidata com a mesma entrada e grave before.json e after.json com total e inputPreserved (comparação do JSON antes/depois). Execute este script e crie/execute candidate.test.cjs com node:test para total 85.15, pedido cancelled excluído, vazio 0 e entrada preservada. Use Node local, --test --test-concurrency=1 --test-isolation=none. Não execute Electron, não instale nem use REA nesta etapa; não altere código original, configurações, gateway, Corel ou impressão. Crie X-TUDO-EXPERIMENT.md com comandos, saídas e limites reais. Um worker e nenhum download/publicação. Só declare completed se executou os testes e gerou os dois JSON reais. O comparador determinístico do app fará a avaliação separada com confirmação.'});
  await execute(experiment?.id||project.missions.at(-1).id);
  assert.equal(hash(readFileSync(join(workspace,'orders.fixture.json'))),fixtureHash);assert.equal(hash(readFileSync(join(workspace,'checks.json'))),contractHash);assert.equal(reviewTarget(projects,project.id,projects.get(project.id).missions.find(item=>item.id===tech.missionId)).sha256,review.sha256);
  const input={contract:'checks.json',baseline:'before.json',candidate:'after.json'};
  assert.deepEqual(await confirmedComparison({projects,id:project.id,input,confirm:async()=>false}),{cancelled:true});
  receipt.comparison=await confirmedComparison({projects,id:project.id,input,confirm:async preview=>preview.sources.contract.sha256===contractHash&&preview.baselinePassed===1&&preview.candidatePassed===2});
  assert.equal(receipt.comparison.decision,'review');assert.equal(receipt.comparison.regressions,0);assert.equal(receipt.comparison.adopted,false);
  const repeated=await confirmedComparison({projects,id:project.id,input,confirm:async()=>true});assert.equal(repeated.id,receipt.comparison.id);assert.equal(repeated.reused,true);
  receipt.approvedExecutions=approvals;receipt.globalConfigPreserved=hashFile(profile.configPath)===globalHash;receipt.protectedFilesPreserved=protectedFiles.every((file,index)=>hashFile(file)===protectedHashes[index]);receipt.realUsage=receipt.executions.map(item=>({title:item.title,usage:item.result.usage}));receipt.passed=true;if(receipt.error){receipt.previousFailure=receipt.error;delete receipt.error;}save();
  console.log(JSON.stringify({passed:true,fixture,projectId:project.id,usage:receipt.realUsage,reaCalls:receipt.rea.calls,decision:receipt.comparison.decision,globalConfigPreserved:receipt.globalConfigPreserved}));
}
run().catch(error=>{receipt.error=error.message;save();console.error(error.stack);process.exitCode=1;}).finally(()=>{controller.close();assert.equal(hashFile(profile.configPath),globalHash);assert.deepEqual(protectedFiles.map(hashFile),protectedHashes);});
