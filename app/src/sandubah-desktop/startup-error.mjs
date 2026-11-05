export function showStartupError(error){
  const panel=document.getElementById('load-error');
  document.body.dataset.ready='error';
  if(!panel)return;
  panel.hidden=false;panel.setAttribute('role','alert');panel.replaceChildren();
  const title=document.createElement('strong');title.textContent='Não conseguimos abrir o SanduBAH por completo.';
  const message=document.createElement('p');message.textContent='A interface parou ao carregar. Isso não significa que seus projetos foram apagados. Tente reabrir; se continuar, envie os detalhes abaixo para revisão.';
  const retry=document.createElement('button');retry.type='button';retry.className='button';retry.textContent='Reabrir a interface';retry.onclick=()=>window.location.reload();
  const details=document.createElement('details'),summary=document.createElement('summary'),technical=document.createElement('p');
  summary.textContent='Detalhes técnicos · opcional';technical.textContent=String(error?.message||'Falha ao carregar a interface.').slice(0,2000);details.append(summary,technical);
  panel.append(title,message,retry,details);
  const loading=document.getElementById('results-count');if(loading)loading.textContent='Carregamento interrompido. Veja o aviso acima.';
}
