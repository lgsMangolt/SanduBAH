'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync,linkSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {randomUUID}=require('node:crypto');
const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'study-notebooks-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
let fixtureNumber=0;
function fixture(){
  const root=join(directory,String(++fixtureNumber)),notes=join(root,'Documents/Notas');mkdirSync(notes,{recursive:true});
  const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:filename=>assertLocalWritePath(root,filename)});
  const options={repositoryRoot:root,home:root,appData:root,write:(filename,text)=>projects.write(filename,text),projects,catalog:{entries:[]},roots:[{name:'Notas fictícias',path:notes}]};
  return {root,notes,projects,options,library:new KnowledgeLibrary(options)};
}
const fields={notes:'# Índices\n\n## Identidade\nDecisão: usar identificadores únicos. A evidência da pesquisa deve ser revisada.',sources:'https://example.com/referencia',questions:'Como medir o resultado?',reviewed:true};
test('estudar cria quatro Markdown interligados no cérebro sem harness, agentes ou missões',()=>{
  const {library,projects}=fixture(),{studyId}=library.createNotebook('Índices de dados');
  const notebook=library.notebook(studyId);assert.equal(projects.list().length,0);assert.equal(notebook.kind,'notebook');assert.equal(notebook.fields.reviewed,false);assert.equal(notebook.files.length,4);assert.match(notebook.files[0].content,/\(CONCEPTS\.md\)/);assert.equal(library.snapshot().projects.some(row=>row.harnessId===studyId),false);
  const entries=library.entries().filter(row=>row.path.startsWith('knowledge:study:'));assert.equal(entries.length,4);projects.knowledgeLibrary=library;assert.equal(library.document(entries[1].path).links.length,3);assert.equal(projects.document(entries[1].path).editable,false);
});
test('fonte local é citada com hash sem copiar originais nem enviá-los na pergunta',()=>{
  const {library,notes,projects}=fixture(),original='# Referência local\nCritério registrado para estudar índices.';writeFileSync(join(notes,'Base.md'),original);const source=library.refresh().sources[0];
  assert.throws(()=>library.createNotebook('Índices','fora'));assert.equal(projects.list().length,0);
  const {studyId}=library.createNotebook('Índices',source.id),notebook=library.notebook(studyId);assert.equal(notebook.localReferences.length,1);assert.match(notebook.files[2].content,/SHA-256: [a-f0-9]{64}/);assert.equal(readFileSync(join(notes,'Base.md'),'utf8'),original);
  library.saveNotebook(studyId,{version:notebook.version,fields:{...fields,sources:''}});assert.equal(library.sharedDocuments('outro').length,2);
});
test('tentativa repetida retoma caderno e rejeita reaproveitar pedido para outro tema',()=>{
  const {library}=fixture(),requestId=randomUUID();const first=library.createNotebook('RAG',undefined,{requestId});assert.deepEqual(library.createNotebook('RAG',undefined,{requestId}),first);assert.equal(library.state.studies.length,1);assert.throws(()=>library.createNotebook('Outro',undefined,{requestId}),/outro estudo/);
});
test('rascunho fica fora do contexto e revisão permite somente Central ou projeto escolhido',()=>{
  const {library,projects}=fixture(),target=projects.create({name:'Projeto fictício',goal:'Guardar conhecimento seletivo'});
  const {studyId}=library.createNotebook('Índices');assert.deepEqual(library.sharedDocuments(target.id),[]);
  let notebook=library.notebook(studyId);library.saveNotebook(studyId,{version:notebook.version,fields});assert.equal(library.sharedDocuments('outro').length,2);
  notebook=library.notebook(studyId);library.routeStudy(studyId,{type:'rag',scope:'project',projectId:target.id});assert.equal(library.sharedDocuments('outro').length,0);assert.equal(library.sharedDocuments(target.id).length,2);assert.throws(()=>library.saveNotebook(studyId,{version:notebook.version,fields}),/alcance mudaram/);
  notebook=library.notebook(studyId);library.saveNotebook(studyId,{version:notebook.version,fields:{...fields,reviewed:false}});assert.deepEqual(library.sharedDocuments(target.id),[]);
});
test('notas persistem após reabrir, com versões anteriores e sem duplicar salvamento igual',()=>{
  const {library,options}=fixture(),{studyId}=library.createNotebook('Índices');let notebook=library.notebook(studyId);const firstRevision=notebook.revision;
  notebook=library.saveNotebook(studyId,{version:notebook.version,fields});const saved=library.saveNotebook(studyId,{version:notebook.version,fields});assert.equal(saved.revision,notebook.revision);assert.equal(readdirSync(join(library.notebooks.location(studyId),'revisions')).length,2);
  assert.match(readFileSync(join(library.notebooks.location(studyId),'revisions',firstRevision,'CONCEPTS.md'),'utf8'),/Aguardando notas/);
  const reopened=new KnowledgeLibrary(options);assert.deepEqual(reopened.notebook(studyId).fields,fields);assert.equal(reopened.sharedDocuments('novo-projeto').length,2);
});
test('credenciais, fontes inseguras e notas sem evidência não são disponibilizadas',()=>{
  const {library}=fixture(),{studyId}=library.createNotebook('Índices'),notebook=library.notebook(studyId);
  for(const invalid of [{notes:'sk-'+'A'.repeat(24)},{sources:'http://example.com'},{sources:'https://user:password@example.com'},{sources:'file:///secret'},{sources:'sem link'},{sources:''},{notes:''},{reviewed:'sim'}])assert.throws(()=>library.saveNotebook(studyId,{version:notebook.version,fields:{...fields,...invalid}}));
  assert.equal(library.notebook(studyId).revision,notebook.revision);assert.deepEqual(library.sharedDocuments('outro'),[]);
});
test('salvamento concorrente e caminho forjado não substituem notas existentes',()=>{
  const {library}=fixture(),{studyId}=library.createNotebook('Índices'),notebook=library.notebook(studyId);library.saveNotebook(studyId,{version:notebook.version,fields});
  assert.throws(()=>library.saveNotebook(studyId,{version:notebook.version,fields:{...fields,notes:'Sobrescrever'}}),/mudaram/);assert.throws(()=>library.document(`knowledge:study:${studyId}:..\\secret`));assert.throws(()=>library.notebook('../outside'));assert.match(library.notebook(studyId).fields.notes,/identificadores únicos/);
});
test('notas vinculadas por hardlink são recusadas',()=>{
  const {library}=fixture(),{studyId}=library.createNotebook('Índices'),notebook=library.notebook(studyId),filename=join(library.notebooks.location(studyId),'revisions',notebook.revision,'CONCEPTS.md');
  linkSync(filename,join(library.notebooks.location(studyId),'linked.md'));assert.throws(()=>library.document(`knowledge:study:${studyId}:CONCEPTS.md`),/Nota inválida|hard link/);
});
test('estudos anteriores continuam legíveis e sua missão não é executada ao consultar',()=>{
  const {library,projects}=fixture(),study=library.study('Tema anterior');const content='# Estudo anterior\n\nDecisão registrada com fonte.';projects.write(join(projects.workspace(study.harnessId),'STUDY.md'),content);
  const result=library.notebook(study.harnessId);assert.equal(result.kind,'legacy');assert.equal(result.content,content);assert.equal(projects.get(study.harnessId).missions[0].status,'pending');
});
test('edição externa com credencial não entra no contexto e falha de gravação preserva a versão anterior',()=>{
  const {library}=fixture(),{studyId}=library.createNotebook('Índices');let notebook=library.notebook(studyId);notebook=library.saveNotebook(studyId,{version:notebook.version,fields});
  const write=library.notebooks.write;library.notebooks.write=(filename,content)=>{if(filename.endsWith('SOURCES.md'))throw new Error('Falha de disco simulada');write(filename,content);};
  assert.throws(()=>library.saveNotebook(studyId,{version:notebook.version,fields:{...fields,notes:'Outra nota com fontes.'}}),/Falha de disco/);assert.equal(library.notebook(studyId).revision,notebook.revision);
  writeFileSync(join(library.notebooks.location(studyId),'revisions',notebook.revision,'CONCEPTS.md'),'sk-'+'A'.repeat(24));assert.throws(()=>library.document(`knowledge:study:${studyId}:CONCEPTS.md`),/credencial/);assert.deepEqual(library.sharedDocuments('outro'),[]);
});
test('limite de estudos recusa novas criações sem descartar cadernos ou criar harness órfão',()=>{
  const {library,projects}=fixture();library.state.studies=Array.from({length:100},()=>({id:randomUUID(),topic:'Estudo fictício',scope:'central'}));
  assert.throws(()=>library.createNotebook('Mais um'),/100 estudos/);assert.throws(()=>library.study('Estudo legado a mais'),/100 estudos/);assert.equal(projects.list().length,0);assert.equal(library.state.studies.length,100);
});
test('tema repetido reconhece acentos, caixa e espaços após reabrir sem alterar notas, categoria ou versões',()=>{
  const {library,options,projects}=fixture(),{studyId}=library.createNotebook('Índices de dados',undefined,{type:'rag'});let saved=library.notebook(studyId);saved=library.saveNotebook(studyId,{version:saved.version,fields});
  const reopened=new KnowledgeLibrary(options),result=reopened.createNotebook('  INDICES  DE\nDADOS  ',undefined,{type:'videos',requestId:randomUUID()});assert.deepEqual(result,{studyId,reused:true});assert.equal(reopened.state.studies.length,1);assert.deepEqual(reopened.notebook(studyId),saved);assert.equal(projects.list().length,0);
  const report=reopened.studyMatches('Indices de dados');assert.equal(report.matches[0].status,'Notas revisadas');assert.equal(report.matches[0].match,'exact');assert.doesNotMatch(JSON.stringify(report),/identificadores únicos/);
});
test('assunto parecido exige escolher continuar ou criar separado, sem gravação na consulta',()=>{
  const {library}=fixture(),first=library.createNotebook('RAG para documentos'),report=library.studyMatches('RAG para documentos locais');assert.equal(report.matches[0].id,first.studyId);assert.equal(report.matches[0].match,'similar');
  const result=library.createNotebook('RAG para documentos locais');assert.equal(result.needsChoice,true);assert.equal(library.state.studies.length,1);
  const separate=library.createNotebook('RAG para documentos locais',undefined,{duplicateChoice:'separate',matchFingerprint:report.fingerprint});assert.ok(separate.studyId);assert.notEqual(separate.studyId,first.studyId);assert.equal(library.state.studies.length,2);
  assert.equal(library.createNotebook('rag para documentos locais').studyId,separate.studyId);
});
test('escolha de estudo separado expira quando o histórico muda',()=>{
  const {library}=fixture(),first=library.createNotebook('RAG para documentos'),report=library.studyMatches('RAG para documentos locais');library.routeStudy(first.studyId,{type:'rag',scope:'central'});
  const result=library.createNotebook('RAG para documentos locais',undefined,{duplicateChoice:'separate',matchFingerprint:report.fingerprint});assert.equal(result.needsChoice,true);assert.equal(result.historyChanged,true);assert.equal(library.state.studies.length,1);
  assert.throws(()=>library.createNotebook('RAG para documentos locais',undefined,{duplicateChoice:'qualquer'}),/Escolha/);
});
test('histórico de correspondências respeita alcance e não mistura estudos de projetos diferentes',()=>{
  const {library,projects}=fixture(),first=projects.create({name:'Projeto A fictício',goal:'Notas privadas A'}),second=projects.create({name:'Projeto B fictício',goal:'Notas privadas B'});
  const central=library.createNotebook('RAG para documentos'),privateStudy=library.createNotebook('RAG para documentos',undefined,{scope:'project',projectId:first.id});assert.notEqual(central.studyId,privateStudy.studyId);
  assert.equal(library.studyMatches('RAG para documentos',undefined,{scope:'project',projectId:first.id}).matches[0].id,privateStudy.studyId);assert.deepEqual(library.studyMatches('RAG para documentos',undefined,{scope:'project',projectId:second.id}).matches,[]);
  assert.equal(library.createNotebook('RAG para documentos',undefined,{scope:'project',projectId:first.id}).studyId,privateStudy.studyId);assert.equal(library.state.studies.length,2);
});
test('outra fonte local pede escolha e não muda referências do caderno anterior',()=>{
  const {library,notes,options}=fixture();writeFileSync(join(notes,'Base.md'),'# Primeira fonte');const otherNotes=join(notes,'Outra');mkdirSync(otherNotes);writeFileSync(join(otherNotes,'Segunda.md'),'# Segunda fonte');options.roots.push({name:'Outra fonte fictícia',path:otherNotes});const snapshot=library.refresh();
  const first=library.createNotebook('RAG para documentos',snapshot.sources[0].id),saved=library.notebook(first.studyId),sourceId=snapshot.sources[1].id,report=library.studyMatches('RAG para documentos',sourceId);
  assert.equal(report.matches[0].sameSource,false);assert.equal(library.createNotebook('RAG para documentos',sourceId).needsChoice,true);assert.deepEqual(library.notebook(first.studyId),saved);
  const separate=library.createNotebook('RAG para documentos',sourceId,{duplicateChoice:'separate',matchFingerprint:report.fingerprint});assert.notEqual(separate.studyId,first.studyId);assert.equal(library.notebook(separate.studyId).sourceId,sourceId);
});
test('estudos antigos são sugeridos sem conversão silenciosa e URLs/códigos distintos não são tratados como iguais',()=>{
  const {library}=fixture(),legacy=library.study('RAG para documentos');const report=library.studyMatches('RAG para documentos');assert.equal(report.matches[0].kind,'legacy');assert.equal(library.createNotebook('RAG para documentos').needsChoice,true);assert.equal(library.state.studies[0].id,legacy.harnessId);
  const {topicKey}=require('../../src/sandubah-desktop/study-history.cjs');assert.notEqual(topicKey('C++ para iniciantes'),topicKey('C# para iniciantes'));assert.notEqual(topicKey('https://example.com/Foo'),topicKey('https://example.com/foo'));
  assert.equal(library.studyMatches('Um assunto sem relação').matches.length,0);
});
