// Histórico de versões do workspace: o que mudou, salvar uma versão com mensagem no padrão de commits e voltar a uma versão.
export const versionTypes=[['feat','Nova funcionalidade'],['fix','Correção'],['docs','Documentação'],['style','Visual'],['refactor','Reorganização'],['test','Testes'],['chore','Manutenção']];
const stateLabels={new:'novo',modified:'alterado',deleted:'removido'};
const node=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
const button=(text,action,className='button')=>{const value=node('button',className,text);value.type='button';value.addEventListener('click',action);return value;};

export function versionLine(version){
  const files=version.files.length;
  return `${new Date(version.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} · +${version.added} −${version.removed} · ${files} ${files===1?'arquivo':'arquivos'}`;
}

export function createProjectHistory({api,projectId,run,notify,output,isBusy=()=>false}){
  const section=node('section','world-card project-history');section.setAttribute('aria-label','Histórico de versões');
  let state=null;
  async function load(){state=await api.history({action:'status',id:projectId});draw();}
  function draw(){
    section.replaceChildren();
    section.append(node('h3','','Histórico de versões'),node('p','muted','Cada versão guarda o workspace inteiro com uma mensagem do que mudou. Fica só neste PC, num git local fora do workspace.'));
    const pending=state.changes;
    const changes=node('details','project-history-changes');changes.open=pending.length>0&&pending.length<=8;
    changes.append(node('summary','',pending.length?`${pending.length} ${pending.length===1?'mudança':'mudanças'} sem versão`:'Nenhuma mudança desde a última versão'));
    const list=node('ul','project-history-files');for(const change of pending.slice(0,200)){const item=node('li');item.append(node('code','',change.path),node('span',`project-history-state is-${change.state}`,stateLabels[change.state]));list.append(item);}
    if(pending.length>200)list.append(node('li','muted',`E mais ${pending.length-200} arquivos.`));
    changes.append(list);section.append(changes);
    section.append(form(pending.length),github());
    const versions=node('ol','project-history-versions');versions.setAttribute('aria-label','Versões salvas');
    if(!state.versions.length)versions.append(node('li','muted','Nenhuma versão salva ainda.'));
    state.versions.forEach((version,index)=>{
      const item=node('li','project-history-version'),head=node('div','project-history-head');
      head.append(node('span','project-history-number',`v${version.number}`),node('strong','',version.subject),node('span','muted',versionLine(version)));
      item.append(head);if(version.note)item.append(node('p','project-history-note',version.note));
      const actions=node('div','project-history-actions');
      actions.append(button('Ver mudanças',run(async()=>{const shown=await api.history({action:'show',id:projectId,hash:version.hash});output(`v${version.number} · ${version.subject}`,shown.truncated?`${shown.diff}\n\n[Diff com ${shown.bytes.toLocaleString('pt-BR')} bytes: mostrando os primeiros 200 KB. Veja o restante no git do harness.]`:shown.diff||'Sem diferenças de texto.');})));
      if(index>0){const restore=button('Voltar para esta versão',run(async()=>{const result=await api.history({action:'restore',id:projectId,hash:version.hash});if(result.cancelled){notify('Nada foi alterado.');return;}state=result;notify(`Workspace igual à v${version.number}. Salve uma versão para registrar a volta.`);draw();}));restore.disabled=isBusy();actions.append(restore);}
      item.append(actions);versions.append(item);
    });
    section.append(versions);
  }
  function github(){
    const remote=state.remote,box=node('div','project-history-github');box.append(node('h4','','GitHub'));
    const connect=(label)=>{
      const wrapper=node('form','project-history-remote');const url=node('input','text-input');url.placeholder='https://github.com/usuario/projeto.git';url.id=`history-remote-${projectId}`;url.setAttribute('aria-label','Endereço do repositório no GitHub');
      const submit=node('button','button',label);submit.type='submit';submit.disabled=isBusy();wrapper.append(url,submit);
      wrapper.addEventListener('submit',event=>{event.preventDefault();run(async()=>{state=await api.history({action:'set-remote',id:projectId,url:url.value});notify('Repositório conectado. Nada foi enviado ainda.');draw();})();});
      return wrapper;
    };
    if(!remote.url){
      box.append(node('p','muted','Para guardar o projeto no GitHub: crie no site um repositório privado e vazio (sem README) e cole o endereço abaixo. O envio usa o seu login do git e sempre pede confirmação.'),connect('Conectar repositório'));
      return box;
    }
    const where=node('p','project-history-remote-url');where.append(node('span','muted','Repositório: '),node('code','',remote.web||remote.url),node('span','muted',` · branch ${remote.branch}`));box.append(where);
    const count=remote.pending.length;
    box.append(node('p','muted',count?`${count} ${count===1?'versão ainda não enviada':'versões ainda não enviadas'}${remote.pushed?'':' (primeiro envio)'}.`:'Tudo enviado: o GitHub está igual à última versão salva.'));
    const actions=node('div','project-history-actions');
    const push=button('Enviar ao GitHub',run(async()=>{const result=await api.history({action:'push',id:projectId});if(result.cancelled){notify('Envio cancelado. Nada saiu deste PC.');return;}state=result;notify(`${result.sent} ${result.sent===1?'versão enviada':'versões enviadas'} ao GitHub.`);draw();}),'button primary');push.disabled=isBusy()||!count||!state.versions.length;
    const change=button('Trocar repositório',()=>{actions.replaceWith(connect('Salvar novo endereço'));});
    const disconnect=button('Desconectar',run(async()=>{state=await api.history({action:'remove-remote',id:projectId});notify('Repositório desconectado deste projeto. Nada foi apagado no GitHub.');draw();}));disconnect.disabled=isBusy();
    actions.append(push,change,disconnect);box.append(actions);
    return box;
  }
  function form(pendingCount){
    const container=node('form','project-history-form');const next=state.versions.length+1;
    const type=node('select');type.id=`history-type-${projectId}`;for(const [value,label] of versionTypes){const option=node('option','',`${label} (${value})`);option.value=value;type.append(option);}
    const summary=node('input','text-input');summary.maxLength=72;summary.placeholder='O que mudou, em uma linha';summary.id=`history-summary-${projectId}`;
    const note=node('textarea','text-input');note.maxLength=500;note.rows=2;note.placeholder='Nota opcional: por que mudou, o que falta';
    const preview=node('code','project-history-preview');const counter=node('span','muted');
    const update=()=>{preview.textContent=`${type.value}: ${summary.value.trim()||'…'}`;counter.textContent=`${summary.value.length}/72`;};
    type.addEventListener('change',update);summary.addEventListener('input',update);update();
    const label=(text,input)=>{const wrapper=node('label','project-history-field');wrapper.append(node('span','field-label',text),input);return wrapper;};
    const save=node('button','button primary',`Salvar versão ${next}`);save.type='submit';save.disabled=isBusy()||!pendingCount;
    const row=node('div','project-history-row');row.append(label('Tipo',type),label('Resumo',summary));
    const meta=node('div','project-history-meta');meta.append(node('span','muted','Mensagem: '),preview,counter);
    container.append(row,label('Nota',note),meta,save);
    container.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.history({action:'save',id:projectId,input:{type:type.value,summary:summary.value,note:note.value}});state=result;notify(`Versão ${result.saved.number} salva: ${result.saved.subject}${result.promptSynced?' · PROMPT.md copiado para o workspace':''}`);draw();})();});
    return container;
  }
  run(load)();
  return section;
}
