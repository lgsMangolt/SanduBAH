# Instalador independente do SanduBAH

## Separação de dados

O instalador Windows x64 contém Electron, Node, interface e a CLI/MCP compilada desta cópia local. Não contém harnesses, Cérebro, conversas, projetos, modelos, Python/AirLLM, configurações globais ou credenciais do desenvolvedor.

O programa é instalado por usuário em `%LOCALAPPDATA%/Programs/SanduBAH`. Dados e código de trabalho ficam em `%LOCALAPPDATA%/SanduBAH/workspace`. O desinstalador não remove os dados. A inicialização atualiza somente arquivos de código pertencentes ao manifesto anterior, com verificação de hash, backup e recuperação. Código personalizado bloqueia a substituição em vez de ser descartado.

A primeira abertura prepara os arquivos locais e pode levar alguns minutos. Uma janela mostra as etapas e o progresso. Nas aberturas seguintes, a mesma imagem já preparada é reaproveitada.

Codex e Claude precisam de CLIs e autenticação da própria pessoa. Modelos locais e integrações opcionais exigem preparação adicional; o instalador não transfere contas, não prepara GPU e não inclui todos os módulos nativos opcionais do Ruflo. A auditoria de dependências identifica os componentes não incluídos.

## Atualização com confirmação

Ao abrir normalmente, o processo principal consulta o canal público de Releases do repositório `lgsMangolt/SanduBAH`. Não usa o gateway, não envia conteúdo de projetos nem credenciais e não permite que a página carregue HTTP. Uma falha de rede não impede o aplicativo de abrir.

1. Confere versão, origem e assinatura Ed25519 do manifesto público.
2. Mostra novidades e tamanho. O download só começa depois da confirmação.
3. Confere tamanho e SHA-256 do instalador baixado.
4. Pede outra confirmação antes de fechar somente o SanduBAH e abrir o assistente de instalação.

Não há instalação silenciosa. Durante uma tarefa, a atualização fica bloqueada. A inexistência de Releases é mostrada como “nenhuma versão desktop publicada”, e não como uma atualização instalada. A demonstração web no GitHub Pages não é o canal de atualização do desktop.

A chave privada **nova e exclusiva de publicação** é cifrada com DPAPI para o usuário atual do Windows e fica fora do pacote em `build/sandubah/publisher/signing-key.dpapi`. Somente a chave pública entra no instalador. Perder essa chave requer um plano de rotação e distribuição de uma nova versão confiável; não basta trocar a chave do feed remoto.

## Construir e testar

Execute na cópia local, uma tarefa por vez:

```powershell
& './build/sandubah/gui/node/node.exe' --test --test-concurrency=1 tests/sandubah-distribution.test.cjs
& './build/sandubah/gui/node/node.exe' scripts/build-sandubah-installer.cjs
& './build/sandubah/gui/node/node.exe' scripts/test-sandubah-installer.cjs
& './build/sandubah/gui/node/node.exe' scripts/audit-sandubah-distribution.cjs
```

A construção usa o Electron já preparado e o `electron-builder` instalado no diretório pai do workspace de desenvolvimento. O usuário final não precisa desses arquivos. Nunca instala ou publica automaticamente. `build/sandubah/distribution/latest-build.json` aponta para os artefatos locais e seus hashes.

O teste abre o executável empacotado em uma pasta temporária fora do repositório, com HOME fictício, sem os módulos Node originais no caminho. Verifica o MCP stdio real, catálogo, interface, persistência de canários fictícios e ausência de dados privados. Testes unitários cobrem download cancelado, assinatura inválida, adulteração, bloqueio de worker e recuperação de código. Isso **não equivale** a instalar/desinstalar em uma máquina virtual limpa.

## Publicar depois, mediante autorização

A publicação é uma etapa separada: revisar artefatos e licenças, testar instalação/atualização/desinstalação em VM Windows e publicar no mesmo Release `v<VERSÃO>` os arquivos `SanduBAH-Setup-<VERSÃO>-x64.exe`, `SanduBAH-update.json` e `SanduBAH-update.sig`. Sem esses três arquivos, o aplicativo não oferece a versão como atualização válida.

A assinatura Ed25519 do canal não é um certificado Authenticode do Windows. Enquanto não houver certificado de distribuição, o Windows poderá avisar que o editor do instalador é desconhecido. Não desative proteções para contornar esse aviso.

## Validação em VM e publicação autorizada

O fluxo em `src/sandubah-release-ci/` executa um único job em uma VM nova Windows Server 2025 hospedada pelo GitHub. A imagem tem ferramentas de desenvolvimento pré-instaladas; o aplicativo usa PATH isolado e HOME fictício. Os scripts recusam execução no computador local e recusam uma VM que já contenha SanduBAH ou seus dados.

O teste baixa o instalador auditado de uma Release em rascunho, confere seu SHA-256 e executa instalação NSIS por usuário, abertura normal com MCP stdio real, reinstalação, desinstalação, instalação novamente e desinstalação final. Verifica atalhos, registro do Windows e preservação de um projeto e um arquivo-canário de credencial inteiramente fictícios. Nenhum modelo é chamado. A consulta automática de atualização não baixa nem instala nada.

Somente mediante autorização para publicar, execute sequencialmente:

```powershell
& './build/sandubah/gui/node/node.exe' scripts/release-sandubah.cjs prepare
& './build/sandubah/gui/node/node.exe' scripts/release-sandubah.cjs start-validation
& './build/sandubah/gui/node/node.exe' scripts/release-sandubah.cjs status
& './build/sandubah/gui/node/node.exe' scripts/release-sandubah.cjs publish
```

`prepare` envia apenas três arquivos de CI ao repositório público autorizado, preservando a árvore existente, e coloca os artefatos auditados em um rascunho. A autenticação existente do Git Credential Manager fica somente na memória do processo. Nenhum projeto, perfil ou configuração pessoal é enviado. O controlador de testes offline é auditado e enviado temporariamente ao rascunho, sem contas ou perfis.

`start-validation` recusa outra VM ativa. `status` registra a execução correspondente ao commit atual. `publish` exige execução bem-sucedida e relatório vinculados ao commit e ao SHA-256 exatos do instalador; remove o controlador temporário e relatórios de tentativas falhas antes de tornar pública a Release. Uma falha conserva o rascunho e não autoriza publicação. Os artefatos finais são o instalador, manifesto público, assinatura, `SHA256SUMS.txt` e relatório bem-sucedido da VM.

Essa validação cobre a imagem Windows Server 2025 usada pelo GitHub, não todas as versões do Windows nem todas as integrações opcionais. Antes de atualizar a demonstração web, preserve os arquivos de CI; não substitua a árvore completa do repositório.

A versão 0.1.0 passou no [ciclo real em VM](https://github.com/lgsMangolt/SanduBAH/actions/runs/39719456000) e está na [Release pública](https://github.com/lgsMangolt/SanduBAH/releases/tag/v0.1.0). O relatório da VM acompanha o instalador. Após publicar, `scripts/verify-sandubah-release.cjs` verifica anonimamente os ativos públicos e o canal assinado real: a versão atual deve indicar `current` e uma versão fictícia anterior deve indicar `available`, sem baixar nem executar o instalador. A evidência local fica em `build/sandubah/distribution/public-release-validation.json`.

## Percurso pelo site até a conta do provedor

O fluxo adicional em `src/sandubah-journey-ci/` abre a página pública em um navegador novo na VM, clica no botão real de download, confere o SHA-256, segue o link do tutorial para a documentação oficial e instala o executável baixado. A instalação NSIS é automatizada com `/S /currentuser`; não é uma validação dos cliques do assistente nem dos avisos de reputação do Windows.

O teste instala a CLI nativa do Claude em um perfil vazio, confere sua assinatura Windows e versão, abre o SanduBAH normalmente e verifica MCP real, projetos vazios, atualização pública assinada, CLI detectada sem login e envio desabilitado sem autenticação. Nenhuma conta ou chave pessoal é transferida. O processo de teste recebe somente variáveis de ambiente permitidas; tokens do runner não são enviados ao navegador, ao aplicativo ou à CLI.

`scripts/run-sandubah-site-journey.cjs` oferece `prepare`, `start`, `status` e `collect`; o argumento seguinte escolhe `codex` ou `claude`. A preparação envia somente cinco arquivos de CI, preserva a página e a validação anterior da Release e nunca substitui seus ativos. A execução mantém um worker. A coleta confere a origem e o hash do artefato; somente relatório sanitizado e capturas da página pública e do painel vazio são preservados. URLs OAuth completas, códigos de autenticação, perfis e instaladores não entram nos artefatos. O checkpoint Codex usa `visitor-codex-github.json`, sem sobrescrever a evidência anterior do Claude.

Na [execução de 22/10/2026](https://github.com/lgsMangolt/SanduBAH/actions/runs/39726652842), download, instalação, Claude Code 2.1.308 com assinatura válida, atualização assinada e detecção local passaram. O provedor retornou **HTTP 403** ao abrir o OAuth em `claude.ai`. A autenticação e uma resposta real de modelo **não foram validadas**: `fullFlowPassed` permanece falso e o job registra falha, em vez de mascarar o bloqueio. A causa do 403 não foi presumida e nenhuma proteção foi contornada. O relatório local está em `build/sandubah/distribution/visitor-journey-validation.json`.

Para testar uma conversa autenticada seria necessário um fluxo autorizado para uma conta de testes; não reutilize as credenciais do desenvolvedor nem publique códigos de login. Consultas IPC assíncronas devem ser aguardadas fora de `waitForFunction`: nesta versão do controlador, uma Promise é avaliada como verdadeira antes de seu resultado, o que pode fazer o teste avançar enquanto a atualização ainda está em andamento.

### Resultado com Codex

Na [execução Codex de 22/10/2026](https://github.com/lgsMangolt/SanduBAH/actions/runs/39773246819), uma nova VM Windows Server 2025 abriu o site público, baixou pelo botão real o instalador publicado e verificou seu SHA-256. A instalação NSIS por usuário, o tutorial até a aba Windows da documentação oficial, a instalação oficial do Codex CLI 0.163.0, sua assinatura Windows válida, o MCP real e a atualização pública assinada passaram. Nenhuma conta foi autenticada e nenhum modelo foi chamado.

Foram confirmados dois bloqueios, sem contorná-los:

- O Codex foi instalado em seu caminho padrão atual, `%LOCALAPPDATA%/Programs/OpenAI/Codex/bin/codex.exe`, mas o SanduBAH 0.1.0 não o detectou. Seu bootstrap procura caminhos antigos e a interface mostrou `CLI não encontrada`; o catálogo permaneceu vazio e o envio, desabilitado. O teste não mudou `CODEX_INSTALL_DIR`, o runtime nem o instalador para disfarçar essa incompatibilidade.
- `codex login status` confirmou ausência de conta e `codex login` iniciou o OAuth oficial. A navegação real para `auth.openai.com` retornou **HTTP 403**, antes do formulário de login. Não foi determinada a causa do bloqueio, nem transferidas credenciais pessoais para tentar superá-lo.

O job registra falha, com `infrastructurePassed=false` e `fullFlowPassed=false`. A evidência local é `build/sandubah/distribution/visitor-evidence-39773246819-1/report.json`; o ZIP correspondente tem SHA-256 `36d97cc7a747109e9daf5c656792a4cb80447348a7dbb242563ca2f140868271`. A Release 0.1.0 e o site não foram alterados por este teste. A conversa autenticada e o assistente interativo de instalação continuam sem validação neste percurso.
