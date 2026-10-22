# Créditos e origem do código

O SanduBAH é um projeto independente construído sobre a base de outro projeto de código aberto. Esta página registra de onde vem cada parte.

## Base: Ruflo

- **Projeto:** [Ruflo](https://github.com/ruvnet/ruflo), de **ruvnet**
- **Licença:** MIT, Copyright (c) 2024-2026 ruvnet. O texto original está em [`app/LICENSE`](app/LICENSE) e continua valendo para essas partes.
- **Versão usada:** commit `6cdad1ae0e4123a307a257b06d4a89b3962f1a53` (19/10/2026), importado sem alterações em `app/`. A árvore importada tem o mesmo hash do original: `3ec584c7498190c1376da9194ab2747deccebca2`.
- **O que veio da base:** o servidor MCP local e a coordenação de agentes, a CLI e os pacotes `v3/@claude-flow/*`, os agentes, skills, plugins e hooks em `.claude/` e `.agents/`, e a documentação original do Ruflo.

Na interface do SanduBAH, a base aparece como "motor local". Os pacotes internos mantêm os nomes originais.

## Alterações sobre a base

Depois da importação, um commit separado aplica ajustes em arquivos da base para a suíte de testes rodar no Windows (testes do CLI, helpers de `.claude/` e validação de caminhos). O histórico do git mostra exatamente o que mudou em relação ao original.

## SanduBAH

Parte própria do projeto, © 2026 lgsMangolt, também sob a licença MIT:

- interface e processo principal do app desktop: `app/src/sandubah-desktop/`
- distribuição, instalador e CI: `app/src/sandubah-distribution/`, `app/src/sandubah-*-ci/`, `app/scripts/*sandubah*`
- testes de regressão: `app/tests/regression/sandubah-*` e `app/tests/sandubah-distribution.test.cjs`
- documentos: `app/docs/customization/`
- demonstração web na raiz do repositório

Desenvolvido com auxílio de Claude e Codex.

## Outras referências

- [claude-howto](https://github.com/luongnv89/claude-howto) (MIT), usado apenas como material de consulta; nada dele é executado.
- As dependências instaladas no build mantêm as próprias licenças.
