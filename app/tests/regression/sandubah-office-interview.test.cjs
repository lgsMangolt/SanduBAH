'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
test('interview adapts to integrations, study and constraints without model calls',async()=>{
  const {interviewQuestion}=await import('../../src/sandubah-desktop/interview.mjs');
  assert.match(interviewQuestion(2,{goal:'Integrar WhatsApp'}).title,/integrações/);
  assert.match(interviewQuestion(2,{goal:'Estudar RAG'}).title,/fontes/);
  assert.match(interviewQuestion(3,{data:'PC local'}).hint,/RAM/);
  assert.match(interviewQuestion(4,{goal:'Estudar'}).title,/estudo/);
  assert.match(interviewQuestion(5,{constraints:'Sem custo'}).hint,/Sem custo/);
});
test('office uses mission evidence and distinguishes idle, pending, unknown and running',async()=>{
  const {officeAgentState}=await import('../../src/sandubah-desktop/office.mjs');
  const agent={id:'agent'},project={missions:[]};assert.equal(officeAgentState(project,agent).status,'idle');
  project.missions.push({id:'first',agentId:'agent',status:'unknown'});assert.match(officeAgentState(project,agent).label,/não confirmado/);
  project.missions.push({id:'second',agentId:'agent',status:'pending'});assert.match(officeAgentState(project,agent).label,/confirmação/);
  project.missions.push({id:'third',agentId:'agent',status:'running'});assert.equal(officeAgentState(project,agent).mission.id,'third');
  assert.equal(officeAgentState(project,{id:'other'}).status,'idle');
});
