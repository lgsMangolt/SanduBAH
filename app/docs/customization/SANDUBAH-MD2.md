# Contexto do executor e avaliação X-Tudo

Integração local de 08/11/2026. Decisões do usuário: começar pelo Codex,
comparar melhorias e pedir revisão, gerar o contexto dos projetos existentes
na próxima execução. As confirmações de execução e aplicação continuam nos
pontos existentes do aplicativo.

## Três camadas

- `src/sandubah-desktop/AGENTS.md` orienta o agente que desenvolve o aplicativo.
- `agent-context.cjs` fornece instruções carregadas explicitamente no prompt do
  executor e valida o contrato JSON versão 1. Os dados vêm de ProjectWorkspace.
- `context-broker.cjs` oferece a ferramenta MCP stdio `read_mission_context`.
  O executor consulta uma seção por chamada: projeto, missão, agente ou
  referências. Caminhos e IDs de outros projetos são recusados.

## Caminho normal

1. A pessoa pede a construção na conversa ou executa uma missão Codex.
2. O controlador prepara o contrato para revisão. A confirmação mostra o
   contrato e a ferramenta somente leitura que ficará disponível.
3. Depois do aceite, a preparação verifica novamente as fontes. Qualquer
   mudança no contrato impede a preparação e exige uma nova revisão.
4. Um `mission-context.json` fica no diretório daquela execução, fora do
   workspace editável. Seu SHA-256 e caminho são vinculados ao processo.
5. O worker configura apenas esse MCP de contexto e, quando já aprovado,
   o MCP REA existente. A configuração é passada na linha de comando.
6. A leitura confere hash, tamanho e contrato em cada consulta. O subprocesso
   Node usa permissões de leitura limitadas ao código do broker e ao snapshot.
   Há um limite de 24 consultas por processo.
7. Arquivos e resultados seguem o caminho de revisão e aplicação do SanduBAH.

As referências selecionadas são carregadas sob demanda. Cada uma registra hash
do texto completo, trecho de até 6.000 caracteres e quantidade de caracteres
omitidos. O contexto estruturado tem limite de 192.000 bytes. A revisão também
continua sujeita ao limite já existente do aplicativo. Os Markdown próprios do
harness e a seleção econômica da Central continuam no prompt atual.

Projetos anteriores usam o contrato na próxima execução Codex. Seus Markdown e
conversas são preservados. Chamadas internas antigas a prepareCodex sem contrato
mantêm o comportamento anterior, enquanto a entrada normal do controlador usa
o contrato revisado.

## Avaliação com princípios Harness²

Foi usada a comparação determinística já existente no X-Tudo. No mesmo projeto
fictício, a base e o candidato foram medidos em três critérios: ferramenta de
leitura por seção, isolamento do projeto e referência carregada sob demanda.
O teste confere cancelamento, persistência do recibo após confirmação e
`adopted: false`. Uma comparação elegível continua como proposta para revisão.

Essa avaliação verifica o mecanismo de contexto. A qualidade de respostas de
um modelo, custo, latência de inferência e generalização para tarefas reais
dependem de ensaios adicionais. Os ensaios desta integração usam um worker
simulado para o Codex e um processo MCP real, com dados fictícios. Nenhuma
chamada autenticada nova a provedor foi necessária.

## Verificação

`tests/regression/sandubah-agent-context.test.cjs` cobre contrato, fontes,
projeto anterior, segredo detectável, adulteração, arquivo ausente, hardlink,
limites, stdio real, cancelamento pela entrada normal e comparação X-Tudo.
O teste de execução serial em sandubah-world agora verifica a referência pelo
snapshot, em vez de exigir sua inclusão integral no prompt.

Resultado final: 126/126 testes passaram em sequência nas áreas afetadas.
O ensaio Electron de prontidão e confirmação passou com duas revisões e uma
execução de worker simulada. O processo MCP real respondeu por stdio usando
as permissões de filesystem restritas. Na comparação de mecanismo, a base
passou 1/3 critérios e o candidato 3/3, com zero regressões e decisão `review`.
Os logs locais estão em build/sandubah/gui/tmp/md2-regression-final.log e
md2-review-ui.log. Esses números avaliam o mecanismo, sem medir a qualidade
das respostas de um modelo.

Fontes conceituais do MCP:
https://modelcontextprotocol.io/specification/2025-11-25/server/tools
https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

Entrega restrita aos fontes locais. A Release pública 0.3.0 permanece como
publicada em 05/11/2026. Uma distribuição desta integração requer build,
auditoria e validação próprios.

## Ensaio autenticado com Luna em 08/11/2026

Duas tentativas sequenciais com gpt-6-luna, força baixa e um worker. Em ambas,
os eventos reais item.completed registraram sandubah_context /
read_mission_context com section=references e status=completed. A ferramenta
retornou docs/rules.md, seu SHA-256 e a regra fictícia REGRATEST-08. O modelo
citou essa regra em seu relatório.

A CLI instalada 0.166.0-alpha.6 bloqueou exec_command pelo sandbox Windows:
"cannot enforce split writable root sets directly". O modelo retornou blocked,
com files e tests vazios. Não houve implementação ou teste de candidato gerado.

Uma sonda local conseguiu escrever no workspace usando o perfil restrito
:workspace depois de remover marcadores de identidade desktop herdados apenas
do subprocesso. Essa higienização foi adicionada ao worker, preservando perfis
herdados restritivos e o sandbox explícito. O erro de exec_command persistiu
na segunda tentativa. Nenhuma alteração de configuração global foi feita.

O X-Tudo registrou reject/adopted=false com confirmação e teste de cancelamento.
A base foi executada por um verificador local sobre os mesmos pedidos fictícios
e somou 1.725 centavos; o critério exige 1.225. A saída do candidato registra
blocked e omite totalCents. Ambos falham no critério crítico e são rejeitados.
Não foi usado código escrito manualmente como se tivesse sido entregue pelo
Luna. As duas cópias temporárias de autenticação foram removidas.

Uso real informado pelo provedor:

| Tentativa | Entrada | Entrada em cache | Saída |
|---|---:|---:|---:|
| Primeira | 74.449 | 54.784 | 356 |
| Segunda | 93.468 | 73.600 | 505 |
| Total | 167.917 | 128.384 | 861 |

Cache é parte da entrada, não soma adicional. Esses números não informam
preço ou saldo da conta. A latência e qualidade do código continuam pendentes
porque o sandbox impediu a execução.

Os recibos e eventos são locais nas pastas temporárias sandubah-context-luna-*.
O teste reproduzível está em scripts/test-sandubah-context-live.cjs. Ele exige
--live, caminho explícito da CLI instalada e autorização para consumo de cota.
O ensaio exercita diálogos reais com cliques automatizados vinculados ao escopo
autorizado, incluindo cancelar antes de aprovar. Reteste após a higienização:
19/19 testes focados passaram; esse resultado não elimina o bloqueio real.

## Correção e conclusão do ensaio em 08/11/2026

As sondas sem modelo localizaram a divergência entre caminhos Windows 8.3 e
caminhos completos. `realpathSync` mantinha aliases como USUARIO~1, enquanto
`realpathSync.native` expandiu os mesmos diretórios para a grafia que o sandbox
comparava. Com caminhos nativos, command/exec passou em workspaceWrite,
permitiu criar o arquivo dentro da raiz e negou escrita na pasta irmã.

O worker agora normaliza workspace, diretório de execução e variáveis de
diretório do subprocesso. Contexto MCP e REA comparam a identidade nativa dos
caminhos. Os temporários externos são excluídos das raízes graváveis e a rede
continua desabilitada. A configuração é por execução; nenhum perfil global
foi alterado. O runtime local, cujo caminho Codex estava ausente, passou a
apontar para a CLI já instalada. O teste unitário do worker passou a usar seu
executável falso injetado, sem depender desse caminho de instalação pessoal.

Uma nova chamada real gpt-6-luna/low concluiu a mesma tarefa e os mesmos casos
em uma nova pasta fictícia isolada. O MCP retornou a regra REGRATEST-08. O Luna
criou código, testes, comparação e relatório. A base somou 1.725 centavos e o
candidato 1.225, preservando a entrada. Três testes passaram dentro do turno e
também na verificação independente. O runner que criava subprocesso recebeu
EPERM; a execução serial em processo único respeitou o sandbox e passou.

X-Tudo: base 1/2, candidato 2/2, zero regressões, decision=review,
adopted=false. Cancelamento e confirmação foram exercitados em diálogos reais
com cliques automatizados no escopo autorizado. A cópia temporária de login
foi removida. A configuração global manteve o hash original.

Uso desta chamada concluída: 207.256 tokens de entrada, incluindo 182.400 em
cache, e 2.868 de saída. Somente uma chamada de modelo nesta rodada da correção;
as sondas anteriores não chamaram modelos. O recibo local fica em
sandubah-context-luna-1IXDGg/validation.json, com eventos e capturas ao lado.
Regressão final das áreas afetadas: 141/141 em sequência. A correção continua
nos fontes locais; a Release pública permanece 0.3.0.
