export const interviewTopics=['goal','audience','data','constraints','success','next'];
const titles=['O que você quer entregar?','Quem vai usar e qual problema precisa resolver?','O que já existe para começar?','Quais limites precisamos respeitar?','Como vamos comprovar que deu certo?','Qual pequeno próximo passo vamos propor?'];
export function interviewQuestion(index,answers={}){
  const key=interviewTopics[index],text=Object.values(answers).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let title=titles[index],hint='Responda com suas palavras. Pode deixar uma dúvida explícita.',choices=[];
  if(key==='goal')choices=['Construir algo novo','Melhorar um projeto existente','Estudar antes de decidir'];
  if(key==='audience'&&answers.goal){hint=`Pensando em “${answers.goal}”, descreva quem vai usar e o problema atual.`;choices=['Só eu, por enquanto','Minha equipe','Clientes externos'];}
  if(key==='data'){
    if(/whatsapp|api|mcp|integr/.test(text)){title='Quais integrações já existem e quais ainda precisam de acesso?';hint='Liste sistemas e dados necessários. Não cole senhas ou chaves.';choices=['Ainda não tenho acesso','Tenho API documentada','Quero começar sem integrações'];}
    else if(/estud|pesquis|rag|markdown/.test(text)){title='Quais documentos e fontes vão orientar o projeto?';choices=['Markdown locais','Preciso pesquisar fontes','Já tenho documentos'];}
    else choices=['Tenho um projeto local','Ainda não tenho arquivos','Tenho exemplos e referências'];
  }
  if(key==='constraints'){hint=/local|pc|offline/.test(text)?'Você mencionou uso local: qual RAM/VRAM, prazo e acesso podem ser usados?':'Informe prazo, custo, privacidade e o que nunca pode ser alterado.';choices=['Não alterar configurações globais','Sem serviços pagos','Somente planejar por enquanto'];}
  if(key==='success'){title=/estud|pesquis/.test(text)?'Que evidência mostrará que o estudo foi útil?':'Qual teste observável comprova a entrega?';hint=answers.goal?`Defina uma evidência para o objetivo “${answers.goal}”.`:'Prefira um teste reproduzível, não apenas “ficou bom”.';choices=['Teste automatizado passando','Demonstração que eu possa revisar','Relatório com fontes e limitações'];}
  if(key==='next'){hint=answers.constraints?`Respeitando “${answers.constraints}”, escolha apenas o primeiro passo. Isso não autoriza execução.`:'O plano continua sujeito à revisão e confirmação.';choices=['Preparar um plano para revisão','Criar uma missão pendente','Fechar dúvidas antes de executar'];}
  return {key,title,hint,choices};
}

export function createInterview({api,projectId,answers:initial={},onSaved}){
  const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
  const panel=node('section',undefined,'interview-panel');panel.setAttribute('aria-label','Entrevista interativa do projeto');
  const storageKey=`sandubah-interview:${projectId}`;let answers={...initial},index=interviewTopics.findIndex(key=>!answers[key]),timer,chain=Promise.resolve(),revision=0;
  if(index<0)index=6;try{const saved=Number(localStorage.getItem(storageKey));if(localStorage.getItem(storageKey)!==null&&saved>=0&&saved<=6)index=saved;}catch{}
  const status=node('p','Respostas salvas neste projeto.','muted');status.setAttribute('role','status');
  function persist(key,value){
    const version=++revision;status.textContent='Salvando…';
    const operation=chain.catch(()=>{}).then(()=>api.knowledge({action:'brief',id:projectId,answers:{[key]:value}}));chain=operation;
    operation.then(snapshot=>{onSaved(snapshot);if(version===revision)status.textContent='Salvo no projeto.';},error=>{if(version===revision)status.textContent=`Não foi salvo: ${error.message}. Mantenha esta página aberta e tente novamente.`;});return operation;
  }
  function draw(){
    panel.replaceChildren();try{localStorage.setItem(storageKey,String(index));}catch{}
    const count=interviewTopics.filter(key=>answers[key]?.trim()).length;
    panel.append(node('p',`${count}/6 pontos respondidos · perguntas adaptadas por regras locais`,'muted'));
    const progress=node('progress');progress.max=6;progress.value=count;progress.setAttribute('aria-label','Pontos respondidos');panel.append(progress);
    if(index===6){
      panel.append(node('h3','Seu briefing, pronto para revisão'));
      interviewTopics.forEach((key,position)=>{const row=node('article',undefined,'interview-summary');row.append(node('h4',titles[position]),node('p',answers[key]||'Pendente — não presumir uma resposta.'));const edit=node('button','Editar','button');edit.type='button';edit.onclick=()=>{index=position;draw();};row.append(edit);panel.append(row);});
      panel.append(node('p','Revise as respostas antes de preparar a missão. Nenhuma execução foi autorizada.','muted'),status);return;
    }
    const question=interviewQuestion(index,answers),form=node('form',undefined,'brain-hub-form');
    const title=node('label',`${index+1}. ${question.title}`,'interview-question');title.htmlFor='brain-grill-answer';
    const answer=node('textarea',undefined,'text-input');answer.id='brain-grill-answer';answer.rows=5;answer.maxLength=2000;answer.value=answers[question.key]||'';
    const hint=node('p',question.hint,'muted');hint.id='grill-hint';answer.setAttribute('aria-describedby','grill-hint');
    let dirty=false;
    const flush=()=>{clearTimeout(timer);if(!dirty)return chain;const value=answers[question.key]||'';return persist(question.key,value).then(result=>{if(answers[question.key]===value)dirty=false;return result;});};
    answer.addEventListener('input',()=>{dirty=true;answers[question.key]=answer.value;status.textContent='Alterações ainda não salvas…';clearTimeout(timer);timer=setTimeout(()=>{flush().catch(()=>{});},400);});
    answer.addEventListener('blur',()=>{if(dirty)flush().catch(()=>{});});
    const choices=node('div',undefined,'interview-actions');
    for(const choice of question.choices){const pick=node('button',choice,'button');pick.type='button';pick.onclick=()=>{answer.value=answer.value?`${answer.value}\n${choice}`:choice;answer.dispatchEvent(new Event('input'));answer.focus();};choices.append(pick);}
    const help=node('button','Não sei — me ajude','button');help.type='button';help.onclick=()=>{hint.textContent=`Vamos simplificar: ${question.hint} Você pode escrever “Ainda não sei” e revisar depois. As opções acima são sugestões, não decisões tomadas por você.`;};
    const actions=node('div',undefined,'interview-actions'),back=node('button','Voltar','button'),next=node('button',index===5?'Salvar e revisar':'Salvar resposta e avançar','button primary');back.type='button';back.disabled=index===0;next.type='submit';
    async function move(delta){next.disabled=true;back.disabled=true;try{await flush();index+=delta;draw();panel.querySelector('textarea')?.focus();}catch{}finally{next.disabled=false;back.disabled=index===0;}}
    back.onclick=()=>move(-1);form.onsubmit=event=>{event.preventDefault();move(1);};actions.append(back,next);
    form.append(title,hint,answer,choices,help,actions,status);panel.append(form);
  }
  draw();return panel;
}
