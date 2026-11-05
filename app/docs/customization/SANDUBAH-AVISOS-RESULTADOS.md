# Avisos e fila ligados aos resultados — 25/10/2026

## Problema observado

A fila guardava o estado da operação, mas não o projeto e as missões executadas. Os avisos ofereciam um destino genérico, inclusive nos testes de notificação. Clicar não garantia acesso ao resultado esperado. O disco sem espaço também impediu a repetição da regressão de inicialização anterior; essa restrição foi resolvida pelo usuário, sem remoção de arquivos pelo agente.

## Correções locais

- Operações de projeto guardam o identificador do projeto e somente as missões que começaram naquela execução. Resultados de missões anteriores não são apresentados como resultado da nova fila.
- Avisos novos oferecem **Ver resultado** e **Abrir arquivos** quando têm esses vínculos. O primeiro mostra as saídas das missões; o segundo abre a aba Arquivos da lateral, no projeto correto.
- A fila usa os mesmos destinos e fecha seu painel ao navegar, inclusive quando estava maximizado.
- Avisos de conversa levam à conversa. Avisos de teste não prometem arquivo: servem apenas para testar a notificação.
- Registros antigos com projeto conhecido mostram **Abrir projeto**, sem inventar vínculo com missão. Histórico antigo sem vínculo informa essa limitação.
- Destinos removidos ou indisponíveis mostram erro e mantêm o aviso não lido. O clique nativo não marca leitura antes de a navegação concluir.
- Ao trocar de projeto, a lateral limpa arquivos anteriores e ignora respostas atrasadas de leitura. Workspace vazio não exibe conteúdo do projeto anterior.
- Navegar não executa missão, ferramenta, publicação ou aplicação de alterações. As confirmações continuam nos pontos originais.

## Validação executada

- Regressões focadas: **32/32** passaram.
- Lote habitual serial, incluindo a nova inicialização integrada: **301/301**, zero falhas, em cerca de 91 segundos. Mantidas as exclusões históricas `worker-panel`, `launcher` e `source-export`; não é a suíte completa da base.
- Teste de privacidade do exportador executado separadamente: **1/1**. Auditoria textual em 19 arquivos desta rodada passou, sem executar a exportação. Isso não substitui a revisão completa exigida antes de publicar.
- Ensaio Electron com interface, CSP, preload, IPC e backend reais; projetos e arquivos fictícios, MCP stdio e monitor de recursos fictícios. Um worker, zero chamadas a modelos, zero requisições de rede e nenhum projeto pessoal usado.
- Confirmados: navegação pelas 11 abas, busca, preservação de rascunho, resultado da execução selecionada, abertura de arquivo na lateral, fila maximizada restaurada, aviso antigo, teste sem destino, projeto removido, arquivo de outro projeto não reaproveitado e clique nativo reemitido para aviso já lido.
- Cancelamento e aprovação passam pela função de confirmação do aplicativo, com resposta nativa substituída explicitamente na fixture. Isso não é teste manual do diálogo do Windows nem de entrega de toast pelo sistema operacional.
- A fixture também provoca falha de importação e verifica o aviso de inicialização e sua recuperação. Captura da lateral inspecionada visualmente.
- Recibo: `%TEMP%/sandubah-boot-oWTGlx/receipt.json`. Capturas no mesmo diretório; log serial em `build/sandubah/gui/tmp/notice-navigation-regressions.log`. São evidências locais, não dados para publicar.

## Reabertura e limites

Com autorização do usuário, a cópia de trabalho foi reaberta pelo launcher existente. A instância anterior já não estava em execução; não foi necessário encerrá-la. O processo novo apresentou janela **SanduBAH** e estado respondendo. Isso confirma a reabertura, não substitui os testes isolados nem comprova todos os fluxos nos projetos pessoais.

Os arquivos da lateral são o estado atual do workspace do projeto; não são um snapshot imutável dos arquivos produzidos por uma missão. Missões que retornam apenas texto não passam a criar arquivos. Não é possível recuperar retroativamente um vínculo que o histórico antigo nunca armazenou.

Não houve teste novo em VM, execução real de IA, reconstrução de instalador, commit, push ou publicação. O README público com alteração do usuário permaneceu com o mesmo hash. Gateway, Corel, impressão, outros aplicativos, autenticação e preferências de modelos não foram alterados.

## Referência jurídica seletiva

Jurisdição considerada: Brasil, quando presentes as hipóteses do art. 3º da LGPD. O art. 46 orienta medidas de segurança desde a concepção até a execução: a mudança mantém leituras restritas ao workspace e não acrescenta envio de arquivos a serviços externos. Fonte oficial consultada: [Lei 13.709/2018, arts. 3º e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm). Esta verificação pontual não certifica conformidade jurídica do produto.
