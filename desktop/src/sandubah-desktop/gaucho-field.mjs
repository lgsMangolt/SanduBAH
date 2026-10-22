// Aba Campo: montar a pista, treinar por tentativa e erro e ver o gauchinho correr com o que aprendeu.
const node=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
const button=(text,action,className='button')=>{const value=node('button',className,text);value.type='button';value.addEventListener('click',action);return value;};
const SVG='http://www.w3.org/2000/svg';
const TILE=14,VIEW=44,SKY=5;
const outcomes={chegou:'chegou ao fim','caiu no buraco':'caiu no buraco','bateu na cerca':'bateu na cerca','bateu no muro':'bateu no muro','passos esgotados':'ficou sem passos'};

export function outcomeText(evaluation){
  if(!evaluation)return 'Ainda não treinou. Sem treino, ele corre direto e bate no primeiro obstáculo.';
  return evaluation.completed?`Com o que aprendeu, ele chegou ao fim da pista em ${evaluation.steps} passos.`:`Com o que aprendeu, ele parou na casa ${evaluation.distance} de ${evaluation.length}: ${outcomes[evaluation.outcome]||evaluation.outcome}.`;
}

// Pixel art desenhada no canvas: céu, chão, obstáculos e o gauchinho de chapéu e poncho.
function drawScene(context,course,frame){
  const width=VIEW*TILE,height=(SKY+3)*TILE,start=Math.max(0,Math.min(course.length-VIEW,frame.x-8)),ground=(SKY+1)*TILE;
  context.imageSmoothingEnabled=false;context.fillStyle='#e8f0df';context.fillRect(0,0,width,height);
  context.fillStyle='#f3d27a';context.fillRect(width-3*TILE,TILE,2*TILE,2*TILE);
  for(let column=0;column<VIEW;column++){
    const index=start+column,tile=course[index],x=column*TILE;if(tile===undefined)continue;
    if(tile!=='B'){context.fillStyle='#6b8f4e';context.fillRect(x,ground,TILE,4);context.fillStyle='#8a6a44';context.fillRect(x,ground+4,TILE,height-ground-4);}
    else{context.fillStyle='#3a2f28';context.fillRect(x,ground,TILE,height-ground);}
    if(tile==='C'){context.fillStyle='#8b5a2b';context.fillRect(x+2,ground-TILE,3,TILE);context.fillRect(x+TILE-5,ground-TILE,3,TILE);context.fillRect(x+1,ground-TILE+3,TILE-2,3);context.fillRect(x+1,ground-TILE+8,TILE-2,3);}
    if(tile==='M'){for(let row=1;row<=3;row++){context.fillStyle=row%2?'#8f8f86':'#a3a39a';context.fillRect(x,ground-row*TILE,TILE,TILE-1);}}
    if(index===course.length-1){context.fillStyle='#b23a2a';context.fillRect(x+6,ground-2*TILE,2,2*TILE);context.fillRect(x+8,ground-2*TILE,6,5);}
  }
  const px=(frame.x-start)*TILE,lift=frame.climb?(3-frame.climb+1)*TILE:frame.y*TILE,py=ground-lift;
  context.fillStyle='#2b2b2b';context.fillRect(px+1,py-15,12,2);context.fillRect(px+4,py-19,6,4);
  context.fillStyle='#e9b98f';context.fillRect(px+5,py-13,4,4);
  context.fillStyle='#b23a2a';context.fillRect(px+2,py-9,10,5);
  context.fillStyle='#3f4f6b';context.fillRect(px+4,py-4,2,4);context.fillRect(px+8,py-4,2,4);
}

export function createFieldPanel({api,gaucho,run,notify,onChange,isBusy=()=>false,presets}){
  const panel=node('div','gaucho-field'),data=gaucho.field;let course=data.course,episodes=1500,replay=null,timer=null,frame=0,speed=14;
  const intro=node('section','gaucho-field-intro');
  intro.append(node('h3','',`Campo de treino de ${gaucho.name}`),node('p','muted','Aqui ele aprende sozinho, por tentativa e erro: ganha pontos por avançar e perde ao bater ou cair. A tabela começa zerada e roda só neste PC, sem IA na nuvem. O que ele aprende vale para qualquer pista, porque olha só o próximo obstáculo.'));
  const stats=node('p','gaucho-field-stats',`${data.episodes.toLocaleString('pt-BR')} tentativas no total · ${data.states} situações aprendidas`);
  intro.append(stats,node('p','',outcomeText(data.evaluation)));panel.append(intro);
  const canvas=node('canvas','gaucho-field-canvas');canvas.width=VIEW*TILE;canvas.height=(SKY+3)*TILE;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Pista com ${gaucho.name}`);
  const context=canvas.getContext('2d');const caption=node('p','muted gaucho-field-caption','');
  const stop=()=>{clearInterval(timer);timer=null;};
  const paint=()=>{const current=replay?.frames[frame]||{x:0,y:0,climb:0,action:null};if(context)drawScene(context,course,current);caption.textContent=replay?`Passo ${frame}/${replay.frames.length-1}${current.action?` · ${current.action}`:''}`:'Treine ou clique em ver para assistir.';};
  const play=run(async()=>{stop();if(!replay)replay=(await api.gaucho({action:'field-replay',id:gaucho.id})).replay;frame=0;paint();timer=setInterval(()=>{if(!canvas.isConnected){stop();return;}if(frame>=replay.frames.length-1){stop();caption.textContent=`${outcomeText({...replay,length:course.length-1})}`;return;}frame++;paint();},1000/speed);});
  const speedSelect=node('select');speedSelect.setAttribute('aria-label','Velocidade');for(const [value,label] of [[6,'Devagar'],[14,'Normal'],[30,'Rápido']]){const option=node('option','',label);option.value=String(value);speedSelect.append(option);}speedSelect.value=String(speed);speedSelect.addEventListener('change',()=>{speed=Number(speedSelect.value);if(timer){const resume=frame;stop();frame=resume;timer=setInterval(()=>{if(!canvas.isConnected||frame>=replay.frames.length-1){stop();return;}frame++;paint();},1000/speed);}});
  const viewer=node('section','gaucho-field-viewer');const controls=node('div','gaucho-rate');controls.append(button('▶ Ver ele correr',play,'button primary'),button('Pausar',stop),speedSelect);
  viewer.append(canvas,caption,controls);panel.append(viewer);
  const editor=node('section','gaucho-task-form');const area=node('textarea','text-input gaucho-field-course');area.rows=3;area.value=course;area.spellcheck=false;area.setAttribute('aria-label','Pista');
  area.addEventListener('input',()=>{course=area.value.trim().toUpperCase();replay=null;stop();paint();});
  const presetRow=node('div','gaucho-rate');for(const preset of presets.presets)presetRow.append(button(preset.title,()=>{area.value=preset.course;area.dispatchEvent(new Event('input'));}));
  const count=node('select');count.setAttribute('aria-label','Tentativas');for(const value of [200,500,1500,5000]){const option=node('option','',`${value.toLocaleString('pt-BR')} tentativas`);option.value=String(value);count.append(option);}count.value=String(episodes);count.addEventListener('change',()=>{episodes=Number(count.value);});
  const train=button('Treinar',run(async()=>{stop();train.disabled=true;train.textContent='Treinando…';try{const result=await api.gaucho({action:'field-train',id:gaucho.id,course:area.value,episodes});replay=result.replay;notify(`${result.run.episodes.toLocaleString('pt-BR')} tentativas em ${result.run.seconds<1?`${Math.max(1,Math.round(result.run.seconds*1000))} ms`:`${result.run.seconds.toFixed(1).replace('.',',')} s`}${result.run.stoppedBy==='tempo'?' · parou no limite de 15 s':''}. ${outcomeText(result.field.evaluation)}`);onChange(result);}finally{train.disabled=false;train.textContent='Treinar';}}),'button primary');train.disabled=isBusy();
  editor.append(node('h3','','Monte a pista'),node('p','muted','. chão · C cerca (pular) · B buraco, até 2 casas (pular) · M muro (escalar, colado nele). Deixe 2 casas de chão entre obstáculos e 3 no começo e no fim.'),presetRow,area,node('div','gaucho-rate'));
  editor.lastChild.append(count,train);
  editor.append(node('p','muted',`Regras do campo: até ${presets.limits.episodes.toLocaleString('pt-BR')} tentativas por treino, no máximo ${presets.limits.timeMs/1000} s por rodada e um treino por vez. Se chegar a um limite, ele para e mostra onde parou.`));
  panel.append(editor);
  panel.append(curveChart(data.runs));
  const reset=button('Recomeçar do zero',()=>{reset.replaceWith(confirmReset);},'button');
  const confirmReset=button('Confirmar: apagar tudo o que ele aprendeu no campo',run(async()=>{const result=await api.gaucho({action:'field-reset',id:gaucho.id});replay=null;notify('Campo zerado. As lições de conversa continuam.');onChange(result);}),'button gaucho-danger');
  panel.append(reset);
  queueMicrotask(paint);return panel;
}

// Curva de aprendizado: porcentagem de chegadas por bloco de tentativas, somando todos os treinos.
function curveChart(runs){
  const section=node('section','gaucho-field-curve');section.append(node('h3','','Curva de aprendizado'));
  const points=runs.flatMap(run=>run.curve);
  if(!points.length){section.append(node('p','muted','Treine para ver a curva.'));return section;}
  const width=600,height=140,maxEpisode=Math.max(...points.map(point=>point.episode)),svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Porcentagem de chegadas ao longo das tentativas');svg.classList.add('gaucho-field-svg');
  const x=value=>value/maxEpisode*(width-40)+30,y=value=>height-20-value/100*(height-36);
  for(const mark of [0,50,100]){const line=document.createElementNS(SVG,'line');line.setAttribute('x1','30');line.setAttribute('x2',String(width-10));line.setAttribute('y1',String(y(mark)));line.setAttribute('y2',String(y(mark)));line.setAttribute('class','grid');svg.append(line);const label=document.createElementNS(SVG,'text');label.setAttribute('x','0');label.setAttribute('y',String(y(mark)+4));label.textContent=`${mark}%`;svg.append(label);}
  const path=document.createElementNS(SVG,'polyline');path.setAttribute('points',points.map(point=>`${x(point.episode).toFixed(1)},${y(point.success).toFixed(1)}`).join(' '));path.setAttribute('class','curve');svg.append(path);
  section.append(svg,node('p','muted',`${maxEpisode.toLocaleString('pt-BR')} tentativas. A taxa durante o treino inclui jogadas de exploração ao acaso; o resultado acima usa só o que ele aprendeu.`));
  return section;
}
