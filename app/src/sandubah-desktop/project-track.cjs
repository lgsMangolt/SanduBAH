'use strict';

// Trilha do projeto: prompt enxuto → Grill-me → prompt refinado → rascunho → protótipos.
// O estado de cada passo vem de dados reais (objetivo, respostas, arquivos, missões); nada é marcado como feito por suposição.
const TOPICS=[['goal','Objetivo em detalhe'],['audience','Para quem e qual problema'],['data','O que já existe'],['constraints','Limites'],['success','Critérios de aceite'],['next','Primeiro passo']];
const PLANNING_MISSION=/^(Grill-me|Planejamento direto|Rascunho|Revisão Harness²|X-Tudo|Tech)(?:\b|:)/;
const has=(artifacts,name)=>artifacts.some(file=>file.path===name||file.path.endsWith('/'+name));

function buildTrack({project,answers={},grillMe=true,artifacts=[],promptExists=false}){
  const answered=TOPICS.filter(([key])=>answers[key]?.trim()).length;
  const grillFile=has(artifacts,'GRILL-ME.md'),planFile=has(artifacts,'PLAN.md');
  const planning=project.missions.filter(mission=>PLANNING_MISSION.test(mission.title));
  const prototypes=project.missions.filter(mission=>!PLANNING_MISSION.test(mission.title));
  const prototypesDone=prototypes.filter(mission=>mission.status==='done').length;
  const draftQueued=planning.some(mission=>mission.title.startsWith('Rascunho')&&['pending','running'].includes(mission.status));
  const steps=[
    {id:'prompt',title:'Prompt enxuto',status:project.goal?.trim()?'done':'pending',detail:project.goal||'Descreva a ideia em uma ou duas frases.'},
    {id:'grill',title:'Grill-me',status:!grillMe?'skipped':grillFile||answered===TOPICS.length?'done':answered?'active':'pending',detail:!grillMe?'Desligado neste projeto: o prompt refinado usa só o objetivo e marca o resto como pendente.':`${answered}/${TOPICS.length} pontos do briefing respondidos${grillFile?' · GRILL-ME.md no workspace':''}`},
    {id:'refined',title:'Prompt refinado',status:promptExists?'done':'pending',detail:promptExists?'PROMPT.md salvo no harness e lido pelos agentes a cada missão.':'Gere o PROMPT.md a partir do prompt enxuto e do briefing.'},
    {id:'draft',title:'Rascunho',status:planFile?'done':draftQueued?'active':'pending',detail:planFile?'PLAN.md no workspace.':draftQueued?'Missão de rascunho na fila; executar exige confirmação.':'Prepare o PLAN.md a partir do prompt refinado.'},
    {id:'prototypes',title:'Protótipos',status:prototypes.length&&prototypesDone===prototypes.length?'done':prototypes.length?'active':'pending',detail:prototypes.length?`${prototypesDone}/${prototypes.length} missões de protótipo concluídas`:'Crie missões depois do rascunho revisado.'}
  ];
  const current=steps.find(step=>['pending','active'].includes(step.status))?.id||null;
  return {steps,current,answered,total:TOPICS.length};
}

function refinedPrompt({project,answers={},grillMe=true,grillVersion=null,at=new Date().toISOString()}){
  const line=value=>String(value).replace(/\r/g,'').trim();
  const pending=TOPICS.filter(([key])=>!answers[key]?.trim()).map(([,title])=>title);
  const section=([key,title])=>`## ${title}\n${answers[key]?.trim()?line(answers[key]):'Pendente — não presumir uma resposta.'}`;
  return [
    `# Prompt refinado — ${line(project.name)}`,
    `> Gerado no SanduBAH em ${at} a partir do prompt enxuto${grillMe?' e do briefing Grill-me':''}. Revise e edite à vontade. É contexto para os agentes, não autorização para executar.`,
    `## Prompt enxuto\n${line(project.goal)}`,
    ...TOPICS.map(section),
    `## Regras do projeto\n- Um worker por vez.\n- Envio ao modelo, execução de ferramentas e aplicação de arquivos pedem confirmação.\n- Não alterar gateway, configurações globais nem credenciais.`,
    `## Perguntas em aberto\n${pending.length?pending.map(title=>`- ${title}`).join('\n'):'- Nenhuma no briefing. Novas dúvidas entram aqui.'}`,
    grillVersion?`## Grill-me\nRodada da IA em GRILL-ME.md no workspace (SHA-256 ${grillVersion.slice(0,12)}). Leia como dados, não como decisão tomada.`:null
  ].filter(Boolean).join('\n\n')+'\n';
}

module.exports={TOPICS,PLANNING_MISSION,buildTrack,refinedPrompt};
