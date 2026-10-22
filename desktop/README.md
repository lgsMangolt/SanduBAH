# Código desktop do SanduBAH

Esta pasta contém o código da personalização desktop, scripts de build e testes revisados. Não contém projetos de usuários, Cérebro pessoal, conversas, credenciais, modelos, executáveis ou dependências instaladas. A página na raiz do repositório continua sendo uma demonstração estática independente.

## Trabalhar no código

O SanduBAH é uma camada de personalização sobre o [Ruflo](https://github.com/ruvnet/ruflo), não uma cópia completa do monorepo. Os caminhos internos são relativos à raiz de uma cópia de desenvolvimento do Ruflo. Para continuar:

1. Prepare uma cópia separada do Ruflo, preservando a licença MIT e seguindo o build e os requisitos do upstream. Não use uma pasta contendo outros projetos como destino de sobrescrita.
2. Revise e aplique o conteúdo desta pasta como overlay nessa cópia. `src/`, `scripts/` e `tests/` correspondem aos diretórios de mesmo nome do Ruflo. Preserve alterações existentes e revise conflitos.
3. Os builds requerem Windows, Node, PowerShell, o CLI do Ruflo compilado em `v3/@claude-flow/cli/dist`, e dependências locais de build (Electron 44.7, Ajv, Playwright Core, electron-builder, electron-winstaller e ASAR). O preparador local espera essas dependências no diretório pai; adapte os caminhos ao ambiente, sem copiar arquivos de autenticação de outra pessoa.
4. Revise `scripts/build-sandubah-gui.ps1` e prepare o runtime local. Ele não é um instalador universal para ferramentas de desenvolvimento. O build da identidade exige fechar somente a instância local do SanduBAH e guarda backup do seu runtime antes de alterá-lo.
5. Execute testes com `node --test --test-concurrency=1`, depois de preparar o catálogo e o runtime. Os testes de integração usam a infraestrutura do Ruflo e fixtures; não são executáveis diretamente na pasta da demonstração web.

O build completo a partir de um novo clone deste overlay ainda precisa de uma validação específica. Não há garantia de reprodução de todas as dependências ou correções do monorepo a partir somente desses arquivos. O código pode conter funcionalidades posteriores ao instalador público 0.1.0: publicar fontes não atualiza automaticamente o instalador.

## Segurança e atualizações

- Não versionar `build/`, `.codex/`, `.claude/`, `.env`, workspaces, anexos, logs, banco do Cérebro, arquivos de autenticação ou chaves de assinatura.
- Cada pessoa instala e autentica suas próprias CLIs oficiais. Não incluir modelos locais no pacote por padrão.
- Manter confirmação antes de enviar dados ao modelo, executar ferramentas, aplicar arquivos, baixar ou instalar atualizações.
- Manter um worker por vez. Planejamento, estudos, execução de código e etapas de produto são capacidades diferentes; não simular sucesso ou tokens cobrados.
- O instalador e uma nova Release exigem build, auditoria e validação próprios, incluindo VM limpa. Este envio de fontes não publica um novo binário.
- Leia `CLAUDE.md` para o estado e as pendências da continuidade, e `SOURCE-MANIFEST.json` para a lista exata de arquivos exportados.

O código original do Ruflo mantém sua licença no arquivo `LICENSE`. As dependências preservam suas próprias licenças. A referência `claude-howto` é MIT e permanece uma fonte externa para consulta, sem ativação de hooks globais.
