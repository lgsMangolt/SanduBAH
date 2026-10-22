# Conversas e força por projeto

Em **Novo projeto**, trocar o modelo ou a força de raciocínio mantém o projeto selecionado, a conversa, o rascunho e os Markdown de referência. **Nova conversa** continua sendo a ação explícita para limpar o chat daquele projeto.

O perfil local do SanduBAH salva separadamente o histórico, o rascunho, a última contagem de tokens e o modelo escolhido de cada projeto. Ao voltar a outro projeto, suas escolhas e conversa são restauradas. O projeto ativo também é lembrado ao recarregar a janela. A nova ideia sem harness tem seu próprio rascunho.

A força é lembrada por combinação de projeto, provedor e modelo. Codex usa os níveis informados pelo catálogo local; Claude usa os níveis expostos pela CLI instalada: Baixa, Média, Alta, Extra e Máxima. Automática deixa o próprio modelo escolher o padrão. O motor Qwen atual não expõe esse ajuste. Níveis que delegam automaticamente para outros agentes não são oferecidos, mantendo um worker.

A confirmação mostra modelo e força antes do envio. Nenhuma consulta começa apenas por trocar uma opção. A interface conserva todo o histórico visível; a regra de envio das últimas seis mensagens continua informada no resumo de contexto. Imagens anexadas são mantidas em memória ao alternar projetos, mas precisam ser anexadas novamente após recarregar o aplicativo.

Se o armazenamento do perfil falhar, a interface avisa e mantém a conversa integral em memória. Não recarregue a janela nesse caso.

Validação: testes de sessões, argumentos das CLIs e confirmação; teste Electron de troca Haiku → Opus, preferências por modelo, alternância entre projetos, rascunhos, histórico e recarga. As respostas usadas pelo teste de interface são simuladas e não consomem cota dos provedores.

## Conexão com Claude e novas tentativas

Antes de iniciar o Claude, o SanduBAH atualiza apenas seu perfil privado quando encontra um token válido mais recente no login principal. O token de renovação não é copiado para esse perfil; a cópia privada não renova nem escreve o login principal. Quando ambos os acessos estão expirados, a mensagem pede que você abra o Claude e confira o login.

`scripts/repair-sandubah-claude-auth.cjs` repara essa cópia e executa somente `claude auth status`. O recibo fica em `build/sandubah/gui/claude-auth-validation.json`, sem tokens, conversas ou credenciais. Isso valida o reconhecimento do login; não comprova uma resposta real de um modelo nem consome uma geração de planejamento.

Falhas de autenticação, cota, modelo, força ou orçamento recebem explicações próprias. O limite de custo continua igual e nenhuma falha dispara outra chamada automaticamente. Reenviar a mesma mensagem que falhou reutiliza o balão existente, mantém o rascunho e pede confirmação novamente. Ao recarregar, tentativas antigas idênticas e consecutivas são reunidas; mensagens com resposta concluída são preservadas.

## Chat com recibos de mensagem

- Relógio: preparando o envio ou aguardando confirmação.
- Um risco cinza: a mensagem foi entregue ao processo do planejador.
- Dois riscos cinza: o motor informou recebimento/início da resposta.
- Dois riscos azuis: o motor começou a produzir raciocínio ou resposta. “Visualizada” representa esse sinal de processamento; não há uma confirmação separada de leitura semântica da mensagem.
- Nuvem com três pontos: o modelo está preparando ou produzindo a resposta. Some ao concluir, falhar, cancelar ou interromper. A preferência do sistema por movimento reduzido desliga a animação.

Os recibos avançam por eventos observados, sem temporizadores que inventem recebimento. Codex usa eventos de raciocínio/resposta; Claude usa streaming; Qwen usa os sinais locais de geração e de tokens. Provedores que só entregam o resultado final podem pular etapas visuais. A última confirmação permanece salva na conversa, inclusive se a geração falhar depois.

O teste de interface injeta eventos controlados para conferir cores, quantidade de riscos, nuvem e interrupção. Essas capturas são exemplos de teste, sem consumo de modelos reais.
