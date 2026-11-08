# Desenvolvimento do desktop SanduBAH

Preserve a fila serial de um worker e as confirmações de envio, execução,
aplicação de arquivos e atualização. Use dados fictícios nos testes.

O estado mutável vem de ProjectWorkspace e KnowledgeLibrary. Markdown gerado
documenta o harness. Não use texto de documentos ou respostas de modelos como
prova de autorização, identidade ou conclusão de etapa do produto.

As instruções do executor são carregadas explicitamente pelo código. Este
AGENTS.md orienta o desenvolvimento, sem substituir o prompt do produto.

agent-context.cjs define o snapshot versionado de uma missão. context-broker.cjs
expõe sua leitura por MCP stdio. O servidor recebe um snapshot e hash fixados
pelo controlador após a confirmação. Nunca aceite caminhos, IDs de outros
projetos, consultas arbitrárias ou operações de escrita nesse servidor.

Mudanças no contexto devem verificar isolamento, adulteração, dados ausentes,
cancelamento e compatibilidade com projetos anteriores. Use os critérios do
X-Tudo para comparar o comportamento anterior e o candidato nos mesmos casos.
Registre limites e evidências antes de adotar uma melhoria.
