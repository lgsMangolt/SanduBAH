# Qwen local no SanduBAH

## Contexto integral do harness — 20/10/2026

O planejador agora reúne os cinco Markdown do harness (`HARNESS.md`, `AGENTS.md`, `CONTEXT.md`, `BOARD.md`, `MEMORY.md`), os documentos anexados e as referências dos agentes, sem truncar cada arquivo. Referências repetidas são incluídas uma vez. Os metadados canônicos incluem o nome completo do projeto; a instrução de leitura pede preservar nomes, sufixos e caminhos sem abreviar. Conteúdo dos documentos continua sendo referência, nunca autorização para executar.

O limite de transporte permanece em 6.000 caracteres de contexto e o limite de inferência em 2.048 tokens totais, incluindo conversa, imagem e resposta. Pedidos que não cabem são recusados explicitamente, não cortados ou resumidos silenciosamente. Isso não significa suporte a projetos de tamanho ilimitado.

Validação: **48 testes Node e 15 testes Python passaram**, em série. Incluem finais de arquivos além dos antigos cortes de 1.200/1.000 caracteres, todos os cinco documentos, referências deduplicadas e recusa de excesso. A primeira tentativa real com contexto integral ultrapassou o teto de VRAM e foi interrompida. O worker foi então ajustado para carregar o encoder visual somente durante seu forward e liberá-lo antes da linguagem, preservando pesos e precisão. As opções de desalocação mimalloc são locais ao processo Python, sem mudar a memória virtual do Windows; veja a [documentação do alocador](https://github.com/microsoft/mimalloc#environment-options).

**A revisão do worker ainda não está aprovada para uso.** A nova validação real foi interrompida por memória comprometível insuficiente: começou com cerca de 11,5 GB disponíveis e atingiu cerca de 69 MB, apesar de ainda haver 2,53 GB de RAM física. Nessa tentativa o pico amostrado da GPU inteira foi 2.972.553.216 bytes, abaixo de 3,9 GB. Não houve resposta completa nem aprovação de conversa/diagrama/harness nessa revisão; o recibo antigo não é reutilizado porque o hash do worker mudou. O painel permanece protegido até repetir o smoke e o teste real com recursos disponíveis. Gateway, Corel, impressão e configurações globais não foram alterados.

Para concluir, rode primeiro o worker com `--mode smoke --model qwen-2b --image <caminho local absoluto de harness-diagram.png>`; somente após aprovação rode `scripts/test-sandubah-qwen-ui.cjs --real-harness` usando o Node local. Execute uma etapa por vez, mantendo os limites originais. Nenhuma configuração de gateway é necessária.

## Planejador de harness — interface revisada em 20/10/2026

A conversa agora ocupa a área principal; os modelos ficam ao lado no desktop e abaixo em telas menores. Escolha um projeto em **Contexto do projeto** para incluir seus Markdown ou use uma nova ideia. Os atalhos de entrevista, agentes e revisão apenas preenchem a mensagem; o envio acontece pelo botão **Planejar meu harness**.

O caminho normal é **Usar no planejador**, disponível no cartão de uma IA aprovada. Essa ação só muda a seleção local, sem baixar pesos, iniciar testes ou pedir confirmação de instalação. **Repetir testes** é uma ação separada. Se uma IA reprovada estiver selecionada, o painel oferece o Qwen aprovado diretamente, sem enfraquecer a validação do modelo reprovado.

A seleção de Kimi incompatível era uma causa concreta do planejador indisponível. Agora a interface e o backend recusam selecionar modelos incompatíveis, e uma seleção antiga incompatível não é restaurada ao iniciar. O Qwen0.8B segue exigindo um recibo válido; não é liberado pelo resultado do Qwen2B. A confirmação dos testes também explica a diferença entre usar e testar.

Os limites de início continuam em 4 GiB de RAM física e 6 GiB comprometíveis livres, com um worker e teto de 3,9 GB na GPU inteira. A configuração do Codex é preservada no estado encontrado no início de cada tarefa, incluindo alterações externas recentes; não se restaura uma cópia antiga sobre correções do usuário ou do Claude.

Para reduzir RAM, o planejador encerra apenas o MCP ocioso da própria janela antes de carregar Qwen. A próxima ferramenta MCP reconecta automaticamente sob a trava única. A interface mostra **MCP em espera** nesse intervalo; o planejador local funciona independentemente dessa conexão. Se faltar memória, o aviso aparece também junto à conversa.

Validação desta revisão: **46 testes focados passaram**, incluindo seleção incompatível, gate de modelos, liberação/reconexão do MCP, contexto Markdown e memória. O teste Electron passou em desktop e tela compacta; reproduziu inicialmente a ausência do atalho de IA aprovada e passou após a correção. Um teste real com Qwen2B chegou a retornar uma resposta, mas a checagem do nome exato do harness não passou; esse uso semântico ainda não foi aprovado por esse teste. As tentativas seguintes encontraram falta de RAM no início ou durante o carregamento. O gate anterior do Qwen2B permanece intacto; não se apresenta esse resultado como aprovação geral do planejamento de harness.

## Estado em 19/10/2026

Pacotes instalados no venv local: PyTorch `2.7.1+cu128`, AirLLM `4.0.0`, Transformers `5.20.2` e bitsandbytes `0.50.2`. Download de 11 arquivos concluído; o peso principal de 4.548.221.488 bytes passou na verificação SHA-256 contra o LFS oficial. O recibo local contém os hashes.

Após nova autorização do usuário, o Brave foi fechado normalmente para liberar RAM. CUDA e NF4 passaram na GTX 1660 SUPER. A preparação gerou 27 arquivos de camadas, totalizando 1.245.353.454 bytes; pico amostrado de 3.031.986.176 bytes na GPU inteira. Os pesos originais foram preservados. A validação completa fica no recibo `receipts/smoke.json`; o painel só habilita envio quando esse recibo aprova conversa e diagrama e corresponde ao SHA-256 do worker atual.

**Qwen3.5-2B aprovado neste teste local e liberado pelo recibo real.** A integração continua experimental: esse resultado não garante a leitura correta de qualquer diagrama. O Qwen3.5-0.8B foi baixado, preparado e testado pela interface, mas **não passou na qualidade de conversa/diagrama** nesta integração; permanece bloqueado. Kimi K3 aparece como incompatível com este perfil.

### Retomada real: modelo leve instalado, teste reprovado

Após o usuário liberar RAM, a medição inicial encontrou cerca de 5,46 GiB físicos livres e 11,74 GiB de memória comprometível disponível. O SanduBAH ocioso foi reaberto pelo atalho da área de trabalho; nenhum outro aplicativo foi encerrado. As barras voltaram a medir. O erro anterior não tinha diagnóstico suficiente para atribuir uma causa definitiva.

- O fluxo real **Minhas IAs → Instalar e validar → Colocar na fila** reutilizou e verificou os pesos já baixados. Não houve necessidade de baixar novamente 1,77 GB.
- `models/qwen-0.8b/receipts/prepare.json`: sucesso em 24,14 s, pico amostrado de **2.152.534.016 bytes (2,15 GB)** na GPU inteira. NF4 nas matrizes de linguagem, visão/vetores/convoluções em FP16, um worker.
- `models/qwen-0.8b/receipts/smoke.json`: teste real de 144,27 s, pico de **2.310.934.528 bytes (2,31 GB)**, abaixo de 3,9 GB. Mínimos livres: 1.844.789.248 bytes físicos e 6.266.421.248 bytes comprometíveis.
- A conversa respondeu que não existia resposta única para 2 + 2 e atingiu o limite de 32 tokens, portanto falhou. O diagrama foi processado, mas a resposta `Centro: HARNES; Ligados: MEMORY, BOARD, AGENTS, CONTEXT` não transcreveu os cinco nomes completos. Isso reprova esta integração/configuração; não demonstra uma limitação geral do modelo original.
- `acceptancePassed: false`, `ok: false`, `ready: false`. Nenhum limite, teste semântico ou recibo foi relaxado para habilitar envio. O Qwen2B continua `ready: true` com seu recibo anterior e o worker original intacto.
- A interface distingue **baixado / instalado / validado**, mostra o diagnóstico da etapa em vez de atribuir todo erro à memória e, após preparar, oferece **Testar conversa e diagrama**, sem refazer a instalação.

### Barras de memória disponível

O rodapé de todas as abas mostra RAM e VRAM livres em barras, atualizadas a cada 5 segundos enquanto a janela está visível. Verde indica margem para **iniciar Qwen**; laranja informa quanto falta. A medição não libera modelos nem altera as proteções. Valores indisponíveis ou antigos não são apresentados como zero ou como memória suficiente.

- RAM física: livre/total em GiB, déficit ou folga sobre os 4 GiB mínimos para início. A memória comprometível disponível também aparece, pois o worker exige 6 GiB livres desse limite do Windows.
- VRAM física: livre/total em GB decimais. A margem de execução usa o teto de **3,9 GB para a GPU inteira**, incluindo outros aplicativos, não a capacidade total da placa. A reserva inicial continua sendo 1,5 GB para o alocador + 0,35 GB de margem.
- São referências do adaptador Qwen atual, não uma garantia de execução nem aprovação para Kimi. Durante uma tarefa continuam sendo margens de **início**; o monitor de segurança do worker mantém seus próprios limites de execução.
- `scripts/sandubah-memory.py` usa apenas a API de memória do Windows e NVML, sem carregar Torch, modelo, worker de inferência ou serviço HTTP. Uma sondagem curta por vez, cache de 5 s, timeout de 3 s e saída limitada a 8 KiB. Nenhum novo pacote foi instalado.
- Se o Python falhar, a RAM física ainda é obtida pela API nativa do Node. VRAM e memória comprometível ficam explicitamente indisponíveis, sem supor zero ou liberação para executar. O código de saída e um diagnóstico limitado ficam visíveis para investigar a causa.
- A altura da barra ajusta o espaço do conteúdo e da fila; o painel mantém indicadores acessíveis e informa falhas de leitura. O helper fica separado para não invalidar o hash do worker nem o recibo aprovado do Qwen2B.
- Validação atual: **103 testes Node passaram**, com concorrência 1, incluindo os novos testes de fallback da RAM e diagnóstico do instalador. O teste Electron passou com leitura real de memória, cenários simulados de falta/folga/indisponibilidade, estados de instalação e layout compacto. Evidência em `build/sandubah/airllm/receipts/memory-ui.json`; os cenários simulados não representam inferência do modelo leve. A inferência real está nos recibos separados de preparação/smoke.

### Histórico: download inicial do modelo leve pela interface

Em 19/10/2026, após autorização para baixar/instalar e testar o Qwen3.5-0.8B, a janela antiga e inativa do SanduBAH foi fechada normalmente e o atalho da área de trabalho reabriu a versão atual. Nenhum outro aplicativo foi fechado. O fluxo real **Minhas IAs → Baixar e instalar → confirmação nativa → fila** iniciou o download; não foram utilizados fixtures, API direta de enfileiramento nem alteração de gates.

- Download concluído: **11 arquivos, 1.769.917.190 bytes**, revisão `2fc06364715b967f1860aea9cf38778875588b17`. O recibo `models/qwen-0.8b/model-receipt.json` confirma `downloadVerified: true`; SHA-256 do peso e hashes Git blob dos demais arquivos foram verificados pelo instalador.
- A etapa automática de preparação foi recusada antes de carregar PyTorch/modelo: havia cerca de **2,81 GiB de RAM livre**, abaixo de 4 GiB. A memória virtual disponível estava acima do mínimo. Não foi gerado recibo de preparação nem de smoke para o modelo leve.
- Conversa e diagrama **não foram testados no 0.8B**. Nenhum consumo de VRAM de inferência foi medido para ele. O teto de 3,9 GB e a trava única permanecem inalterados.
- Interface deixada aberta com **Qwen3.5-0.8B selecionado**, estado **Baixado · validação pendente**, envio desabilitado e o motivo visível na fila. A trava de worker está disponível: nenhum worker de instalação/inferência ficou em execução.
- Para retomar depois de liberar memória, clicar **Instalar e validar**. Os arquivos já verificados são reutilizados, sem novo download dos pesos válidos. O Qwen2B continua com seu recibo aprovado e não foi alterado.
- Hashes de `config.toml`, `codex-worker.cjs` e `execution-policy.cjs` conferidos antes/depois e idênticos. Gateway e correções do Claude preservados.

### Validação completa autorizada em 19/10/2026

- Memória inicial: cerca de 5,6 GiB de RAM física e 12,9 GiB de memória virtual disponíveis. Um único worker; nenhuma aplicação foi encerrada por esta tarefa.
- O diagnóstico completo `sensitive --tokens 48` transcreveu os cinco nomes, sem nomes esperados no prompt: `Centro: HARNESS.md; Ligados: BOARD.md, MEMORY.md, AGENTS.md, CONTEXT.md`. Pico amostrado da GPU inteira: 3.661.180.928 bytes. Esse diagnóstico não libera o painel por si só.
- Depois da inclusão do seletor de modelo, o smoke da versão final passou: conversa `4.` e a mesma transcrição completa do diagrama, sem truncamento. Tempo total: 204 s; imagem: 157,75 s. Pico amostrado: **3.443.634.176 bytes (3,44 GB)**, abaixo de 3,9 GB. RAM física mínima livre: 902.094.848 bytes; memória virtual mínima: 5.269.041.152 bytes. A margem de RAM ficou estreita, mas acima da proteção de parada.
- `receipts/smoke.json` vincula modelo `qwen-2b`, aceite semântico e SHA-256 `16be4f840128205b97afa44541c723fce1bbef821fa88920017271c37157c44d`. `QwenPlanner.status()` retornou `ready: true`. Nenhum gate foi relaxado nem recibo fabricado para liberar o envio.
- Os hashes da configuração global do Codex, `codex-worker.cjs` e `execution-policy.cjs` continuam idênticos. O gateway não foi utilizado nem alterado.

### Minhas IAs e fila local

Abra **Minhas IAs**. Clique no nome para selecionar; isso não inicia download. Cada cartão tem **Info** com RAM, VRAM, espaço em disco, limitações e link oficial. Recomendações de RAM instalada e estimativas de VRAM são orientações conservadoras do SanduBAH, não mínimos oficiais nem benchmarks do modelo leve.

- **Leve — Qwen3.5-0.8B:** pesos oficiais fixados na revisão `2fc06364715b967f1860aea9cf38778875588b17`; aproximadamente 1,77 GB de download. Instalado; pico medido de 2,31 GB na GPU inteira neste teste curto, mas respostas não aprovadas. 8 GiB de RAM instalada sugeridos; exige as mesmas margens de início de 4 GiB físicos livres e 6 GiB de memória virtual disponível.
- **Médio — Qwen3.5-2B:** modelo existente, aprovado no teste acima; 16 GiB de RAM instalada sugeridos. Não é necessário baixar novamente.
- **Alto — Kimi K3:** modelo oficial de 2,8T parâmetros, com arquitetura diferente e sem adaptador validado aqui. Aproximadamente 1,4 TB só para pesos teóricos a 4 bits, sem overhead; isso não é uma recomendação oficial de RAM/VRAM. Não cabe no orçamento deste PC. Download e instalação ficam bloqueados, com fonte oficial acessível. Nenhuma API externa é configurada como fallback.

**Baixar e instalar** abre confirmação nativa. Após aprovar, a sequência é automática: download por bytes → verificação SHA-256 dos pesos e Git blob dos demais arquivos → preparação NF4 → smoke de conversa e diagrama. Uma falha para a instalação desse modelo e mantém seu envio bloqueado; não há repetição automática. Não baixa todos os modelos ao abrir o painel. O runtime Python/AirLLM existente é compartilhado; não instala pacotes globais.

A barra inferior é visível em todas as abas. Clique nela para abrir a fila, remover pendências ou interromper somente o processo da tarefa atual. Download mostra porcentagem real dos bytes; preparação e geração usam progresso indeterminado e mensagens de etapa, sem porcentagens inventadas. Missões e comandos em execução na sessão aparecem na barra; a fila de instalação espera a trava do harness/Codex. A fila é desta sessão e não retoma automaticamente após fechar o aplicativo.

Os modelos têm diretórios e recibos separados. O leve usa `build/sandubah/airllm/models/qwen-0.8b/`; o médio mantém o caminho existente. Ambos compartilham a mesma trava de arquivo. Seleção fica somente em `build/sandubah/airllm/model-selection.json`. Trocar de modelo limpa o histórico visual para não misturar conversas.

### Histórico: correção preparada antes da liberação

Em 19/10/2026 o usuário autorizou salvar o resumo no MCP. O registro `patterns/sandubah-airllm-runtime-validation` foi confirmado. Depois solicitou **continuar apenas preparando a correção**, sem novos carregamentos enquanto não liberar RAM. Esse adiamento foi posteriormente revogado pelo pedido de conferir a RAM e testar, cujos resultados aprovados estão na seção de validação completa.

- O AirLLM instalado comprime todos os tensores, incluindo o encoder visual, normalizações, convoluções e parâmetros da recorrência. Isso é uma hipótese concreta para a perda de precisão, ainda não uma causa isolada por comparação completa.
- O adaptador local agora mantém NF4 nas matrizes de linguagem e lê os demais parâmetros diretamente do checkpoint já baixado, convertendo-os para FP16. Trata-se de um perfil híbrido; não de todos os pesos em 4 bits.
- A leitura agrupa os tensores pelo arquivo original e clona seus dados antes de fechar o leitor. Um primeiro diagnóstico encerrou com violação de acesso em `torch_cpu.dll`; a tentativa posterior com essa estratégia concluiu sem essa falha. Não houve evidência de esgotamento de memória nos eventos consultados, mas a causa nativa não foi definitivamente isolada.
- Antes do adiamento, o diagnóstico curto com o perfil candidato respondeu `HARNESS.md`, corretamente, em 35,62 s / 5 tokens. Pico amostrado da GPU inteira: 3.472.662.528 bytes (3,47 GB). Evidência: `receipts/diagnose-sensitive-16.json`. Isso prova somente essa pergunta, não a leitura de todos os nomes e conexões.
- A tentativa do teste completo foi recusada antes do carregamento porque a RAM livre ficou abaixo de 4 GiB. Depois disso foram preparados os arquivos e executados apenas testes leves: **12 Python + 9 Node passaram**. A versão integrada do adaptador ainda não foi submetida a inferência completa.
- O recibo de falha anterior foi preservado em `receipts/smoke.before-vision-fix.json`. O hash atual do worker não corresponde ao antigo smoke, e `QwenPlanner.status()` confirma `ready: false`, `busy: false`.
- Nenhum pacote instalado, modelo original, gateway, configuração global, `codex-worker.cjs` ou `execution-policy.cjs` foi alterado.

Procedimento utilizado na retomada autorizada: diagnóstico completo `--profile sensitive --tokens 48`, conferência da resposta sem fornecer nomes esperados no prompt e depois smoke normal. `baseline` e `vision` são opções de diagnóstico para comparar os perfis sequencialmente, nunca em paralelo. Não reduzir os critérios de aceite nem habilitar a interface a partir de um recibo de diagnóstico.

```powershell
& .\build\sandubah\airllm\venv\Scripts\python.exe -I .\scripts\diagnose-sandubah-qwen.py --profile sensitive --tokens 48
```

### Evidência do smoke anterior, reprovado e preservado

- Pergunta curta `2 + 2`: resposta `4.`, 3 tokens, 19,98 s.
- Diagrama fornecido pelo usuário: 128 tokens, 689,44 s, saída repetitiva e truncada, sem identificar os arquivos. Uma tentativa anterior também terminou incompleta.
- Pico amostrado da GPU inteira: 3.570.958.336 bytes (3,57 GB), abaixo do orçamento de 3,9 GB. Alocação máxima PyTorch: 1.731.651.584 bytes. Não são medidas equivalentes nem prova de ausência de picos entre amostras.
- Mínimos registrados: 2.067.259.392 bytes de RAM física livre e 7.198.859.264 bytes de memória virtual disponível.
- Um worker; processo encerrou com código 1 e `acceptancePassed: false`. Nenhum teste pesado ficou em execução.
- Próximo diagnóstico: comparar precisão do encoder visual e do caminho FP16/NF4 com uma referência compatível, antes de repetir tentativas longas. A causa da resposta repetitiva ainda não foi isolada; não reduzir o critério de aceite para liberar o painel.

## Isolamento

O ambiente fica em `build/sandubah/airllm/venv`. Pesos, camadas, cache e recibos ficam em `build/sandubah/airllm/`. A instalação não altera Python global, configuração do Codex, Claude, gateway ou serviços. Não abre portas HTTP.

O modelo selecionado é `Qwen/Qwen3.5-2B`, revisão `15852e8c16360a2fea060d615a32b45270f8a8fc`. O download usa um worker, não utiliza tokens privados e verifica tamanho e SHA-256 dos pesos contra os metadados oficiais. Nenhum arquivo Python do repositório do modelo é baixado.

## Instalação

Execute `scripts/install-sandubah-airllm.ps1` informando explicitamente os caminhos de um Python 3.12 e do executável `uv`. O script exige 20 GiB livres, cria um venv local e instala PyTorch CUDA 12.8, AirLLM e dependências. As versões resolvidas ficam em `requirements.lock.txt` no diretório de instalação.

Depois execute, a partir da raiz desta cópia:

```powershell
& .\build\sandubah\airllm\venv\Scripts\python.exe -I .\scripts\download-sandubah-qwen.py
```

O download não carrega o modelo nem prepara a compressão. `model-receipt.json` e `settings.json` são o registro da etapa de download, não a fonte de estado do runtime. Evidências posteriores ficam separadas em `receipts/probe.json`, `receipts/prepare.json` e `receipts/smoke.json`.

## Runtime local

- Compressão AirLLM `4bit` nas matrizes de linguagem; visão e parâmetros não matriciais vêm do checkpoint original em FP16. Não é um arquivo GGUF.
- Precisão de execução FP16, com bloqueio de resultados não finitos.
- Orçamento conservador de 3.900.000.000 bytes na GPU inteira, incluindo outros aplicativos. O watchdog amostra a cada 250 ms; isso não prova ausência de picos entre amostras nem consumo exclusivo do modelo. Existe também limite conservador no alocador PyTorch.
- Uma imagem e um worker por vez; contexto inicial máximo de 2.048 tokens e até 128 novos tokens por resposta, com aviso de truncamento.
- Inferência offline; o processo não deve executar ferramentas sugeridas pelo modelo.
- Planejamento por linguagem natural e entrevista grill-me. A resposta não chama ferramentas, cria harnesses nem executa missões: o usuário revisa e utiliza o fluxo existente de Meu harness.

## Como usar

1. Reabra o SanduBAH e escolha **Minhas IAs** → **Qwen3.5-2B / Médio**. O envio é habilitado somente pelo recibo aprovado e correspondente ao modelo e worker atuais. Cada chamada confere novamente a memória.
2. Selecione um harness para incluir seus cinco Markdown e referências completos dentro dos limites seguros, ou planeje do zero. Contextos grandes são recusados explicitamente, sem cortes silenciosos.
3. Use **Anexar diagrama** para escolher PNG, JPEG ou WebP de até 10 MiB / 16 megapixels. A imagem é copiada para o ambiente local, não enviada à internet.
4. Converse e acompanhe o progresso por tokens. **Interromper Qwen** encerra apenas o worker iniciado pelo painel.
5. Use **Nova conversa** para limpar o histórico da tela e remover a imagem da próxima chamada. As cópias das imagens continuam em `build/sandubah/airllm/images/`; esse botão não apaga arquivos.

O modelo é liberado da memória após cada chamada. Há uma trava de arquivo entre processos, além da trava compartilhada com Codex/MCP na interface. Antes do carregamento, exige 4 GiB de RAM e 6 GiB de memória virtual disponíveis; interrompe se a RAM cair abaixo de 0,75 GiB, a memória virtual abaixo de 1,5 GiB ou o orçamento amostrado de VRAM for ultrapassado. Limite de 15 minutos por chamada. A aplicação não fecha outros apps automaticamente nem altera a memória virtual.

Na 1660 SUPER, o caminho de referência sem kernels opcionais é lento: respostas podem demorar minutos. Não há garantia de correção de todos os diagramas ou planos. Revise especialmente nomes, setas e integrações propostas.

## Adaptador e testes

`scripts/sandubah-qwen-worker.py` usa o AirLLM instalado sem editar seus pacotes. O adaptador descomprime NF4 em blocos pequenos para as matrizes de linguagem; para visão, vetores e convoluções, usa os pesos originais sem compressão adicional. Todos são convertidos para FP16. Transmite embedding e cabeça de saída separadamente, evitando mantê-los residentes com o encoder visual. A equivalência da descompressão em blocos é comparada com bitsandbytes no teste CUDA. A limpeza por camada libera tensores sem repetir uma coleta global de lixo; o watchdog permanece ativo. Marcadores de fim de mensagem são passados explicitamente porque o checkpoint não inclui `generation_config.json`.

Execute a partir da raiz da cópia, uma etapa por vez:

```powershell
& .\build\sandubah\airllm\venv\Scripts\python.exe -I .\scripts\sandubah-qwen-worker.py --mode probe
& .\build\sandubah\airllm\venv\Scripts\python.exe -I .\scripts\sandubah-qwen-worker.py --mode prepare
& .\build\sandubah\airllm\venv\Scripts\python.exe -I .\scripts\sandubah-qwen-worker.py --mode smoke --image .\build\sandubah\airllm\images\harness-diagram.png
& .\build\sandubah\airllm\venv\Scripts\python.exe -I .\tests\regression\test_sandubah_qwen.py
& .\build\sandubah\gui\node\node.exe --test --test-concurrency=1 --test-isolation=none .\tests\regression\sandubah-qwen.test.cjs
& .\build\sandubah\gui\node\node.exe .\scripts\test-sandubah-qwen-ui.cjs
```

O smoke espera o diagrama de HARNESS.md ligado a BOARD.md, MEMORY.md, CONTEXT.md e AGENTS.md. O teste da interface diferencia inferência real (recibo) de fixture usada apenas para testar renderização segura. Alterar o worker invalida o recibo anterior; repita o smoke antes de conversar. A interface JS/CSS é carregada diretamente, sem recompilar o launcher ou reinstalar o atalho.

O teste visual normal não carrega o modelo: verifica também o bloqueio real quando falta aprovação e usa fixtures explicitamente identificadas para renderização/XSS e fila de download, sem baixar pesos. Depois de um smoke aprovado, `test-sandubah-qwen-ui.cjs --real-chat` testa uma pergunta real pelo formulário. O recibo `ui.json` separa `realChat` de `downloadFixtureOnly`; a fixture da fila não comprova download/instalação real do modelo leve.

### Testes leves concluídos

- Nesta alteração: **93 testes Node + 13 testes Python do worker + 3 testes Python do downloader passaram**, serialmente. Os testes de links de segurança exigiram permissão fora do sandbox; não foram ignorados.
- A interface passou em cartões, Info, fontes, bloqueio do Kimi, fila/progresso/cancelamento (fixtures sem rede), renderização segura e layout compacto. `receipts/ui.json` registra `passed: true`, `smokeValidated: true`, `realChat: null`, `downloadFixtureOnly: true`. A captura `receipts/models-compact.png` foi inspecionada. Nenhum download real do modelo leve foi iniciado.
- Uma tentativa de conversa real pelo formulário chegou à resposta esperada, mas o teste falhou ao capturar a janela oculta do Electron. Na repetição com janela visível, a memória disponível caiu abaixo da margem e o worker foi corretamente recusado antes de carregar. Por isso não há aprovação integral de `--real-chat` nesta rodada; o recibo de smoke real continua válido e o painel confere RAM novamente a cada envio. A rodada final da interface foi feita sem inferência.

Histórico anterior:

- 12 testes Python e 9 testes Node específicos do Qwen passaram, incluindo seleção dos parâmetros preservados e clonagem antes de fechar o arquivo original.
- A suíte serial dos painéis/launcher/harness executou 85 testes: 81 passaram inicialmente e os quatro casos de hard links/junctions, bloqueados pelo sandbox, passaram na repetição autorizada. Nenhum teste foi enfraquecido ou ignorado. Um caso adicional de validação do recibo foi incluído depois e passou na suíte específica.
- O teste visual passou em navegação, bloqueio do envio, isolamento do renderer, política sem HTTP, texto sem XSS, nova conversa e layout compacto. `receipts/ui.json` registra `smokeValidated: false` e `realChat: null`; não equivale à aprovação do modelo.
- O SHA-256 de `config.toml` permaneceu idêntico antes/depois dos testes da interface. Os arquivos existentes `codex-worker.cjs` e `execution-policy.cjs` também não foram alterados.
- O registro adicional no MCP foi inicialmente bloqueado por privacidade e somente foi realizado após autorização explícita do usuário. Documentação e recibos detalhados permanecem nesta cópia local.

Fontes: [Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B), [Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B), [Kimi K3](https://huggingface.co/moonshotai/Kimi-K3), [AirLLM](https://github.com/lyogavin/airllm).
