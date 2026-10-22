'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
test('guias têm IDs únicos, destinos existentes e passos de leitura sem código executável',async()=>{
  const {tutorials}=await import('../../src/sandubah-desktop/tutorials.mjs');
  assert.equal(tutorials.length,9);assert.equal(new Set(tutorials.map(guide=>guide.id)).size,9);
  const targets=new Set(['planner','projects','all','office','connections']);
  for(const guide of tutorials){assert.ok(targets.has(guide.target));assert.equal(guide.steps.length,4);assert.ok(guide.title&&guide.category&&guide.description&&guide.destination);assert.ok(guide.steps.every(step=>typeof step==='string'&&step.length>25));assert.doesNotMatch(JSON.stringify(guide),/https?:|[a-z]:\\|<script|api[_-]?key\s*[:=]/i);}
});
test('busca combina termos sem acentos, categoria e conteúdo dos passos',async()=>{
  const {tutorials,filterTutorials}=await import('../../src/sandubah-desktop/tutorials.mjs');
  assert.equal(filterTutorials().length,tutorials.length);
  assert.deepEqual(filterTutorials({query:'cerebro economico',category:'Cérebro'}).map(guide=>guide.id),['brain-context']);
  assert.deepEqual(filterTutorials({query:'permissoes',category:'Projetos'}).map(guide=>guide.id),['product-stages']);
  assert.deepEqual(filterTutorials({query:'VIBEWASE',category:'Começar'}).map(guide=>guide.id),['conversation-modes']);
  assert.deepEqual(filterTutorials({query:'sem-resultado-inexistente'}),[]);assert.deepEqual(filterTutorials({category:'inexistente'}),[]);assert.deepEqual(filterTutorials({query:'<img src=x onerror=alert(1)>'}),[]);
});
test('orientações distinguem planejamento, execução protegida, produto e uso de tokens',async()=>{
  const {tutorials}=await import('../../src/sandubah-desktop/tutorials.mjs');
  const content=id=>tutorials.find(guide=>guide.id===id).steps.join(' ');
  assert.match(content('first-project'),/Planejar não executa/);assert.match(content('product-stages'),/100% das missões/);assert.match(content('brain-context'),/indisponível não significa zero/);assert.match(content('conversation-modes'),/não remove confirmações/);assert.match(content('connections'),/não inicia testes/);
});
