# Cadernos de estudo no Cérebro — 26/10/2026

## Mudança de fluxo

O usuário esclareceu que estudar significa formar uma biblioteca de conhecimento e referências em Markdown. O fluxo anterior criava um harness de produto e desviava para agentes/missões. A Área de estudo agora cria um caderno próprio e mantém a navegação no Cérebro.

Cada caderno tem quatro documentos ligados entre si: `INDEX.md`, `CONCEPTS.md`, `SOURCES.md` e `QUESTIONS.md`. Aparecem na biblioteca e no mapa como documentos de conhecimento. Nenhum projeto, agente, missão de implementação ou etapa de app/SaaS é criado pelo botão de estudo. Uma referência local selecionada entra como identificação e hash, preservando o original.

## Perplexity web

O usuário confirmou que utiliza sua conta no navegador. **Pesquisar no Perplexity** prepara a pergunta a partir do tema e pede confirmação antes de abrir o site. A pergunta solicita conceitos, fontes primárias, datas, dúvidas e limitações, com objetivo de estudo. Não inclui notas, fontes locais, anexos, nomes de outros projetos ou credenciais.

O retorno é manual: o usuário traz a resposta e os links aos campos do caderno. Abertura do navegador não é pesquisa concluída; não há leitura automática da sessão, integração com a API ou contagem fictícia de tokens do Perplexity. Não foi cadastrada chave ou alterado login.

## Revisão, persistência e contexto

- O caderno começa como rascunho, fora do contexto automático.
- **Revisar e salvar Markdown** confirma a gravação. Cancelar mantém o texto no formulário e não grava a nova versão.
- Editar o conteúdo desmarca a revisão. Disponibilizar como referência exige notas, fontes HTTPS ou referências locais selecionadas, e revisão explícita do usuário.
- O alcance é Central ou somente o projeto escolhido. O planejador e o executor continuam selecionando trechos relevantes, inclusive no modo Completo.
- Cada gravação mantém uma revisão separada; o manifesto passa a apontar para a nova revisão somente após gravar os quatro documentos. Erro de gravação preserva a revisão anterior.
- Versão e alcance são conferidos ao salvar e após a confirmação. Um rascunho desatualizado exige reconciliação explícita.
- Repetir a criação com o mesmo identificador de pedido retoma o caderno. Salvar conteúdo idêntico não duplica revisão. Atingir 100 estudos recusa novas criações sem apagar registros antigos.
- Paths forjados, links/hardlinks, arquivos grandes e possíveis credenciais são recusados. Edição externa com segredo não entra no contexto.

Os dados ficam apenas em `build/sandubah/gui/brain/studies/`. Não são conteúdo para exportação pública. Estudos anteriores em harness permanecem legíveis por **Ler estudo anterior**, sem iniciar a missão. A preparação específica de fine-tuning mantém seu fluxo separado.

## Evidências e limites

O ensaio Electron integrado passou com interface, preload, IPC, backend e persistência reais numa cópia isolada. Confirmou criação sem projeto, quatro Markdown, pesquisa cancelada/aberta, gravação cancelada/confirmada, preservação do rascunho e leitura após recarregar. Abertura externa e respostas do diálogo nativo foram substituídas por fixtures explícitas: não comprova entrega real de pesquisa ou qualidade do retorno do Perplexity. Zero chamadas reais a modelos e nenhuma requisição de rede nesse ensaio. Captura da interface inspecionada.

Lote amplo desta rodada: **299/310**. Os 11 erros vieram de `sandubah-codex.test.cjs`: o caminho do executável configurado no runtime local não existe. Esses testes usam spawn simulado, mas a validação de existência do executor ocorre antes. Não foi removida a validação, alterado o runtime nem feita instalação para contornar a falha. O ensaio integrado e os testes novos de cadernos passaram no lote. A suíte ampla não está integralmente aprovada.

Logs locais: `build/sandubah/gui/tmp/study-notebooks-regressions.log`, `study-notebooks-ui.log` e `study-notebooks-final.log`. O último inclui a repetição focada após ajustes de leitura, concorrência e limite de estudos. Não houve VM nova, chamada paga, commit, push, Release ou reconstrução do instalador. README público pendente preservado. Gateway, Corel e impressão permaneceram fora do escopo.

Reteste focado final: **46/46**, zero falhas, incluindo cérebro, seleção de executor das missões existentes, cadernos, privacidade da exportação e interface Electron integrada. Essa aprovação não substitui os 11 testes de Codex bloqueados no lote amplo.

## Histórico e prevenção de repetição — etapa posterior de 26/10

Antes de criar, o backend confere os títulos do histórico no mesmo alcance Central/projeto. A comparação normaliza acentos, caixa e espaços e preserva diferenças em códigos como C++/C# e no caminho de URLs. Tema igual com a mesma seleção de fontes retoma o caderno existente, preservando categoria, conteúdo, anexos e revisões. Nenhuma pesquisa é aberta automaticamente.

Temas com palavras próximas são sugeridos na própria tela, com data de atualização e estado (rascunho, notas salvas ou revisadas). O usuário escolhe continuar ou criar um caderno separado. A escolha de criar separado é vinculada à consulta atual; mudanças no histórico pedem nova conferência. A API também impede duplicação quando o cliente ainda não exibiu as sugestões. Estudos anteriores em harness continuam sendo apenas consultados. A comparação não procura sinônimos, não analisa o conteúdo completo das notas e não é uma busca semântica de IA.

Validação desta etapa: **52/52** testes focados passaram, incluindo Electron isolado. Reconhecidos títulos repetidos após reabrir, notas/versões preservadas, sugestões com escolha explícita, separação de projetos e fontes, escolha desatualizada recusada e nenhuma nova pesquisa ou projeto ao retomar. Recibo/captura locais em `%TEMP%/sandubah-boot-gOEouD/`; log em `build/sandubah/gui/tmp/study-history-tests.log`. Abertura externa e diálogos continuam simulados, com zero chamadas reais a modelos ou rede. Não foi repetida a suíte ampla com os 11 testes de Codex bloqueados já documentados.

Consulta seletiva com `leis-brasil`: considerada a jurisdição brasileira para notas que contenham dados pessoais; a seleção retornou o art. 1º da LGPD e pendência de acesso à referência de software. Não houve conclusão nova sobre obrigações legais ou declaração de conformidade; vigência e aplicabilidade normativa permanecem sujeitas à conferência oficial quando pertinentes ao tema estudado.
