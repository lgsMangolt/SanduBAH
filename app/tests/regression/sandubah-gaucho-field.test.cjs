'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {mkdirSync,mkdtempSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const field=require('../../src/sandubah-desktop/gaucho-field.cjs');
const {DesktopController,createValidator}=require('../../src/sandubah-desktop/backend.cjs');
const {GauchoLibrary}=require('../../src/sandubah-desktop/gaucho.cjs');
const {secretPattern}=require('../../src/sandubah-desktop/knowledge.cjs');
const Ajv=require('../../build/sandubah/gui/vendor/node_modules/ajv');
const catalog=require('../../build/sandubah/gui/catalog.json');
const runtime=require('../../build/sandubah/gui/runtime.json');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});
const directory=mkdtempSync(join(parent,'field-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
const RUN=0,JUMP=1,CLIMB=2;
function play(course,actions){const env=new field.Field(course);env.reset();let last=null;for(const action of actions){last=env.step(action);if(last.done)break;}return {env,last};}

test('a pista é validada: presets passam, pistas impossíveis são recusadas',()=>{
  for(const preset of field.PRESETS)assert.equal(field.parseCourse(preset.course),preset.course);
  assert.equal(field.parseCourse('  ...c....b.....m......  '),'...C....B.....M......');
  for(const [course,message] of [['..C',/de 20 a 300/],['...X................',/Use só/],['C...................',/Comece e termine/],['...BBB..............',/no máximo 2/],['...C.C..............',/2 casas de chão/],['...M.C..............',/2 casas de chão/],['...BB.C.............',/2 casas de chão/]])assert.throws(()=>field.parseCourse(course),message);
});

test('física: pulo passa cerca e buraco de 2, muro exige escalar colado, escalar fora do muro desperdiça passo',()=>{
  const fence='.....C..............';
  assert.equal(play(fence,[RUN,RUN,RUN,RUN,RUN]).last.outcome,'bateu na cerca');
  for(const wait of [1,2,3]){const {env,last}=play(fence,[...Array(5-wait).fill(RUN),JUMP,RUN,RUN,RUN,RUN]);assert.equal(last.done,false,`pulo a ${wait} casa(s)`);assert.equal(env.x,10-wait);}
  assert.equal(play(fence,[RUN,JUMP,RUN,RUN,RUN,RUN,RUN]).last.outcome,'bateu na cerca');
  const hole='.....BB.............';
  assert.equal(play(hole,[RUN,RUN,RUN,RUN,RUN]).last.outcome,'caiu no buraco');
  assert.equal(play(hole,[RUN,RUN,RUN,JUMP,RUN,RUN,RUN,RUN]).last.done,false);assert.equal(play(hole,[RUN,RUN,RUN,RUN,JUMP,RUN,RUN,RUN]).last.done,false);
  assert.equal(play(hole,[RUN,RUN,JUMP,RUN,RUN,RUN,RUN]).last.outcome,'caiu no buraco');
  const wall='.....M..............';
  assert.equal(play(wall,[RUN,RUN,RUN,RUN,JUMP,RUN,RUN,RUN]).last.outcome,'bateu no muro');
  const climbed=play(wall,[RUN,RUN,RUN,RUN,CLIMB,RUN,RUN,RUN]);assert.equal(climbed.last.done,false);assert.equal(climbed.env.x,6);
  const wasted=new field.Field(wall);wasted.reset();const step=wasted.step(CLIMB);assert.equal(wasted.x,0);assert.equal(step.reward,field.REWARD.wastedClimb);
  // Política gulosa que só escala longe do muro: antes do ajuste, essa corrida nunca terminava.
  const looping=field.evaluate(wall,{'4|M|0|0':[0,0,1]});assert.equal(looping.outcome,'passos esgotados');assert.ok(looping.frames.length<=wall.length*field.LIMITS.stepsPerCell+1);
  const stuck=new field.Field(wall);stuck.reset();let result;for(let index=0;index<200&&!stuck.done;index++)result=stuck.step(CLIMB);assert.equal(result.outcome,'passos esgotados');
  assert.equal(play('....................',Array(25).fill(RUN)).last.outcome,'chegou');
});

test('sem treino ele bate; treinando do zero ele aprende as três pistas, de forma reproduzível',async()=>{
  for(const preset of field.PRESETS){
    const before=field.evaluate(preset.course,{});assert.equal(before.completed,false);assert.notEqual(before.outcome,'chegou');
    const trained=await field.train({course:preset.course,episodes:1500,seed:7});
    assert.equal(trained.episodes,1500);assert.equal(trained.stoppedBy,'episódios');
    const after=field.evaluate(preset.course,trained.table);assert.equal(after.completed,true,preset.id);assert.equal(after.distance,preset.course.length-1);
    const early=trained.history.slice(0,100).filter(item=>item.completed).length,late=trained.history.slice(-100).filter(item=>item.completed).length;assert.ok(late>early,`${preset.id}: ${early} → ${late}`);
    const again=await field.train({course:preset.course,episodes:1500,seed:7});assert.deepEqual(again.table,trained.table);
  }
});

test('o que ele aprende vale para outra pista com os mesmos obstáculos',async()=>{
  const trained=await field.train({course:field.PRESETS[2].course,episodes:3000,seed:11});
  const other=field.parseCourse('.....M.........C.....BB.........M.....C........B.......');
  assert.equal(field.evaluate(other,trained.table).completed,true);
});

test('limites do campo: tentativas e tempo',async()=>{
  for(const episodes of [0,5001,1.5])await assert.rejects(field.train({course:field.PRESETS[0].course,episodes}),/de 1 a 5\.000/);
  let clock=0;const result=await field.train({course:field.PRESETS[0].course,episodes:5000,now:()=>(clock+=10),timeLimitMs:500});
  assert.equal(result.stoppedBy,'tempo');assert.ok(result.episodes<5000&&result.episodes>0);
  assert.ok(field.curve(result.history,40).length<=40);
});

test('o gauchinho guarda o treino, acumula tentativas, pode recomeçar e treina um por vez',async()=>{
  const repositoryRoot=mkdtempSync(join(directory,'project-'));writeFileSync(join(repositoryRoot,'AGENTS.md'),'# Agentes');writeFileSync(join(repositoryRoot,'README.md'),'# Guia');
  const mcp=new EventEmitter();mcp.ready=false;mcp.toolNames=new Set();mcp.connect=async()=>{};mcp.close=()=>{};mcp.request=async()=>({content:[]});
  const app=new DesktopController({repositoryRoot,runtime,catalog,confirm:async()=>true,validator:createValidator(Ajv),mcpClient:mcp});
  app.gauchos=new GauchoLibrary({directory:join(repositoryRoot,'gauchos'),guard:path=>app.projects.guard(path),write:(path,content)=>app.projects.write(path,content),secretPattern});
  const {id}=app.gauchos.create({name:'Tchê Corredor'});assert.equal(app.gauchos.get(id).field.episodes,0);
  await assert.rejects(app.trainGauchoField({id,course:'...C.C..............',episodes:100}),/2 casas de chão/);
  let result=await app.trainGauchoField({id,course:field.PRESETS[0].course,episodes:800});
  assert.equal(result.field.episodes,800);assert.equal(result.run.episodes,800);assert.equal(result.field.evaluation.completed,true);assert.ok(result.field.states>0);assert.equal(result.replay.frames.length,result.replay.steps+1);
  result=await app.trainGauchoField({id,course:field.PRESETS[1].course,episodes:1500});
  assert.equal(result.field.episodes,2300);assert.equal(result.run.newCourse,true);assert.equal(result.field.runs.length,2);assert.equal(result.field.course,field.PRESETS[1].course);
  assert.equal(app.gauchos.fieldReplay(id).replay.completed,result.field.evaluation.completed);
  app.active={label:'outra operação'};await assert.rejects(app.trainGauchoField({id,course:field.PRESETS[0].course,episodes:10}),/um worker por vez/);app.active=null;
  const reset=app.gauchos.resetField(id);assert.equal(reset.field.episodes,0);assert.equal(reset.field.states,0);assert.deepEqual(reset.field.runs,[]);assert.equal(reset.field.course,field.PRESETS[1].course);
});
