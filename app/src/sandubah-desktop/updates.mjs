export function createUpdates({api,container,notify,autoCheck=true}){
  const element=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
  const panel=element('section');panel.className='desktop-updates';panel.id='desktop-updates';panel.setAttribute('aria-label','Atualizações do aplicativo');
  const title=element('h2','Seu SanduBAH, atualizado com sua permissão'),message=element('p'),version=element('small'),notes=element('ul'),progress=element('progress');progress.max=1;progress.hidden=true;progress.setAttribute('aria-label','Download da atualização');
  const explanation=element('p','Ao abrir, consulta somente as versões públicas. Só baixa e instala depois de você confirmar. Projetos e chaves ficam no seu PC, separados do programa.');
  const actions=element('div'),check=element('button','Verificar atualizações'),download=element('button','Baixar atualização'),install=element('button','Fechar e instalar');for(const button of [check,download,install]){button.type='button';button.className='button';actions.append(button);}install.classList.add('primary');
  panel.append(title,version,message,notes,progress,actions,explanation);container.prepend(panel);
  const render=state=>{panel.dataset.phase=state.phase;version.textContent=`Versão desktop ${state.version}${state.availableVersion?' · disponível '+state.availableVersion:''}`;message.textContent=state.message;message.setAttribute('role','status');notes.replaceChildren(...(state.notes||[]).map(note=>element('li',note)));progress.hidden=state.phase!=='downloading';progress.value=(state.received||0)/(state.bytes||1);check.disabled=['checking','downloading','installing'].includes(state.phase);download.hidden=!['available','error'].includes(state.phase)||!state.availableVersion;install.hidden=state.phase!=='ready';if(state.phase==='available')notify(`SanduBAH ${state.availableVersion} disponível. Veja em Tutoriais → Atualizações.`);};
  const run=async action=>{try{const state=await action();if(!state.cancelled)render(state);}catch(error){notify(error.message,true);}};
  check.onclick=()=>run(api.checkUpdates);download.onclick=()=>run(api.downloadUpdate);install.onclick=()=>run(api.installUpdate);api.onUpdates(render);
  return {async start(){render(await api.updatesStatus());if(autoCheck)run(api.checkUpdates);}};
}
