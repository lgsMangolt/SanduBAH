# Roadmap

O que ainda não está pronto. Os itens saem do backlog em [desktop/CLAUDE.md](desktop/CLAUDE.md), que é onde fica o estado detalhado.

## Ambiente e distribuição

- [ ] Rodar o app desktop a partir de um clone, com um único comando: fork do Ruflo ou script de setup com commit fixado.
- [ ] Validar a suíte completa do Ruflo e um clone limpo do overlay `desktop/`.
- [ ] Nova Release do instalador. Os fontes em `desktop/` são posteriores à 0.1.0, e publicar fontes não atualiza o instalador.
- [ ] Assinatura de código do Windows (Authenticode).

## Funcionalidades

- [ ] **Checkpoints por missão:** diff e restauração confirmada, sem sobrescrever mudanças externas.
- [ ] **Skills sob demanda:** metadados e carregamento progressivo, com escopos Central, projeto e papel.
- [ ] **Gates de qualidade:** verificações determinísticas com evidências de testes e artefatos, sem depender só da autoavaliação do modelo.
- [ ] **Templates de equipe:** contratos de entrega, dependências e handoff real entre etapas, em execução serial.
- [ ] **Trilhas guiadas:** novos tutoriais e um catálogo das capacidades reais de Codex, Claude e modelos locais.
- [ ] **Arena:** comparar propostas depois do Grill-me no planejamento de novos projetos.

## Qualidade

- [ ] Corrigir o mock de DOM dos testes do painel de worker. Seis casos falham por falta de `matchMedia` no mock, não no app.
- [ ] Escrever o `ARCHITECTURE.md`.
