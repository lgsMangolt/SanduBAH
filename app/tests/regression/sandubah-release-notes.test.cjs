'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {resolve,join,sep}=require('node:path');
const {ReleaseNotes,RELEASES}=require('../../src/sandubah-desktop/release-notes.cjs');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const {assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'release-notes-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
const releases=[{id:'first',date:'2026-10-20',title:'Primeira revisão',changes:[{title:'Guia de exemplo',description:'Conteúdo estático e local.'}]},{id:'second',date:'2026-10-21',title:'Segunda revisão',changes:[{title:'Mais um guia',description:'Nenhuma instalação automática.'}]}];
function fixture(){const root=mkdtempSync(join(directory,'repo-'));const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard:filename=>assertLocalWritePath(root,filename),readLocal:filename=>join(root,filename)});const options={directory:join(root,'build/sandubah/gui/profile'),guard:projects.guard,write:(filename,content)=>projects.write(filename,content),releases};return {root,options,notes:new ReleaseNotes(options)};}
test('primeira abertura informa todas as revisões não vistas sem instalar ou gravar nada',()=>{
  const {notes}=fixture(),snapshot=notes.snapshot();assert.deepEqual(snapshot.unread,releases);assert.equal(snapshot.currentId,'second');assert.equal(snapshot.automaticUpdates,false);assert.equal(snapshot.warning,null);assert.equal(notes.read(),null);
  snapshot.available[0].title='Alterado no renderer';assert.equal(notes.snapshot().available[0].title,'Primeira revisão');assert.ok(RELEASES.some(release=>release.changes.some(change=>/Tutoriais/.test(change.title))));
});
test('confirmação persiste no perfil e reabrir a mesma revisão não repete novidades',()=>{
  const {notes,options}=fixture();assert.equal(notes.seen('second').unread.length,0);const restored=new ReleaseNotes(options);assert.equal(restored.snapshot().unread.length,0);assert.equal(restored.snapshot().available.length,2);assert.equal(restored.read().releaseId,'second');
});
test('uma atualização posterior mostra apenas notas novas; uma revisão desconhecida não esconde novidades',()=>{
  const {notes}=fixture();notes.write(notes.filename,JSON.stringify({version:1,releaseId:'first',seenAt:'2026-10-20T12:00:00Z'}));assert.deepEqual(notes.snapshot().unread.map(release=>release.id),['second']);notes.write(notes.filename,JSON.stringify({version:1,releaseId:'unknown',seenAt:'2026-10-20T12:00:00Z'}));assert.equal(notes.snapshot().unread.length,2);
});
test('ID antigo ou operação inválida não sobrescreve o registro de leitura',()=>{
  const {notes}=fixture();notes.seen('second');const original=readFileSync(notes.filename,'utf8');assert.throws(()=>notes.seen('first'),/revisão mudou/);assert.throws(()=>notes.seen('../config.toml'),/revisão mudou/);assert.equal(readFileSync(notes.filename,'utf8'),original);
});
test('metadados corrompidos ou grandes avisam sem derrubar a abertura nem substituir o arquivo',()=>{
  const {notes}=fixture();for(const invalid of ['{invalid',JSON.stringify({version:2}), 'x'.repeat(2049)]){notes.write(notes.filename,invalid);assert.match(notes.snapshot().warning,/preservado/);assert.equal(notes.snapshot().unread.length,2);assert.throws(()=>notes.seen('second'));assert.equal(readFileSync(notes.filename,'utf8'),invalid);}
});
test('falha na gravação não marca novidades como vistas e o caminho permanece dentro do perfil',()=>{
  const {notes,options,root}=fixture();const failed=new ReleaseNotes({...options,write:()=>{throw new Error('Disco indisponível');}});assert.throws(()=>failed.seen('second'),/Disco/);assert.equal(notes.read(),null);assert.equal(notes.snapshot().unread.length,2);assert.ok(notes.filename.startsWith(root+sep));
  assert.throws(()=>new ReleaseNotes({...options,releases:[]}));assert.throws(()=>new ReleaseNotes({...options,releases:[releases[0],releases[0]]}));assert.throws(()=>new ReleaseNotes({...options,releases:[{...releases[0],id:'../outside'}]}));
});
