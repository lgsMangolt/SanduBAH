// Painéis ajustáveis: divisórias arrastáveis, altura por arraste, maximizar e recolher.
// Os tamanhos ficam no armazenamento local deste PC, por projeto; se ele não estiver disponível, a tela usa o padrão.
const node=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
let maximized=null;

export function layoutStore(scope){
  const key=`sandubah-layout:${scope}`;
  const read=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
  return {
    get(name,fallback){const value=read()[name];return value===undefined?fallback:value;},
    set(name,value){try{const data=read();if(value===undefined)delete data[name];else data[name]=value;localStorage.setItem(key,JSON.stringify(data));}catch{}}
  };
}

function restoreMaximized(){if(!maximized)return;const {element,button}=maximized;element.classList.remove('panel-maximized');document.body.classList.remove('has-maximized-panel');button.textContent='⤢';button.title=button.ariaLabel='Maximizar';button.setAttribute('aria-pressed','false');maximized=null;}
let escapeBound=false;
const bindEscape=()=>{if(escapeBound)return;escapeBound=true;document.addEventListener('keydown',event=>{if(event.key==='Escape'&&maximized)restoreMaximized();});};

// Botões de maximizar e recolher no canto do painel. Recolher é lembrado; maximizar vale só até restaurar.
export function panelControls(element,{id,title,store,host=null}){
  if(!element)return element;
  bindEscape();
  // Painel reaproveitado (por exemplo, o do worker entre projetos): só relê o estado guardado para este projeto.
  if(element.panelSync){element.panelSync(store);return element;}
  element.classList.add('panel');element.dataset.panel=id;
  const tools=node('div','panel-tools');const label=node('span','panel-label',title);
  const collapse=node('button','panel-button');collapse.type='button';
  const maximize=node('button','panel-button','⤢');maximize.type='button';maximize.title=maximize.ariaLabel='Maximizar';maximize.setAttribute('aria-pressed','false');
  const setCollapsed=value=>{element.classList.toggle('panel-collapsed',value);collapse.textContent=value?'▸':'▾';collapse.title=collapse.ariaLabel=value?`Expandir ${title}`:`Recolher ${title}`;collapse.setAttribute('aria-expanded',String(!value));store?.set(`collapsed:${id}`,value||undefined);};
  collapse.addEventListener('click',()=>{if(maximized?.element===element)restoreMaximized();setCollapsed(!element.classList.contains('panel-collapsed'));});
  maximize.addEventListener('click',()=>{
    if(maximized?.element===element){restoreMaximized();return;}
    restoreMaximized();setCollapsed(false);element.classList.add('panel-maximized');document.body.classList.add('has-maximized-panel');
    maximize.textContent='⤡';maximize.title=maximize.ariaLabel='Restaurar tamanho';maximize.setAttribute('aria-pressed','true');maximized={element,button:maximize};element.focus?.();
  });
  // host: cabeçalho próprio do painel (como na prévia lateral), onde os botões entram ao lado dos que já existem.
  const place=()=>{if(host){tools.classList.add('is-inline');host.insertBefore(tools,host.lastElementChild);}else element.prepend(tools);};
  tools.append(label,collapse,maximize);place();
  // Painéis que se redesenham sozinhos (trilha, histórico) trocam os filhos; os botões voltam para o topo.
  new MutationObserver(()=>{if(!tools.isConnected||tools.parentNode!==(host||element))place();}).observe(host||element,{childList:true});
  element.panelSync=next=>{store=next;setCollapsed(Boolean(store?.get(`collapsed:${id}`,false)));};
  element.panelSync(store);
  if(maximized&&!maximized.element.isConnected)restoreMaximized();
  return element;
}

// Divisória vertical entre duas colunas: arrastar, setas do teclado, Home ou duplo clique para o padrão.
export function columnSplitter({container,target,store,key='dockWidth',min=300,reserve=360,fallback=()=>Math.round(clamp(window.innerWidth*0.38,340,760))}){
  const handle=node('div','panel-splitter');handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Ajustar a largura da prévia');handle.title='Arraste para ajustar · duplo clique volta ao padrão';
  const limits=()=>({min,max:Math.max(min,container.getBoundingClientRect().width-reserve)});
  const apply=(width,save=true)=>{const {min:low,max}=limits(),value=Math.round(clamp(width,low,max));target.style.setProperty('--dock-width',`${value}px`);handle.setAttribute('aria-valuenow',String(value));handle.setAttribute('aria-valuemin',String(low));handle.setAttribute('aria-valuemax',String(Math.round(max)));if(save)store().set(key,value);return value;};
  const current=()=>target.getBoundingClientRect().width||fallback();
  handle.addEventListener('pointerdown',event=>{
    event.preventDefault();handle.setPointerCapture(event.pointerId);document.body.classList.add('is-resizing');
    const move=moveEvent=>apply(container.getBoundingClientRect().right-moveEvent.clientX,false);
    const up=upEvent=>{handle.releasePointerCapture(upEvent.pointerId);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);document.body.classList.remove('is-resizing');apply(current());};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);
  });
  handle.addEventListener('keydown',event=>{const step=event.shiftKey?96:24;if(event.key==='ArrowLeft'){apply(current()+step);event.preventDefault();}if(event.key==='ArrowRight'){apply(current()-step);event.preventDefault();}if(event.key==='Home'){store().set(key,undefined);target.style.removeProperty('--dock-width');event.preventDefault();}});
  handle.addEventListener('dblclick',()=>{store().set(key,undefined);target.style.removeProperty('--dock-width');});
  target.before(handle);
  return {restore(){const saved=store().get(key,null);if(Number.isFinite(saved))apply(saved,false);else target.style.removeProperty('--dock-width');}};
}

// Alça horizontal para ajustar altura de um elemento (prévia, fila). A alça fica abaixo, ou acima se edge='top'.
export function heightHandle({target,store,key,min=160,max=()=>window.innerHeight*0.85,edge='bottom',label='Ajustar a altura'}){
  const handle=node('div',`panel-height-handle is-${edge}`);handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','horizontal');handle.setAttribute('aria-label',label);handle.title='Arraste para ajustar · duplo clique volta ao padrão';
  const apply=(height,save=true)=>{const value=Math.round(clamp(height,min,max()));target.style.height=`${value}px`;target.style.maxHeight='none';handle.setAttribute('aria-valuenow',String(value));if(save)store().set(key,value);};
  const reset=()=>{store().set(key,undefined);target.style.removeProperty('height');target.style.removeProperty('max-height');};
  handle.addEventListener('pointerdown',event=>{
    event.preventDefault();handle.setPointerCapture(event.pointerId);document.body.classList.add('is-resizing-y');
    const start=event.clientY,base=target.getBoundingClientRect().height;
    const move=moveEvent=>apply(base+(edge==='top'?start-moveEvent.clientY:moveEvent.clientY-start),false);
    const up=upEvent=>{handle.releasePointerCapture(upEvent.pointerId);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);document.body.classList.remove('is-resizing-y');apply(target.getBoundingClientRect().height);};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);
  });
  handle.addEventListener('keydown',event=>{const step=event.shiftKey?96:24,grow=edge==='top'?'ArrowUp':'ArrowDown',shrink=edge==='top'?'ArrowDown':'ArrowUp';const height=target.getBoundingClientRect().height;if(event.key===grow){apply(height+step);event.preventDefault();}if(event.key===shrink){apply(height-step);event.preventDefault();}if(event.key==='Home'){reset();event.preventDefault();}});
  handle.addEventListener('dblclick',reset);
  if(edge==='top')target.prepend(handle);else target.after(handle);
  return {restore(){const saved=store().get(key,null);if(Number.isFinite(saved))apply(saved,false);else{target.style.removeProperty('height');target.style.removeProperty('max-height');}}};
}
