'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {BrainSearch,sections,tokenUsage}=require('../../src/sandubah-desktop/brain-search.cjs');
const doc=(id,content)=>({id,label:id+'.md',title:id,content});
test('Econômico preserva controles e seleciona seções relevantes inteiras com origem e hash',()=>{
  const search=new BrainSearch(),documents=[doc('manual','# Impressão\nOrçamento da impressão: revisar as cores.\n\n# Futebol\n'+('placar e campeonato '.repeat(500)))],mandatory=[doc('HARNESS','# Objetivo\nPreservar gateway, Corel e impressão.')];
  const result=search.build({query:'orçamento impressão',mode:'economic',documents,mandatory,limit:2000});
  assert.equal(result.blocked,false);assert.match(result.context,/Preservar gateway, Corel/);assert.match(result.context,/Orçamento da impressão: revisar as cores/);assert.doesNotMatch(result.context,/placar e campeonato/);
  assert.equal(result.included[1].startLine,1);assert.equal(result.included[1].endLine,3);assert.match(result.included[1].sha256,/^[a-f0-9]{64}$/);assert.equal(result.excluded[0].title,'Futebol');assert.match(result.tokenMethod,/não é o tokenizer/);
  assert.ok(result.estimatedTokens>0);assert.ok(search.build({query:'orçamento',mode:'complete',documents,mandatory,limit:2000}).blocked);
});
test('Completo não corta sufixos ou fontes indisponíveis; excesso bloqueia antes de enviar',()=>{
  const search=new BrainSearch(),documents=[doc('exato','# Documento\n'+('conteúdo '.repeat(20))+'SUFIXO-CANÔNICO')];
  const result=search.build({query:'x',mode:'complete',documents,limit:2000});assert.match(result.context,/SUFIXO-CANÔNICO/);assert.equal(result.excluded.length,0);
  const blocked=search.build({query:'x',mode:'complete',documents,limit:100});assert.equal(blocked.context,null);assert.equal(blocked.blocked,true);assert.match(blocked.message,/Nada será cortado/);
  assert.equal(search.build({query:'x',mode:'complete',documents:[{id:'broken',label:'broken.md',error:true}],limit:2000}).blocked,true);
  assert.equal(search.build({query:'x',mode:'economic',mandatory:documents,limit:100}).blocked,true);
});
test('sem correspondência não inventa conteúdo, semântica ou seções parciais',()=>{
  const search=new BrainSearch(),documents=[doc('música','# Melodia\nPartitura e acordes.')];
  const empty=search.build({query:'criptografia quântica',mode:'economic',documents,limit:2000});assert.equal(empty.included.length,0);assert.equal(empty.excluded.length,1);
  const oversized=search.build({query:'Melodia',mode:'economic',documents:[doc('música','# Melodia\n'+('acorde '.repeat(500)))],limit:500});assert.equal(oversized.included.length,0);assert.match(oversized.excluded[0].reason,/Seção inteira/);
  assert.throws(()=>search.build({query:'x',mode:'silent-truncate',documents,limit:2000}));
});
test('cache invalida por conteúdo, limita seções e não interpreta headings em blocos de código',()=>{
  const search=new BrainSearch(),original=doc('nota','# Cor\nAzul.');const before=search.build({query:'cor',mode:'economic',documents:[original],limit:2000});
  original.content='# Cor\nVerde.';const after=search.build({query:'cor',mode:'economic',documents:[original],limit:2000});assert.notEqual(before.fingerprint,after.fingerprint);assert.match(after.context,/Verde/);assert.equal(search.cache.size,1);
  assert.equal(sections('# Código\n```md\n# Não é título\n```\n# Final\nTexto.').length,2);
  const huge=search.build({query:'tema',mode:'economic',documents:[doc('grande',Array.from({length:513},(_,index)=>'# Tema '+index+'\nTexto').join('\n'))],limit:2000});assert.match(huge.excluded[0].reason,/512 seções/);
});
test('tokens reportados distinguem zero de ausência e nunca fingem estimativa como medida',()=>{
  assert.equal(tokenUsage(0,0,0,'provedor').inputTokens,0);assert.equal(tokenUsage(undefined,NaN,-1,'provedor').inputTokens,null);assert.equal(tokenUsage(12,3,4,'provedor').estimated,false);
});

test('Completo Codex resolve quatro referências após reinício e conserva documentos acima de 36 mil',()=>{
  const {mkdirSync,mkdtempSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
  const {join,resolve,sep}=require('node:path');
  const {createHash}=require('node:crypto');
  const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
  const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
  const {DesktopController,assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
  const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
  const root=mkdtempSync(join(parent,'complete-'));
  try{
    const notes=join(root,'notes');mkdirSync(notes);
    const paths=Array.from({length:4},(_,index)=>join(notes,`Nota-${index}.md`));
    paths.forEach((filename,index)=>writeFileSync(filename,`# Nota ${index}\n${'conteúdo integral '.repeat(1200)}FINAL-${index}`));
    const ids=paths.map(filename=>'knowledge:'+createHash('sha256').update(filename.toLowerCase()).digest('hex').slice(0,24));
    const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:filename=>assertLocalWritePath(root,filename),readLocal:filename=>join(root,filename)});
    const project=projects.create({name:'Referências depois de reiniciar',goal:'Conferir finais dos quatro documentos'});
    const library=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write:(filename,content)=>projects.write(filename,content),catalog:()=>({entries:[]}),roots:[{name:'Notas',path:notes}]});
    projects.knowledgeLibrary=library;
    const saved=projects.get(project.id);saved.context=ids;
    projects.write(join(projects.location(project.id),'harness.json'),JSON.stringify(saved));
    assert.equal(library.scanReport,null);
    const controller={projects,knowledge:library,brainSearch:new BrainSearch(),cloud:{selection:{provider:'codex'}}};
    const payload={projectId:project.id,prompt:'Conferir documentos',contextMode:'complete'};
    const report=DesktopController.prototype.plannerContextPreview.call(controller,payload);
    assert.equal(report.blocked,false);assert.equal(report.excluded.length,0);assert.ok(report.characters>36000);assert.equal(report.limit,120000);
    for(const index of [0,1,2,3])assert.ok(report.context.includes(`FINAL-${index}`));
    assert.equal(report.included.filter(source=>source.kind==='integral').length,4);
    const scan=library.scanReport;library.searchDocument(ids[0]);assert.equal(library.scanReport,scan);
    controller.cloud.selection.provider='local';assert.equal(DesktopController.prototype.plannerContextPreview.call(controller,payload).blocked,true);
    controller.cloud.selection.provider='codex';rmSync(paths[3]);
    const missing=DesktopController.prototype.plannerContextPreview.call(controller,payload);assert.equal(missing.blocked,true);assert.equal(missing.context,null);assert.equal(missing.excluded[0].id,ids[3]);
  }finally{assert.ok(realpathSync(root).startsWith(realpathSync(parent)+sep));rmSync(root,{recursive:true,force:true});}
});
