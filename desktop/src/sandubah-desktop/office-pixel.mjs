export const officeThemes={galpao:'Galpão · desenvolvimento',biblioteca:'Biblioteca · pesquisa',laboratorio:'Laboratório · testes'};
export function officeBlocks(project){
  const blocks=[];
  for(let offset=0;offset<Math.max(1,project.agents.length);offset+=4)blocks.push({id:`${project.id}:${offset}`,agents:project.agents.slice(offset,offset+4),number:offset/4+1});
  return blocks;
}
export function officeHandoffs(previous,current){
  if(!previous)return [];
  return current.missions.flatMap(mission=>{
    const before=previous.missions.find(item=>item.id===mission.id),source=current.missions.find(item=>item.id===mission.dependsOn);
    if(mission.status!=='running'||before?.status==='running'||source?.status!=='done'||source.agentId===mission.agentId)return [];
    if(!current.agents.some(item=>item.id===source.agentId)||!current.agents.some(item=>item.id===mission.agentId))return [];
    return [{id:`${mission.id}:${mission.startedAt||mission.runId||'start'}`,from:source.agentId,to:mission.agentId,title:source.title}];
  });
}
