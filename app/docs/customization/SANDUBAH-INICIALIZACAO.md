# Falha de inicialização — 25/10/2026

## Causa reproduzida

A interface ficava no catálogo vazio, com contagens `—` e carregamento indefinido. O módulo dos gauchinhos importava `gaucho-appearance.json` com atributo JSON. No Electron, essa importação foi bloqueada pela CSP `connect-src 'none'`. Como fazia parte do grafo estático de `app.mjs`, nenhuma das abas era inicializada. Testes de componentes isolados e importações no Node não exercitavam essa combinação.

## Correção local

- O renderer usa `gaucho-appearance-data.mjs`, sem fetch nem importação JSON. A política de rede continua bloqueada.
- O JSON permanece no backend. A regressão compara os dois catálogos integralmente para evitar divergências ao adicionar peças.
- `bootstrap.mjs` captura falhas de importação. A inicialização também usa o aviso amigável de `startup-error.mjs`, com detalhes técnicos recolhidos e opção de reabrir. Não há nova tentativa de missão ou operação protegida.
- Novo ensaio integrado executa index, CSP, módulos, preload, IPC e backend reais em cópia temporária, com HOME isolado, projeto fictício, MCP fictício e monitor de memória fictício. Não chama provedores nem usa projetos pessoais.

## Resultados

- Ensaio integrado executado separadamente: passou. Catálogo, busca, 11 abas, projeto/rascunho preservados na navegação, erro de módulo provocado e recuperação passaram. Zero chamadas a modelos e requisições de rede.
- Regressões focadas: 32/32 passaram, incluindo catálogo compartilhado, confirmações, prontidão e auditoria de exportação.
- Lote habitual serial: 298 testes, 297 passaram e 1 falhou. O novo ensaio integrado recusou iniciar sua repetição porque o disco estava abaixo da reserva mínima de 200 MiB. Não declarar a suíte inteira aprovada. As exclusões históricas worker-panel, launcher e source-export permanecem; source-export foi testado no lote focado.
- Recibos e captura do ensaio integrado ficam em `%TEMP%/sandubah-boot-jyeXOo/`. Log do lote: `build/sandubah/gui/tmp/startup-regressions.log`.

## Impedimento da primeira rodada

O disco C: chegou a zero bytes livres, apresentou cerca de 478 MiB durante o primeiro ensaio e voltou a menos de 10 MiB. Uma edição de um novo script de teste falhou por falta de espaço; o arquivo novo foi recomposto e validado quando houve espaço. Nenhum arquivo pessoal foi removido. A remoção automática dos temporários foi bloqueada; não foi contornada.

É necessário liberar espaço estável antes de repetir a suíte e reabrir a cópia pessoal com segurança para salvar projetos. Não foram feitos testes de gravação nos projetos do usuário, nova VM, chamadas reais de IA, reconstrução de instalador, commit, push ou publicação. O README alterado pelo usuário no clone público permanece preservado. Gateway, Corel e impressão ficaram fora do escopo.

Esta nota complementa `SANDUBAH-CONFIABILIDADE.md`: o ensaio anterior de primeiro uso testava componentes e controlador, mas não comprovava a inicialização completa do aplicativo.

## Reteste após liberar espaço — 25/10/2026

O usuário liberou espaço; a checagem antes da reabertura mostrou aproximadamente 85,7 GiB livres. O bloqueio por disco da primeira rodada não permaneceu. Com as correções adicionais de avisos/fila, o lote serial passou **301/301**, zero falhas, incluindo o ensaio integrado de inicialização e recuperação. As exclusões históricas permanecem. Recibo em `%TEMP%/sandubah-boot-oWTGlx/receipt.json` e log em `build/sandubah/gui/tmp/notice-navigation-regressions.log`.

A cópia de trabalho foi reaberta com autorização e sua janela respondeu. Nenhum outro aplicativo foi encerrado. Detalhes de navegação, confirmações, evidências fictícias e limitações em `SANDUBAH-AVISOS-RESULTADOS.md`; a falha histórica de espaço acima não foi apagada nem convertida em aprovação retroativa.
