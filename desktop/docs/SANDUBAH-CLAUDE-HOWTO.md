# Claude How To: oportunidades para o SanduBAH

Revisão em 22/10/2026. Fonte solicitada: [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto). Leitura dos módulos de memória, skills, agentes, MCP, hooks, checkpoints e trilha de aprendizado, com conferência de conceitos na documentação oficial do Claude Code. Nenhum exemplo, hook ou instalador remoto foi executado. As propostas abaixo não foram implementadas por esta análise.

## Prioridades propostas

1. **Pontos de retorno por missão.** Antes de alterações, guardar um estado versionado do workspace, preferências, fontes e resultados. Mostrar diferenças antes de restaurar, exigir confirmação e não sobrescrever alterações externas. Backups transacionais de dados precisam de estratégia própria; um checkpoint de conversa não desfaz ações externas. Referências: [guia](https://github.com/luongnv89/claude-howto/blob/main/08-checkpoints/README.md), [documentação oficial e limites](https://code.claude.com/docs/en/checkpointing).

2. **Cérebro e skills carregados em camadas.** Ampliar a busca seletiva existente: índice curto de nome, finalidade, origem, versão e compatibilidade; carregar instruções e recursos somente quando necessários. Separar Central, projeto e papel do agente. Evitar importar todo o guia ou todas as skills. Referências: [memória](https://github.com/luongnv89/claude-howto/blob/main/02-memory/README.md), [skills](https://github.com/luongnv89/claude-howto/blob/main/03-skills/README.md), [documentação oficial](https://code.claude.com/docs/en/skills).

3. **Portões de qualidade determinísticos.** Antes de concluir uma etapa, conferir evidências do executor: código de saída, testes realmente executados, artefatos e origem. Regras de segurança devem ser verificadas pelo aplicativo, não depender só da obediência do modelo. Gatilhos automáticos devem ficar no workspace e respeitar o escopo autorizado; não instalar hooks globais do tutorial. Referências: [hooks](https://github.com/luongnv89/claude-howto/blob/main/06-hooks/README.md), [documentação oficial](https://code.claude.com/docs/en/hooks-guide).

4. **Equipes reutilizáveis com contrato de entrega.** Modelos de equipe com papel, objetivo, ferramentas permitidas, fontes, custo conhecido ou desconhecido, artefato esperado e critérios de aceite. Uma entrega real pode atualizar o escritório e liberar a próxima etapa. Manter a execução sequencial quando o projeto está em um worker; animação não deve simular colaboração que não ocorreu. Referências: [agentes](https://github.com/luongnv89/claude-howto/blob/main/04-subagents/README.md), [MCP](https://github.com/luongnv89/claude-howto/blob/main/05-mcp/README.md).

5. **Tutoriais guiados e catálogo com compatibilidade.** Trilhas curtas e interativas para criar projeto, conectar conta, revisar contexto, executar e verificar evidências. Cada template deve informar quais recursos funcionam com Codex, Claude ou IA local; formatos e permissões específicos do Claude não devem ser copiados como se fossem universais. Referências: [trilha de aprendizado](https://github.com/luongnv89/claude-howto/blob/main/LEARNING-ROADMAP.md), [catálogo](https://github.com/luongnv89/claude-howto/blob/main/CATALOG.md).

## Relação com o estado atual

O SanduBAH já possui busca Econômico/Completo, fontes e tokens, preferências por projeto, fila serial, confirmações, relatórios de testes, estudos categorizados e Central. As propostas ampliam essas bases; não justificam refazer tudo ou remover proteções.

No adaptador atual, Codex executa código e testes; Claude e IAs locais fazem planejamento ou síntese sem comandos neste fluxo. Suporte a execução e ferramentas deve ser tratado como capacidade específica de cada integração, com revisão própria, não como uma opção visual que libera tudo.

O guia tem [licença MIT](https://github.com/luongnv89/claude-howto/blob/main/LICENSE). Uma eventual reutilização de conteúdo ou código deve ser revisada, com seus avisos e atribuição preservados. A análise não instala dependências nem altera as configurações globais do Codex ou Claude.

## Referência instalada para consulta

O repositório foi obtido como referência inerte em `build/sandubah/references/claude-howto`, revisão `188f468893231cbe4525f45e657d554746232072`, preservando a licença MIT. Nenhum hook, skill, plugin, comando ou instalador do guia foi executado ou ativado globalmente. O clone não é um diretório de fontes do Cérebro e não entra automaticamente no contexto. Este índice curto aponta somente aos capítulos necessários; o acervo completo não acompanha a publicação do SanduBAH.

As cinco propostas continuam sendo um backlog, não funcionalidades entregues. A busca seletiva, os controles por projeto e as confirmações já existentes são preservados. Checkpoints transacionais, gates novos, templates de equipe e trilhas adicionais precisam de implementação e testes específicos.

## Aprendizado do teste das opções

Uma consulta real com Luna mostrou que apenas mencionar a organização no contexto documental não garantiu papéis de agentes na resposta. A correção local separa as três preferências confiáveis do histórico e dos documentos nas instruções do planejador. O servidor usa as opções persistidas e a confirmação as exibe. Isso melhora o controle, mas não transforma respostas de um modelo em garantias determinísticas.
