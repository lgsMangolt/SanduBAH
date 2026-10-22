'use strict';

// Campo de treino do gauchinho: uma pista 2D onde ele aprende sozinho, por tentativa e erro (Q-learning),
// a correr, pular cercas e buracos e escalar muros. Tudo roda na CPU, sem rede e sem modelo de linguagem.
// A tabela Q começa zerada: o que ele sabe no campo vem só das tentativas dele.
const ACTIONS=['correr','pular','escalar'];
const TILES={'.':'chão',C:'cerca',B:'buraco',M:'muro'};
const JUMP=[1,2,2,1];
const CLIMB_STEPS=3;
const REWARD={advance:1,finish:200,crash:-100,jump:-0.3,wastedClimb:-2};
const LIMITS={episodes:5000,timeMs:15000,minLength:20,maxLength:300,stepsPerCell:4};
const PRESETS=[
  {id:'cercas',title:'Nível 1 · cercas',course:'.......C.......C........C......C.......C.........C......C.......'},
  {id:'buracos',title:'Nível 2 · cercas e buracos',course:'......C.......BB......C.....B.......BB.....C......B......C....BB.......'},
  {id:'muros',title:'Nível 3 · tudo, com muros',course:'......C.......M.......BB......M......C.....B.......M........BB.....C.......M.....'}
];

// Valida a pista escrita pelo usuário: começa e termina em chão, sem buraco maior que 2 e sem obstáculos colados que tornem a pista impossível.
function parseCourse(text){
  const course=typeof text==='string'?text.trim().toUpperCase():'';
  if(course.length<LIMITS.minLength||course.length>LIMITS.maxLength)throw new Error(`A pista precisa ter de ${LIMITS.minLength} a ${LIMITS.maxLength} casas.`);
  if(!/^[.CBM]+$/.test(course))throw new Error('Use só . (chão), C (cerca), B (buraco) e M (muro).');
  if(!course.startsWith('...')||!course.endsWith('...'))throw new Error('Comece e termine a pista com pelo menos 3 casas de chão.');
  if(/BBB/.test(course))throw new Error('Um buraco pode ter no máximo 2 casas: o pulo alcança só isso.');
  if(/[CBM]\.{0,1}[CBM]/.test(course.replace(/BB/g,'B')))throw new Error('Deixe pelo menos 2 casas de chão entre obstáculos.');
  return course;
}

function createRng(seed){let value=seed>>>0||1;return ()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

class Field{
  constructor(course){this.course=course;this.reset();}
  reset(){this.x=0;this.y=0;this.air=0;this.climb=0;this.steps=0;this.done=false;this.outcome=null;return this.observe();}
  next(){for(let x=this.x+1;x<this.course.length;x++)if(this.course[x]!=='.')return {distance:x-this.x,tile:this.course[x]};return {distance:99,tile:'.'};}
  observe(){const {distance,tile}=this.next();return `${Math.min(distance,7)}|${tile}|${this.air}|${this.climb?1:0}`;}
  // Um passo: o gauchinho avança uma casa por vez; no ar ou escalando, a escolha não muda o movimento.
  step(action){
    if(this.done)throw new Error('Episódio encerrado.');
    this.steps++;let reward=0;
    if(this.climb){this.climb--;if(!this.climb){this.x+=2;this.y=0;reward+=REWARD.advance*2;}}
    else{
      if(this.air===0&&action===1){this.air=1;reward+=REWARD.jump;}
      if(this.air===0&&action===2){
        if(this.course[this.x+1]==='M'){this.climb=CLIMB_STEPS;return this.result(reward);}
        return this.result(reward+REWARD.wastedClimb);
      }
      this.x++;reward+=REWARD.advance;
      if(this.air){this.y=JUMP[this.air-1];this.air=this.air<JUMP.length?this.air+1:0;if(!this.air)this.y=0;}else this.y=0;
      const tile=this.course[this.x];
      if(tile==='C'&&this.y<1||tile==='B'&&this.y===0||tile==='M')return this.end(reward+REWARD.crash,tile==='B'?'caiu no buraco':tile==='C'?'bateu na cerca':'bateu no muro');
    }
    if(this.x>=this.course.length-1)return this.end(reward+REWARD.finish,'chegou');
    return this.result(reward);
  }
  // Todo passo que não termina o episódio passa por aqui, então o limite de passos vale até para escaladas desperdiçadas.
  result(reward){if(this.steps>=this.course.length*LIMITS.stepsPerCell)return this.end(reward,'passos esgotados');return {state:this.observe(),reward,done:false};}
  end(reward,outcome){this.done=true;this.outcome=outcome;return {state:this.observe(),reward,done:true,outcome};}
}

const values=(table,state)=>table[state]||(table[state]=[0,0,0]);
const best=list=>{let index=0;for(let i=1;i<list.length;i++)if(list[i]>list[index])index=i;return index;};

function runEpisode(course,table,{epsilon=0,alpha=0.2,gamma=0.95,rng=Math.random,learn=true,record=false}={}){
  const field=new Field(course);let state=field.reset(),total=0;const frames=record?[{x:0,y:0,climb:0,action:null}]:null;
  while(true){
    const choice=rng()<epsilon?Math.floor(rng()*ACTIONS.length):best(values(table,state));
    const {state:next,reward,done,outcome}=field.step(choice);total+=reward;
    if(learn){const current=values(table,state),target=done?reward:reward+gamma*Math.max(...values(table,next));current[choice]+=alpha*(target-current[choice]);}
    if(record)frames.push({x:field.x,y:field.y,climb:field.climb,action:ACTIONS[choice]});
    state=next;
    if(done)return {reward:Math.round(total*10)/10,distance:field.x,completed:outcome==='chegou',outcome,steps:field.steps,frames};
  }
}

// Treina em blocos, devolvendo o controle entre eles para não travar o app. Para no limite de episódios ou de tempo e diz onde parou.
async function train({course,table={},episodes,seed=1,startEpisode=0,timeLimitMs=LIMITS.timeMs,now=Date.now,yieldEvery=200}){
  if(!Number.isInteger(episodes)||episodes<1||episodes>LIMITS.episodes)throw new Error(`Escolha de 1 a ${LIMITS.episodes.toLocaleString('pt-BR')} tentativas por treino.`);
  const rng=createRng(seed+startEpisode),started=now(),history=[];let stoppedBy='episódios',done=0;
  for(let index=0;index<episodes;index++){
    if(now()-started>timeLimitMs){stoppedBy='tempo';break;}
    const progress=(startEpisode+index)/(startEpisode+episodes),epsilon=Math.max(0.05,1-progress*1.25);
    const run=runEpisode(course,table,{epsilon,rng});history.push({episode:startEpisode+index+1,reward:run.reward,distance:run.distance,completed:run.completed});done++;
    if((index+1)%yieldEvery===0)await new Promise(resolve=>setImmediate(resolve));
  }
  return {table,history,episodes:done,stoppedBy,seconds:(now()-started)/1000};
}

function evaluate(course,table){return runEpisode(course,table,{epsilon:0,learn:false,record:true});}

// Curva compacta: médias por blocos, para guardar o histórico sem crescer sem limite.
function curve(history,points=60){
  if(!history.length)return [];
  const size=Math.max(1,Math.ceil(history.length/points)),result=[];
  for(let start=0;start<history.length;start+=size){const block=history.slice(start,start+size);result.push({episode:block.at(-1).episode,reward:Math.round(block.reduce((sum,item)=>sum+item.reward,0)/block.length*10)/10,success:Math.round(block.filter(item=>item.completed).length/block.length*100)});}
  return result;
}

module.exports={ACTIONS,TILES,REWARD,LIMITS,PRESETS,parseCourse,createRng,Field,runEpisode,train,evaluate,curve};
