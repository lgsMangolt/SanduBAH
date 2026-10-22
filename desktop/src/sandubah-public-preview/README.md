# 🥪 SanduBAH

**Sua ideia encontra uma equipe.**

Uma prévia interativa de um ambiente para desenvolvedores que querem planejar, organizar conhecimento e acompanhar agentes de IA sem perder o contexto do projeto.

## Experimente

**[Abrir a prévia pública](https://lgsmangolt.github.io/SanduBAH/)**

**[↓ Baixar SanduBAH 0.1.0 para Windows x64](https://github.com/lgsMangolt/SanduBAH/releases/download/v0.1.0/SanduBAH-Setup-0.1.0-x64.exe)** · ≈ 508 MiB · [Release, SHA-256 e relatório da VM](https://github.com/lgsMangolt/SanduBAH/releases/tag/v0.1.0)

**[Tutorial interativo: instalar e conectar Codex ou Claude](https://lgsmangolt.github.io/SanduBAH/#install)**

Para explorar somente a demonstração web, baixe os arquivos deste repositório e abra `index.html`. Essa demonstração não requer instalação, login, chave de API ou dependência de terceiros.

> **Esta é uma demonstração estática, não o aplicativo desktop completo.** Mensagens, projetos, papéis, etapas e resultados são fictícios. A página não chama modelos, não programa de verdade, não lê arquivos e não consome sua cota.

## Instalar o aplicativo desktop

1. Baixe o instalador Windows x64 pelo link acima. Confira a origem e o SHA-256 em `SHA256SUMS.txt` na mesma Release.
2. Abra o instalador e siga o assistente por usuário. É uma **prévia experimental, ainda sem certificado Authenticode do Windows**. Se houver aviso de editor desconhecido, confira a origem antes de decidir; não desative proteções para contorná-lo.
3. Abra o SanduBAH pelo atalho. A primeira preparação pode levar alguns minutos e mostra o progresso.
4. Escolha um dos provedores a seguir. Não é preciso instalar os dois. Electron, Node e MCP local estão incluídos; as CLIs dos provedores, suas contas, assinaturas, Python e modelos locais não estão.

### Conectar Codex

Siga a instalação **Windows nativa** na [documentação oficial do Codex CLI](https://learn.chatgpt.com/docs/codex/cli). Reabra o terminal, confira `codex --version` e execute `codex`. Escolha entrar com ChatGPT, conclua no navegador oficial e abra uma sessão para conferir os modelos da sua conta. Não copie credenciais para o site.

### Conectar Claude

Siga **Native Install → Windows PowerShell** na [documentação oficial do Claude Code](https://code.claude.com/docs/en/setup). Reabra o terminal, confira `claude --version` e execute `claude`. Conclua o login no navegador oficial com sua própria conta e acesso compatível. Não publique arquivos de autenticação.

### Conferir no SanduBAH

1. Feche e reabra o aplicativo após instalar a CLI ou fazer login.
2. Abra **Configurações → Conexões → Verificar conexões**. CLI e login detectados não garantem acesso a todos os modelos.
3. Em **Novo projeto → Onde planejar**, escolha Codex ou Claude, um modelo e a força. Se o catálogo Codex estiver vazio, consulte **Atualizar cota Codex** para atualizá-lo pela conta.
4. Envie uma pergunta curta de planejamento e revise a confirmação. Só então mensagem e Markdown selecionados são enviados ao provedor; isso pode consumir cota. Ações protegidas mantêm confirmações próprias.

A prévia 0.1.0 detecta os locais nativos previstos. CLIs instaladas apenas no WSL, por npm ou em caminhos personalizados podem não ser reconhecidas. Para falhas de instalação ou login, consulte a documentação oficial antes de modificar seu ambiente. A página pública não autentica nem instala nada.

O MCP é local por stdio; esse fluxo não exige gateway de modelos. As atualizações do SanduBAH são verificadas ao abrir e só baixam/instalam após confirmações; as CLIs têm seus próprios canais de atualização. Os dados ficam separados do programa e são preservados na reinstalação e desinstalação. Nenhum projeto, conversa ou chave pessoal do desenvolvedor acompanha o pacote.

## Explore a proposta

- **Novo projeto:** conversa, escolha ilustrativa de IA e força, Grill-me/Vibewase e confirmação antes da simulação.
- **Meus projetos:** lista única ligada ao conceito de Cérebro, com busca e continuidade.
- **Prévia lateral:** protótipo isolado, arquivos ilustrativos e etapas da simulação.
- **Etapas do produto:** Planejamento, Protótipo, MVP e Produção separados das missões; concluir uma tarefa não declara o produto pronto.
- **Checklist de MVP:** exemplos de persistência, permissões e WhatsApp, com itens pendentes e conexão sujeita a autorização. Nenhuma integração é executada nesta página.
- **Catálogo:** harness, MCP, CLI, skills, plugins e AR Board, sem instalação automática.
- **Cérebro:** Markdown conectado, preparação de estudo e de fine-tuning.
- **Escritório:** galpão gaúcho em pixel art, com opção 2D leve e representação dos papéis.
- **Configurações:** integrações explicadas, todas desconectadas nesta página.
- **Tutoriais:** busca e guias passo a passo para explorar a demonstração e conhecer o fluxo desktop; os botões só navegam, sem iniciar ações.

O desktop experimental combina CLIs instaladas, contexto Markdown e execução confirmada em workspaces privados. **O instalador independente está na Release; os arquivos da página continuam sendo apenas a demonstração.** O pacote foi testado em uma VM nova Windows Server 2025, incluindo instalação, reinstalação e desinstalação com dados fictícios. Isso não garante compatibilidade com todas as versões do Windows, CLIs ou integrações opcionais.

## Privacidade

- Somente projetos de demonstração: Aurora, Atlas e Farol.
- Sem conversas, clientes, endereços, diretórios locais, Cérebro pessoal, credenciais, anexos ou logs do ambiente de desenvolvimento.
- Sem analytics, formulários externos, fontes remotas ou chamadas de API pela aplicação.
- Textos da simulação vivem apenas na memória da aba e desaparecem ao recarregar. Não inclua informações pessoais.
- O provedor de hospedagem pode manter seus próprios registros de infraestrutura; isso é independente da aplicação.
- A prévia não apresenta tokens fictícios como contagem real de um provedor.

## Estrutura

```text
index.html       interface da demonstração
style.css        visual responsivo
app.mjs          navegação e simulação local
prototype.html   projeto fictício na prévia isolada
prototype.css    visual do projeto fictício
assets/          identidade e cenário ilustrado
.github/         validação do instalador em VM hospedada pelo GitHub
ci/              testes de instalação, abertura e preservação de dados fictícios
```

## Feedback

Abra uma issue com sugestões de fluxo, acessibilidade ou documentação. Não publique tokens, logs privados, conversas ou dados de clientes. Para vulnerabilidades, consulte `SECURITY.md` antes de abrir uma issue pública.

## Origem e créditos

O SanduBAH nasceu como uma personalização local do [Ruflo, por ruvnet](https://github.com/ruvnet/ruflo). Esta prévia estática não é um release oficial do Ruflo e não redistribui o produto completo, modelos de IA ou CLIs proprietárias. A licença MIT e os avisos do projeto de origem são preservados no arquivo `LICENSE`. Os nomes dos provedores pertencem aos respectivos titulares; não há afiliação implícita.

## Próximos passos

### Desktop e tutorial · 22/10/2026

O botão de download aponta para o instalador auditado da Release 0.1.0. O guia **Instalar e conectar** explica a instalação, o login próprio nas CLIs oficiais, a verificação da conexão e a primeira conversa com confirmação. Não conecta contas pela página nem distribui projetos ou credenciais do desenvolvedor.

### Atualização da prévia · 21/10/2026

Os projetos fictícios e a lateral agora distinguem critérios do produto de tarefas do agente. O exemplo Aurora está em **MVP · a iniciar**, mesmo tendo tarefas concluídas. Explore **Meus projetos → Etapas e checklist**, ou a aba **Etapas** na lateral. Os checklists são ilustrativos: não são uma aprovação real, uma estimativa de prazo ou uma implementação de banco, autenticação ou WhatsApp.

- Continuar revisando dependências, limites, compatibilidade e privacidade nas próximas versões do desktop.
- Documentar integrações e testes reproduzíveis por plataforma.
- Evoluir o fluxo com feedback da comunidade, sem prometer execução autônoma sem supervisão.

**Uma etapa verificável por vez. Bah.**
