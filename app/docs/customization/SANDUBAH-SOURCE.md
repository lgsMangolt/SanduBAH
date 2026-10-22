# Código do SanduBAH

A pasta `app/` do repositório tem o código completo do aplicativo desktop: o SanduBAH e a base que ele usa. A página na raiz do repositório continua sendo uma demonstração estática independente. Não há projetos de usuários, Cérebro pessoal, conversas, credenciais, modelos, executáveis ou dependências instaladas.

## De onde vem cada parte

- **Base (motor local):** importada sem alterações do [Ruflo, de ruvnet](https://github.com/ruvnet/ruflo), commit `6cdad1ae0e4123a307a257b06d4a89b3962f1a53`, sob a licença MIT preservada em `app/LICENSE`. Inclui o servidor MCP local, a CLI (`v3/@claude-flow/*`), agentes, skills, plugins e hooks.
- **Ajustes na base:** correções de testes e helpers para Windows, num commit separado, depois da importação.
- **SanduBAH:** a interface e o processo principal (`app/src/sandubah-desktop/`), a distribuição e os instaladores (`app/src/sandubah-distribution/`, `app/scripts/`), os testes `sandubah-*` (`app/tests/`) e os documentos `app/docs/customization/`.

O nome Ruflo foi retirado da interface do SanduBAH, que se refere à base como "motor local". Os pacotes internos mantêm os nomes originais (`@claude-flow/*`), e os créditos ficam no `NOTICE.md` da raiz e nesta página.

## Trabalhar no código

1. Clone o repositório e trabalhe dentro de `app/`. Os caminhos dos scripts e testes do SanduBAH são relativos a essa pasta.
2. Os builds requerem Windows, Node, PowerShell, a CLI da base compilada em `v3/@claude-flow/cli/dist` e dependências locais de build (Electron 44.7, Ajv, Playwright Core, electron-builder, electron-winstaller e ASAR). O preparador local espera essas dependências no diretório pai; adapte os caminhos ao ambiente, sem copiar arquivos de autenticação de outra pessoa.
3. Revise `scripts/build-sandubah-gui.ps1` e prepare o runtime local. Ele não é um instalador universal para ferramentas de desenvolvimento. O build da identidade exige fechar somente a instância local do SanduBAH e guarda backup do seu runtime antes de alterá-lo.
4. Execute os testes com `node --test --test-concurrency=1`, depois de preparar o catálogo e o runtime.

Ainda não há um comando único que instale as dependências e prepare o runtime a partir de um clone limpo, e esse caminho ainda não foi validado de ponta a ponta. O código pode conter funcionalidades posteriores ao instalador público 0.1.0: publicar o código não atualiza o instalador.

## Segurança e atualizações

- Não versionar `build/`, `.codex/`, `.env`, workspaces, anexos, logs, banco do Cérebro, arquivos de autenticação ou chaves de assinatura. O `.claude/` dentro de `app/` é da base (agentes, skills e helpers) e faz parte da ferramenta; configurações locais de agentes ficam fora do repositório.
- Cada pessoa instala e autentica suas próprias CLIs oficiais. Não incluir modelos locais no pacote por padrão.
- Manter confirmação antes de enviar dados ao modelo, executar ferramentas, aplicar arquivos, baixar ou instalar atualizações.
- Manter um worker por vez. Planejamento, estudos, execução de código e etapas de produto são capacidades diferentes; não simular sucesso ou tokens cobrados.
- O instalador e uma nova Release exigem build, auditoria e validação próprios, incluindo VM limpa.
- Leia `SANDUBAH-HANDOFF.md` para o estado e as pendências da continuidade.

O código da base mantém sua licença em `app/LICENSE`. As dependências preservam suas próprias licenças. A referência `claude-howto` é MIT e permanece uma fonte externa para consulta, sem ativação de hooks globais.
