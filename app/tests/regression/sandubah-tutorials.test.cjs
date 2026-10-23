'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
test('guias têm IDs únicos, destinos existentes e passos de leitura sem código executável',async()=>{
  const {tutorials}=await import('../../src/sandubah-desktop/tutorials.mjs');
  assert.equal(tutorials.length,21);assert.equal(new Set(tutorials.map(guide=>guide.id)).size,21);
  const targets=new Set(['planner','projects','all','office','connections','tech','tutorials']);
  for(const guide of tutorials){assert.ok(targets.has(guide.target));assert.equal(guide.steps.length,4);assert.ok(guide.title&&guide.category&&guide.description&&guide.destination);assert.ok(guide.steps.every(step=>typeof step==='string'&&step.length>25));assert.doesNotMatch(JSON.stringify(guide),/https?:|[a-z]:\\|<script|api[_-]?key\s*[:=]/i);}
});
test('busca combina termos sem acentos, categoria e conteúdo dos passos',async()=>{
  const {tutorials,filterTutorials}=await import('../../src/sandubah-desktop/tutorials.mjs');
  assert.equal(filterTutorials().length,tutorials.length);
  assert.deepEqual(filterTutorials({query:'cerebro economico',category:'Cérebro'}).map(guide=>guide.id),['brain-context']);
  assert.deepEqual(filterTutorials({query:'permissoes',category:'Projetos'}).map(guide=>guide.id),['automation-safely','product-stages']);
  assert.deepEqual(filterTutorials({query:'VIBEWASE',category:'Começar'}).map(guide=>guide.id),['conversation-modes']);
  assert.deepEqual(filterTutorials({query:'harness2',category:'Tech'}).map(guide=>guide.id),['evaluate-harness','harness2-xtudo']);
  assert.deepEqual(filterTutorials({query:'sem-resultado-inexistente'}),[]);assert.deepEqual(filterTutorials({category:'inexistente'}),[]);assert.deepEqual(filterTutorials({query:'<img src=x onerror=alert(1)>'}),[]);
});
test('níveis e trilhas cobrem do fundamento ao primeiro projeto e avaliações',async()=>{
  const {tutorials,filterTutorials,firstProjectPrompt,learningResources}=await import('../../src/sandubah-desktop/tutorials.mjs');
  for(const guide of tutorials){assert.ok(['beginner','intermediate','advanced'].includes(guide.level));assert.ok(['foundations','first','sandubah','tech'].includes(guide.segment));}
  assert.equal(filterTutorials({level:'beginner',segment:'foundations'}).length,6);assert.ok(filterTutorials({level:'beginner',segment:'first'}).some(guide=>guide.id==='first-project-together'));assert.equal(filterTutorials({level:'advanced',segment:'tech'}).length,3);
  const prompt=firstProjectPrompt({name:'Lista fictícia',goal:'Organizar meus estudos.',success:'Criar e concluir uma tarefa.',limits:'Sem login ou publicação.'});assert.match(prompt,/uma pergunta por vez/);assert.match(prompt,/sem confirmação/);assert.match(prompt,/Corel/);
  assert.throws(()=>firstProjectPrompt({name:'Sem respostas'}));assert.throws(()=>firstProjectPrompt({name:'x',goal:'sk-'+'A'.repeat(24),success:'x',limits:'x'}));assert.throws(()=>firstProjectPrompt({name:'x',goal:'x'.repeat(501),success:'x',limits:'x'}));
  assert.deepEqual(learningResources.map(item=>new URL(item.url).hostname),['learn.microsoft.com','academy.openai.com','github.com']);assert.ok(learningResources.every(item=>item.reviewed==='2026-10-23'));
});
test('orientações distinguem planejamento, execução protegida, produto e uso de tokens',async()=>{
  const {tutorials}=await import('../../src/sandubah-desktop/tutorials.mjs');
  const content=id=>tutorials.find(guide=>guide.id===id).steps.join(' ');
  assert.match(content('first-project'),/Planejar não executa/);assert.match(content('product-stages'),/100% das missões/);assert.match(content('brain-context'),/indisponível não significa zero/);assert.match(content('conversation-modes'),/não remove confirmações/);assert.match(content('connections'),/não inicia testes/);
  assert.match(content('harness2-xtudo'),/runner upstream completo no Windows continua pendente/);assert.match(content('harness2-xtudo'),/regressão bloqueia/);assert.match(content('tech-reference'),/REA só é usado quando pertinente e disponível/);
});
