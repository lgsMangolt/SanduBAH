export function createConnections({api,container,navigate,getStatus}){
  const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
  const toolbar=node('div',undefined,'world-toolbar'),refresh=node('button','Verificar conexões','button'),status=node('p','','muted'),grid=node('div',undefined,'connections-grid');refresh.type='button';status.setAttribute('role','status');toolbar.append(refresh);
  container.append(node('h2','Suas conexões'),node('p','O que está disponível, o que foi detectado e o que ainda precisa ser conectado. Detectar um login não comprova acesso ao modelo.','muted'),toolbar,status,grid);
  function card(title,state,description,action,label){const item=node('article',undefined,'world-card connection-card');item.append(node('h3',title),node('strong',state),node('p',description,'muted'));if(action){const button=node('button',label,'button');button.type='button';button.onclick=async()=>{button.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};item.append(button);}grid.append(item);}
  let visible=false,busy=false;
  async function refreshStatus(){
    if(busy)return;busy=true;refresh.disabled=true;status.textContent='Consultando disponibilidade local…';grid.replaceChildren();
    try{
      const planner=await api.plannerStatus(),models=await api.modelsStatus(),brain=await api.knowledge({action:'status'}),mcp=getStatus();
      card('Motor local · MCP',mcp.connected?'Conectado':'Desconectado','Conexão local por stdio. Não usa nem altera o gateway.',async()=>{await api.connect();await refreshStatus();},'Conectar MCP');
      for(const provider of planner.cloud.providers)card(provider.name,provider.installed?(provider.authenticated?'CLI e login detectados':'CLI detectada · falta login'):'CLI não encontrada',provider.installed?'O acesso efetivo e a cota dependem da conta; a verificação do modelo acontece após confirmar um envio.':'Ainda pode ser configurado. Nenhuma instalação ou autenticação será iniciada automaticamente.',()=>navigate('planner'),'Escolher IA em Novo projeto');
      for(const model of models.models)card(model.name,model.ready?'Validação local aprovada':model.installed?'Instalado · validação pendente':model.downloaded?'Baixado · falta preparar':model.supported?'Disponível para instalar':'Incompatível neste perfil',model.reason||'A instalação e os testes mantêm confirmação e um worker.',()=>navigate('planner'),'Ver modelos locais');
      for(const source of brain.sources)card(source.name,'Fonte local indexada',`${source.documents} Markdown. Leitura local; isso não é uma conexão com a nuvem.`,()=>navigate('brain'),'Ver no cérebro');
      card('Perplexity','Disponível pela web · API não conectada','Pesquisas abrem no navegador após confirmação. Nenhuma chave de API configurada por este painel.',()=>navigate('brain'),'Abrir área do cérebro');
      status.textContent=`Verificado às ${new Date().toLocaleTimeString('pt-BR')}. Nenhuma consulta a modelo foi iniciada.`;
    }catch(error){status.textContent=`Consulta incompleta: ${error.message}. Não presumimos que as conexões estejam ativas.`;}finally{busy=false;refresh.disabled=false;}
  }
  refresh.onclick=refreshStatus;api.onState(()=>{if(visible&&!busy)refreshStatus();});
  return {show(view){visible=view==='connections';container.hidden=!visible;if(visible)refreshStatus();}};
}
