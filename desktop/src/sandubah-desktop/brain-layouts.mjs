export const brainStyles=Object.freeze([
  {id:'orbit',name:'Cérebro orbital',color:'#c9ee87'},
  {id:'constellation',name:'Constelação de ideias',color:'#a9d9e6'},
  {id:'library',name:'Biblioteca suspensa',color:'#dfc1f1'},
  {id:'islands',name:'Ilhas do projeto',color:'#a5d4b2'},
  {id:'pipeline',name:'Esteira de missões',color:'#efb77e'},
  {id:'tree',name:'Árvore de decisões',color:'#f0d79a'},
  {id:'solar',name:'Sistema solar',color:'#f1ab94'},
  {id:'cube',name:'Cubo de memória',color:'#a6c8fa'},
  {id:'helix',name:'Espiral de aprendizado',color:'#b9dfc6'},
  {id:'command',name:'Sala de comando',color:'#d6e99f'},
  {id:'classic',name:'Clássico 2D · arrastar',color:'#a5b894'}
]);
export const brainPreferenceKey='sandubah-brain-visual-v1';

export function brainPreferences(value={},reducedMotion=false){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  return {style:brainStyles.some(style=>style.id===value.style)?value.style:'orbit',motion:typeof value.motion==='boolean'?value.motion:!reducedMotion,speed:typeof value.speed==='number'&&Number.isFinite(value.speed)?Math.max(.2,Math.min(1.5,value.speed)):.6};
}

export function brainPositions(style,count,time=0){
  if(!Number.isInteger(count)||count<1||count>25)throw new Error('O mapa suporta entre 1 e 25 documentos.');
  if(!Number.isFinite(time))throw new Error('Tempo de animação inválido.');
  const phase=time*.12;
  const neighborCount=Math.max(1,count-1);
  return Array.from({length:count},(_,index)=>{
    if(count>11&&index>0){const column=(index-1)%6;const row=Math.floor((index-1)/6);return [(column-2.5)*120,-150+row*95,(row%2)*-50];}
    if(count>11&&index===0)return [0,205,60];
    if(index===0&&!['library','pipeline','tree','cube','helix'].includes(style))return [0,0,40];
    const angle=(index-1)*Math.PI*2/neighborCount;
    if(style==='constellation')return [Math.cos(angle)*245+(index%2?25:-25),Math.sin(angle)*135+Math.sin(time*.35+index)*10,(index%3-1)*60];
    if(style==='library')return [index%2===0?-95:95,(index-(count-1)/2)*Math.min(56,300/count),(index%4)*28+Math.sin(time*.3+index)*8];
    if(style==='islands')return [Math.cos(angle)*250,Math.sin(angle)*138+Math.sin(time*.5+index)*9,(index%3-1)*65];
    if(style==='pipeline')return [(index-(count-1)/2)*Math.min(118,580/Math.max(1,count-1)),Math.sin(index*.9)*48,Math.cos(index*.9+phase)*65];
    if(style==='tree'){
      const level=Math.floor(Math.log2(index+1));const first=2**level-1;const columns=Math.min(2**level,count-first);
      return [columns===1?0:(index-first-(columns-1)/2)*Math.min(180,540/Math.max(1,columns-1)),-130+level*92,Math.sin(time*.25+index)*10];
    }
    if(style==='solar')return [Math.cos(angle+phase)*245,Math.sin(angle+phase)*120,Math.sin(angle+phase)*105];
    if(style==='cube')return [(index%2?1:-1)*150,(Math.floor(index/2)%2?1:-1)*100,Math.floor(index/4)*-85+65];
    if(style==='helix')return [Math.sin(index*1.2+phase)*195,(index-(count-1)/2)*Math.min(57,300/count),Math.cos(index*1.2+phase)*95];
    if(style==='command')return [Math.cos(angle)*260,Math.sin(angle)*140+Math.sin(time*.25+index)*4,index%2?-20:35];
    return [Math.cos(angle)*245,Math.sin(angle)*135,Math.sin(angle+phase)*55];
  });
}
