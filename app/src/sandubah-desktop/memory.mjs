const GIB=1024**3,GB=1e9;
const format=(value,unit)=>`${(value/unit).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${unit===GIB?'GiB':'GB'}`;
const missing=(value,unit)=>format(Math.ceil(value/unit*100)/100*unit,unit);

export function describeMemory(snapshot,now=Date.now()){
  const stale=!Number.isFinite(snapshot?.sampledAt)||now-snapshot.sampledAt>15000||snapshot.sampledAt>now+1000;
  const unknown={state:'unknown',value:'Indisponível',detail:stale?'Aguardando leitura atualizada':snapshot?.error||'Não foi possível medir',percent:null};
  const result={ram:{...unknown},gpu:{...unknown}};
  if(stale)return result;
  if(snapshot.ram){
    const {free,total,commitFree}=snapshot.ram;
    const shortage=4*GIB-free,commitShortage=commitFree===null?null:6*GIB-commitFree;
    let detail=shortage>0?`Faltam ${missing(shortage,GIB)} de RAM para iniciar`:`Folga de ${format(Math.max(0,-shortage),GIB)} acima do mínimo`;
    let state=shortage>0?'low':'good';
    if(commitShortage===null){state=shortage>0?'low':'unknown';detail+=' · memória comprometível indisponível';}
    else if(commitShortage>0){state='low';detail+=` · faltam ${missing(commitShortage,GIB)} de memória comprometível`;}
    else detail+=` · comprometível: ${format(commitFree,GIB)} livre`;
    result.ram={state,value:`${format(free,GIB)} livres / ${format(total,GIB)}`,detail,percent:free/total*100};
  }
  if(snapshot.gpu){
    const {free,total,used}=snapshot.gpu;
    const margin=3.9*GB-used,available=Math.min(free,margin),shortage=1.85*GB-available;
    const detail=margin<0?`Teto excedido em ${missing(-margin,GB)}`:shortage>0?`Faltam ${missing(shortage,GB)} para a reserva inicial`:`Folga de ${format(margin,GB)} até o teto de 3,9 GB`;
    result.gpu={state:shortage>0?'low':'good',value:`${format(free,GB)} livres / ${format(total,GB)}`,detail,percent:free/total*100};
  }
  return result;
}

export function createMemoryBars(api,onReading=()=>{}){
  const container=document.getElementById('memory-bars');
  const cards={};let snapshot=null,timer=null,pending=false,closed=false;
  const observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--task-bar-height',`${Math.ceil(container.closest('.task-bar').getBoundingClientRect().height)}px`));
  observer.observe(container.closest('.task-bar'));
  for(const [key,label] of [['ram','RAM'],['gpu','VRAM']]){
    const card=document.createElement('div');card.className='memory-card';card.dataset.memory=key;
    const heading=document.createElement('div');heading.className='memory-heading';
    const name=document.createElement('strong');name.textContent=label;
    const value=document.createElement('span');value.className='memory-value';heading.append(name,value);
    const meter=document.createElement('div');meter.className='memory-meter';meter.setAttribute('role','meter');meter.setAttribute('aria-label',`${label} disponível`);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
    const fill=document.createElement('span');meter.append(fill);
    const detail=document.createElement('small');detail.id=`memory-${key}-detail`;meter.setAttribute('aria-describedby',detail.id);
    card.append(heading,meter,detail);container.append(card);cards[key]={card,value,meter,fill,detail};
  }
  function render(){
    const description=describeMemory(snapshot);
    for(const key of ['ram','gpu']){
      const view=cards[key],reading=description[key];
      view.card.dataset.state=reading.state;view.value.textContent=reading.value;view.detail.textContent=reading.detail;
      if(reading.percent===null){view.meter.removeAttribute('aria-valuenow');view.fill.style.width='0%';}
      else{view.meter.setAttribute('aria-valuenow',String(reading.percent));view.fill.style.width=`${reading.percent}%`;}
      view.meter.setAttribute('aria-valuetext',`${reading.value}. ${reading.detail}`);
    }
    onReading(description);
  }
  async function refresh(){
    if(pending||closed)return;
    clearTimeout(timer);render();
    if(document.hidden||document.body.dataset.currentView==='planner'&&['codex','claude'].includes(document.body.dataset.plannerProvider)){timer=setTimeout(refresh,5000);return;}
    pending=true;
    try{snapshot=await api.memoryStatus();}catch{snapshot=null;}
    finally{pending=false;if(!closed){render();timer=setTimeout(refresh,5000);}}
  }
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',refresh);},{once:true});
  render();refresh();
}
