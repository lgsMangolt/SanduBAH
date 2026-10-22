import {brainStyles,brainPreferenceKey,brainPreferences,brainPositions} from './brain-layouts.mjs';

const element=(tag,className,text)=>{const value=document.createElement(tag);value.className=className;if(text!==undefined)value.textContent=text;return value;};

export function createBrainMap({container,toolbar,onOpen,onClassic}){
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let saved;try{saved=JSON.parse(localStorage.getItem(brainPreferenceKey)||'null');}catch{}
  let settings=brainPreferences(saved,media.matches);
  let source=null,visible=false,intersecting=true,frameId=null,elapsed=0,lastFrame=0,lastPaint=0,pointerX=0,pointerY=0,world=null,stage=null,nodes=[],edges=[];
  const styleSelect=element('select','');styleSelect.id='brain-style';styleSelect.setAttribute('aria-label','Visual do cérebro');
  for(const style of brainStyles)styleSelect.add(new Option(style.name,style.id));
  const label=element('label','brain-style-label');label.append(element('span','','Visual do cérebro'),styleSelect);
  const pause=element('button','button subtle');pause.type='button';pause.id='brain-motion';
  const reset=element('button','button subtle','↺ Recentralizar');reset.type='button';reset.id='brain-reset';
  const speed=element('input','');speed.id='brain-speed';speed.type='range';speed.min='.2';speed.max='1.5';speed.step='.1';speed.setAttribute('aria-label','Velocidade da animação');
  const speedLabel=element('label','brain-speed-label');speedLabel.append(element('span','','Velocidade'),speed);
  const note=element('span','brain-style-saved','Preferência salva neste dispositivo');note.setAttribute('role','status');
  toolbar.classList.add('brain-visual-controls');toolbar.append(label,pause,reset,speedLabel,note);
  const observer=new IntersectionObserver(entries=>{intersecting=entries.at(-1)?.isIntersecting??false;schedule();});
  function persist(){try{localStorage.setItem(brainPreferenceKey,JSON.stringify(settings));note.textContent='Preferência salva neste dispositivo';}catch{note.textContent='Preferência aplicada só nesta sessão';}}
  function controls(){
    styleSelect.value=settings.style;speed.value=String(settings.speed);
    const paused=!settings.motion||media.matches;
    pause.textContent=media.matches?'Movimento reduzido':paused?'▶ Animar':'Ⅱ Pausar';pause.setAttribute('aria-pressed',String(paused));pause.disabled=media.matches||settings.style==='classic';speed.disabled=paused||settings.style==='classic';reset.disabled=settings.style==='classic';
    container.classList.toggle('brain-motion-paused',paused);
  }
  function stop(){if(frameId!==null)cancelAnimationFrame(frameId);frameId=null;lastFrame=0;}
  function schedule(){
    if(!visible||!intersecting||document.hidden||!settings.motion||media.matches||settings.style==='classic'||!world){stop();return;}
    if(frameId===null)frameId=requestAnimationFrame(animate);
  }
  function animate(timestamp){
    frameId=null;
    if(lastFrame)elapsed+=Math.min((timestamp-lastFrame)/1000,.1)*settings.speed;lastFrame=timestamp;
    if(timestamp-lastPaint>=40){paint();lastPaint=timestamp;}
    schedule();
  }
  function paint(){
    if(!world||!source)return;
    const points=brainPositions(settings.style,nodes.length,elapsed);
    const horizontal=Math.max(...points.map(point=>Math.abs(point[0])),260);
    const vertical=Math.max(...points.map(point=>Math.abs(point[1])),150);
    const scale=Math.min(1,Math.max(.25,(stage.clientWidth-35)/(horizontal*2+150)),(stage.clientHeight-30)/(vertical*2+130));
    world.style.transform=`scale(${scale}) rotateX(${-12+pointerY*10}deg) rotateY(${-12+pointerX*16}deg)`;
    points.forEach((point,index)=>{nodes[index].style.transform=`translate3d(${point[0]}px,${point[1]}px,${point[2]}px)`;});
    edges.forEach((edge,index)=>{
      const start=points[0],end=points[index+1];const delta=end.map((coordinate,axis)=>coordinate-start[axis]);const length=Math.hypot(...delta);
      edge.style.transform=`translate3d(${start[0]}px,${start[1]}px,${start[2]}px) rotateZ(${Math.atan2(delta[1],delta[0])*180/Math.PI}deg) rotateY(${-Math.asin(delta[2]/length)*180/Math.PI}deg) scaleX(${length/100})`;
    });
  }
  function render(nextSource=source){
    stop();observer.disconnect();source=nextSource;world=null;nodes=[];edges=[];container.replaceChildren();controls();
    if(!source)return;
    container.dataset.style=settings.style;
    if(settings.style==='classic'){onClassic();return;}
    const style=brainStyles.find(item=>item.id===settings.style);
    container.style.setProperty('--brain-accent',style.color);
    stage=element('div','brain-3d-stage');stage.setAttribute('role','group');stage.setAttribute('aria-label',`Mapa Markdown 3D · ${style.name}`);
    world=element('div','brain-3d-world');stage.append(element('div','brain-3d-floor'),world);
    const items=[source,...source.links.slice(0,24)];
    for(let index=1;index<items.length;index++){const edge=element('div','brain-3d-edge');edge.style.animationDelay=`${-index*.7}s`;world.append(edge);edges.push(edge);}
    nodes=items.map((item,index)=>{
      const title=item.title||item.path.split('/').pop();
      const button=element('button',`brain-3d-node${index===0?' brain-3d-center':''}`);button.type='button';button.title=item.sourceLabel||item.path;button.setAttribute('aria-label',`Abrir ${title}`);
      const body=element('span','brain-3d-node-body');body.append(element('span','brain-3d-glyph',index===0?'◉':'MD'),element('span','brain-3d-name',title));button.append(body);button.addEventListener('click',()=>onOpen(item));world.append(button);return button;
    });
    stage.append(element('span','brain-3d-hint','Mova para inclinar · clique ou use Tab + Enter para abrir'));
    stage.addEventListener('pointermove',event=>{if(!settings.motion||media.matches)return;const bounds=stage.getBoundingClientRect();pointerX=(event.clientX-bounds.left)/bounds.width*2-1;pointerY=-((event.clientY-bounds.top)/bounds.height*2-1);paint();});
    stage.addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;paint();});
    container.append(stage);elapsed=0;pointerX=0;pointerY=0;observer.observe(stage);paint();schedule();
  }
  styleSelect.addEventListener('change',()=>{settings={...settings,style:styleSelect.value};persist();render();});
  pause.addEventListener('click',()=>{settings={...settings,motion:!settings.motion};persist();controls();schedule();});
  speed.addEventListener('input',()=>{settings={...settings,speed:Number(speed.value)};persist();});
  reset.addEventListener('click',()=>{elapsed=0;pointerX=0;pointerY=0;paint();});
  media.addEventListener('change',()=>{controls();schedule();});
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('resize',paint);
  controls();
  return {render,setVisible(value){visible=value;controls();if(value)paint();schedule();},get settings(){return {...settings};}};
}
