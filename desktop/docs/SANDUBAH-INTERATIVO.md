# Entrevista, conexões e escritório

## Grill-me por projeto

Abra Meus projetos → Grill-me e recomendações. A lista é a mesma conhecida pelo Cérebro. Cada etapa tem uma caixa de resposta, opções sugeridas, ajuda, voltar e avançar. Aguarde “Salvo no projeto” antes de fechar o aplicativo. O salvamento automático ocorre após uma breve pausa na digitação; as escolhas também são salvas ao avançar. O resumo final permite revisar cada resposta.

São seis temas: objetivo, público, dados, restrições, evidência de sucesso e próximo passo. Perguntas e sugestões são adaptadas por regras locais às respostas anteriores (integrações, pesquisa, uso local e limites). Não é uma entrevista gerada por LLM a cada tecla e não consome cota. O aprofundamento com Codex continua sendo uma missão pendente, sujeita à revisão e confirmação. Grill-me e Vibewase continuam independentes por projeto.

Respostas ficam no estado local do cérebro; o ponto de retomada fica no perfil do aplicativo, separado por projeto. Atualizações parciais não apagam outras respostas. Limites de tamanho e detecção de credenciais continuam ativos. Nenhuma confirmação de execução é removida.

## Configurações → Conexões

Mostra MCP conectado ou desconectado, presença das CLIs/login de Codex e Claude, modelos locais e respectivas validações, fontes Markdown e Perplexity web. Login detectado não significa acesso validado a todos os modelos. Links levam às telas existentes; instalações, envio de contexto e pesquisa continuam sujeitos às confirmações. O painel não configura gateway nem credenciais globais.

## Escritório

Uma sala por harness e uma mesa por agente cadastrado. O modo 2D é o padrão leve; 3D usa perspectiva CSS isométrica, sem carregar biblioteca 3D ou modelo de IA. A escolha persiste e movimento reduzido é respeitado. Somente mesas em execução recebem movimento em 3D.

Progresso é a contagem de missões concluídas, não uma porcentagem inventada da tarefa atual. Clique numa mesa para ver missões e eventos recebidos; “Continuar no harness” abre o projeto correspondente. A aba não executa missões. Eventos detalhados são acompanhados nesta sessão; depois de reabrir, resultados salvos são revisados no harness. Estado desconhecido não vira sucesso, e papéis ociosos não são processos de IA rodando. Sessões externas de outras IAs não são monitoradas por esta aba.

## Validação

Testes de regressão cobrem adaptação, persistência parcial, limites, estados reais e confirmação obrigatória. O teste Electron verifica entrevista completa e retomada, conexões, navegação, 2D/3D persistido e evento de execução via fixture claramente separado de execução real. Nenhuma chamada paga ou missão real é iniciada pela suíte de interface. Evidência: `build/sandubah/gui/brain-ui-validation.json`.
