# Referência jurídica seletiva

O Cérebro usa [ctresb/leis](https://github.com/ctresb/leis) como referência informativa para apps e sites. O repositório não é uma skill e não foi clonado. O adaptador local faz roteamento inicial por tema e busca somente as normas candidatas, sequencialmente, sem enviar a pergunta, o projeto ou credenciais ao GitHub.

## Padrão no SanduBAH

- O painel Cérebro → Visão geral mostra a fonte externa separada das notas e projetos locais.
- O planejamento com Codex, Claude ou IA local inclui automaticamente a seleção pertinente ao pedido e ao objetivo do harness. A execução Codex recebe a mesma política e artigos selecionados, apesar de continuar isolada e sem acesso a skills/configurações globais.
- As normas são baixadas sob demanda, fixadas a um commit, com cache local por norma, data, fonte oficial, linhas e SHA-256. O cache da cópia local fica em `build/sandubah/gui/brain/legal-cache`; testes usam perfil separado.
- O contexto jurídico tem orçamento padrão de 3.500 caracteres, incluindo avisos. Artigos são incluídos inteiros ou omitidos com motivo explícito. Os demais artigos e normas não são carregados no contexto. Fontes jurídicas entram na contagem estimada existente do Cérebro; a estimativa não é uso real cobrado pelo modelo.
- O modo Completo continua completo para os documentos do escopo local, mas não significa baixar a biblioteca jurídica inteira. Essa distinção aparece no recibo de contexto.
- Nenhuma confirmação de envio ou execução foi removida. Não há consulta a modelo para classificar temas, nem treino, embeddings, GPU ou gateway adicionais.

O catálogo inicial contém sete referências federais: LGPD, Marco Civil, consumidor, comércio eletrônico, inclusão/acessibilidade, ECA e software. Isso não cobre toda legislação aplicável. Estado, município, setor, alterações normativas e jurisdição continuam exigindo verificação. A seleção lexical é uma triagem, não análise jurídica automática completa.

## Padrão no Codex

A skill local `leis-brasil` é instalada pelo adaptador `scripts/install-sandubah-legal-skill.cjs`, sem executar scripts do repositório de leis. As preferências em `~/.codex/AGENTS.md` orientam seu uso em criação/evolução de apps e sites; `config.toml`, autenticações e gateway permanecem intactos.

O helper da skill aceita:

```text
node "<pasta-da-skill>/scripts/consultar.cjs" --query "site cadastro dados pessoais"
node "<pasta-da-skill>/scripts/consultar.cjs" --query "loja pedidos pagamento" --limit 7000
```

Ele mantém cache em `~/.cache/sandubah-legal` e retorna só a seleção, com proveniência e omissões. Para normas fora do catálogo, a skill orienta pesquisa pontual no acervo e verificação em fonte oficial. A instalação recusa arquivos existentes divergentes ou links, em vez de sobrescrever personalizações.

## Limitações e segurança

Os textos do acervo são conversões automáticas/OCR. Verificar a revisão do GitHub não comprova vigência ou aplicabilidade oficial. Antes de tratar algo como obrigação, confira a fonte oficial, alterações, exceções e artigo relevante. Se a rede falhar, o cache antigo fica identificado e pendências não são inventadas. Não há promessa de conformidade garantida ou substituição de aconselhamento jurídico especializado.

O cliente só busca URLs HTTPS construídas para o repositório autorizado, sem redirecionamentos, tokens ou parâmetros derivados da pergunta. Respostas e cache têm limites; links de arquivos e cache adulterado são recusados. Conteúdo remoto é tratado como referência, não instrução executável.

Validação serial: `node --test --test-concurrency=1 tests/regression/sandubah-legal.test.cjs`.
