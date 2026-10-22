const test=require('node:test');
const assert=require('node:assert/strict');
test('reabrir conversa reúne tentativas idênticas sem apagar envios concluídos',async()=>{
  const {plannerMessages}=await import('../../src/sandubah-desktop/planner-sessions.mjs');
  const old=[{role:'user',text:'Ideia'},{role:'user',text:'Ideia'},{role:'user',text:'Ideia',delivery:'sending'}];
  const fixed=plannerMessages(old);assert.equal(fixed.length,1);assert.equal(fixed[0].delivery,'failed');assert.equal(old.length,3);
  const sent=[{role:'user',text:'Ideia',delivery:'sent'},{role:'assistant',text:'Plano'},{role:'user',text:'Ideia',delivery:'failed'}];
  assert.equal(plannerMessages(sent).length,3);
});
test('conversas, rascunhos e modelos ficam isolados por projeto e sobrevivem ao reinício',async()=>{
  const {createPlannerSessions}=await import('../../src/sandubah-desktop/planner-sessions.mjs');
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const sessions=createPlannerSessions(storage);
  const first={history:[{role:'user',content:'Objetivo A'}],messages:[{role:'assistant',text:'Proposta A',model:'Haiku'}],prompt:'Continuar A',selection:{provider:'claude',model:'claude-opus-5-5',effort:'high'},efforts:{'claude:claude-haiku-5-5':'low'}};
  sessions.save('a',first);sessions.save('b',{history:[],messages:[],prompt:'Projeto B'});sessions.activate('a');
  first.history[0].content='Mutação externa';const restarted=createPlannerSessions(storage);
  assert.equal(restarted.active(),'a');assert.equal(restarted.load('a').history[0].content,'Objetivo A');assert.equal(restarted.load('a').selection.effort,'high');
  assert.equal(restarted.load('b').prompt,'Projeto B');assert.equal(restarted.load(''),null);
});
test('falha de armazenamento avisa e mantém a conversa integral na memória',async()=>{
  const {createPlannerSessions}=await import('../../src/sandubah-desktop/planner-sessions.mjs');let notices=0;
  const sessions=createPlannerSessions({getItem:()=>null,setItem:()=>{throw new Error('Quota');}},()=>notices++);
  const content='Objetivo completo '.repeat(2000);sessions.save('a',{history:[{role:'user',content}],messages:[],prompt:content});
  sessions.save('b',{history:[],messages:[]});assert.equal(notices,1);assert.equal(sessions.load('a').prompt,content);assert.equal(sessions.load('a').history[0].content,content);
});
