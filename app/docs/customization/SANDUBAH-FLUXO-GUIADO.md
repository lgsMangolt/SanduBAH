# Fluxo guiado — 26/10/2026

## Mudança

A entrada do aplicativo oferece Criar um projeto, Estudar um assunto e Continuar de onde parei. Estudar abre diretamente os cadernos do Cérebro, sem criar projeto ou missão. A navegação anterior continua disponível.

Na conversa do projeto, um painel deriva a próxima ação dos dados existentes: missão pendente, falha que precisa de revisão, prévia, critérios do produto e histórico da conversa. O resultado da execução fica nessa tela, junto ao projeto selecionado. Configuração de IA, força, contexto e ferramentas fica em detalhes avançados, acessíveis pelo próprio painel.

## Limites preservados

- Preparar uma implementação não troca o provedor/modelo escolhido nem sobrescreve um rascunho existente. A construção pela conversa ainda requer Codex: com Claude/local selecionado, o pedido fica preparado e a configuração é aberta para escolha explícita.
- Executar missão passa pelo executor e pela confirmação existentes. Cancelar mantém a missão pendente. Falha/resultado desconhecido pede revisão em vez de repetir automaticamente.
- A fase vem do checklist do produto. Missão concluída ou arquivo de prévia não aprovam protótipo, MVP ou produção.
- Um worker; nenhum envio a modelos, download, publicação ou alteração de autenticação foi necessário nos ensaios desta rodada.
- Gateway, Corel e impressão não fazem parte das alterações.

## Verificação

`sandubah-guided-workspace.test.cjs` cobre seleção da próxima ação e critérios reais. `test-sandubah-startup-ui.cjs` exercita as três entradas, execução/cancelamento confirmados e resultado no mesmo projeto em Electron isolado, com MCP e diálogos fictícios. `test-sandubah-planner-readiness-ui.cjs` verifica preparação sem sobrescrever o rascunho, escolha explícita do executor e revisão antes de construir com worker simulado. Não equivalem a uma execução autenticada nova com Luna/Claude.

Há uma pendência local anterior: runtime.json aponta para uma versão removida do executável Codex. Existe outra versão instalada, mas seu caminho não foi alterado nesta mudança de interface. Os testes do executor que dependem desse caminho continuam bloqueados. Não declarar a suíte inteira aprovada.

Resultado desta rodada: lote amplo serial **311/323**, com 11 falhas pelo executável Codex ausente e uma falha EPERM na renomeação de CONTEXT.md em uma fixture Tech. O reteste serial focado (guiado, Tech e prontidão) passou **25/25**, incluindo o caso Tech, sem alteração para ocultar a falha. Dois ensaios Electron finais passaram: inicialização completa e prontidão/construção. O primeiro valida execução MCP fictícia no projeto selecionado; o segundo usa contas/worker simulados, duas revisões e uma execução simulada. Zero chamadas reais a modelos. Recebimentos locais nos logs `guided-final-ui.log` e `guided-readiness-ui.log` de build/sandubah/gui/tmp. O lote amplo antecede somente os últimos ajustes de apresentação; esses ajustes foram cobertos pelos retestes finais.

Somente fontes locais. O clone público, seu README pendente e o instalador publicado não foram atualizados.
