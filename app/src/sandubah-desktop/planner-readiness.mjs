export function plannerReadiness({cloud,ready=false,action='plan',projectName='',statusError=null}={}) {
  const selection=cloud?.selection,provider=selection?.provider;
  const account=cloud?.providers?.find(item=>item.id===provider);
  const model=account?.models?.find(item=>item.id===selection?.model);
  const local=provider==='local',building=action==='code';
  const supported=['codex','claude','local'].includes(provider);
  const modelAvailable=Boolean(model&&(selection?.effort==null||model.effortLevels?.includes(selection.effort)));
  let reason='';
  if(statusError)reason='Não foi possível conferir a IA. Reabra esta aba para consultar novamente; nada será enviado.';
  else if(!supported)reason='Escolha uma IA antes de continuar.';
  else if(building&&provider!=='codex')reason='Para construir nesta integração, escolha Codex explicitamente ou volte a planejar. Sua IA e seu projeto não serão trocados automaticamente.';
  else if(!local&&!account?.installed)reason='A CLI desta IA não foi encontrada. Confira a instalação em Configurações; nenhum download será iniciado aqui.';
  else if(!local&&!account?.authenticated)reason='Não encontramos um login local desta IA. Conecte sua própria conta pelo tutorial; não cole chaves no chat.';
  else if(!local&&!modelAvailable)reason='O modelo ou a força não está no catálogo disponível. Revise sua escolha; não usaremos outro modelo no lugar.';
  else if(!ready)reason=local?'Esta IA local ainda precisa da validação indicada no painel. Confira também a memória disponível.':'A configuração desta IA ainda não está disponível. Confira o painel antes de tentar novamente.';
  const canSubmit=!reason;
  return {
    canSubmit,reason,building,
    title:canSubmit?'Próximo passo: revisar e confirmar':'Antes de continuar',
    cost:local?'Sem cobrança de provedor nesta inferência local; depende de hardware, memória e energia.':'SanduBAH gratuito; a conta de IA pode consumir assinatura, créditos ou cota. Tokens reais aparecem depois, quando informados pelo provedor.',
    scope:building?'Cria e testa arquivos no workspace deste projeto, com um worker. Alterações aqui não são publicação nem aplicação automática na pasta original.':'Produz uma conversa ou plano. Planejar não cria nem testa o aplicativo; construção é uma ação separada.',
    media:'Vídeos são referências por quadros selecionados, com áudio não analisado. Anexar não significa analisar o vídeo inteiro nem renderizar um novo vídeo.',
    checks:[
      {id:'model',label:'IA escolhida',state:supported&&(local||modelAvailable)?'found':'pending',detail:local?'IA neste PC · modelo indicado no painel local':`${provider==='codex'?'Codex':provider==='claude'?'Claude':'IA não selecionada'}${model?' · '+model.name:''}`},
      {id:'account',label:local?'Validação local':'Conta e acesso',state:local?(ready?'found':'pending'):account?.installed&&account?.authenticated?'unverified':'pending',detail:local?'A validação do modelo e a memória são conferidas antes da execução.':'Encontrar a CLI e um arquivo de login não comprova autenticação válida, cota ou acesso ao modelo. O provedor confirma isso somente no envio autorizado.'},
      {id:'project',label:'Seu projeto',state:projectName?'found':'pending',detail:projectName?`${projectName} · trocar a IA mantém a conversa e os Markdown neste projeto.`:'Nova ideia. Planejar mantém o rascunho; construir prepara um projeto e uma missão pendente antes da confirmação.'},
      {id:'review',label:'Seu controle',state:'unverified',detail:'Mensagem, contexto e execução continuam sujeitos às confirmações existentes. Cancelar não chama o modelo; uma missão já preparada pode continuar pendente.'},
    ],
  };
}

export function createPlannerReadiness({container,onChoose,onPlan}) {
  const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  container.className='planner-start-check';
  container.setAttribute('aria-label','Conferência antes de enviar');
  const title=element('strong','planner-start-title');
  const reason=element('p','planner-start-reason');reason.id='planner-start-reason';reason.setAttribute('role','status');
  const scope=element('p','planner-start-scope');
  const buttons=element('div','planner-start-actions');
  const choose=element('button','button subtle','Conferir minha IA');choose.type='button';choose.addEventListener('click',onChoose);
  const plan=element('button','button subtle','Voltar a planejar');plan.type='button';plan.addEventListener('click',onPlan);buttons.append(choose,plan);
  const details=element('details','planner-start-details');
  details.append(element('summary','','O que acontece ao enviar?'));
  const checks=element('ul','planner-start-list'),cost=element('p',''),media=element('p','');
  details.append(checks,cost,media);container.append(title,reason,scope,buttons,details);
  return {update(input,locked=false){
    const view=plannerReadiness(input);
    container.dataset.state=view.canSubmit?'review':'pending';
    title.textContent=view.title;reason.textContent=view.reason;reason.hidden=!view.reason;scope.textContent=view.scope;
    choose.disabled=locked;plan.disabled=locked;plan.hidden=!view.building;
    cost.textContent=view.cost;media.textContent=view.media;checks.replaceChildren();
    for(const check of view.checks){const item=element('li','');item.dataset.check=check.id;item.dataset.state=check.state;item.append(element('strong','',check.label),element('span','',check.detail));checks.append(item);}
    return view;
  }};
}
