# Continuidade do SanduBAH

## Regras de trabalho

Trabalhar com um worker e mudanças focadas. Não alterar gateways, aplicativos externos, impressão, configurações globais de autenticação ou correções de outros agentes. Não publicar projetos, Cérebro pessoal, anexos, conversas ou chaves. Não restaurar ou sobrescrever alterações concorrentes. Ações protegidas continuam exigindo confirmação.

O conteúdo desta pasta é um overlay de desenvolvimento sobre Ruflo. Não confundir os fontes desktop, a demonstração web da raiz e o instalador público: são entregas diferentes. Antes de afirmar que uma funcionalidade chegou ao instalador, gerar, testar e publicar uma versão própria.

## Entregue nos fontes

- Cérebro com modos Econômico/Completo, fontes, omissões explícitas e distinção entre tokens estimados e uso retornado pelo provedor.
- Estudos com categorias, escopo Central ou projeto, triagem e contexto seletivo. Fine-tuning é preparação de pesquisa/dados, não treino fictício de pesos.
- Referência jurídica seletiva, por jurisdição e artigos pertinentes; não carregar o acervo inteiro e não prometer conformidade. Confirmar vigência e aplicabilidade em fonte oficial antes de concluir sobre obrigações.
- Controles por projeto para entrevista, organização de agentes e revisão do harness. As três preferências entram nas instruções confiáveis do planejador; não como comandos inseridos no chat nem como autorização para executar.
- Modelos e força por projeto, com catálogo por provedor e capacidades reais. Codex executa código/testes no workspace privado; as integrações atuais de Claude e IA local para estudo são síntese sem comandos.
- Prévia lateral isolada, execução confirmada, anexos, etapas de produto separadas das missões e tutoriais.
- Lateral reorganizada com Novo projeto em destaque. Avisos com contador persistido, overlay Windows 1 a 9 e 9+, leitura individual e geral e botão de teste sem chamar IA.
- Identidade Windows corrigida no runtime local, AUMID/CLSID estáveis e arquivamento do antigo atalho Electron apenas quando AUMID e executável pertencem ao SanduBAH. Nunca limpar caches globais nem atalhos de outros aplicativos.

## Validação e limites

As três opções do planejador foram testadas separadamente com Codex Luna e confirmação, em sequência. Retornos reais do provedor: entrevista 19.703 entrada / 47 saída; organização 20.316 / 656; revisão 19.725 / 590. Esses números são evidência daquela execução, não cota disponível nem previsão de custo de outra conta. Nenhuma resposta ou fonte privada acompanha este envio.

Os testes focados passaram em dois lotes seriais: 56 testes de planejador, opções, fila, avisos e workspace; 53 de Cérebro, identidade, avisos, publicação e atualização/distribuição. Os lotes têm casos em comum; não somar como se fossem todos distintos. A interface também foi testada com dez avisos, 1–9/9+, leitura geral e abertura a frio do executável local. O Windows passou a enumerar o AUMID como SanduBAH após arquivar o atalho duplicado Electron. A apresentação final de notificações depende também do Windows e das preferências do usuário; não afirmar inspeção visual da área de trabalho se não foi feita.

Durante o trabalho anterior, uma construção foi confirmada na interface compartilhada. O resultado foi preservado, não revertido. Os três testes finais de planejamento não alteraram os arquivos protegidos medidos. Não atribuir essas alterações privadas a esta exportação e não publicá-las.

Uma rodada posterior passou em 210 testes de regressão/distribuição, em sequência e com zero falhas, incluindo as alterações publicadas. O arquivo de testes do painel de worker ficou fora dessa rodada: seis casos já dependiam de um mock de DOM sem `matchMedia`. Não maquiar o resultado nem consertar código de produção para compensar o mock sem investigar. A suíte completa do Ruflo, esse arquivo e um clone limpo do overlay ainda precisam de validação própria.

## Claude How To

Referência: https://github.com/luongnv89/claude-howto, commit `188f468893231cbe4525f45e657d554746232072`, licença MIT. Foi obtida uma cópia local inerte para leitura. Não foram executados instaladores, hooks ou comandos do repositório, nem carregado todo o guia no contexto. Leia somente os capítulos pertinentes. Veja `docs/SANDUBAH-CLAUDE-HOWTO.md`.

Backlog autorizado, mas ainda não implementado:

1. Checkpoints por missão, diff e restauração confirmada, sem sobrescrever mudanças externas. Ações externas e bancos precisam de estratégias próprias de recuperação.
2. Metadados e carregamento progressivo de skills, com escopos Central/projeto/papel e compatibilidade por provedor.
3. Gates determinísticos de qualidade com evidências de saída, testes e artefatos; não instalar hooks globais nem confiar só na autoavaliação do modelo.
4. Templates de equipe com contratos de entrega e dependências, handoff real e execução serial. O escritório não pode representar trabalho fictício.
5. Trilhas guiadas adicionais e catálogo de capacidades reais de Codex, Claude e modelos locais.

Também permanece pendente a Arena após o Grill-me no planejamento de novos projetos. A proposta não equivale a uma integração pronta ou uma disputa já executada; revisar a skill e o consumo, confirmar antes de chamadas e manter um worker.

## Próximo passo recomendado

Conferir o diff desta exportação, preparar um ambiente de desenvolvimento reproduzível e escolher uma pendência por vez com testes. Não ativar publicação automática: cada envio público continua exigindo revisão de dados privados e autorização. Salvar mudanças localmente não significa que já foram enviadas ao GitHub.
