# Clientes e vídeos

## Uso

- **Clientes:** nome obrigatório; empresa, contato e notas opcionais. Buscar, editar, ver projetos/vídeos vinculados e excluir com confirmação. Um cliente pode ter vários projetos e vídeos.
- **Meus projetos → abrir projeto:** seletor Cliente deste projeto no planejador e na tela do harness; salvar, trocar ou retirar vínculo. Botões para Clientes e Vídeos deste projeto. Fontes externas precisam primeiro virar um harness pelo fluxo existente de continuação.
- **Vídeos:** título, briefing, formato vertical/horizontal/quadrado, etapa manual, cliente, projeto e até cinco skills. Busca e filtros por cliente/projeto. Um vídeo pode ficar sem cliente ou projeto. Um projeto pode conter vários vídeos.
- O cliente do vídeo é independente do cliente do projeto. Ao escolher um projeto em um vídeo sem cliente, a interface sugere seu cliente; não altera o cadastro do projeto.
- A exclusão de cliente com vínculos é bloqueada: desvincule primeiro. Excluir um vídeo remove apenas o cadastro, não os arquivos ou missões já preparados.

## Skills e execução

Três skills originais estão incluídas: Briefing e roteiro, Storyboard e cenas, Revisão e entrega. A lista também apresenta skills pertinentes já disponíveis no catálogo local; nenhuma instalação é feita pela seleção. As skills incluídas são Markdown em `src/sandubah-desktop/video-skills/`.

Salvar seleciona as instruções para aquele vídeo. **Preparar missão com estas skills** requer projeto vinculado, briefing e executor já configurado no projeto; monta uma missão pendente, preservando modelo/força. Seleções são lidas integralmente, com fonte e SHA-256. Se excederem 16.000 caracteres junto do briefing, a preparação bloqueia, sem cortar ou criar missão parcial. Dois cliques com conteúdo/executor iguais reaproveitam a missão ainda pendente/em execução/desconhecida.

**Abrir projeto e revisar fila** usa o fluxo existente de confirmação e um worker. Preparar não chama a IA. A etapa do vídeo é manual, não mede progresso da missão nem comprova renderização. Nesta entrega, o roteiro prepara planejamento, storyboard e revisão; não foi adicionada uma engine de renderização, publicação ou envio ao cliente. As capacidades de Codex, Claude e IA local continuam as do executor existente.

## Persistência e privacidade

Dados e vínculos ficam em `build/sandubah/gui/clients-videos/clients-videos.json`, ou no perfil de teste isolado. Gravações usam o writer atômico e guardas de caminho existentes. Revisões por registro rejeitam edição desatualizada. Não há alteração dos Markdown do projeto para salvar contatos ou vínculos. Não se envia automaticamente nome, contato ou notas do cadastro à IA; o briefing e o contexto já conectado ao projeto continuam sujeitos à revisão de execução.

O arquivo local não é criptografado por esta funcionalidade. Não guarde segredos/dados sensíveis; o filtro de credenciais é uma proteção adicional, não garantia de detecção completa. Os limites atuais são 500 clientes, 1.000 vídeos e 4 MB de cadastro. O build privado não faz parte da exportação de fontes e não deve ser publicado.

Referência jurídica seletiva: uso inicialmente no Brasil; consulta à skill `$leis-brasil` e verificação do texto oficial da [LGPD, arts. 3º, 6º (necessidade) e 46 (segurança)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), em 23/10/2026. Campos mínimos, envio não automático e exclusão controlada são medidas de projeto; não certificam conformidade. Base legal, retenção, transparência ao titular, direitos de imagem/música e eventual transferência internacional dependem do uso e continuam sujeitos a revisão específica. A ferramenta não presume consentimento como única base legal.

## Testes

`tests/regression/sandubah-client-videos.test.cjs`: persistência, vínculos independentes, revisões, credenciais, confirmação de exclusão, bloqueio de referência/worker, preparação idempotente, skills e limite sem truncamento, corrupção sem sobrescrita e conexão da interface/IPC.

`scripts/test-sandubah-client-videos-ui.cjs`: componentes reais em Electron com armazenamento real isolado e dados fictícios; cadastro, vínculo nos dois sentidos, filtros, skills, missão pendente, proteção do rascunho, exclusão cancelada/bloqueada/confirmada, largura de 430 px e ausência de contatos no prompt. Diálogo de confirmação simulado na fixture; nenhuma execução real de modelo, renderização ou publicação. Recibos e capturas ficam em `build/sandubah/gui/tmp`.

Mudança local posterior à Release 0.2.0. Não atualizar GitHub ou instalador sem autorização própria.
