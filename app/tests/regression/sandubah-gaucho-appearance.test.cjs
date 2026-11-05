'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,dirname,sep}=require('node:path');
const {GauchoLibrary}=require('../../src/sandubah-desktop/gaucho.cjs');
const {appearance,catalog}=require('../../src/sandubah-desktop/gaucho-appearance.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'gaucho-appearance-'));
const guard=path=>assert.ok(resolve(path).startsWith(directory+sep));
const options={directory:join(directory,'gauchos'),guard,write:(path,content)=>{guard(path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);}};
const library=new GauchoLibrary(options);
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});

test('aparência persiste por gauchinho sem trocar modelo, memória, permissões ou contexto',()=>{
  const first=library.create({name:'Oficina fictícia',selection:{provider:'codex',model:'modelo-teste'}}),second=library.create({name:'Campanha fictícia'});
  library.record(first.id,{prompt:'Oi',answer:'Olá',provider:'codex',model:'modelo-teste'});
  const before=library.get(first.id),context=library.context(first.id,'Oi').context;
  const look={...catalog.defaults,skin:'dark',hair:'gray',hairstyle:'curls',hat:'none',outfit:'vest',shirt:'purple',scarf:'gold',pants:'earth',accessory:'glasses',animated:false};
  library.update(first.id,{appearance:look});
  const reopened=new GauchoLibrary(options).get(first.id);
  assert.deepEqual(reopened.appearance,look);assert.deepEqual(library.get(second.id).appearance,catalog.defaults);
  for(const key of ['selection','persona','messages','lessonList','knowledge','taskList','permissions','field'])assert.deepEqual(reopened[key],before[key]);
  assert.equal(library.context(first.id,'Oi').context,context);
  assert.deepEqual(library.list().find(item=>item.id===first.id).appearance,look);
});

test('perfis antigos recebem padrão sem reescrever disco durante leitura',()=>{
  const {id}=library.create({name:'Antigo fictício'}),file=join(library.folder(id),'gaucho.json');
  const profile=JSON.parse(readFileSync(file,'utf8'));delete profile.appearance;writeFileSync(file,JSON.stringify(profile));
  const before=readFileSync(file,'utf8');assert.deepEqual(library.get(id).appearance,catalog.defaults);assert.equal(readFileSync(file,'utf8'),before);
  profile.appearance={hat:'arquivo-remoto',skin:null,animated:'sim'};writeFileSync(file,JSON.stringify(profile));
  assert.deepEqual(library.get(id).appearance,catalog.defaults);
});

test('aparência rejeita URL, código, valores e campos desconhecidos antes de salvar',()=>{
  const {id}=library.create({name:'Validação fictícia'}),file=join(library.folder(id),'gaucho.json'),before=readFileSync(file,'utf8');
  for(const look of [null,[],true,{hat:'https://example.invalid/sprite.svg'},{skin:'<script>'},{animated:'false'},{permissions:{mode:'write'}},{__bad:'extra'}]){
    assert.throws(()=>library.update(id,{appearance:look}),/aparência|catálogo|animações/i);
    assert.equal(readFileSync(file,'utf8'),before);
  }
  const count=library.list().length;assert.throws(()=>library.create({name:'Inválido',appearance:{hat:'inexistente'}}));assert.equal(library.list().length,count);
});

test('catálogo compartilhado valida todas as peças no backend e no renderer',async()=>{
  const renderer=await import('../../src/sandubah-desktop/gaucho-avatar.mjs');
  assert.deepEqual(renderer.avatarCatalog,catalog,'O módulo estático do renderer deve acompanhar o JSON do backend sem depender de fetch ou importação JSON.');
  for(const field of catalog.fields)for(const [value]of field.options){
    const look={...catalog.defaults,[field.key]:value};assert.deepEqual(appearance(look,{strict:true}),renderer.normalizeAvatar(look));
    assert.notDeepEqual(renderer.avatarPixels(look),[]);
  }
  assert.deepEqual(renderer.normalizeAvatar({hat:'inexistente'}),catalog.defaults);
});

test('sete movimentos têm poses distintas, frames distintos e pixels dentro do quadro',async()=>{
  const {avatarPixels,avatarPoses}=await import('../../src/sandubah-desktop/gaucho-avatar.mjs');
  const poses=new Set();
  for(const [pose]of avatarPoses){
    const frames=[];
    for(let frame=0;frame<4;frame++){
      const pixels=avatarPixels(catalog.defaults,pose,frame);frames.push(JSON.stringify(pixels));
      for(const [left,top,width,height,color]of pixels){assert.ok(left>=0&&top>=0&&left+width<=52&&top+height<=52,`${pose}: ${left},${top}`);assert.match(color,/^#[0-9a-f]{6}$/i);}
    }
    assert.ok(new Set(frames).size>1,pose);poses.add(JSON.stringify(frames));
  }
  assert.equal(poses.size,avatarPoses.length);
});
