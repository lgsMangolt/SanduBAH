# Estudos por tipo e Central

Em **Cérebro → Área de estudo**, filtre vídeos/reels, sites, skills, plugins, harnesses, agentes, MCP, APIs, CLI, Markdown, RAG, fine-tuning, leis e outros. A categoria pode ser sugerida pelo tema ou escolhida manualmente e alterada depois.

Escolha **Central** para conhecimento reutilizável entre projetos ou **Somente em um projeto** para restringir o alcance. Estudos antigos continuam privados até você compartilhar explicitamente. As leis aparecem na Central como referência seletiva; o acervo inteiro não entra no contexto.

Na Área de estudo, o objetivo é formar conhecimento, não criar um produto. **Criar caderno de estudo** permanece no Cérebro e prepara quatro Markdown interligados: `INDEX.md` (mapa), `CONCEPTS.md` (conceitos/notas), `SOURCES.md` (fontes) e `QUESTIONS.md` (dúvidas e aprofundamentos). Não cria projeto, harness, agentes, missão de código ou etapas de SaaS.

O **Histórico de estudos** conserva temas, datas, notas e versões. Ao digitar um tema, o Cérebro consulta os títulos já salvos. Tema igual, desconsiderando acentos, caixa e espaços, reabre o caderno da mesma seleção de fontes e do mesmo alcance. Não refaz pesquisa, gravação ou revisão. Temas parecidos mostram os cadernos próximos, seu estado e a última atualização: escolha **Continuar este estudo** ou **Criar caderno separado**. Outra seleção de fontes também pede essa escolha. A comparação é local por palavras do título, sem IA ou consumo de cota; não garante detectar sinônimos ou todo assunto equivalente. Cadernos de projetos diferentes não são confundidos. Estudos antigos são sugeridos para leitura, sem conversão silenciosa. Notas já preenchidas oferecem **Aprofundar no Perplexity**.

**Pesquisar no Perplexity** usa a conta web do usuário. Mostra a pergunta e pede confirmação antes de abrir no navegador. Só o tema e a orientação da pesquisa são enviados; notas privadas, anexos e documentos locais não acompanham a busca. O usuário traz a resposta e os links para os campos do caderno: não há extração automática da sessão web nem chamada à API. Cancelar mantém as notas.

**Revisar e salvar Markdown** pede confirmação e preserva a versão anterior. Alterar notas desmarca a revisão; um rascunho fica fora do contexto automático. Para disponibilizar uma referência, é necessário marcar a revisão, ter notas e ao menos uma fonte HTTPS ou referência local selecionada. Estudar não declara as fontes como verificadas automaticamente. Alterações concorrentes ou de alcance impedem salvar sobre uma versão antiga; o rascunho permanece disponível para reconciliação.

Os Markdown ficam em `build/sandubah/gui/brain/studies/<id>/revisions/<versão>/`, com manifesto local. Os quatro documentos aparecem na biblioteca/mapa do Cérebro e ligam-se entre si. Somente notas disponibilizadas pelo usuário e resultados antigos aceitos pela triagem entram na busca da Central, respeitando o alcance Central/projeto. A busca escolhe trechos relevantes, inclusive no modo Completo.

Estudos anteriores em harness permanecem preservados. **Ler estudo anterior** consulta seu `STUDY.md` sem executar a missão nem converter o estudo em app. A preparação específica de fine-tuning e as missões existentes conservam seus fluxos separados e as configurações abaixo:

- Codex: modelos anunciados pela conta/CLI, com código e testes no workspace privado.
- Claude: modelos configurados na integração, com estudo e síntese sem ferramentas ou comandos.
- IAs neste PC: modelos locais disponíveis; execução só depois de validação, com as proteções de RAM/VRAM. Não há ajuste de força se o adaptador não o suporta.
- MCP: ferramenta local explícita, com validação dos argumentos e confirmação.

O catálogo não garante acesso ou saldo. A força só oferece níveis anunciados pelo modelo; Ultra/multiagentes não é usado na fila de um worker. Vídeos são referências amostradas pelo fluxo de anexos, não uma promessa de compreensão integral ou transcrição de áudio. Links de skills não autorizam instalar ou executar seu conteúdo. Ações protegidas continuam exigindo confirmação.

## Opções do planejamento

Na conversa, **Entrevista · Grill-me**, **Organizar agentes** e **Revisar harness** são botões de ligar/desligar por projeto, não sugestões que preenchem a mensagem. A escolha persiste ao trocar de modelo ou reabrir o aplicativo e é incluída no contexto de controle da próxima consulta. O texto da conversa não é alterado nem enviado automaticamente. O contexto continua disponível na revisão opcional antes de enviar.

A entrevista usa a mesma preferência Grill-me do projeto. A organização e a revisão orientam o planejamento, não iniciam trabalhadores, instalações ou alterações por conta própria. Em uma nova ideia, a escolha fica no rascunho e é herdada quando a construção cria o projeto. Todas as confirmações continuam obrigatórias.

No planejador de nuvem, as três opções atuais também são enviadas como controle estruturado nas instruções do aplicativo, separado dos documentos e do histórico. O servidor usa a escolha persistida, não uma preferência arbitrária enviada pelo cliente. A confirmação mostra as opções ativas. Entrevista trata uma decisão por resposta; organização distingue agentes de IA de usuários do produto e pede papéis, sequência e dependências; revisão pede lacuna fundamentada nos Markdown e próximo passo verificável. São orientações ao modelo, não uma garantia determinística de obediência em qualquer conversa.
