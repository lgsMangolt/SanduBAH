export function plannerMessages(messages){
  const result=[];
  for(const [index,message]of messages.entries()){
    const prior=result.at(-1);
    const copy={...message,delivery:message.delivery==='sending'?'failed':message.delivery};
    if(copy.delivery==='sent'&&messages[index+1]?.role==='assistant'){copy.delivery='answered';copy.receipt='read';}
    if(copy.role==='user'&&prior?.role==='user'&&copy.text===prior.text&&copy.delivery!=='sent'&&prior.delivery!=='sent')result[result.length-1]=copy;
    else result.push(copy);
  }
  return result;
}
export function createPlannerSessions(storage,onError=()=>{}){
  const cache=new Map();let warned=false;
  const key=projectId=>`sandubah-planner-session:${projectId||'new'}`;
  function failed(){if(!warned){warned=true;onError('Não foi possível salvar a conversa no disco. Ela continua aberta nesta sessão; mantenha o aplicativo aberto.');}}
  return {
    active(){try{return storage.getItem('sandubah-planner-active')||'';}catch{return '';}},
    activate(projectId){try{storage.setItem('sandubah-planner-active',projectId);}catch{failed();}},
    load(projectId){
      if(cache.has(projectId))return structuredClone(cache.get(projectId));
      try{
        const value=JSON.parse(storage.getItem(key(projectId))||'null');
        if(value?.version===1&&Array.isArray(value.history)&&Array.isArray(value.messages)&&value.history.every(item=>['user','assistant'].includes(item.role)&&typeof item.content==='string')&&value.messages.every(item=>['user','assistant'].includes(item.role)&&typeof item.text==='string')){cache.set(projectId,value);return structuredClone(value);}
      }catch{failed();}
      return null;
    },
    save(projectId,value){
      const snapshot=structuredClone({...value,version:1});cache.set(projectId,snapshot);
      try{storage.setItem(key(projectId),JSON.stringify(snapshot));}catch{failed();}
    },
  };
}
