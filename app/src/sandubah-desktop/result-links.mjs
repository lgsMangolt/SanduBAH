const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);

export function resultActions(item){
  if(!item||item.kind==='test'||item.title==='Teste SanduBAH')return [];
  if(validId(item.projectId)){
    const missions=Array.isArray(item.missionIds)&&item.missionIds.length>0&&item.missionIds.every(validId);
    return [{mode:missions?'result':item.view==='planner'?'conversation':'project',label:missions?'Ver resultado':item.view==='planner'?'Ver conversa':'Abrir projeto'},{mode:'files',label:'Abrir arquivos'}];
  }
  if(item.kind==='planning'&&item.view==='planner'&&item.projectId==='')return [{mode:'conversation',label:'Ver conversa'}];
  return [];
}
