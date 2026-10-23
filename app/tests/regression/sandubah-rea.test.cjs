'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,relative}=require('node:path');
const {createHash}=require('node:crypto');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {installation,targetFiles,loadManifest,executeAnalysis,configuration}=require('../../src/sandubah-desktop/rea-executor.cjs');
const {createBroker}=require('../../src/sandubah-desktop/rea-broker.cjs');
const {workerArguments}=require('../../src/sandubah-desktop/codex-worker.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const root=mkdtempSync(join(parent,'rea-'));
test.after(()=>{assert.ok(!relative(realpathSync(parent),realpathSync(root)).startsWith('..'));rmSync(root,{recursive:true,force:true});});
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const repo=mkdtempSync(join(root,'repo-')),projects=new ProjectWorkspace({repositoryRoot:repo,catalog:{entries:[]},guard:path=>assertLocalWritePath(repo,path),readLocal:path=>join(repo,path)}),project=projects.create({name:'Artefato fictício',goal:'Verificação local.'});
  const workspace=projects.workspace(project.id),runDirectory=join(projects.location(project.id),'runs','fixture'),snapshot=join(runDirectory,'rea/snapshot'),home=join(runDirectory,'rea/home'),cache=join(repo,'cache'),packageRoot=join(cache,'fixture/node_modules/rea-agents');
  for(const directory of [workspace,snapshot,home,join(packageRoot,'scripts')])mkdirSync(directory,{recursive:true});
  writeFileSync(join(packageRoot,'package.json'),'{"name":"rea-agents","version":"6.1.0"}');writeFileSync(join(packageRoot,'scripts/rea.mjs'),'console.log("fixture");');
  writeFileSync(join(snapshot,'app.js'),'module.exports = 42;');writeFileSync(join(workspace,'candidate.json'),'{}');
  const installed=installation(cache),files=[{path:'app.js',sha256:hash(readFileSync(join(snapshot,'app.js'))),bytes:20}];
  const manifest={schema:1,workspace:realpathSync(workspace),runDirectory:realpathSync(runDirectory),snapshot:realpathSync(snapshot),analysisPath:realpathSync(snapshot),target:'sample',format:'directory',files,targetHash:hash(JSON.stringify(files)),installation:installed,nodeExecutable:process.execPath,home:realpathSync(home),tool:'analyze_javascript_application',callLimit:1};
  const filename=join(runDirectory,'rea/manifest.json');writeFileSync(filename,JSON.stringify(manifest));const digest=hash(readFileSync(filename));return {projects,project,workspace,runDirectory,snapshot,home,manifest,filename,digest};
}
test('REA só descobre a versão local fixada; nunca baixa nem configura',()=>{assert.equal(installation(join(root,'missing')),null);const {manifest}=fixture();assert.equal(manifest.installation.version,'6.1.0');assert.match(manifest.installation.entryHash,/^[a-f0-9]{64}$/);});
test('alvo só pode ser ASAR/pasta do workspace sem travessia ou conteúdo privado',()=>{
  const {projects,project,workspace}=fixture();projects.write(join(workspace,'sample/app.js'),'module.exports=1;');const target=targetFiles(projects,project.id,'sample');assert.equal(target.files.length,1);assert.equal(target.format,'directory');
  for(const path of ['../sample','C:/outside','sample\\app.js','candidate.json'])assert.throws(()=>targetFiles(projects,project.id,path));
  projects.write(join(workspace,'sample/.env'),'PRIVATE=1');assert.throws(()=>targetFiles(projects,project.id,'sample'),/privadas/);
});
test('manifesto e snapshot alterados são recusados',()=>{
  const {filename,digest,snapshot}=fixture();assert.equal(loadManifest(filename,digest).callLimit,1);writeFileSync(join(snapshot,'app.js'),'changed');assert.throws(()=>loadManifest(filename,digest),/Snapshot/);assert.throws(()=>loadManifest(filename,'0'.repeat(64)),/Manifesto/);
});
test('broker anuncia só uma ferramenta e recusa outros alvos, rede e operações',async()=>{
  const {filename,digest}=fixture();let calls=0;const broker=createBroker(filename,digest,()=>{calls++;return {evidence:{id:'fixture-evidence'},raw:'{"id":"fixture-evidence"}'};});
  const list=await broker({id:1,method:'tools/list'});assert.deepEqual(list.result.tools.map(tool=>tool.name),['analyze_javascript_application']);
  for(const request of [{id:2,method:'tools/call',params:{name:'open_binary',arguments:{input_path:'sample'}}},{id:3,method:'tools/call',params:{name:'analyze_javascript_application',arguments:{input_path:'../outside'}}},{id:4,method:'tools/call',params:{name:'analyze_javascript_application',arguments:{input_path:'sample',url:'https://example.test'}}},{id:5,method:'resources/read',params:{uri:'file:///outside'}}])assert.ok((await broker(request)).error);
  assert.equal(calls,0);
});
test('broker executa uma vez, retém evidência completa e recusa snapshot modificado',async()=>{
  const {filename,digest,snapshot,runDirectory}=fixture();let calls=0;const broker=createBroker(filename,digest,()=>{calls++;return {evidence:{id:'fixture-evidence',limitations:['static only']},raw:'{"id":"fixture-evidence","limitations":["static only"]}'};});
  const request={id:1,method:'tools/call',params:{name:'analyze_javascript_application',arguments:{input_path:'sample'}}};const first=await broker(request),again=await broker({...request,id:2});assert.deepEqual(first.result,again.result);assert.equal(calls,1);assert.equal(JSON.parse(readFileSync(join(runDirectory,'rea-evidence.json'))).calls,1);
  writeFileSync(join(snapshot,'app.js'),'modified');assert.equal((await broker({...request,id:3})).result.isError,true);assert.equal(calls,1);
});
test('falha REA não é repetida silenciosamente ou convertida em evidência',async()=>{
  const {filename,digest}=fixture();let calls=0;const broker=createBroker(filename,digest,()=>{calls++;throw new Error('falha real');});const request={id:1,method:'tools/call',params:{name:'analyze_javascript_application',arguments:{input_path:'sample'}}};assert.equal((await broker(request)).result.isError,true);assert.equal((await broker({...request,id:2})).result.isError,true);assert.equal(calls,1);
});
test('processo REA recebe ambiente mínimo e limites de filesystem sem shell ou credenciais',()=>{
  const {manifest}=fixture();let invocation;executeAnalysis(manifest,(command,args,options)=>{invocation={command,args,options};return {status:0,stdout:JSON.stringify({evidence_id:'ev_'+'a'.repeat(64),operation:'analyze_javascript_application',normalized_result:{}})};});
  assert.equal(invocation.options.shell,false);assert.equal(invocation.options.env.OPENAI_API_KEY,undefined);assert.equal(invocation.options.env.CODEX_HOME,undefined);assert.equal(invocation.options.env.HOME,manifest.home);assert.ok(invocation.args.includes('--permission'));assert.ok(!invocation.args.includes('--allow-child-process'));assert.ok(!invocation.args.includes('--allow-addons'));assert.equal(invocation.args.at(-1),'--json');
});
test('configuração é literal, restrita à execução e não desativa o sandbox Codex',()=>{
  const {filename,digest,workspace,runDirectory}=fixture(),rea={manifest:filename,sha256:digest},runtime={nodeExecutable:process.execPath};const config=configuration({workspace,runDirectory,rea,runtime});assert.match(config.join('\n'),/enabled_tools/);assert.doesNotMatch(config.join('\n'),/http:|npx|dangerously|config\.toml/);
  const args=workerArguments({workspace,outputPath:join(runDirectory,'last-message.txt'),settings:{model:'gpt-6-luna',effort:'low'},rea,runtime});assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('workspace-write'));assert.ok(args.includes('sandbox_workspace_write.network_access=false'));assert.doesNotMatch(args.join(' '),/dangerously/);
  assert.throws(()=>configuration({workspace:root,runDirectory,rea,runtime}),/outra execução/);
});
