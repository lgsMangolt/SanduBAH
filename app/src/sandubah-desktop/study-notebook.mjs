import {createMediaPicker} from './media-ui.mjs';
const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};

export function createStudyNotebook({record,api,notify,drafts,onSaved}){
  const panel=node('section','world-card brain-hub-card study-notebook');panel.id='study-notebook';panel.setAttribute('aria-label','Caderno de estudo');
  panel.append(node('h3','',record.topic));
  if(record.kind==='legacy'){panel.append(node('p','muted','Estudo anterior preservado. O Markdown produzido fica disponível aqui para consulta.'),node('pre','brain-learning-content',record.content));return panel;}
  const state=drafts.get(record.id)||{...record.fields,version:record.version};drafts.set(record.id,state);
  if(state.version!==record.version){const warning=node('p','brain-hub-warning','As notas ou o alcance mudaram desde o seu rascunho. Consulte os Markdown salvos abaixo antes de reconciliar seu texto.');const reconcile=node('button','button','Revisar meu rascunho sobre a versão atual');reconcile.type='button';reconcile.addEventListener('click',()=>{state.version=record.version;state.reviewed=false;reviewed.checked=false;warning.remove();reconcile.remove();notify('Rascunho preservado. Revise o conteúdo e o alcance antes de salvar.');});panel.append(warning,reconcile);}
  const status=node('p','muted',state.reviewed?'Notas revisadas para consulta seletiva.':'Rascunho: aguardando pesquisa e revisão.');status.setAttribute('role','status');panel.append(status);
  const research=node('button','button primary',record.fields.notes?'1. Aprofundar no Perplexity':'1. Pesquisar no Perplexity');research.type='button';
  research.addEventListener('click',async()=>{research.disabled=true;try{const result=await api.knowledge({action:'study-search',id:record.id});status.textContent=result.cancelled?'Pesquisa cancelada. Suas notas continuam aqui.':'Pesquisa aberta no navegador. Cole a resposta e os links abaixo para revisar.';}catch(error){notify(error.message,true);}finally{research.disabled=false;}});
  panel.append(research,node('p','muted','Use sua conta web. A pergunta é mostrada antes de abrir; apenas ela vai ao Perplexity. O retorno é registrado por você neste caderno.'));
  const form=node('form','brain-hub-form');
  const fields={};
  for(const [key,label,limit,placeholder]of [['notes','2. Conceitos e notas da pesquisa',60000,'Cole a resposta do Perplexity ou escreva suas notas. Separe os conceitos com títulos Markdown e revise as afirmações.'],['sources','Fontes · uma URL HTTPS por linha',8000,'https://…'],['questions','Dúvidas e próximos estudos',8000,'O que ainda falta confirmar ou aprofundar?']]){
    const labelNode=node('label','',label),field=node('textarea','text-input');field.id='study-notebook-'+key;field.maxLength=limit;field.rows=key==='notes'?10:4;field.placeholder=placeholder;field.value=state[key];labelNode.htmlFor=field.id;field.addEventListener('input',()=>{state[key]=field.value;state.reviewed=false;reviewed.checked=false;status.textContent='Alterações ainda não salvas.';});fields[key]=field;form.append(labelNode,field);
  }
  const reviewed=node('input');reviewed.type='checkbox';reviewed.id='study-notebook-reviewed';reviewed.checked=state.reviewed;reviewed.addEventListener('change',()=>{state.reviewed=reviewed.checked;status.textContent='Alterações ainda não salvas.';});
  const reviewLabel=node('label','brain-auto-assess');reviewLabel.append(reviewed,node('span','','Revisei as notas e as fontes; disponibilizar como referência para '+(record.scope==='central'?'todos os projetos (Central).':'o projeto selecionado.')));form.append(reviewLabel);
  if(record.localReferences?.length)form.append(node('p','muted',`${record.localReferences.length} referência(s) local(is) registrada(s) no Markdown de fontes.`));
  form.append(node('p','muted','A consulta usa somente trechos relevantes. Salvar um rascunho não marca afirmações como verificadas.'));
  const submit=node('button','button primary','3. Revisar e salvar Markdown');submit.type='submit';form.append(submit);panel.append(form);
  form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{const result=await api.knowledge({action:'study-save',id:record.id,version:state.version,fields:{notes:fields.notes.value,sources:fields.sources.value,questions:fields.questions.value,reviewed:reviewed.checked}});if(result.cancelled){status.textContent='Gravação cancelada. Seu texto continua no formulário.';return;}drafts.delete(record.id);notify('Quatro Markdown salvos e interligados no Cérebro.');await onSaved(record.id);}catch(error){notify(error.message,true);}finally{submit.disabled=false;}});
  const attachments=node('div','media-picker');panel.append(attachments);createMediaPicker({api,container:attachments,scope:'study:'+record.id,notify});
  const documents=node('details');documents.append(node('summary','','Ver os 4 Markdown salvos'));
  for(const file of record.files){const section=node('details');section.append(node('summary','',file.path+' · '+file.title),node('pre','brain-learning-content',file.content));documents.append(section);}panel.append(documents);
  return panel;
}
