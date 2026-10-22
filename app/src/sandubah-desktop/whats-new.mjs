export function createWhatsNew({api,initial,navigate,notify}){
  let snapshot=initial,busy=false,previousFocus=null;
  const element=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=text;return item;};
  const dialog=element('dialog','whats-new');dialog.id='whats-new-dialog';dialog.setAttribute('aria-labelledby','whats-new-title');
  const header=element('header','whats-new-header'),logo=element('img');logo.src='sandubah-logo.png';logo.alt='';const heading=element('div');heading.append(element('p','whats-new-eyebrow','NOVIDADES DA SUA CÓPIA'));const title=element('h2','','O que mudou no SanduBAH');title.id='whats-new-title';heading.append(title);header.append(logo,heading);
  const content=element('div','whats-new-content'),explanation=element('section','whats-new-update-mode');explanation.append(element('strong','','Verifica ao abrir. Você decide se instala.'),element('p','','O SanduBAH não baixa nem instala versões sozinho. A edição independente consulta versões públicas ao abrir e pede confirmação antes de baixar e antes de instalar. Seus dados ficam separados do programa.'),element('p','','A prévia do GitHub é separada do aplicativo desktop. Sem uma versão desktop assinada publicada, não há atualização para instalar.'));
  const footer=element('footer','whats-new-actions'),tutorials=element('button','button','Ver tutoriais'),close=element('button','button primary','Entendi');tutorials.type=close.type='button';footer.append(tutorials,close);dialog.append(header,content,explanation,footer);document.body.append(dialog);
  const open=element('button','button subtle whats-new-open','O que mudou no SanduBAH');open.type='button';open.id='whats-new-open';document.getElementById('tutorials-view').prepend(open);
  function show(releases){
    if(dialog.open||document.querySelector('dialog[open]'))return false;
    content.replaceChildren();
    if(snapshot.warning)content.append(element('p','whats-new-warning',snapshot.warning));
    for(const release of [...releases].reverse()){
      const section=element('section','whats-new-release'),date=element('time','whats-new-date',release.date.split('-').reverse().join('/'));date.dateTime=release.date;
      section.append(date,element('h3','',release.title));const list=element('ul');for(const change of release.changes){const item=element('li');item.append(element('strong','',change.title),element('p','',change.description));list.append(item);}section.append(list,element('small','',`Revisão da interface · ${release.id}`));content.append(section);
    }
    previousFocus=document.activeElement;dialog.showModal();close.focus();return true;
  }
  async function dismiss(destination){
    if(busy)return;busy=true;close.disabled=tutorials.disabled=true;
    try{snapshot=await api.releaseNotes({action:'seen',releaseId:snapshot.currentId});}
    catch{notify('Não foi possível salvar que você viu as novidades. Elas poderão aparecer de novo ao abrir.',true);}
    finally{dialog.close();close.disabled=tutorials.disabled=false;busy=false;if(destination)navigate(destination);else if(previousFocus?.isConnected)previousFocus.focus();}
  }
  close.onclick=()=>dismiss();tutorials.onclick=()=>dismiss('tutorials');dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  open.onclick=async()=>{try{snapshot=await api.releaseNotes({action:'status'});show(snapshot.available);}catch{notify('Não foi possível abrir o histórico de novidades agora.',true);}};
  return {showOnStartup(){if(snapshot?.autoShow&&snapshot.unread.length)show(snapshot.unread);}};
}
