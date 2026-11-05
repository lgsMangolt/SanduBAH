const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const button=(label,action,primary=false)=>{const element=node('button',primary?'button primary':'button',label);element.type='button';element.addEventListener('click',action);return element;};
const field=(title,element)=>{const label=node('label','client-video-field');element.setAttribute('aria-label',title);label.append(node('span','field-label',title),element);return label;};
const input=(value='',limit=120,rows=0)=>{const element=node(rows?'textarea':'input','text-input');element.value=value;element.maxLength=limit;if(rows)element.rows=rows;return element;};
function select(items,value,empty='Sem vínculo'){
  const element=node('select');if(empty!==null)element.add(new Option(empty,''));for(const item of items)element.add(new Option(item.name||item.title,item.id));
  if(value&&!items.some(item=>item.id===value))element.add(new Option('Vínculo indisponível · escolha outro',value));element.value=value||'';return element;
}

export function createProjectClientLink({api,projectId,notify,onClients,onVideos}){
  const panel=node('section','client-project-link');panel.setAttribute('aria-label','Cliente do projeto');panel.append(node('p','muted','Carregando cliente do projeto…'));
  async function load(){
    try{
      const data=await api.clientVideos({action:'snapshot'}),old=data.links.find(link=>link.projectId===projectId)?.clientId||null;
      const choice=select(data.clients,old,'Sem cliente');const save=button('Salvar vínculo',async()=>{
        save.disabled=true;try{await api.clientVideos({action:'project-link',projectId,clientId:choice.value||null,expectedClientId:old});notify('Cliente do projeto salvo. Nenhum dado foi enviado à IA.');await load();}catch(error){notify(error.message,true);save.disabled=false;}
      });
      panel.replaceChildren(field('Cliente deste projeto',choice),save,button('Clientes',onClients),button('Vídeos deste projeto',onVideos));
      panel.append(node('small','muted','Vínculo organizacional: contato e notas do cliente ficam fora do contexto automático.'));
    }catch(error){panel.replaceChildren(node('p','muted',error.message),button('Tentar novamente',load));}
  }
  load();return panel;
}

export function createClientVideos({api,clientsContainer,videosContainer,notify,navigate,onContinue}){
  let view='',data=null,clientId=null,videoId=null,query='',filterClient='',filterProject='',saving=false,epoch=0;
  const run=action=>async()=>{try{await action();}catch(error){notify(error.message,true);}};
  const clientName=id=>data.clients.find(item=>item.id===id)?.name||(id?'Cliente indisponível':'Sem cliente');
  const projectName=id=>data.projects.find(item=>item.id===id)?.name||(id?'Projeto indisponível':'Sem projeto');
  async function load(){const ticket=++epoch;const next=await api.clientVideos({action:'snapshot'});if(ticket!==epoch)return;data=next;draw();}
  function openVideo(id){videoId=id;query='';filterClient='';filterProject='';navigate('videos');}
  function draw(){if(!data)return;if(view==='clients')drawClients();if(view==='videos')drawVideos();}
  function search(placeholder,onInput){const element=node('input','text-input');element.type='search';element.placeholder=placeholder;element.setAttribute('aria-label',placeholder);element.value=query;element.addEventListener('input',()=>{query=element.value;onInput();});return element;}
  function bindSave(form,save,action){form.addEventListener('submit',event=>{event.preventDefault();if(saving)return;saving=true;save.disabled=true;run(async()=>{try{await action();}finally{saving=false;save.disabled=false;}})();});}
  function deletion(collection,item){return button('Excluir cadastro',run(async()=>{const result=await api.clientVideos({action:'delete',collection,id:item.id,revision:item.revision});if(result.cancelled)return;if(collection==='clients')clientId=null;else videoId=null;notify('Cadastro excluído. Projetos e arquivos foram preservados.');await load();}));}
  function drawClients(){
    clientsContainer.replaceChildren();const layout=node('div','client-video-layout'),side=node('section','client-video-side'),detail=node('section','client-video-detail');
    const list=node('div','client-video-list');
    const paintList=()=>{list.replaceChildren();for(const client of data.clients.filter(item=>`${item.name} ${item.company}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))){const card=button('',()=>{clientId=client.id;drawClients();});card.classList.add('client-video-card');card.setAttribute('aria-pressed',String(clientId===client.id));card.append(node('strong','',client.name),node('small','muted',`${data.links.filter(link=>link.clientId===client.id).length} projeto(s) · ${data.videos.filter(video=>video.clientId===client.id).length} vídeo(s)`));list.append(card);}if(!list.children.length)list.append(node('p','muted','Nenhum cliente encontrado.')) ;};
    side.append(button('+ Novo cliente',()=>{clientId=null;drawClients();},true),search('Buscar clientes',paintList),list);paintList();
    const client=data.clients.find(item=>item.id===clientId);const form=node('form','client-video-form');
    const name=input(client?.name),company=input(client?.company),contact=input(client?.contact,180),notes=input(client?.notes,1500,3);name.required=true;
    const save=node('button','button primary',client?'Salvar cliente':'Criar cliente');save.type='submit';
    form.append(node('h2','',client?'Dados do cliente':'Novo cliente'),node('p','muted','Cadastre só o necessário. Contato e notas são opcionais; não guarde senhas ou dados sensíveis aqui.'),field('Nome do cliente',name),field('Empresa (opcional)',company),field('Contato (opcional)',contact),field('Notas privadas (opcional)',notes),save);
    bindSave(form,save,async()=>{const result=await api.clientVideos({action:'client-save',input:{id:client?.id,revision:client?.revision,name:name.value,company:company.value,contact:contact.value,notes:notes.value}});clientId=result.id;notify('Cliente salvo neste PC.');await load();});detail.append(form);
    if(client){
      const related=node('section','client-video-related');related.append(node('h3','','Projetos deste cliente'));
      for(const link of data.links.filter(item=>item.clientId===client.id))related.append(button(projectName(link.projectId),run(()=>onContinue(link.projectId))));
      const project=select(data.projects,null,'Escolha um projeto'),attach=button('Vincular projeto',run(async()=>{if(!project.value)throw new Error('Escolha um projeto.');const old=data.links.find(link=>link.projectId===project.value)?.clientId||null;if(old&&old!==client.id)throw new Error('Este projeto tem outro cliente. Troque o vínculo dentro do projeto.');await api.clientVideos({action:'project-link',projectId:project.value,clientId:client.id,expectedClientId:old});notify('Projeto vinculado ao cliente.');await load();}));
      related.append(field('Projeto para vincular',project),attach,node('h3','','Vídeos deste cliente'));
      const videos=data.videos.filter(video=>video.clientId===client.id);for(const video of videos)related.append(button(video.title,()=>openVideo(video.id)));
      if(!videos.length)related.append(node('p','muted','Nenhum vídeo vinculado ainda.'));
      related.append(node('p','muted','Para excluir o cliente, retire antes os vínculos nos projetos e nos vídeos.'),deletion('clients',client));detail.append(related);
    }
    layout.append(side,detail);clientsContainer.append(layout);
  }
  function drawVideos(){
    videosContainer.replaceChildren();const layout=node('div','client-video-layout'),side=node('section','client-video-side'),detail=node('section','client-video-detail'),list=node('div','client-video-list');
    const clientFilter=select(data.clients,filterClient,'Todos os clientes'),projectFilter=select(data.projects,filterProject,'Todos os projetos');
    const paintList=()=>{
      list.replaceChildren();const videos=data.videos.filter(video=>(!filterClient||video.clientId===filterClient)&&(!filterProject||video.projectId===filterProject)&&video.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      for(const video of videos){const card=button('',()=>{videoId=video.id;drawVideos();});card.classList.add('client-video-card');card.setAttribute('aria-pressed',String(videoId===video.id));card.append(node('strong','',video.title),node('small','muted',`${clientName(video.clientId)} · ${data.stages[video.stage]}`));list.append(card);}if(!videos.length)list.append(node('p','muted','Nenhum vídeo encontrado.'));
    };
    clientFilter.addEventListener('change',()=>{filterClient=clientFilter.value;paintList();});projectFilter.addEventListener('change',()=>{filterProject=projectFilter.value;paintList();});
    side.append(button('+ Novo vídeo',()=>{videoId=null;drawVideos();},true),search('Buscar vídeos',paintList),field('Filtrar vídeos por cliente',clientFilter),field('Filtrar vídeos por projeto',projectFilter),list);paintList();
    const video=data.videos.find(item=>item.id===videoId),form=node('form','client-video-form');
    const title=input(video?.title),brief=input(video?.brief,5000,5),project=select(data.projects,video?.projectId||filterProject,'Sem projeto'),client=select(data.clients,video?.clientId||null,'Sem cliente');title.required=true;
    if(!video&&project.value)client.value=data.links.find(link=>link.projectId===project.value)?.clientId||'';
    project.addEventListener('change',()=>{if(!client.value)client.value=data.links.find(link=>link.projectId===project.value)?.clientId||'';});
    const stage=select(Object.entries(data.stages).map(([id,name])=>({id,name})),video?.stage||'idea',null),format=select(Object.entries(data.formats).map(([id,name])=>({id,name})),video?.format||'9:16',null);
    form.append(node('h2','',video?'Produção do vídeo':'Novo vídeo'),field('Título do vídeo',title),field('Cliente do vídeo',client),field('Projeto do vídeo',project),node('p','muted','O cliente do vídeo pode ser diferente do cliente do projeto. Alterar um vínculo não modifica o outro.'),field('Formato',format),field('Etapa do vídeo',stage),node('small','muted','Etapa informada por você, separada das missões. Marcar Entregue não comprova renderização.'),field('Briefing do vídeo',brief));
    const selected=new Set(video?.skills||['video:brief','video:storyboard']);const skills=node('fieldset','client-video-skills');skills.append(node('legend','','Skills deste vídeo · até 5'));
    const skillSearch=input('',120);skillSearch.type='search';skillSearch.placeholder='Buscar skills de vídeo';skillSearch.setAttribute('aria-label','Buscar skills de vídeo');skills.append(skillSearch);
    const skillList=node('div','client-video-skill-list');
    const paintSkills=()=>{skillList.replaceChildren();for(const skill of data.skills.filter(item=>item.title.toLocaleLowerCase().includes(skillSearch.value.toLocaleLowerCase()))){const label=node('label','client-video-skill');const check=node('input');check.type='checkbox';check.checked=selected.has(skill.id);check.addEventListener('change',()=>{if(check.checked&&selected.size>=5){check.checked=false;notify('Escolha até cinco skills.',true);return;}if(check.checked)selected.add(skill.id);else selected.delete(skill.id);});label.append(check,node('span','',skill.title),node('small','muted',skill.builtin?'Incluída no SanduBAH':'Disponível no catálogo local'));skillList.append(label);}if(!skillList.children.length)skillList.append(node('p','muted','Nenhuma skill com esse nome. Nenhum download foi iniciado.'));};
    skillSearch.addEventListener('input',paintSkills);paintSkills();skills.append(skillList);
    for(const id of selected)if(!data.skills.some(skill=>skill.id===id)){const missing=node('p','muted','Skill indisponível: '+id);missing.append(button('Remover seleção indisponível',()=>{selected.delete(id);missing.remove();}));skills.append(missing);}
    form.append(skills,node('p','muted','As skills são instruções de trabalho, não ferramentas instaladas. Selecionar não executa, baixa ou publica nada.'));
    const save=node('button','button primary','Salvar vídeo');save.type='submit';form.append(save);
    bindSave(form,save,async()=>{const result=await api.clientVideos({action:'video-save',input:{id:video?.id,revision:video?.revision,title:title.value,brief:brief.value,clientId:client.value||null,projectId:project.value||null,format:format.value,stage:stage.value,skills:[...selected]}});videoId=result.id;notify('Vídeo salvo neste PC.');await load();});detail.append(form);
    if(video){
      const actions=node('section','client-video-related');actions.append(node('h3','','Próximo passo'),node('p','muted',`Projeto: ${projectName(video.projectId)}. A missão usa o executor já escolhido nesse projeto. Salve suas mudanças antes de preparar.`));
      let changed=false;form.addEventListener('input',()=>{changed=true;});form.addEventListener('change',()=>{changed=true;});
      const prepare=button('Preparar missão com estas skills',run(async()=>{if(changed)throw new Error('Salve as mudanças do vídeo antes de preparar a missão.');prepare.disabled=true;try{const result=await api.clientVideos({action:'prepare',id:video.id,revision:video.revision});notify(result.reused?'Esta missão já está na fila.':'Missão preparada. Revise e confirme a execução no projeto.');}finally{prepare.disabled=false;}}));prepare.disabled=!video.projectId;
      actions.append(prepare);if(video.projectId)actions.append(button('Abrir projeto e revisar fila',run(()=>onContinue(video.projectId))));actions.append(node('small','muted','Nome, contato e notas do cadastro não entram no pedido. Só o briefing e as skills escolhidas; revise também o contexto já conectado ao projeto.'),deletion('videos',video));detail.append(actions);
    }
    layout.append(side,detail);videosContainer.append(layout);
  }
  return {show(next){if(next!==view)query='';view=next;clientsContainer.hidden=view!=='clients';videosContainer.hidden=view!=='videos';if(['clients','videos'].includes(view))run(load)();},openProjectVideos(id){filterProject=id;filterClient='';videoId=null;query='';navigate('videos');}};
}
