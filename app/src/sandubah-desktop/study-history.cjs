'use strict';
const {createHash}=require('node:crypto');
const stopWords=new Set('a as o os de da das do dos e em no nos na nas um uma uns umas para por com sobre como quero estudar estude estudo estudos aprender'.split(' '));
function topicKey(topic){return topic.trim().split(/(https?:\/\/\S+)/i).map(part=>{if(/^https?:\/\//i.test(part)){try{return new URL(part).href;}catch{return part;}}return part.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');}).join('');}
function tokens(topic){return new Set((topicKey(topic).match(/[a-z0-9+#]+/g)||[]).filter(word=>word.length>1&&!stopWords.has(word)));}
function findStudyMatches(studies,topic,{scope,targetProjectId},sourceId){
  const key=topicKey(topic),query=tokens(topic),candidates=[];
  for(const record of studies){
    if(typeof record.topic!=='string')continue;
    const recordScope=record.scope||'project',recordProject=recordScope==='project'?(record.targetProjectId||record.id):null;
    if(recordScope!==scope||recordProject!==targetProjectId)continue;
    const exact=topicKey(record.topic)===key,words=tokens(record.topic),common=[...query].filter(word=>words.has(word)).length;
    const score=common/(query.size+words.size-common||1);
    if(!exact&&(!common||score<0.5))continue;
    candidates.push({id:record.id,topic:record.topic,kind:record.kind==='notebook'?'notebook':'legacy',match:exact?'exact':'similar',sameSource:(record.sourceId||null)===(sourceId||null),scope:recordScope,targetProjectId:recordProject,type:record.type||'other',createdAt:record.createdAt||null,score});
  }
  candidates.sort((first,second)=>Number(second.match==='exact')-Number(first.match==='exact')||Number(second.kind==='notebook')-Number(first.kind==='notebook')||Number(second.sameSource)-Number(first.sameSource)||second.score-first.score||(second.createdAt||'').localeCompare(first.createdAt||'')||first.id.localeCompare(second.id));
  const fingerprint=createHash('sha256').update(JSON.stringify({key,scope,targetProjectId,sourceId:sourceId||null,candidates})).digest('hex');
  return {matches:candidates.slice(0,5).map(({score,...candidate})=>candidate),fingerprint,total:candidates.length};
}
module.exports={topicKey,findStudyMatches};
