# 🥪 SanduBAH

**Sua ideia encontra uma equipe.**

Uma prévia interativa de um ambiente para desenvolvedores que querem planejar, organizar conhecimento e acompanhar agentes de IA sem perder o contexto do projeto.

## Experimente

**[Abrir a prévia pública](https://lgsmangolt.github.io/SanduBAH/)**

Ou baixe os arquivos deste repositório e abra `index.html`. Não há instalação, compilação, login, chave de API ou dependência de terceiros.

> **Esta é uma demonstração estática, não o aplicativo desktop completo.** Mensagens, projetos, papéis, etapas e resultados são fictícios. A página não chama modelos, não programa de verdade, não lê arquivos e não consome sua cota.

## Explore a proposta

- **Novo projeto:** conversa, escolha ilustrativa de IA e força, Grill-me/Vibewase e confirmação antes da simulação.
- **Meus projetos:** lista única ligada ao conceito de Cérebro, com busca e continuidade.
- **Prévia lateral:** protótipo isolado, arquivos ilustrativos e etapas da simulação.
- **Catálogo:** harness, MCP, CLI, skills, plugins e AR Board, sem instalação automática.
- **Cérebro:** Markdown conectado, preparação de estudo e de fine-tuning.
- **Escritório:** galpão gaúcho em pixel art, com opção 2D leve e representação dos papéis.
- **Configurações:** integrações explicadas, todas desconectadas nesta página.

O desktop em desenvolvimento combina CLIs instaladas, contexto Markdown e execução confirmada em workspaces privados. **Esse backend e os runtimes não estão distribuídos aqui.** O objetivo deste repositório é compartilhar a direção visual e o fluxo de uso, receber feedback e preparar uma distribuição revisada.

## Privacidade

- Somente projetos de demonstração: Aurora, Atlas e Farol.
- Sem conversas, clientes, endereços, diretórios locais, Cérebro pessoal, credenciais, anexos ou logs do ambiente de desenvolvimento.
- Sem analytics, formulários externos, fontes remotas ou chamadas de API pela aplicação.
- Textos da simulação vivem apenas na memória da aba e desaparecem ao recarregar. Não inclua informações pessoais.
- O provedor de hospedagem pode manter seus próprios registros de infraestrutura; isso é independente da aplicação.
- A prévia não apresenta tokens fictícios como contagem real de um provedor.

## Estrutura

```text
index.html       interface da demonstração
style.css        visual responsivo
app.mjs          navegação e simulação local
prototype.html   projeto fictício na prévia isolada
prototype.css    visual do projeto fictício
assets/          identidade e cenário ilustrado
```

## Feedback

Abra uma issue com sugestões de fluxo, acessibilidade ou documentação. Não publique tokens, logs privados, conversas ou dados de clientes. Para vulnerabilidades, consulte `SECURITY.md` antes de abrir uma issue pública.

## Origem e créditos

O SanduBAH nasceu como uma personalização local do [Ruflo, por ruvnet](https://github.com/ruvnet/ruflo). Esta prévia estática não é um release oficial do Ruflo e não redistribui o produto completo, modelos de IA ou CLIs proprietárias. A licença MIT e os avisos do projeto de origem são preservados no arquivo `LICENSE`. Os nomes dos provedores pertencem aos respectivos titulares; não há afiliação implícita.

## Próximos passos

- Revisar dependências, instalação, limites e privacidade antes de distribuir o desktop.
- Documentar integrações e testes reproduzíveis por plataforma.
- Evoluir o fluxo com feedback da comunidade, sem prometer execução autônoma sem supervisão.

**Uma etapa verificável por vez. Bah.**
