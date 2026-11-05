# Relatório de confiabilidade — 24/10/2026

## Decisão e escopo

Após a avaliação dos 30 perfis hipotéticos, foi priorizada uma correção pequena e verificável do primeiro uso, em vez de adicionar mais funcionalidades. Os relatos são simulação qualitativa, não entrevistas nem prova de adoção. Esta etapa trata da escolha explícita de executor e da clareza antes do envio; não encerra todo o backlog.

Um worker, dados fictícios e ferramentas já instaladas. Sem chamadas a modelos, novas instalações, publicação, alterações de autenticação ou preferências globais. Gateway, Corel, impressão, filas e serviços externos permanecem fora do escopo.

## Defeito reproduzido e corrigido

Em **Construir / alterar o projeto**, a interface liberava o envio quando encontrava Codex instalado e um login local, mesmo se o planejador selecionado fosse Claude ou IA local. O backend criava uma missão Codex e só copiava modelo/força quando a seleção atual já era Codex. Isso permitia uma mudança implícita de executor e o uso do padrão dele. A confirmação existente continuava presente; não era execução sem confirmação. Ainda assim, a escolha na tela podia divergir da ferramenta usada.

Agora:

- Construção nessa integração exige escolher Codex explicitamente. Claude e IA local continuam disponíveis para planejar; não foram removidos ou trocados automaticamente.
- A interface explica a incompatibilidade e oferece conferir a IA ou voltar a planejar, sem apagar projeto, conversa ou rascunho.
- O backend compara provedor, modelo e força enviados pela tela com a seleção corrente. Ausência, divergência, modelo removido e força inválida são recusados antes de acessar ou preparar o projeto.
- A missão recebe uma cópia da seleção validada. Sua confirmação mostra a força efetivamente resolvida para executar, além do modelo; uma força ausente não é apresentada como conhecida.
- Cancelamento continua sem chamada ao worker. Uma missão já preparada pode permanecer pendente; retentar o mesmo pedido pendente não cria outra missão.

## Clareza do primeiro uso

O formulário ganhou a conferência **Próximo passo: revisar e confirmar**, com detalhes opcionais sobre IA, conta, projeto, custos e controle do usuário.

Encontrar CLI e arquivo de login não aparece mais como acesso remoto garantido. A tela distingue configuração local de autenticação válida, acesso ao modelo e cota. Falhar ao consultar o status bloqueia o envio, mesmo quando havia uma leitura anterior favorável.

Também diferencia planejamento de criação de arquivos; execução no workspace de aplicação/publicação; quadros de vídeo de análise integral/áudio; e gratuidade do aplicativo de custos externos. O painel apenas usa o status existente: não consulta cotas, autentica, instala nem chama modelos por conta própria.

## Evidências

| Verificação | Resultado | Limite |
|---|---|---|
| Regressões focadas em prontidão, construção e confirmações | 17/17 passaram | Worker de teste, não provedor real |
| Lote habitual SanduBAH + distribuição, serial | 297/297 passaram, zero falhas | Exclui worker-panel, launcher e source-export; não é toda a base Ruflo |
| Interface Electron e controlador reais | Passou | Contas, MCP e worker simulados; dados fictícios isolados |
| Diálogo de confirmação | Cancelar e aprovar exercitados na tela | Duas confirmações, uma execução simulada, zero chamadas a modelos |
| Modelo/força e projetos | Bloqueios, cancelamento, missão sem duplicar e troca de projeto preservando conversa/rascunho passaram | Não valida OAuth em máquina nova |
| Usabilidade focada | Teclado no expansor, foco no seletor e painel a 430 px passaram | Não substitui auditoria completa de acessibilidade |
| Rede e tokens no ensaio | Zero requisições HTTP(S), tokens não informados aparecem como indisponíveis | Nenhum uso real de provedor foi inventado |
| README público do usuário | Hash preservado | Nenhum arquivo do clone público alterado |
| Exportação e auditoria textual focada | Teste de bloqueio de segredos 1/1 e 12 arquivos aprovados | Rodada separada do lote de 297; nenhuma exportação, publicação ou auditoria exaustiva executada |

Os sete novos casos estão em `tests/regression/sandubah-planner-readiness.test.cjs`. O teste de construção existente também passou a selecionar explicitamente seu modelo fictício. A fixture é `scripts/test-sandubah-planner-readiness-ui.cjs`; recibos com hashes dos fontes e capturas ficam em `build/sandubah/gui/tmp/planner-readiness-ui-*`. Logs: `readiness-red.log`, `readiness-focused.log`, `readiness-ui.log` e `readiness-regression.log` na mesma pasta temporária.

Falhas durante o desenvolvimento: a regressão inicial reproduziu a falta de bloqueio; os testes do novo módulo falharam antes de ele existir. Depois, uma asserção de texto diferiu apenas em maiúscula/minúscula e foi ajustada. O primeiro início da fixture usou um caminho incorreto para verificar o README público; corrigido o controlador de teste, antes de abrir o aplicativo. Esses erros não são falhas atuais de OAuth nem evidência de defeito na instalação.

## Pendências priorizadas e riscos

| Próxima etapa | Critério de aceite | Risco enquanto pendente |
|---|---|---|
| Primeiro uso real em conta de teste | Instalar, autenticar, criar, confirmar, testar e retomar um projeto; exercitar cota/login inválidos | Instalação funcionar, mas a primeira entrega não |
| Recuperação por missão | Revisar e restaurar o conjunto de arquivos, com falha parcial testada | Checkpoints individuais deixarem arquivos incompatíveis |
| Setup reproduzível | Clone em caminho curto, dependências fixadas, downloads confirmados, build e testes em ambiente novo | Colaboradores dependerem do runtime do desenvolvedor |
| Atualização 0.1 → 0.2 e assinatura Windows | Migração real, interrupção, recuperação e fluxo visual; Authenticode tratado separadamente do canal Ed25519 | Migração não comprovada e aviso de editor desconhecido |
| Evidências do produto/X-Tudo | Requisito ligado a comando, artefato, resultado e aceite; origem dos resultados verificável | Confundir relato, animação ou missão concluída com produto aprovado |
| Clientes e vídeos | Retenção/exclusão de cópias definidas e uma produção de vídeo validada | Cadastro excluído não remover dados presentes em arquivos; missão não equivaler a renderização |
| Desempenho e acessibilidade | Medições em PC modesto e testes com teclado/leitor de tela em todo o fluxo | Público inicial não conseguir usar com autonomia |
| Publicação coerente | Revisar exportação e documentação, autorizar commit/Release e testar o novo pacote | Fontes locais, GitHub e instalador divergirem |

O `ROADMAP.md` do clone público ainda contém estados históricos que devem ser reconciliados na próxima publicação autorizada; ele não foi alterado nesta etapa. A documentação local de origem foi atualizada para distinguir a Release 0.2.0 das mudanças posteriores. Personalização dos gauchinhos no escritório 3D, renderização de vídeos, LoRA e colaboração simultânea não foram entregues por esta correção.

## Privacidade e referência jurídica

Escopo inicial brasileiro, sem presumir aplicação automática a outros países. A skill `leis-brasil` foi consultada seletivamente. Sua seleção curta retornou artigo com baixa aderência à mudança; não foi usada como cobertura jurídica suficiente. A fonte oficial da [LGPD, arts. 3º e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) foi conferida em 24/10/2026 para âmbito e segurança. Seleção explícita e confirmações são medidas de produto, não uma declaração de conformidade. Base legal, transferência internacional, retenção e segurança abrangente continuam dependendo do uso e de revisão específica.

## Entrega

Alterações somente nos fontes locais. Não foi reconstruído o instalador, não foi reiniciado o aplicativo pessoal e nada foi enviado ao GitHub. O README público com edição do usuário e os trabalhos anteriores foram preservados. A próxima etapa recomendada é o primeiro uso autenticado em ambiente separado, após autorização específica para conta, envio de contexto e eventual consumo de cota.
