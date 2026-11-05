# Gauchinhos: peças e animações

## Personalizar

Em **Gauchinhos**, crie um personagem ou abra um existente e escolha **Aparência**. Há três combinações iniciais, sem impedir misturar as peças: Do galpão, Da oficina e Da campanha.

- Cinco tons de pele e cinco cores de cabelo.
- Cabelo curto, cacheado, comprido ou sem cabelo.
- Chapéu gaúcho, boina ou sem chapéu.
- Poncho, camisa ou colete, com cinco cores; quatro cores de lenço e três de bombacha.
- Óculos, fones, bigode ou nenhum acessório.

**Salvar aparência** guarda as escolhas no perfil daquele gauchinho. A prévia não chama modelos, não altera personalidade, lições, conversa, permissões, seleção de modelo ou instruções enviadas à IA. Perfis anteriores recebem uma aparência padrão durante a leitura, sem migração destrutiva.

Sete movimentos ilustrativos: descansar/piscar, caminhar, digitar à mesa, conversar, tomar chimarrão, comemorar e pular. O interruptor **Animar este gauchinho** é persistido. A preferência de movimento reduzido do sistema prevalece sobre a animação automática da prévia. Alternar movimentos não inicia uma missão nem significa que um agente está trabalhando.

A lista, o cabeçalho e o campo usam a aparência salva. No campo, a posição continua vindo do replay real do Q-learning; trocar a roupa não altera a política aprendida ou o resultado. Não há associação nova com o escritório 3D nesta entrega.

## Assets de código nativo

O kit é desenhado em Canvas 2D, seguindo a implementação pixel art já existente no campo. Não depende de imagens baixadas, modelos gráficos ou arquivos de jogos. São peças originais de código, não sprites copiados de Corporation Inc. As cores e combinações aceitas estão em `src/sandubah-desktop/gaucho-appearance.json`; validação em `gaucho-appearance.cjs`; peças e quadros em `gaucho-avatar.mjs`. Aplicam-se a licença e os créditos existentes do projeto.

O quadro lógico tem 52 × 52 pixels. `avatarPixels` devolve retângulos coloridos determinísticos; `paintAvatar` desenha o personagem em qualquer Canvas. Quatro fases sustentam cada movimento. Somente a prévia aberta anima continuamente; ela pausa quando o documento fica oculto, respeita movimento reduzido e libera temporizadores/listeners ao sair. Os cartões ficam estáticos. Não há upload de rostos, importação de SVG externo nem URLs de assets nesta etapa.

## Validação

- `tests/regression/sandubah-gaucho-appearance.test.cjs`: persistência, isolamento, retrocompatibilidade, valores inválidos e quadros.
- `scripts/test-sandubah-gaucho-avatar-ui.cjs`: Electron real com perfis fictícios isolados, edição e salvamento, animações, movimento reduzido, liga/desliga, uso no campo e largura de 430 px. Gera capturas e recibo local em `build/sandubah/gui/tmp`. Não envia mensagens a modelos e não substitui um teste de missão real.
- As confirmações de conversa, tarefa, ferramentas e aplicação continuam no backend existente, cobertas pelos testes anteriores de Gauchinhos.

Escopo jurídico: ferramenta local voltada inicialmente ao Brasil; nenhuma nova coleta, publicação ou transação. A consulta seletiva `$leis-brasil` foi feita, mas retornou artigo sem pertinência para esta mudança e fonte de software indisponível. Nenhuma obrigação foi inferida desse resultado; revisão de aplicabilidade/vigência permanece pendente. Movimento reduzido, controles de teclado e nomes acessíveis foram adotados como decisões técnicas, não como certificação de conformidade.

Esta mudança é local. Não atualiza automaticamente o GitHub nem o instalador 0.2.0 já publicado.
