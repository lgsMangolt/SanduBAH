import catalog from './gaucho-appearance-data.mjs';

export const avatarCatalog=catalog;
export const avatarPoses=[['idle','Descansar'],['walk','Caminhar'],['work','Digitar'],['talk','Conversar'],['mate','Tomar chimarrão'],['celebrate','Comemorar'],['jump','Pular']];
export const avatarPresets=[
  {name:'Do galpão',appearance:{...catalog.defaults}},
  {name:'Da oficina',appearance:{...catalog.defaults,skin:'brown',hairstyle:'curls',hat:'none',outfit:'vest',shirt:'blue',accessory:'glasses'}},
  {name:'Da campanha',appearance:{...catalog.defaults,skin:'light',hairstyle:'long',hair:'red',hat:'beret',outfit:'shirt',shirt:'cream',scarf:'blue'}}
];

export function normalizeAvatar(value){
  const result={...catalog.defaults};
  for(const field of catalog.fields)if(field.options.some(option=>option[0]===value?.[field.key]))result[field.key]=value[field.key];
  if(typeof value?.animated==='boolean')result.animated=value.animated;
  return result;
}

export function avatarPixels(value,pose='idle',frame=0){
  const look=normalizeAvatar(value),pixels=[];
  const color=key=>catalog.fields.find(field=>field.key===key).options.find(option=>option[0]===look[key])[2];
  const outline='#302e30',skin=color('skin'),hair=color('hair'),shirt=color('shirt'),scarf=color('scarf'),pants=color('pants');
  const phase=Math.abs(Math.floor(frame))%4,step=phase%2,raised=pose==='celebrate',drinking=pose==='mate',working=pose==='work';
  const lift=pose==='jump'?[0,2,4,2][phase]:pose==='walk'?step:pose==='idle'&&phase===2?1:0;
  const rect=(left,top,width,height,fill)=>pixels.push([left,top-lift,width,height,fill]);
  const limb=(left,top,width,height,fill)=>{rect(left,top,width,height,outline);rect(left+1,top+1,width-2,height-2,fill);};
  pixels.push([13,45,23,2,'#b5b5a4']);
  limb(17,34,8,10,pants);limb(26,34,8,10,pants);
  const stride=pose==='walk'?step*2:0;
  rect(16-stride,42,10,4,outline);rect(26+stride,42-stride,10,4,outline);
  rect(17-stride,42,7,1,'#8a6547');rect(27+stride,42-stride,7,1,'#8a6547');
  if(look.hairstyle==='long'){rect(12,12,26,20,outline);rect(13,13,24,18,hair);}
  limb(15,24,22,14,shirt);
  if(look.outfit==='poncho'){
    rect(12,26,28,8,outline);rect(13,26,26,7,shirt);rect(14,33,24,3,shirt);
    rect(13,30,26,2,'#e5ce9a');rect(17,35,2,3,'#e5ce9a');rect(23,35,2,3,'#e5ce9a');rect(31,35,2,3,'#e5ce9a');
  }else if(look.outfit==='vest'){
    rect(16,26,7,11,'#73503a');rect(29,26,7,11,'#73503a');rect(17,29,4,1,'#c2935e');rect(30,29,4,1,'#c2935e');
  }else{rect(25,26,1,9,'#e5ce9a');rect(25,29,2,1,outline);rect(25,33,2,1,outline);}
  rect(21,24,10,3,scarf);rect(25,27,4,5,scarf);rect(28,29,3,3,scarf);
  limb(13,10,25,15,skin);rect(11,16,3,5,skin);rect(37,16,3,5,skin);
  rect(16,24,19,2,outline);rect(18,24,14,1,skin);
  if(look.hairstyle!=='bald'){
    rect(14,10,23,4,hair);rect(13,13,3,5,hair);
    if(look.hairstyle==='short'){rect(16,12,5,3,hair);rect(34,12,3,6,hair);}
    if(look.hairstyle==='long'){rect(13,12,4,13,hair);rect(35,12,4,15,hair);}
    if(look.hairstyle==='curls')for(const [left,top]of [[12,9],[17,7],[23,8],[29,7],[34,10],[35,14]]){rect(left,top,6,5,outline);rect(left+1,top,4,4,hair);}
  }
  const blink=pose==='idle'&&phase===3;
  rect(19,17,3,blink?1:3,outline);rect(29,17,3,blink?1:3,outline);
  if(!blink){rect(19,17,1,1,'#fff6e9');rect(29,17,1,1,'#fff6e9');}
  rect(25,20,2,1,'#ae7455');rect(23,22,6,pose==='talk'&&step?2:1,outline);
  if(look.accessory==='glasses'){
    for(const left of [16,27]){rect(left,15,9,1,outline);rect(left,20,9,1,outline);rect(left,16,1,4,outline);rect(left+8,16,1,4,outline);}
    rect(25,17,2,1,outline);
  }
  if(look.accessory==='mustache'){rect(21,21,4,2,hair);rect(26,21,4,2,hair);}
  if(look.hat==='gaucho'){
    rect(15,4,21,8,outline);rect(17,5,17,5,'#9c704b');rect(15,10,21,2,scarf);
    rect(8,12,35,3,outline);rect(10,12,31,1,'#b68959');rect(17,5,3,4,'#be9567');
  }else if(look.hat==='beret'){rect(13,7,24,5,outline);rect(15,6,21,5,shirt);rect(34,8,5,3,shirt);rect(25,4,3,2,outline);}
  if(look.accessory==='headphones'){rect(12,12,2,10,outline);rect(38,12,2,10,outline);rect(10,17,4,6,'#cf9b50');rect(38,17,4,6,'#cf9b50');}
  if(raised){
    limb(8,18+step,6,11,shirt);limb(39,18-step,6,11,shirt);rect(9,15+step,4,4,skin);rect(40,15-step,4,4,skin);
    rect(5,7+step,2,3,'#cf9b50');rect(44,8-step,2,3,scarf);
  }else if(drinking){
    limb(10,28,6,9,shirt);rect(11,35,4,3,skin);limb(35,26,6,8,shirt);rect(31,28,8,4,skin);
    const cupTop=step?23:28;
    rect(29,cupTop,7,8,outline);rect(30,cupTop+2,5,5,'#a86839');rect(29,cupTop,7,2,'#547842');rect(32,cupTop-5,1,6,'#d9dfdb');rect(30,cupTop-5,3,1,'#d9dfdb');rect(34,cupTop+3,4,3,skin);
  }else if(working){
    limb(10,28,6,8,shirt);limb(37,28,6,8,shirt);rect(14,33+step,7,3,skin);rect(32,34-step,7,3,skin);
  }else{
    const swing=pose==='walk'?step*2:0;limb(10,27-swing,6,9,shirt);limb(37,27+swing,6,9,shirt);rect(11,34-swing,4,4,skin);rect(38,34+swing,4,4,skin);
  }
  if(working){
    pixels.push([7,39,39,3,'#986c49'],[8,42,3,7,outline],[41,42,3,7,outline],[20,28,13,9,outline],[21,29,11,6,'#71acaf'],[25,37,3,2,outline],[17,38,19,1,'#d4ded4']);
  }
  return pixels;
}

export function paintAvatar(context,appearance,pose='idle',frame=0,{left=0,top=0,scale=1}={}){
  context.save();context.imageSmoothingEnabled=false;context.translate(left,top);context.scale(scale,scale);
  for(const [column,row,width,height,color]of avatarPixels(appearance,pose,frame)){context.fillStyle=color;context.fillRect(column,row,width,height);}
  context.restore();
}

export function avatarCanvas(appearance,name,size=104){
  const canvas=document.createElement('canvas');canvas.width=52;canvas.height=52;canvas.className='gaucho-avatar';canvas.style.width=`${size}px`;canvas.style.height=`${size}px`;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Gauchinho ${name}`);
  paintAvatar(canvas.getContext('2d'),appearance);return canvas;
}

export function createAvatarEditor({appearance,onSave}){
  let draft=normalizeAvatar(appearance),pose='idle',frame=0,timer=null,saving=false,dirty=false;
  const panel=document.createElement('section');panel.className='gaucho-avatar-editor';
  const heading=document.createElement('h3');heading.textContent='Seu gauchinho, do seu jeito';
  const help=document.createElement('p');help.className='muted';help.textContent='Combine peças, escolha as cores e ensaie os movimentos. Esta prévia não executa tarefas nem usa a IA.';
  const stage=document.createElement('div');stage.className='gaucho-avatar-stage';const canvas=avatarCanvas(draft,'em personalização',260);stage.append(canvas);
  const form=document.createElement('form');form.className='gaucho-avatar-options';
  const status=document.createElement('p');status.className='muted gaucho-avatar-status';status.setAttribute('role','status');
  const save=document.createElement('button');save.type='submit';save.className='button primary';save.textContent='Salvar aparência';
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const paint=()=>{const context=canvas.getContext('2d');context.clearRect(0,0,52,52);paintAvatar(context,draft,pose,frame);canvas.setAttribute('aria-label',`Prévia: ${avatarPoses.find(item=>item[0]===pose)[1]}`);};
  const animate=()=>{clearInterval(timer);timer=null;frame=0;paint();if(draft.animated&&!motion.matches&&!document.hidden)timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);timer=null;return;}frame++;paint();},220);};
  const markDirty=()=>{dirty=true;status.textContent='Prévia alterada. Salve para usar neste gauchinho.';};
  const selectors=new Map();
  for(const field of catalog.fields){
    const label=document.createElement('label');label.textContent=field.label;
    const select=document.createElement('select');select.name=field.key;select.setAttribute('aria-label',field.label);
    for(const [value,text]of field.options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    select.value=draft[field.key];select.addEventListener('change',()=>{draft[field.key]=select.value;markDirty();paint();});label.append(select);form.append(label);selectors.set(field.key,select);
  }
  const presets=document.createElement('div');presets.className='gaucho-avatar-presets';
  for(const preset of avatarPresets){const button=document.createElement('button');button.type='button';button.className='button';button.append(avatarCanvas(preset.appearance,preset.name,52),document.createTextNode(preset.name));button.addEventListener('click',()=>{draft={...preset.appearance,animated:draft.animated};for(const [key,select]of selectors)select.value=draft[key];markDirty();paint();});presets.append(button);}
  const poses=document.createElement('div');poses.className='gaucho-avatar-poses';poses.setAttribute('role','group');poses.setAttribute('aria-label','Prévia de animações');
  for(const [id,title]of avatarPoses){const button=document.createElement('button');button.type='button';button.className='button';button.textContent=title;button.setAttribute('aria-pressed',String(pose===id));button.addEventListener('click',()=>{pose=id;for(const sibling of poses.children)sibling.setAttribute('aria-pressed',String(sibling===button));animate();});poses.append(button);}
  const motionLabel=document.createElement('label');motionLabel.className='gaucho-avatar-motion';const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=draft.animated;toggle.addEventListener('change',()=>{draft.animated=toggle.checked;markDirty();animate();});motionLabel.append(toggle,document.createTextNode('Animar este gauchinho'));
  const reduced=document.createElement('small');reduced.className='muted';
  const motionChange=()=>{reduced.textContent=motion.matches?'O sistema pediu movimento reduzido: a prévia fica parada.':'Movimentos ilustrativos. O estado de uma missão continua na fila.';animate();};
  const actions=document.createElement('div');actions.className='gaucho-avatar-actions';actions.append(motionLabel,reduced,save,status);form.append(actions);
  const body=document.createElement('div');body.className='gaucho-avatar-studio';const preview=document.createElement('div');preview.className='gaucho-avatar-preview';preview.append(stage,poses);body.append(preview,form);panel.append(heading,help,presets,body);
  form.addEventListener('submit',async event=>{event.preventDefault();if(saving)return;saving=true;for(const input of panel.querySelectorAll('button,select,input'))input.disabled=true;status.textContent='Salvando aparência…';try{await onSave({...draft});dirty=false;status.textContent='Aparência salva neste gauchinho.';}catch(error){status.textContent=`Não foi possível salvar: ${error.message}`;}finally{saving=false;for(const input of panel.querySelectorAll('button,select,input'))input.disabled=false;}});
  motion.addEventListener('change',motionChange);document.addEventListener('visibilitychange',animate);motionChange();
  return {element:panel,hasChanges:()=>dirty,dispose(){clearInterval(timer);motion.removeEventListener('change',motionChange);document.removeEventListener('visibilitychange',animate);}};
}
