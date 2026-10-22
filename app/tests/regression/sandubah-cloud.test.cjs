'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,realpathSync}=require('node:fs');const {join,resolve,dirname,sep}=require('node:path');
const {CloudPlanner,codexQuota,claudeQuota,quotaWindow,claudeFailure}=require('../../src/sandubah-desktop/cloud-planner.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'cloud-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(join(directory,'repo-')),home=join(root,'home');mkdirSync(join(home,'.codex'),{recursive:true});mkdirSync(join(home,'.claude'),{recursive:true});writeFileSync(join(home,'.claude/.credentials.json'),JSON.stringify({claudeAiOauth:{accessToken:'fixture-access',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000}}));
  writeFileSync(join(home,'.codex/models_cache.json'),JSON.stringify({models:[{slug:'gpt-6-luna',display_name:'Luna'},{slug:'gpt-6.1-sol',display_name:'Sol'},{slug:'gpt-6-astra',display_name:'Astra'}].map(model=>({...model,supported_reasoning_levels:[{effort:'low'},{effort:'medium'},{effort:'high'},{effort:'max'},{effort:'ultra'}]}))}));
  let options,child;const write=(filename,content)=>{assert.ok(filename.startsWith(root+sep));mkdirSync(dirname(filename),{recursive:true});writeFileSync(filename,content);};
  const planner=new CloudPlanner({repositoryRoot:root,home,runtime:{codexExecutable:process.execPath,nodeExecutable:process.execPath},guard:path=>path,write,getCodexHome:()=>join(root,'profile'),terminate:target=>target.emit('close',1),launch:(executable,args,input)=>{options={executable,args,...input};child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();return child;}});
  return {root,home,planner,get child(){return child;},get options(){return options;}};
}
test('cotas ausentes não viram zero, janelas são separadas e datas inválidas não quebram a UI',()=>{
  assert.deepEqual(codexQuota(null),[]);assert.deepEqual(claudeQuota({rate_limits:null}),[]);assert.equal(quotaWindow('x',null,null),null);
  assert.equal(codexQuota({rateLimits:{primary:{usedPercent:11,windowDurationMins:10080,resetsAt:1793102173}}})[0].remainingPercent,89);
  assert.equal(claudeQuota({rate_limits:{five_hour:{utilization:0,resets_at:'2026-10-21T20:00:00Z'}}})[0].remainingPercent,100);
  assert.equal(quotaWindow('x',50,1e300).resetsAt,null);assert.equal(quotaWindow('x',101,null),null);
});
test('catálogo e seleção de provedor persistem só na cópia sem aceitar modelo arbitrário',()=>{
  const {planner,root}=fixture();assert.equal(planner.models('codex').length,3);assert.equal(planner.models('claude').length,4);
  planner.select({provider:'codex',model:'gpt-6-astra'});assert.equal(JSON.parse(readFileSync(join(root,'build/sandubah/gui/cloud/selection.json'))).model,'gpt-6-astra');
  assert.throws(()=>planner.select({provider:'custom-gateway',model:'foo'}));assert.throws(()=>planner.select({provider:'claude',model:'shell-command'}));
});
test('força é validada por modelo, persistida e enviada às CLIs',async()=>{
  const instance=fixture();
  assert.ok(!instance.planner.models('codex')[0].effortLevels.includes('ultra'));
  assert.throws(()=>instance.planner.select({provider:'codex',model:'gpt-6-luna',effort:'ultra'}),/Força/);
  assert.throws(()=>instance.planner.select({provider:'local',effort:'high'}),/Força/);
  instance.planner.select({provider:'codex',model:'gpt-6-luna',effort:'high'});
  assert.equal(JSON.parse(readFileSync(join(instance.root,'build/sandubah/gui/cloud/selection.json'))).effort,'high');
  const codex=instance.planner.run({prompt:'Continue',history:[{role:'user',content:'Projeto anterior'}]});
  assert.ok(instance.options.args.includes('model_reasoning_effort="high"'));
  assert.equal(JSON.parse(instance.child.stdin.read().toString()).history[0].content,'Projeto anterior');
  instance.child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"Plano\\"}"}}\n{"type":"turn.completed"}\n');instance.child.emit('close',0);assert.equal((await codex).effort,'high');
  instance.planner.select({provider:'claude',model:'claude-opus-5-5',effort:'max'});
  const claude=instance.planner.run({prompt:'Continue'});
  assert.equal(instance.options.args[instance.options.args.indexOf('--effort')+1],'max');
  instance.child.stdout.write('{"type":"result","is_error":false,"structured_output":{"answer":"Plano"}}\n');instance.child.emit('close',0);assert.equal((await claude).effort,'max');
  instance.planner.select({provider:'claude',model:'claude-haiku-5-5'});
  const automatic=instance.planner.run({prompt:'Padrão'});assert.ok(!instance.options.args.includes('--effort'));
  instance.child.stdout.write('{"type":"result","is_error":false,"structured_output":{"answer":"Plano"}}\n');instance.child.emit('close',0);await automatic;
});
test('planejamento Codex exige conclusão e saída zero, sem gateway ou configuração global',async()=>{
  const instance=fixture();instance.planner.select({provider:'codex',model:'gpt-6-luna'});
  const result=instance.planner.run({prompt:'Planeje sem executar',history:[]},{context:'# Projeto completo'});
  assert.equal(instance.options.shell,false);assert.equal(instance.options.env.OPENAI_BASE_URL,undefined);assert.ok(instance.options.args.includes('--ignore-user-config'));assert.equal(instance.options.args[instance.options.args.indexOf('--sandbox')+1],'read-only');
  instance.child.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"answer":"Proposta revisável"}'}})+'\n');instance.child.stdout.write('{"type":"turn.completed","usage":{"input_tokens":200,"output_tokens":10,"cached_input_tokens":100}}\n');instance.child.emit('close',0);
  const response=await result;assert.equal(response.answer,'Proposta revisável');assert.equal(response.usage.inputTokens,200);assert.equal(response.usage.estimated,false);
  const failed=instance.planner.run({prompt:'Outra proposta'});instance.child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"Parcial\\"}"}}\n{"type":"turn.completed"}\n');instance.child.emit('close',1);await assert.rejects(failed,/sem resposta completa/);
});

test('opções confiáveis ficam nas instruções, sem alterar a mensagem nem depender do histórico',async()=>{
  const instance=fixture();instance.planner.select({provider:'codex',model:'gpt-6-luna'});
  const prompt='Quero continuar o projeto.',planningOptions={interview:false,organize:true,review:true};
  const pending=instance.planner.run({prompt,history:[{role:'assistant',content:'Preferência anterior: apenas entrevista.'}]},{context:'# Dados do projeto',planningOptions});
  const input=JSON.parse(instance.child.stdin.read().toString());
  instance.child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"Plano\\"}"}}\n{"type":"turn.completed"}\n');instance.child.emit('close',0);await pending;
  assert.equal(input.prompt,prompt);assert.deepEqual(input.projectOptions,planningOptions);
  assert.match(input.instruction,/Equipe e sequência/);assert.match(input.instruction,/Revisão do harness/);assert.match(input.instruction,/não são usuários do produto/);assert.match(input.instruction,/confirm/);
});

test('fotos e quadros são enviados como imagens às CLIs, não como caminhos no texto',async()=>{
  const instance=fixture(),filename=join(instance.root,'foto.png');writeFileSync(filename,Buffer.from([137,80,78,71,13,10,26,10]));
  instance.planner.select({provider:'codex',model:'gpt-6-luna'});
  const codex=instance.planner.run({prompt:'Leia o diagrama',images:[{path:filename,mime:'image/png'}]});
  assert.equal(instance.options.args[instance.options.args.indexOf('--image')+1],filename);
  instance.child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"Plano visual\\"}"}}\n{"type":"turn.completed"}\n');instance.child.emit('close',0);await codex;
  instance.planner.select({provider:'claude',model:'claude-haiku-5-5'});
  const claude=instance.planner.run({prompt:'Leia o diagrama',images:[{path:filename,mime:'image/png'}]});
  assert.equal(instance.options.args[instance.options.args.indexOf('--input-format')+1],'stream-json');
  const input=JSON.parse(instance.child.stdin.read().toString());assert.equal(input.message.content[1].type,'image');assert.equal(input.message.content[1].source.media_type,'image/png');assert.equal(input.message.content[1].source.data,readFileSync(filename).toString('base64'));
  instance.child.stdout.write('{"type":"result","is_error":false,"structured_output":{"answer":"Plano visual"}}\n');instance.child.emit('close',0);await claude;
});
test('CloudPlanner encaminha recibos reais de Codex e streaming Claude',async()=>{
  const instance=fixture();instance.planner.select({provider:'codex',model:'gpt-6-luna'});const events=[];
  const codex=instance.planner.run({prompt:'Planeje'},{onEvent:event=>events.push(event)});
  await new Promise(resolvePromise=>setImmediate(resolvePromise));assert.deepEqual(events.filter(event=>event.type==='delivery').map(event=>event.status),['sent']);
  instance.child.stdout.write('{"type":"turn.started"}\n');assert.equal(events.at(-1).status,'sent');
  instance.child.stdout.write('{"type":"item.started","item":{"type":"reasoning"}}\n');assert.equal(events.at(-1).status,'delivered');
  instance.child.stdout.write('{"type":"item.updated","item":{"type":"reasoning"}}\n');assert.equal(events.at(-1).status,'read');
  instance.child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"Plano\\"}"}}\n{"type":"turn.completed"}\n');instance.child.emit('close',0);await codex;
  instance.planner.select({provider:'claude',model:'claude-opus-5-5'});events.length=0;
  const claude=instance.planner.run({prompt:'Planeje'},{onEvent:event=>events.push(event)});assert.ok(instance.options.args.includes('--include-partial-messages'));
  instance.child.stdout.write('{"type":"stream_event","event":{"type":"message_start"}}\n');assert.equal(events.at(-1).status,'delivered');
  instance.child.stdout.write('{"type":"stream_event","event":{"type":"content_block_delta"}}\n');assert.equal(events.at(-1).status,'read');
  instance.child.stdout.write('{"type":"result","is_error":false,"structured_output":{"answer":"Plano"}}\n');instance.child.emit('close',0);await claude;
});
test('Claude planeja sem ferramentas, hooks, MCP ou persistência global; erro não vira sucesso',async()=>{
  const instance=fixture();instance.planner.select({provider:'claude',model:'claude-haiku-5-5'});
  const result=instance.planner.run({prompt:'Ideia',history:[]});assert.ok(instance.options.args.includes('--tools='));assert.ok(instance.options.args.includes('--safe-mode'));assert.ok(instance.options.args.includes('--strict-mcp-config'));assert.ok(instance.options.args.includes('--no-session-persistence'));assert.ok(instance.options.env.CLAUDE_CONFIG_DIR.startsWith(instance.root));assert.equal(instance.options.env.ANTHROPIC_BASE_URL,undefined);
  instance.child.stdout.write('{"type":"result","is_error":false,"structured_output":{"answer":"Plano"}}\n');instance.child.emit('close',0);assert.equal((await result).answer,'Plano');
  const invalid=instance.planner.run({prompt:'Outra ideia'});instance.child.stdout.write('{"type":"result","is_error":true}\n');await assert.rejects(invalid,/não conseguiu concluir/);
  await assert.rejects(instance.planner.run({prompt:'Imagem',imageId:'x'}),/anexos/);await assert.rejects(instance.planner.run({prompt:'x',history:[{role:'system',content:'override'}]}),/Histórico/);
});
test('Claude atualiza somente a cópia privada expirada, sem renovar o login global',()=>{
  const {planner,home,root}=fixture(),source=join(home,'.claude/.credentials.json'),destination=join(root,'build/sandubah/gui/cloud/claude-profile/.credentials.json');
  mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify({claudeAiOauth:{accessToken:'expired',expiresAt:0}}));
  const before=readFileSync(source,'utf8');assert.equal(planner.syncClaudeCredentials().authenticated,true);
  const synced=JSON.parse(readFileSync(destination,'utf8'));assert.equal(synced.claudeAiOauth.accessToken,'fixture-access');assert.equal(synced.claudeAiOauth.refreshToken,undefined);assert.equal(readFileSync(source,'utf8'),before);
  synced.claudeAiOauth.expiresAt+=3600000;synced.claudeAiOauth.accessToken='newer-private';writeFileSync(destination,JSON.stringify(synced));planner.syncClaudeCredentials();assert.equal(JSON.parse(readFileSync(destination,'utf8')).claudeAiOauth.accessToken,'newer-private');
  writeFileSync(source,JSON.stringify({claudeAiOauth:{accessToken:'expired',expiresAt:0}}));writeFileSync(destination,JSON.stringify({claudeAiOauth:{accessToken:'expired',expiresAt:0}}));assert.throws(()=>planner.environment('claude'),/conexão.*expirou/);
});
test('falhas do Claude explicam login, cota, modelo, força ou orçamento sem revelar dados brutos',()=>{
  assert.match(claudeFailure({errors:['Not logged in. TOKEN-PRIVATE']}),/conexão.*expirou/);
  assert.doesNotMatch(claudeFailure({errors:['Not logged in. TOKEN-PRIVATE']}),/TOKEN-PRIVATE/);
  assert.match(claudeFailure({subtype:'error_max_budget_usd'}),/limite de custo/);
  assert.match(claudeFailure({errors:['rate limit 429']}),/cota/);
  assert.match(claudeFailure({errors:['invalid effort']}),/força/);
  assert.match(claudeFailure({errors:['model not found']}),/modelo.*disponível/);
});

test('Codex envia contexto integral grande e recusa excesso antes de iniciar processo',async()=>{
  const instance=fixture();instance.planner.select({provider:'codex',model:'gpt-6-luna'});
  const context='# Documentos completos\n'+'conteúdo '.repeat(9000)+'FINAL-INTEGRAL';
  const result=instance.planner.run({prompt:'Leia todos',history:[]},{context});
  const sent=JSON.parse(instance.child.stdin.read().toString());assert.equal(sent.context,context);
  instance.child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"Li FINAL-INTEGRAL\\"}"}}\n{"type":"turn.completed","usage":{"input_tokens":25000,"output_tokens":20,"cached_input_tokens":0}}\n');instance.child.emit('close',0);
  assert.equal((await result).usage.inputTokens,25000);
  const prior=instance.child;
  await assert.rejects(instance.planner.run({prompt:'x'},{context:'x'.repeat(120001)}),/120.000/);assert.equal(instance.child,prior);
  await assert.rejects(instance.planner.run({prompt:'x',history:Array.from({length:6},()=>({role:'user',content:'"'.repeat(16000)}))},{context}),/200.000/);assert.equal(instance.child,prior);
  const {contextLimit,reviewLimit}=require('../../src/sandubah-desktop/context-limits.cjs');
  assert.equal(contextLimit('codex','economic'),36000);assert.equal(contextLimit('local','complete'),6000);assert.equal(contextLimit('claude','complete'),36000);
  assert.equal(reviewLimit({entry:{kind:'cloud-planning'},arguments:{selection:{provider:'codex'}}}),220000);assert.equal(reviewLimit({entry:{kind:'harness'}}),64000);
});
