# Espaço Tech e X-Tudo

Implementação local de 23/10/2026. Não publicada e não incluída no instalador 0.1.0.

## Tech: referência → análise → plano → implementação confirmada

A aba **Tech** fica na lateral, com projeto de destino explícito. Organiza referências de repositórios, sites autorizados, apps/pacotes locais e vídeos para planejar mods, apps/sites, sistemas e recriações. O formulário registra alvo, objetivo e permissão/limites informados pelo usuário. Não é verificação automática da titularidade.

**Preparar análise e plano** cria apenas uma missão pendente no harness escolhido. Preserva executor, modelo e força do projeto, não escreve comandos no chat e não inicia chamadas, downloads, instalações ou renderizações. Repetir o pedido enquanto pendente, executando ou desconhecido reaproveita a mesma missão. As configurações do outro projeto não são alteradas. Rascunhos do formulário são mantidos em memória ao trocar de projeto, não são salvamento durável de uma edição ainda não preparada.

Na fila existente, revise o contexto e confirme a execução. O relatório pedido no Codex é `TECH-<id>.md`; Claude e IA local continuam usando a entrega de síntese `MISSION-<id>.md` do adaptador existente. O relatório deve separar observações, inferências e desconhecidos, informar cobertura e lacunas e ligar conclusões a caminhos, versões/hashes, Evidence IDs ou tempos do vídeo. Um link ou transcrição não comprova que o agente assistiu ao vídeo inteiro.

### Uso da skill reverse-engineer-anything

A skill local solicitada foi lida para desenhar este fluxo. Quando aparece no índice de instruções do SanduBAH, é anexada ao papel Analista Tech e entra pelo mecanismo existente de contexto de agentes. A interface informa sua presença ou ausência. O roteiro resumido continua disponível sem ela; isso não é anunciado como execução do REA.

- Fontes completos: leitura normal de repositório, sem decompilador, doctor ou setup.
- App/pacote/ASAR: análise de artefato adequada ao formato, somente se as ferramentas necessárias estiverem disponíveis e autorizadas.
- Runtime/site: observação passiva limitada ao alvo explicitamente autorizado, não a outras janelas ou conversas.
- Vídeo: análise dos materiais realmente acessíveis; recriação com roteiro, código e recursos próprios ou licenciados. Não há download automático, quebra de DRM, cópia de marcas, rostos, vozes ou assets sem autorização específica.

**Skill instalada não equivale a MCP conectado.** O executor protegido Codex atual não recebe automaticamente servidores MCP externos. Este recurso não registra REA globalmente, instala provedores, abre decompiladores ou amplia o perfil do worker. Análise via REA no executor permanece dependente de uma futura integração de ferramentas explicitamente autorizada; quando não disponível, o relatório deve registrar a pendência. Materiais fora do workspace que não estiverem acessíveis precisam ser anexados/importados pelo fluxo existente; informar um caminho não concede acesso irrestrito.

Implementar código, integrar um mod ou renderizar um vídeo é a etapa seguinte, numa missão confirmada do projeto. A primeira etapa não promete um clone pronto. Codex executa código/testes no workspace pelo mecanismo existente; Claude e IA local fazem síntese neste adaptador. Não foi feita chamada real de modelo para validar este recurso.

## X-Tudo: melhoria supervisionada do harness

**X-Tudo** é o nome da experiência do SanduBAH inspirada no [Harness²](https://github.com/google-research/harness2/tree/1cfe254e8d25b15f37048c3730134686abe60335), do Google Research, Apache-2.0. Não é renomeação do pacote upstream, treino de pesos ou promessa de ganho automático. Os créditos de Harness² e Ruflo/ruvnet permanecem.

Abra **Tech → X-Tudo** ou **Trilha do projeto → X-Tudo → Abrir Tech e comparações**. Preparar revisão cria a mesma missão supervisionada já existente: baseline com fontes, uma hipótese pequena, plano de ensaio, composição e aprendizado proposto. O título interno e o prefixo `HARNESS2-REVIEW-<id>.md` permanecem compatíveis com as revisões antigas. O botão novo não duplica uma revisão pendente antiga.

As instruções agora exigem:

1. Critérios individuais definidos antes do ensaio e critérios críticos explícitos.
2. Mesma tarefa, dados, modelo e força entre base e candidato, ou comparação declarada inconclusiva.
3. Ganhos e regressões separados; nota agregada maior não permite ignorar uma regressão.
4. Possibilidade de manter a base ou recusar ambos, sem adoção automática.
5. Tokens/custos somente dos recibos reais dos provedores; desconhecido não vira zero ou estimativa de cobrança.
6. Versão anterior preservada e aprendizado ainda sujeito à revisão.

Ao triar o resultado da fila, operações que contêm missões Tech/X-Tudo ficam em **revisão**, não em aprendizado automaticamente aceito. A triagem conservadora alcança o resultado agregado da fila; não transforma relatos de modelo em fatos verificados.

### Comparador determinístico de JSON

O comparador da aba X-Tudo verifica dados locais, não executa código fornecido nos arquivos. Selecione três arquivos distintos existentes no workspace:

`checks.json` — critérios explícitos, com ao menos um crítico:

```json
{"checks":[
  {"id":"total","path":"order.total","expected":85.15,"critical":true},
  {"id":"estado","path":"order.state","expected":"paid","critical":false}
]}
```

`before.json` — saída da base atual:

```json
{"order":{"total":105.25,"state":"paid"}}
```

`after.json` — saída do candidato:

```json
{"order":{"total":85.15,"state":"paid"}}
```

Os números são **fictícios**. O resultado nesse exemplo é base 1/2 e candidato 2/2. O resultado é apto à **revisão**, não aplicado ou publicado. Cada critério usa igualdade estrita de valores JSON, inclusive tipo. Campo ausente não equivale a `null`. Não há execução de JavaScript, expressões arbitrárias ou comandos.

- Limites explícitos: 64 KB por documento, até 50 critérios, profundidade de JSON até 16 e histórico de até 40 recibos / 512 KB por projeto. Excesso é recusado, nunca truncado silenciosamente ou resolvido apagando recibos antigos.
- Qualquer regressão bloqueia recomendar adoção. Se os dois resultados falham em critérios críticos, ambos são recusados. Empate conserva a base. O comparador não aprova a produção ou altera o progresso do produto.
- Ao confirmar, os três arquivos são relidos. Mudança após a revisão ou outro worker ativo impede salvar. O recibo contém resultado por critério, fontes, SHA-256 e data; repetir os mesmos arquivos/critérios não duplica o registro.
- Recibos privados ficam em `x-tudo-receipts.json` dentro do harness, nunca no repositório público. Não há botão de adoção automática. Aplicação em originais usa as revisões/confirmações existentes.
- A comparação consome **zero chamadas a modelos**, mas não inventa o uso das gerações que produziram os resultados: `usage` é `null`. Os recibos das missões são a fonte do uso real, quando informado pelo provedor.

**Limite essencial:** checar valores de um JSON não comprova que uma aplicação produziu aqueles valores. Resultados podem ser escritos manualmente ou por um modelo. Procedência, execução independente, condições equivalentes e adequação dos critérios precisam ser revisadas. Este não é um gate de execução completo, benchmark de LLM, teste do produto ou certificado de segurança.

O pacote Harness² instalado separadamente e o ensaio aritmético anterior não são acionados pela aba. O runner upstream completo em Windows, gates de execução arbitrária, adoção/aprendizado com revisão própria e validação com modelos reais continuam pendentes. Veja [SANDUBAH-HARNESS2.md](SANDUBAH-HARNESS2.md).

## Tutorial no app

**Tutoriais → Tech** contém dois guias de quatro passos: **Harness² no SanduBAH: X-Tudo** e **Tech: de uma referência ao seu projeto**. Buscar `harness2` também encontra `Harness²`. Ler os guias não chama modelo, instala ferramentas ou executa missão.

## Direitos e fontes

A consulta seletiva pela skill `leis-brasil` foi realizada, sem carregar o acervo. O helper não conseguiu obter a norma de software e registrou a pendência; a versão oficial foi então consultada diretamente. Para o contexto brasileiro foram lidos os arts. 2, 5, 6 e 9 da [Lei 9.609/1998](https://www.planalto.gov.br/ccivil_03/leis/l9609.htm) e o art. 29 da [Lei 9.610/1998](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm), em 23/10/2026. Essas fontes não estabelecem autorização irrestrita para copiar apps ou vídeos; licenças, exceções, direitos de terceiros e jurisdição do alvo exigem avaliação específica. A ferramenta não declara conformidade jurídica garantida nem substitui revisão especializada.

## Validação e cobertura

- Testes de regressão de Tech, X-Tudo, tutoriais e revisão usam dados fictícios, sem serviços externos ou modelos pagos. Cobrem autorização ausente, origem da skill, isolamento, preferências de modelos, duplicação, critérios críticos, regressão com ganho líquido, empate, recusa de ambos, cancelamento, alteração após revisão, limites de entrada e triagem conservadora de aprendizado.
- `scripts/test-sandubah-tech-ui.cjs` renderiza os componentes reais em Electron de desenvolvimento com backend e projetos temporários isolados. Exercita formulário, troca de projeto sem perder rascunho, fila pendente, cancelamento/salvamento/idempotência do recibo, tabela de critérios, busca/destino do tutorial e largura de 680 px. A confirmação nesse teste é simulada; não é inspeção visual do diálogo nativo nem uma execução de LLM.
- A primeira tentativa usou o runtime empacotado, cujo bootstrap abre o app e ignora o entrypoint de fixture. O ensaio foi corrigido para exigir Electron de desenvolvimento sem `resources/app.asar`, identidade de URL da fixture e perfil isolado. As falhas de configuração do ensaio não foram contadas como testes aprovados.
- Nenhuma alteração em gateway, Corel, impressão, autenticação ou preferências globais; nenhum download adicional, commit, push, Release ou atualização de instalador. O README público com alterações do usuário permaneceu intacto.

Rodada final combinada de regressão/distribuição: **266/266, zero falhas**, em sequência com `--test-concurrency=1`. Excluídos worker-panel, launcher e source-export, como na rodada anterior. Inclui os 13 casos novos de Tech/X-Tudo; não somar novamente os testes focados. Auditoria textual de privacidade passou em 20 arquivos desta etapa. Isso não é auditoria exaustiva, validação do runner Harness², instalação limpa ou prova de qualidade de um modelo.
