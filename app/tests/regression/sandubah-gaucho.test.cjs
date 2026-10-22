'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {DesktopController,createValidator}=require('../../src/sandubah-desktop/backend.cjs');
const {GauchoLibrary,LIMITS,gauchoInstruction}=require('../../src/sandubah-desktop/gaucho.cjs');
const {gauchoReview}=require('../../src/sandubah-desktop/planning-review.cjs');
const {secretPattern}=require('../../src/sandubah-desktop/knowledge.cjs');
const Ajv=require('../../build/sandubah/gui/vendor/node_modules/ajv');
const catalog=require('../../build/sandubah/gui/catalog.json');
const runtime=require('../../build/sandubah/gui/runtime.json');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'gaucho-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
const codex={provider:'codex',model:'gpt-teste'};
function fixture(confirm=async()=>true){
  const repositoryRoot=mkdtempSync(join(directory,'project-'));writeFileSync(join(repositoryRoot,'AGENTS.md'),'# Agentes');writeFileSync(join(repositoryRoot,'README.md'),'# Guia');
  const mcp=new EventEmitter();mcp.ready=false;mcp.toolNames=new Set();mcp.connect=async()=>{};mcp.close=()=>{};mcp.request=async()=>({content:[]});
  const app=new DesktopController({repositoryRoot,runtime,catalog,confirm,validator:createValidator(Ajv),mcpClient:mcp});
  app.gauchos=new GauchoLibrary({directory:join(repositoryRoot,'gauchos'),guard:path=>app.projects.guard(path),write:(path,content)=>app.projects.write(path,content),secretPattern});
  return {app,library:app.gauchos,root:repositoryRoot};
}
function converse(library,id,prompt,answer){return library.record(id,{prompt,answer,provider:'codex',model:'gpt-teste'});}

test('um gauchinho nasce do zero, só com nome e personalidade',()=>{
  const {library}=fixture();
  const gaucho=library.create({name:'Tchê Planilhas',persona:'Fala curto e entende de planilhas.',selection:codex});
  assert.equal(gaucho.lessons,0);assert.equal(gaucho.documents,0);assert.deepEqual(gaucho.messages,[]);assert.equal(gaucho.selection.provider,'codex');
  const {context,info}=library.context(gaucho.id,'oi');
  assert.match(context,/Nome: Tchê Planilhas\nFala curto/);assert.doesNotMatch(context,/Lições do usuário|Base de conhecimento/);assert.equal(info.lessonsTotal,0);
  assert.throws(()=>library.create({name:'   '}),/nome/);assert.throws(()=>library.create({name:'X',persona:'password: abcdefghijklmnop'}),/credenciais/);
  assert.throws(()=>library.create({name:'X',selection:{provider:'outro',model:'y'}}),/Codex ou o Claude/);
  assert.deepEqual(library.list().map(item=>item.name),['Tchê Planilhas']);
});

test('👍 vira exemplo, 👎 exige a resposta certa e vira correção usada no contexto',()=>{
  const {library}=fixture();const {id}=library.create({name:'Tchê',selection:codex});
  const first=converse(library,id,'Como somo uma coluna?','Use a função SOMA.');
  library.rate(id,{messageId:first.id,rating:'good'});
  const second=converse(library,id,'E a média?','Some tudo e divida.');
  assert.throws(()=>library.rate(id,{messageId:second.id,rating:'bad'}),/deveria ter sido/);
  const updated=library.rate(id,{messageId:second.id,rating:'bad',ideal:'Use =MÉDIA(A1:A10), bah.'});
  assert.deepEqual(updated.lessonList.map(lesson=>lesson.kind),['example','correction']);assert.equal(updated.lessonList[1].prompt,'E a média?');
  assert.equal(updated.messages.find(message=>message.id===second.id).rating,'bad');
  assert.throws(()=>library.rate(id,{messageId:'inexistente',rating:'good'}),/não encontrada/);
  const {context,info}=library.context(id,'média');
  assert.match(context,/### Correção\nPergunta: E a média\?\nNão responda assim: Some tudo e divida\.\nResponda assim: Use =MÉDIA\(A1:A10\), bah\./);
  assert.ok(context.indexOf('### Correção')<context.indexOf('### Exemplo aprovado'));assert.equal(info.lessonsIncluded,2);
});

test('editar e apagar lições; lições que não cabem são contadas, nunca cortadas em silêncio',()=>{
  const {library}=fixture();const {id}=library.create({name:'Tchê',selection:codex});
  for(let index=0;index<6;index++){const reply=converse(library,id,`Pergunta ${index}`,'x'.repeat(10));library.rate(id,{messageId:reply.id,rating:'bad',ideal:`Lição ${index} `+'y'.repeat(3000)});}
  const {context,info}=library.context(id,'p');
  assert.equal(info.lessonsTotal,6);assert.ok(info.lessonsOmitted>0);assert.equal(info.lessonsIncluded+info.lessonsOmitted,6);
  assert.match(context,/Lição 5 /);assert.doesNotMatch(context,/Lição 0 /);assert.ok(info.estimatedTokens>0);
  let gaucho=library.get(id);const lesson=gaucho.lessonList[0];
  gaucho=library.editLesson(id,{lessonId:lesson.id,ideal:'Resposta revisada.'});assert.equal(gaucho.lessonList[0].ideal,'Resposta revisada.');
  assert.throws(()=>library.editLesson(id,{lessonId:lesson.id,ideal:'  '}),/vazia/);
  gaucho=library.deleteLesson(id,{lessonId:lesson.id});assert.equal(gaucho.lessons,5);assert.equal(gaucho.messages.find(message=>message.id===lesson.messageId).rating,null);
});

test('a base é uma cópia própria: importar, ignorar repetido, bloquear credencial e remover só a cópia',()=>{
  const {library,root}=fixture();const {id}=library.create({name:'Tchê',selection:codex});
  const original=join(root,'notas.md');writeFileSync(original,'# Planilhas\nUse tabelas dinâmicas para resumir vendas.\n');
  let gaucho=library.importDocuments(id,[{source:'notas.md',title:'Notas de planilha',content:readFileSync(original,'utf8')}]);
  assert.equal(gaucho.documents,1);assert.equal(library.importDocuments(id,[{source:'notas.md',title:'Notas',content:readFileSync(original,'utf8')}]).imported,0);
  assert.throws(()=>library.importDocuments(id,[{source:'x.md',title:'Segredo',content:'api_key="abcdefghijklmnop1234"'}]),/credencial em Segredo/);
  const {context,info}=library.context(id,'tabelas dinâmicas vendas');assert.match(context,/Base de conhecimento do Tchê/);assert.match(context,/tabelas dinâmicas/);assert.equal(info.documents,1);
  const entry=gaucho.knowledge[0],copy=join(library.folder(id),'knowledge',entry.id+'.md');assert.ok(existsSync(copy));
  gaucho=library.removeDocument(id,{documentId:entry.id});assert.equal(gaucho.documents,0);assert.equal(existsSync(copy),false);
  assert.equal(readFileSync(original,'utf8'),'# Planilhas\nUse tabelas dinâmicas para resumir vendas.\n');
});

test('conversar pede confirmação, envia personalidade, lições e base, e registra a resposta',async()=>{
  let approve=false,review=null;const {app,library}=fixture(async request=>{review=request;return approve;});
  const calls=[];app.cloud={status:()=>({providers:[{id:'codex',installed:true,models:[{id:'gpt-teste',effortLevels:[]}]},{id:'claude',installed:false,models:[]}]}),run:async(request,options)=>{calls.push({request,options});return {answer:'Bah, use =MÉDIA, tchê!',provider:'codex',model:'gpt-teste',usage:{inputTokens:120,outputTokens:9}};}};
  const {id}=library.create({name:'Tchê Planilhas',persona:'Fala com gírias gaúchas.',selection:codex});
  const reply=converse(library,id,'E a média?','Some tudo.');library.rate(id,{messageId:reply.id,rating:'bad',ideal:'Use =MÉDIA(A1:A10).'});
  assert.equal((await app.chatGaucho({id,prompt:'Como calculo a média?'})).cancelled,true);assert.equal(calls.length,0);assert.equal(library.get(id).messages.length,2);
  assert.equal(review.entry.kind,'gaucho-chat');assert.equal(review.projectName,'Tchê Planilhas');assert.equal(review.arguments.lessons.lessonsIncluded,1);assert.match(review.arguments.context,/Responda assim: Use =MÉDIA/);
  approve=true;const result=await app.chatGaucho({id,prompt:'Como calculo a média?'});
  assert.equal(calls.length,1);assert.equal(calls[0].options.instruction,gauchoInstruction('Tchê Planilhas'));assert.deepEqual(calls[0].options.selection,{provider:'codex',model:'gpt-teste',effort:null});
  assert.match(calls[0].options.context,/Fala com gírias gaúchas/);assert.deepEqual(calls[0].request.history.map(item=>item.role),['user','assistant']);
  assert.equal(result.reply.content,'Bah, use =MÉDIA, tchê!');assert.equal(result.messages.length,4);assert.equal(result.reply.usage.inputTokens,120);
  await assert.rejects(app.chatGaucho({id,prompt:'  '}),/mensagem/);
  library.update(id,{selection:{provider:'claude',model:'claude-teste'}});await assert.rejects(app.chatGaucho({id,prompt:'oi'}),/não encontrado neste PC/);
  library.update(id,{selection:null});await assert.rejects(app.chatGaucho({id,prompt:'oi'}),/Escolha o Codex ou o Claude/);
});

test('a revisão mostra quantas lições e documentos vão e quantas ficaram de fora',()=>{
  const review=gauchoReview({projectName:'Tchê',arguments:{selection:{provider:'codex',model:'gpt-teste'},prompt:'oi',lessons:{lessonsIncluded:3,lessonsTotal:5,lessonsOmitted:2,documents:1,estimatedTokens:900}},contextInfo:{included:[]}},'{}');
  assert.equal(review.title,'Conversar com Tchê?');assert.match(review.intro,/3 de 5 lições e 1 documento/);assert.match(review.intro,/2 lição\(ões\) mais antiga\(s\) ficaram de fora/);assert.match(review.notice,/Nada do Cérebro entra sem importação/);
  assert.equal(LIMITS.lessonBudget,12000);
});

const {gauchoTaskInstruction}=require('../../src/sandubah-desktop/gaucho.cjs');
const {gauchoTaskReview}=require('../../src/sandubah-desktop/planning-review.cjs');
const vendas='# Vendas de outubro\nCadernos: 40 unidades.\nAgendas: 12 unidades.\n';

test('tarefa: documentos inteiros ou bloqueio, entrega salva e avaliação vira lição',()=>{
  const {library}=fixture();const {id}=library.create({name:'Tchê',selection:codex});
  const doc=library.importDocuments(id,[{source:'vendas.md',title:'Vendas de outubro',content:vendas}]).knowledge[0];
  assert.throws(()=>library.createTask(id,{title:'',instructions:'x'}),/título/);assert.throws(()=>library.createTask(id,{title:'Resumo',instructions:'x',documents:['inexistente']}),/não está mais na base/);
  let gaucho=library.createTask(id,{title:'Resumo de vendas',instructions:'Resuma as vendas de outubro em 3 tópicos.',documents:[doc.id]});
  const task=gaucho.taskList[0];assert.equal(task.status,'pending');
  const {context,info}=library.taskContext(id,task.id);assert.match(context,/## Documento da tarefa: Vendas de outubro[^\n]*\n# Vendas de outubro\nCadernos: 40 unidades\.\nAgendas: 12 unidades\./);assert.equal(info.documents,1);
  assert.throws(()=>library.evaluateTask(id,{taskId:task.id,score:5,feedback:'ok'}),/entregue/);
  const finished=library.finishTask(id,task.id,{result:'- Cadernos lideram com 40.\n- Agendas: 12.\n- Total: 52.',provider:'codex',model:'gpt-teste'});
  assert.equal(finished.status,'done');const delivery=join(library.folder(id),'entregas',task.id+'.md');assert.match(readFileSync(delivery,'utf8'),/^# Resumo de vendas\n\n- Cadernos lideram/);
  assert.throws(()=>library.evaluateTask(id,{taskId:task.id,score:6,feedback:'x'}),/1 a 5/);assert.throws(()=>library.evaluateTask(id,{taskId:task.id,score:4,feedback:' '}),/melhorar/);
  gaucho=library.evaluateTask(id,{taskId:task.id,score:4,feedback:'Bom, mas mostre a porcentagem de cada item.'});
  assert.equal(gaucho.lessons,1);assert.equal(gaucho.taskList[0].evaluation.score,4);
  assert.match(library.context(id,'vendas').context,/### Avaliação de tarefa · nota 4\/5\nTarefa: Resumo de vendas: Resuma as vendas[^\n]*\nO que o usuário disse: Bom, mas mostre a porcentagem/);
  gaucho=library.evaluateTask(id,{taskId:task.id,score:5,feedback:'Perfeito agora.'});assert.equal(gaucho.lessons,1);assert.equal(gaucho.lessonList[0].score,5);
  gaucho=library.deleteLesson(id,{lessonId:gaucho.lessonList[0].id});assert.equal(gaucho.taskList[0].evaluation,null);
  library.evaluateTask(id,{taskId:task.id,score:3,feedback:'Faltou o total.'});gaucho=library.deleteTask(id,{taskId:task.id});
  assert.equal(gaucho.taskList.length,0);assert.equal(existsSync(delivery),false);assert.equal(gaucho.lessons,1);
});

test('tarefa com documentos acima do limite é bloqueada, nunca cortada',()=>{
  const {library}=fixture();const {id}=library.create({name:'Tchê',selection:codex});
  const docs=library.importDocuments(id,[1,2].map(index=>({source:`grande-${index}.md`,title:`Grande ${index}`,content:`# ${index}\n`+'z'.repeat(LIMITS.taskDocumentBudget/2+10)}))).knowledge;
  const {taskList}=library.createTask(id,{title:'Ler tudo',instructions:'Leia os dois.',documents:docs.map(doc=>doc.id)});
  assert.throws(()=>library.taskContext(id,taskList[0].id),/Nada foi cortado ou enviado/);
});

test('executar tarefa pede confirmação, manda o pedido e registra entrega ou erro',async()=>{
  let approve=false,review=null,fail=false;const {app,library}=fixture(async request=>{review=request;return approve;});
  const calls=[];app.cloud={status:()=>({providers:[{id:'codex',installed:true,models:[{id:'gpt-teste',effortLevels:[]}]}]}),run:async(request,options)=>{calls.push({request,options});if(fail)throw new Error('O provedor recusou ou interrompeu a resposta.');return {answer:'## Resumo\n- Cadernos: 40.',provider:'codex',model:'gpt-teste',usage:{inputTokens:200,outputTokens:20}};}};
  const {id}=library.create({name:'Tchê Planilhas',selection:codex});const doc=library.importDocuments(id,[{source:'vendas.md',title:'Vendas',content:vendas}]).knowledge[0];
  const taskId=library.createTask(id,{title:'Resumo de vendas',instructions:'Resuma em tópicos.',documents:[doc.id]}).taskList[0].id;
  assert.equal((await app.runGauchoTask({id,taskId})).cancelled,true);assert.equal(calls.length,0);assert.equal(library.task(id,taskId).status,'pending');
  assert.equal(review.entry.kind,'gaucho-task');assert.match(review.arguments.prompt,/^Resumo de vendas\n\nResuma em tópicos\./);assert.match(review.arguments.context,/Cadernos: 40 unidades/);
  approve=true;fail=true;await assert.rejects(app.runGauchoTask({id,taskId}),/recusou/);assert.equal(library.task(id,taskId).status,'error');assert.match(library.task(id,taskId).error,/recusou/);
  fail=false;const result=await app.runGauchoTask({id,taskId});
  assert.equal(calls.length,2);assert.equal(calls[1].options.instruction,gauchoTaskInstruction('Tchê Planilhas'));assert.equal(calls[1].request.prompt,'Resuma em tópicos.');
  assert.equal(result.task.status,'done');assert.equal(result.task.result,'## Resumo\n- Cadernos: 40.');assert.equal(result.task.usage.inputTokens,200);assert.equal(result.task.error,null);
  const text=gauchoTaskReview({projectName:'Tchê',arguments:{selection:codex,prompt:'x',lessons:{lessonsIncluded:1,lessonsTotal:1,documents:2,estimatedTokens:50}},contextInfo:{included:[]}},'{}');
  assert.equal(text.title,'Dar esta tarefa a Tchê?');assert.match(text.intro,/2 documento\(s\) inteiros/);assert.match(text.intro,/nada é executado nem alterado/);assert.equal(text.approvalLabel,'Enviar a tarefa');
});

const datasetTools=require('../../src/sandubah-desktop/gaucho-dataset.cjs');
function taught(library){
  const {id}=library.create({name:'Tchê Planilhas',persona:'Fala curto.',selection:codex});
  const a=converse(library,id,'Como somo?','Some na mão.');library.rate(id,{messageId:a.id,rating:'bad',ideal:'Use =SOMA(A1:A10).'});
  const b=converse(library,id,'E a média?','Use =MÉDIA(A1:A10).');library.rate(id,{messageId:b.id,rating:'good'});
  for(const [title,score] of [['Boa tarefa',5],['Tarefa fraca',3]]){const taskId=library.createTask(id,{title,instructions:`Faça ${title}.`}).taskList.at(-1).id;library.finishTask(id,taskId,{result:`Entrega de ${title}.`});library.evaluateTask(id,{taskId,score,feedback:'Comentário.'});}
  return id;
}

test('o dataset nasce das lições e acompanha edições e exclusões',()=>{
  const {library}=fixture();const id=taught(library);
  let gaucho=library.syncDataset(id);assert.deepEqual(gaucho.sync,{added:3,updated:0,removed:0,duplicates:0});
  const pairs=library.datasetRecords(id).map(record=>[record.source,record.prompt,record.response]);
  assert.deepEqual(pairs,[['correction','Como somo?','Use =SOMA(A1:A10).'],['example','E a média?','Use =MÉDIA(A1:A10).'],['task','Faça Boa tarefa.','Entrega de Boa tarefa.']]);
  assert.equal(library.syncDataset(id).sync.added,0);
  const correction=library.get(id).lessonList.find(lesson=>lesson.kind==='correction');library.editLesson(id,{lessonId:correction.id,ideal:'Use =SOMA(A:A).'});
  assert.equal(library.syncDataset(id).sync.updated,1);assert.equal(library.datasetRecords(id)[0].response,'Use =SOMA(A:A).');
  library.deleteLesson(id,{lessonId:correction.id});gaucho=library.syncDataset(id);assert.equal(gaucho.sync.removed,1);assert.equal(gaucho.dataset.report.included,2);
});

test('pares escritos e arquivos JSONL entram validados; repetidos, inválidos e credenciais são contados',()=>{
  const {library}=fixture();const {id}=library.create({name:'Tchê',selection:codex});
  library.addPair(id,{prompt:'Oi?',response:'Bah, oi!'});assert.throws(()=>library.addPair(id,{prompt:'Oi?',response:'Bah, oi!'}),/já está/);assert.throws(()=>library.addPair(id,{prompt:'x',response:' '}),/pergunta e a resposta/);
  const secret=JSON.stringify({prompt:'Chave?',response:'api_key="abcdefghijklmnop1234"'});
  const text=[JSON.stringify({prompt:'Tchau?',response:'Até mais, tchê!'}),JSON.stringify({messages:[{role:'user',content:'Frio?'},{role:'assistant',content:'Bah, de renguear cusco.'}]}),JSON.stringify({prompt:'Oi?',response:'Bah, oi!'}),'não é json',secret,JSON.stringify({prompt:'vazio',response:''})].join('\n');
  const result=library.importPairs(id,{text});
  assert.equal(result.imported.added,2);assert.equal(result.imported.duplicates,1);assert.equal(result.imported.rejected.length,3);
  assert.ok(result.imported.rejected.some(item=>item.reason==='possível credencial'));assert.equal(result.dataset.report.included,3);assert.equal(result.dataset.report.bySource.upload,2);
  const long=library.importPairs(id,{text:JSON.stringify({prompt:'Longo',response:'x'.repeat(datasetTools.LIMITS.field)})});const record=library.datasetRecords(id).find(item=>item.prompt==='Longo');
  assert.equal(record.include,false);assert.equal(long.dataset.report.excluded,1);assert.throws(()=>library.setRecord(id,{recordId:record.id,include:true}),/longo demais/i);
  const manual=library.datasetRecords(id)[0];library.setRecord(id,{recordId:manual.id,include:false});assert.equal(library.dataset(id).report.included,2);library.deleteRecord(id,{recordId:manual.id});assert.equal(library.datasetRecords(id).length,3);
  assert.throws(()=>datasetTools.parseJsonl(''),/vazio/);
});

test('divisão estável, níveis de volume e exportação no formato de chat',()=>{
  const records=Array.from({length:60},(_,index)=>({prompt:`P${index}`,response:`R${index}`,key:datasetTools.pairKey(`P${index}`,`R${index}`),include:true,source:'manual'}));
  const first=datasetTools.split(records),second=datasetTools.split([...records].reverse());
  assert.ok(first.validation.length>=1&&first.validation.length<records.length/2);assert.deepEqual(first.validation.map(item=>item.key).sort(),second.validation.map(item=>item.key).sort());
  assert.equal(datasetTools.report(records).level,'minimum');assert.equal(datasetTools.report(records.slice(0,10)).level,'insufficient');
  const {library}=fixture();const id=taught(library);library.syncDataset(id);
  assert.throws(()=>library.exportDataset(id,{model:'qualquer coisa',memory:null}),/organizacao\/modelo/);
  const exported=library.exportDataset(id,{model:'Qwen/Qwen2.5-0.5B-Instruct',memory:{gpu:null}});
  assert.deepEqual(exported.files,['train.jsonl','validation.jsonl','train_lora.py','README.md']);assert.equal(exported.stats.train,3);assert.equal(exported.readiness.canTrainHere,false);
  const lines=readFileSync(join(exported.directory,'train.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(lines.length,3);assert.deepEqual(lines[0].messages.map(message=>message.role),['system','user','assistant']);assert.equal(lines[0].messages[0].content,'Você é Tchê Planilhas. Fala curto.');
  assert.match(readFileSync(join(exported.directory,'train_lora.py'),'utf8'),/não foi executado pelo SanduBAH[\s\S]*BASE_MODEL = "Qwen\/Qwen2\.5-0\.5B-Instruct"/);
  assert.match(readFileSync(join(exported.directory,'README.md'),'utf8'),/Este PC não passou na verificação/);
  for(const record of library.datasetRecords(id))library.setRecord(id,{recordId:record.id,include:false});
  assert.throws(()=>library.exportDataset(id,{model:'Qwen/Qwen2.5-0.5B-Instruct',memory:null}),/ao menos um exemplo/);
});

test('o verificador só aprova com exemplos suficientes e VRAM estimada para o modelo',()=>{
  const records=Array.from({length:60},(_,index)=>({prompt:`P${index}`,response:`R${index}`,key:datasetTools.pairKey(`P${index}`,`R${index}`),include:true,source:'manual'}));
  const gpu=gib=>({gpu:{total:gib*1073741824,free:gib*1073741824,used:0}});
  let result=datasetTools.readiness({memory:{gpu:null},records,model:'Qwen/Qwen2.5-0.5B-Instruct'});
  assert.equal(result.canTrainHere,false);assert.match(result.checks.find(check=>check.id==='gpu').message,/Nenhuma GPU/);assert.match(result.note,/não inicia esse treino/);
  assert.equal(datasetTools.readiness({memory:gpu(8),records,model:'Qwen/Qwen2.5-1.5B-Instruct'}).canTrainHere,true);
  assert.equal(datasetTools.readiness({memory:gpu(8),records,model:'Qwen/Qwen2.5-3B-Instruct'}).canTrainHere,false);
  result=datasetTools.readiness({memory:gpu(24),records:records.slice(0,5),model:'Qwen/Qwen2.5-0.5B-Instruct'});assert.equal(result.canTrainHere,false);assert.match(result.checks[0].message,/mínimo sugerido é 50/);
  assert.equal(datasetTools.readiness({memory:gpu(24),records,model:'outra/coisa'}).canTrainHere,false);
});
