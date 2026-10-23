# Harness² no SanduBAH

## Estado desta integração

Revisão em 22/10/2026, pelo código público de [google-research/harness2](https://github.com/google-research/harness2), fixado em `1cfe254e8d25b15f37048c3730134686abe60335`.

- Implementado nos fontes locais: referência curta e citável no Cérebro; botão **Preparar revisão com Harness²** na trilha do projeto; preparação de uma missão na fila existente. Não é execução do runner upstream.
- Não há envio automático à IA, instalação ao abrir o app ou mudanças automáticas nos Markdown. Executor, modelo e força do projeto são preservados. Uma revisão desconhecida/pendente não é reenviada por outro clique.
- A revisão não conta como protótipo nem conclui etapas do produto. Não cria outro projeto e não treina pesos.
- Atualização em **23/10/2026**: após o estudo, o usuário autorizou instalar. Núcleo upstream **0.1.0 instalado em venv próprio**, a partir da revisão fixada, sem pacotes adicionais de runtime. Nenhum benchmark, modelo, bridge, Docker ou credencial foi instalado/configurado. A recusa anterior foi substituída pela autorização posterior, não ignorada.
- Não houve chamada real a Codex/Claude para este recurso. Testes com fixtures não demonstram a qualidade de uma resposta de modelo.
- Nada foi publicado; o instalador 0.1.0 não foi reconstruído. O README público com alterações do usuário permanece intacto.

## Como usar

1. Abra um projeto existente e a **Trilha do projeto**.
2. Em **Melhorar meu harness**, clique em **Preparar revisão com Harness²**. Isso apenas acrescenta uma missão pendente; o botão não chama modelo nem executa comandos.
3. Confira executor, modelo e força da missão. Use **Revisar e executar fila** e aprove somente o contexto e as missões desejadas na confirmação existente. As cotas/custos são os da integração já selecionada, não uma cota nova do Harness².
4. A missão pede uma baseline com fontes, uma hipótese pequena, um plano de comparação com dados fictícios e uma proposta revisável. Sem duas execuções demonstradas, a comparação deve ficar pendente, sem declarar vencedor.
5. No Codex, a entrega solicitada é um novo `HARNESS2-REVIEW-<id>.md` no workspace. Claude/IA local mantêm o adaptador de síntese existente: o app salva a resposta em `MISSION-<id>.md`, sem executar testes ou ferramentas.
6. Um ensaio real é outra missão, confirmada separadamente, no workspace privado. Aplicar uma alteração aos originais continua exigindo revisão e confirmação próprias. Esta primeira etapa não aplica sugestões nem seleciona automaticamente uma vencedora.

A referência `knowledge:harness2` aparece na biblioteca e pode ser anexada explicitamente como contexto. É um resumo local com revisão, fonte e hash; não indexa o repositório inteiro nem entra automaticamente em todos os projetos.

## Leitura arquitetural guiada pela skill REA

A skill `reverse-engineer-anything` foi lida. Ela manda usar análise normal de código quando há um repositório-fonte completo. Portanto não houve decompilação, instalação de REA, alteração de MCP ou inspeção de aplicativos privados. A cobertura abaixo é estática e focada, não auditoria exaustiva nem observação de execução.

| Evidência pública na revisão fixada | Observação | Aproveitamento / limite |
| --- | --- | --- |
| [README](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/README.md) | Refina componentes do harness, mantendo os pesos do modelo. | Melhorar instruções e organização antes de recomendar treinamento. |
| [core/spec.py](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/spec.py) | Separa método, executor e adaptador do benchmark. | Não acoplar as CLIs e autenticação do SanduBAH aos benchmarks. |
| [core/recursion.py](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/recursion.py) | Propostas, execuções de sondagem e composição; validação e registro de falhas/retries. | Proposta não é ganho comprovado; manter baseline e evidências identificadas. |
| [core/selection.py: selection_pool](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py) | O pool de seleção exclui a baseline e escolhe entre finais refinadas. | Não interpretar seleção como garantia de superar o original. Uma futura adoção no SanduBAH precisa poder manter a baseline. |
| [core/library.py: Library.add](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/library.py) | Guarda harness adotado, motivo e experiência por domínio; leva a árvore completa. | Reaproveitar proveniência e escopo; não copiar toda essa memória ao Cérebro/contexto. |
| [config.py](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/config.py) e [core/schedule.py](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/schedule.py) | Há concorrência por domínio e dentro de fases; `PHASE_WIDTH` e `PROPOSER_CONCURRENCY` valem 2. | `--workers 1 --mode sequential` sozinho não garante um worker em toda a execução. Não conectar esse runner diretamente à fila protegida. |
| [docs/SETUP.md](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/docs/SETUP.md), [substrate/codex.py](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/substrate/codex.py) | Plataforma recomendada Linux; fluxo Codex usa endpoint Responses e sandbox desativado. Bridge opcional abre serviço próprio. | Não é simplesmente usar o login Codex já existente. Não instalar bridge, alterar gateway ou substituir `CodexWorker`. |
| [demo.py](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/demo.py) | Editor determinístico e scripts Python reais com lançamentos fictícios. | Primeiro teste upstream deve usar essa demonstração sem credenciais; não comprova melhoria por LLM. |

## Instalação restrita executada

Foi obtido o código fixado em uma pasta exclusiva sob `%LOCALAPPDATA%/SanduBAH/tools/h2-1cfe254`. Python **3.12.14**, setuptools **84.1.0**, wheel **0.48.0** e uv **0.13.0** já estavam presentes. O pacote foi construído com `pip wheel --no-index --no-deps --no-build-isolation` e instalado com `uv pip install --offline --no-deps`, sem baixar ferramentas ou dependências. O ambiente instalado contém **somente `harness2`**. O [pyproject.toml](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/pyproject.toml) não declara dependências obrigatórias de runtime.

SHA-256 do wheel construído: `ccb35414e843c9f8cdbcca5f2c3eb9579ec8c1a5361af009acce49bf0443f526`. Os **39 módulos Python** instalados foram comparados com a revisão Git, tolerando apenas conversão LF/CRLF. Os recibos guardam hashes exatos de cada origem e de cada arquivo instalado, além do hash normalizado. Não foi alterado o `core.autocrlf` global. O primeiro build falhou por caminho longo e o segundo encontrou resíduo da tentativa anterior. A construção que passou usou um novo snapshot local em pasta curta; os arquivos anteriores foram preservados, sem limpeza ou sobrescrita das pastas existentes.

O Windows pode redirecionar `%LOCALAPPDATA%` para o armazenamento privado do aplicativo. Use o caminho resolvido que o utilitário devolve em `receipt`, não fixe o caminho deste PC em código público. Snapshots temporários curtos e todos os ensaios contêm apenas fontes públicos/dados fictícios.

### Verificador e demonstrações

Utilitário local: `scripts/probe-sandubah-harness2.py`. Não baixa, não instala nem chama modelos. Precisa ser iniciado pelo Python do venv instalado; sem `--demo`, verifica somente revisão, distribuição, módulos e wheel. `--demo native` e `--demo method` exigem **`--confirm-local-demo`**. Sem essa opção, o utilitário recusa com saída 2 e não inicia demonstração.

Os ensaios usam saídas novas por execução. O processo retira credenciais e proxies do ambiente herdado, usa home/temp próprios e recusa rede, shell, gravações por `open` fora da saída e subprocessos distintos do pequeno script aritmético revisado. Essas barreiras são instrumentação de teste em um processo, **não um sandbox de segurança para código arbitrário**. Não conecte tarefas de usuário, plugins ou modelos a esse utilitário.

| Teste executado | Resultado observado |
| --- | --- |
| CLI upstream, uma rodada sequencial, fases explicitamente seriais | **Falhou: 0/2 tarefas**, `ModuleNotFoundError: No module named 'fcntl'`. Isso confirma uma dependência Unix, não uma falha de autenticação. |
| Núcleo upstream com adaptador local de teste | **2/2 casos passaram**, reproduzidos numa segunda saída nova. Foram usadas as classes e funções reais de recursão, execução Python, seleção trivial, reflexão e biblioteca do pacote instalado. |
| Caso fictício 1 | Baseline `105.25`; candidato `85.15`; soma independente esperada `85.15`. |
| Caso fictício 2 | Baseline `35.50`; candidato `20.25`; soma independente esperada `20.25`. |
| Serialização medida no adaptador | Máximo **1 operação ativa**; **8 execuções Python e 8 chamadas ao editor determinístico** por ensaio de duas tarefas. |
| Memória do ensaio | Biblioteca com 0→1→2 entradas; o segundo caso recebeu a entrada anterior. Não é o Cérebro privado do usuário. |
| Provedores | **0 chamadas a modelos**; tokens do modelo ficam `null`/não aplicável, não uma contagem inventada. |
| Testes do utilitário | **3/3**: bloqueio de concorrência, normalização de caminhos preservando rejeições, e recusa de rede/escrita externa/shell/programa arbitrário. |
| Regressão focada do SanduBAH após aprofundamento | **15/15** em sequência: revisão, botão simulado e trilha do projeto. |
| Nova suíte combinada após aprofundamento | **253/253**, zero falhas, em sequência; mesmos três arquivos excluídos da rodada anterior. Não é a suíte completa da base nem a suíte upstream. |

### Adaptações explícitas, sem alterar o pacote instalado

1. `run_sequential` tem `propose_workers=2` no próprio argumento padrão: mudar só `config.PHASE_WIDTH` não basta. O ensaio passa **ambos os workers como 1** e mede execuções/edições ativas.
2. `tree.read_tree` usa `str(relative_to(...))`, que retorna barras invertidas no Windows. Isso deixou candidatos corrigidos no disco, mas rejeitou sua adoção e conservou a baseline. O adaptador normaliza as chaves para POSIX e ignora somente os README-stubs já declarados pela superfície; caminhos realmente rejeitados continuam rejeitados.
3. O adaptador chama o núcleo diretamente e grava recibo próprio; **não finge corrigir o lock `fcntl` do agendador** nem a semântica de resume multiprocesso. Os fontes e os módulos instalados continuam íntegros.

Os resultados demonstram apenas a correção desse cálculo e o fluxo de evidências com editor roteirizado. Não demonstram aprendizado por LLM, melhoria em projetos reais, suporte completo a Windows ou equivalência com os benchmarks do artigo.

## O que o aprofundamento muda no desenho do SanduBAH

- **Propor não é adotar:** a seleção upstream usa apenas finais refinadas; com `k=1`, nem chama um seletor. O SanduBAH deve poder manter a baseline ou recusar ambas, com um gate independente. “Terminou o pipeline” não significa “melhorou o produto”.
- **Orçamento não é uma chamada:** `ledger.py` conta `4k` execuções e `3k` estágios de melhoria; seleção, reflexão e retries têm contabilidade própria. Não converter isso em tokens/cota garantidos. Usar os recibos reais de cada provedor e limitar tempo/rodadas antes de um ensaio pago.
- **Contexto sob demanda:** `context.py` entrega evidências como arquivos com um mapa curto, em vez de colar tudo no prompt. Esse padrão é aproveitável no Cérebro seletivo. Porém trajetórias aceitam cortes por observação e seleção de imagens: uma integração futura precisa declarar o que foi omitido, sem prometer contexto integral só porque o arquivo da trajetória existe.
- **Memória com escopo:** guardar hipótese, motivo, evidência e revisão por projeto/nicho; promover à Central somente mediante avaliação. A biblioteca upstream carrega árvores completas e não deve virar injeção automática do acervo inteiro do Cérebro.
- **Permissões fora do alcance do editor:** `tree.validate` verifica estrutura, tamanho e sintaxe, não estabelece sandbox. O proposer Claude também usa `--dangerously-skip-permissions`. Não importar esses launchers, hooks ou guardrails mutáveis; conservar a política externa e as confirmações do SanduBAH.
- **Cache não é autoridade:** fingerprints e namespaces ajudam a não reutilizar resultados de outra configuração, mas não substituem aprovação, integridade de artefatos e proteção contra alteração depois da revisão.

A integração na interface permanece deliberadamente no estágio **revisão proposta → ensaio confirmado → aplicação confirmada**. Instalar o pacote não ativa um serviço, não substitui o executor Codex/Claude e não torna o SanduBAH autônomo sem supervisão. Instalar Linux/WSL, rodar benchmarks ou fazer chamadas pagas exige outro plano e autorização.

## Segurança, créditos e pendências

Validação local desta etapa: suíte combinada de regressão/distribuição, serial, **252/252**, sem worker-panel, launcher e source-export. Depois foi acrescentado o teste de interface com DOM simulado, e o arquivo focado passou **9/9**; oito desses testes já estavam na suíte anterior, portanto os resultados não devem ser somados. A interface foi exercitada por simulação, não por inspeção visual do aplicativo aberto. Seis fontes passaram pela checagem de sintaxe do Node e nove arquivos pela auditoria textual de privacidade. O hash do README público continuou igual ao de antes desta etapa. Isso não valida instalação limpa, segurança exaustiva nem melhora medida em produção.

O código upstream é Apache-2.0, de Google LLC; terceiros mantêm suas licenças. Esta etapa usa uma descrição do método com atribuição e implementação própria, sem incorporar seus fontes ao aplicativo. Antes de redistribuir qualquer pacote upstream, revisar licença, NOTICE e dependências. Os créditos MIT de Ruflo/ruvnet e os nomes `@claude-flow/*` não mudam.

Contexto inicial: ferramenta local usada no Brasil, mantendo os controles existentes de privacidade e acesso. A skill `leis-brasil` foi consultada como orientação; nenhuma nova conclusão jurídica ou garantia de conformidade foi feita. Revisão jurídica de eventual redistribuição/serviço e aplicabilidade por jurisdição permanecem pendentes; não foi carregado o acervo de leis.

Pendentes: compatibilidade completa do runner com Windows ou validação Linux separada; suíte upstream completa; ensaio real confirmado por modelo; comparação de qualidade/tempo/tokens em projetos reais; gate de execução independente que possa recusar ambos; adoção e aprendizado com revisão humana; validação do fluxo completo no aplicativo real e nova distribuição. A presença do botão ou do pacote instalado não equivale a essas entregas.

## X-Tudo e tutorial · etapa de 23/10/2026

A experiência de melhoria passou a se chamar **X-Tudo**, com créditos explícitos ao Harness². A trilha mantém compatibilidade com revisões pendentes anteriores. Foi acrescentada a aba **Tech**, com análise de referências guiada pela skill `reverse-engineer-anything`, e dois tutoriais no aplicativo. A presença da skill no índice não implica conexão de ferramentas REA ao executor; falta de capacidade deve ser registrada, nunca simulada.

X-Tudo acrescenta um comparador local de valores JSON por critérios definidos pelo usuário, com críticos, ganhos/regressões, manutenção da base ou recusa de ambos, recibos com hashes e confirmação antes de salvar. Não executa o aplicativo nem comprova procedência dos dados de saída. Não é o runner upstream, não altera permissões nem promove aprendizado automaticamente. Propostas Tech/X-Tudo triadas da fila ficam em revisão. As instruções de revisão agora exigem condições equivalentes, uso real do provedor, versão anterior e revisão de memória.

O compositor upstream pode preservar o original; isso é distinto de o pool final de seleção excluir a baseline. Não interpretar a seleção ou o simples término de um ensaio como evidência universal de melhoria.

Veja [SANDUBAH-TECH.md](SANDUBAH-TECH.md) para uso, exemplos fictícios, validação, fontes jurídicas seletivas e limites. A integração não incorpora código do framework ao app nem redistribui seu pacote Python. Não houve download adicional ou chamada paga nesta etapa. Código local ainda não publicado nem incluído no instalador.
