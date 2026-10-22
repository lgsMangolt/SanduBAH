export function createPlanningReview(api){
  const modal=document.createElement('dialog');modal.id='planning-review';modal.className='planning-review';modal.setAttribute('aria-labelledby','planning-review-title');
  document.body.append(modal);let current=null,responding=false;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  async function respond(approved){
    if(!current||responding)return;responding=true;
    const id=current.id;
    for(const button of modal.querySelectorAll('button'))button.disabled=true;
    try{await api.respondPlanningReview({id,approved});if(current?.id===id){current=null;modal.close();}}
    catch{if(current?.id===id){let error=modal.querySelector('[role="alert"]');if(!error){error=node('p',undefined,'planning-review-notice');error.setAttribute('role','alert');modal.querySelector('.planning-review-body').append(error);}error.textContent='Não conseguimos confirmar agora. Tente novamente ou escolha Agora não.';}}
    finally{responding=false;for(const button of modal.querySelectorAll('button'))button.disabled=false;}
  }
  modal.addEventListener('cancel',event=>{event.preventDefault();respond(false).catch(()=>{});});
  api.onPlanningReview(review=>{
    if(modal.open)modal.close();current=review;responding=false;modal.replaceChildren();
    const heading=node('header',undefined,'planning-review-heading');
    const logo=node('img');logo.src='sandubah-logo.png';logo.alt='';heading.append(logo);
    const titles=node('div');titles.append(node('p','ANTES DE COMEÇAR','planning-review-eyebrow'));
    const title=node('h2',review.title);title.id='planning-review-title';titles.append(title,node('p',review.project,'planning-review-project'));heading.append(titles);modal.append(heading);
    const body=node('div',undefined,'planning-review-body');
    body.append(node('p',review.intro||'Vamos transformar sua ideia em um plano. Você decide depois o que executar.','planning-review-intro'));
    const facts=node('div',undefined,'planning-review-facts');
    for(const [label,value]of [['Sua IA',`${review.provider} · ${review.model}`],['Força',review.effort||'Automática'],['Contexto',review.sources.length?`${review.sources.length} fontes e trechos · ${review.mode}`:review.context?'Markdown do projeto':'Só a conversa']]){const card=node('div');card.append(node('span',label),node('strong',value));facts.append(card);}body.append(facts);
    if(review.projectOptions){const names={interview:'Entrevista',organize:'Organizar agentes',review:'Revisar harness'},enabled=Object.entries(names).filter(([key])=>review.projectOptions[key]).map(([,name])=>name);const card=node('div');card.append(node('span','Opções deste projeto'),node('strong',enabled.join(' · ')||'Planejamento direto'));facts.append(card);}
    body.append(node('h3','Sua mensagem'),node('p',review.prompt,'planning-review-prompt'),node('p',review.notice,'planning-review-notice'));
    if(review.attachments?.length){const list=node('ul');for(const asset of review.attachments)list.append(node('li',`${asset.name} · ${asset.summary}`));body.append(node('h3','Fotos e vídeos que serão enviados'),list);}
    const details=(label,content)=>{const section=node('details');section.append(node('summary',label),content);body.append(section);};
    if(review.sources.length){const list=node('ul');for(const source of review.sources)list.append(node('li',`${source.citation} · ${source.label.split(/[\\/]/).pop()} · linhas ${source.startLine}–${source.endLine}`));details(`Ver as ${review.sources.length} fontes selecionadas`,list);}
    if(review.context)details('Ler o contexto completo que será enviado',node('pre',review.context,'planning-review-context'));
    if(review.history.length){const history=node('div');for(const message of review.history){history.append(node('h4',message.role==='user'?'Você':'Assistente'),node('p',message.content,'planning-review-prompt'));}details(`Ver histórico enviado · ${review.history.length} mensagens`,history);}
    details('Detalhes técnicos · opcional',node('pre',review.parameters,'planning-review-context'));
    modal.append(body);
    const footer=node('footer');const cancel=node('button','Agora não','button');cancel.id='planning-review-cancel';cancel.type='button';cancel.addEventListener('click',()=>respond(false).catch(()=>{}));
    const approve=node('button',review.approvalLabel||'Enviar e planejar','button primary');approve.id='planning-review-approve';approve.type='button';approve.addEventListener('click',()=>respond(true).catch(()=>{}));footer.append(cancel,approve);modal.append(footer);
    modal.showModal();cancel.focus();
  });
}
