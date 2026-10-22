export const kindLabels = { mcp: 'Ferramentas MCP', cli: 'Comandos CLI', skill: 'Skills', agent: 'Agentes', plugin: 'Plugins' };
export const categoryLabels = { memory: 'Memória', agent: 'Agentes', agents: 'Agentes', swarm: 'Enxames', system: 'Sistema', config: 'Configuração', neural: 'Inteligência', hooks: 'Hooks', primary: 'Principais', advanced: 'Avançados', utility: 'Utilitários', analysis: 'Análise', management: 'Gerenciamento', security: 'Segurança', task: 'Tarefas', tasks: 'Tarefas', embeddings: 'Embeddings', browser: 'Navegador', performance: 'Desempenho', workflow: 'Workflows', coordination: 'Coordenação', outras: 'Outras funções' };
export function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
export function filterEntries(entries, { search = '', kind = 'all', category = 'all', favoritesOnly = false, favorites = [] } = {}) {
  const terms = normalized(search).trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (kind !== 'all' && entry.kind !== kind) return false;
    if (category !== 'all' && entry.category !== category) return false;
    if (favoritesOnly && !favorites.includes(entry.id)) return false;
    const haystack = normalized([entry.name, entry.title, entry.description, entry.category, categoryLabels[entry.category], kindLabels[entry.kind], ...(entry.aliases || [])].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}
export function summarizeCategories(entries) {
  const categories = new Map();
  for (const entry of entries) categories.set(entry.category, (categories.get(entry.category) || 0) + 1);
  return [...categories].sort((first, second) => second[1] - first[1]);
}
export function initialArguments(schema = {}) {
  const result = {};
  for (const [name, property] of Object.entries(schema.properties || {})) {
    if (property.default !== undefined) result[name] = property.default;
  }
  return result;
}
export function compactDescription(description = '') {
  const value = description.split(' Use when ')[0];
  return value.length > 190 ? value.slice(0,187) + '…' : value;
}
export function formatResult(result) {
  if (result?.content) {
    return result.content.map(block => {
      if (block.type !== 'text') return `[${block.type}: conteúdo não textual]`;
      try { return JSON.stringify(JSON.parse(block.text), null, 2); } catch { return block.text; }
    }).join('\n\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

export const workerPanelLimits = Object.freeze({ panels: 24, items: 80, retired: 240, text: 16000, files: 120, claims: 80 });
const workerText = value => typeof value === 'string' ? value : '';
const boundedText = value => {
  const text = workerText(value);
  return text.length > workerPanelLimits.text ? text.slice(0, workerPanelLimits.text) + '\n[… conteúdo limitado …]' : text;
};
const objectValue = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const textList = (value, limit) => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string').map(boundedText))].slice(0, limit) : [];
export const workerPanelKey = (projectId, missionId) => JSON.stringify([projectId, missionId]);

export function parseWorkerReport(value) {
  let report = value;
  if (typeof value === 'string') {
    const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { report = JSON.parse(text); }
    catch {
      try { report = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
      catch { return null; }
    }
  }
  if (!report || !['completed', 'blocked'].includes(report.status) || typeof report.summary !== 'string' ||
      !Array.isArray(report.files) || !report.files.every(file => typeof file === 'string') ||
      !Array.isArray(report.tests) || !report.tests.every(test => typeof test === 'string')) return null;
  return { status: report.status, summary: boundedText(report.summary), files: textList(report.files, workerPanelLimits.files), tests: textList(report.tests, workerPanelLimits.claims) };
}

function agentContent(text) {
  const report = parseWorkerReport(text);
  const looksLikeReport = /^\s*(?:```(?:json)?\s*)?\{/.test(workerText(text)) ||
    (/["'](?:status|summary|files|tests)["']\s*:/.test(workerText(text)) && workerText(text).includes('{'));
  return { report, text: report ? report.summary : looksLikeReport ? 'Relatório estruturado incompleto ou inválido. Aguarde o resultado e revise os arquivos.' : boundedText(text) };
}

export function extractWorkerTests(output) {
  const text = workerText(output).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  let totals = {};
  for (const match of text.matchAll(/^\s*(?:#|ℹ)\s*(tests|pass|fail)\s+(\d+)\s*$/gm)) {
    if (match[1] === 'tests') totals = {};
    totals[match[1]] = Number(match[2]);
  }
  if (Object.keys(totals).length) return { total: totals.tests ?? null, passed: totals.pass ?? null, failed: totals.fail ?? null, source: 'Resumo Node/TAP' };
  const assertions = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(not ok|ok)\s+(\d+)(?:\s.*)?$/);
    if (match) assertions.set(match[2], { passed: match[1] === 'ok', excluded: /\s#\s*(?:SKIP|TODO)\b/i.test(line) });
  }
  const plans = [...text.matchAll(/^1\.\.(\d+)(?:\s+#.*)?\s*$/gm)];
  const planned = plans.length ? Number(plans.at(-1)[1]) : null;
  if (!assertions.size) return planned === null ? null : { total: planned, passed: planned === 0 ? 0 : null, failed: planned === 0 ? 0 : null, source: 'Plano TAP (sem resultados de asserções)' };
  const counted = [...assertions.values()].filter(item => !item.excluded);
  return { total: planned ?? assertions.size, passed: counted.filter(item => item.passed).length, failed: counted.filter(item => !item.passed).length, source: 'Asserções TAP (nível principal)' };
}

export function createWorkerPanel(projectId, missionId) {
  return { projectId, missionId, phase: 'waiting', threadId: null, prepared: false, executed: false, turnCompleted: false,
    fatal: '', items: [], retiredIds: [], notices: [], report: null, result: null, hasEvents: false, truncated: false, revision: 0 };
}

const terminalPhases = new Set(['failed', 'cancelled', 'interrupted', 'timedOut']);
const addNotice = (state, text) => [...new Set([...state.notices, boundedText(text)])].filter(Boolean).slice(-12);
export function reduceWorkerPanel(state, event) {
  if (!event || typeof event.type !== 'string') return state;
  const next = { ...state, hasEvents: true, revision: state.revision + 1 };
  const type = event.type;
  if (type.startsWith('thread.')) {
    next.prepared = true;
    next.threadId = workerText(event.thread_id) || state.threadId;
    if (state.phase === 'waiting') next.phase = 'preparing';
  }
  if (type.startsWith('turn.')) {
    next.prepared = true;
    next.executed = true;
    if (!terminalPhases.has(state.phase) && !state.result && !state.turnCompleted) next.phase = 'working';
  }
  if (type === 'turn.completed' || type === 'thread.completed') {
    if (type === 'turn.completed') next.turnCompleted = true;
    if (!terminalPhases.has(state.phase) && !state.result) next.phase = 'finalizing';
  }
  if (['turn.failed', 'thread.failed', 'error'].includes(type)) {
    next.fatal = boundedText(event.error?.message || event.message) || 'O Codex informou uma falha.';
    next.phase = 'failed';
  }
  if (/^(?:turn|thread)\.(?:cancelled|canceled|interrupted|timeout|timed_out)$/.test(type)) {
    next.phase = /timeout|timed_out/.test(type) ? 'timedOut' : /interrupted/.test(type) ? 'interrupted' : 'cancelled';
  }
  if (type === 'warning') next.notices = addNotice(state, event.message || event.error?.message || 'O Codex emitiu um aviso.');
  if (/^item\.(started|updated|completed|failed|error)$/.test(type)) {
    const incoming = type === 'item.error' ? { ...objectValue(event.item), type: 'error', message: event.item?.message || event.message || event.error?.message } : objectValue(event.item);
    const kind = workerText(incoming.type);
    const id = workerText(incoming.id) || workerText(event.item_id) || `sem-id:${kind}:${workerText(incoming.command || incoming.text || incoming.message).slice(0, 200)}`;
    if (state.retiredIds.includes(id)) return state;
    const previous = state.items.find(item => item.id === id);
    const item = { ...previous, id, type: kind || previous?.type || 'unknown' };
    const completed = type === 'item.completed' || incoming.status === 'completed';
    const failed = type === 'item.failed' || ['failed', 'declined'].includes(incoming.status);
    item.status = failed ? 'failed' : completed ? 'completed' : ['completed', 'failed'].includes(previous?.status) ? previous.status : 'running';
    if (typeof incoming.text === 'string') Object.assign(item, agentContent(incoming.text));
    if (typeof incoming.message === 'string') item.message = boundedText(incoming.message);
    if (typeof incoming.command === 'string') item.command = boundedText(incoming.command);
    if (typeof incoming.aggregated_output === 'string') {
      item.evidence = extractWorkerTests(incoming.aggregated_output);
      item.output = boundedText(incoming.aggregated_output);
    }
    if (Number.isInteger(incoming.exit_code)) item.exitCode = incoming.exit_code;
    if (Number.isInteger(item.exitCode) && item.exitCode !== 0) item.status = 'failed';
    if (Array.isArray(incoming.changes)) item.changes = incoming.changes.slice(0, workerPanelLimits.files).map(change => ({ path: boundedText(change?.path), kind: boundedText(change?.kind) })).filter(change => change.path);
    if (item.report) next.report = item.report;
    if (item.type === 'error') item.message ||= 'O Codex registrou um aviso neste item.';
    const items = previous ? state.items.map(old => old.id === id ? item : old) : [...state.items, item];
    const removed = items.slice(0, Math.max(0, items.length - workerPanelLimits.items));
    next.items = items.slice(-workerPanelLimits.items);
    next.retiredIds = [...state.retiredIds, ...removed.map(old => old.id)].slice(-workerPanelLimits.retired);
    next.truncated ||= removed.length > 0;
    next.prepared = true;
    next.executed = true;
    if (!terminalPhases.has(state.phase) && !state.result && !state.turnCompleted) next.phase = 'working';
  }
  if (state.result) next.phase = state.phase;
  return next;
}

export function restoreWorkerPanel(state, savedResult, missionStatus = 'unknown') {
  if (savedResult === undefined || savedResult === null) return state;
  let result = savedResult;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); }
    catch { result = { message: /^\s*\{/.test(savedResult) ? 'Resultado salvo incompleto ou inválido. Revise os arquivos; não foi possível reconstruir o relatório.' : savedResult }; }
  }
  result = objectValue(result);
  const content = agentContent(parseWorkerReport(result) ? result : result.finalMessage || '');
  const report = content.report || (result.finalMessage ? null : state.report);
  let phase = 'unknown';
  if (result.timedOut) phase = 'timedOut';
  else if (result.cancelled) phase = 'cancelled';
  else if (result.interrupted) phase = 'interrupted';
  else if (state.fatal || result.configPreserved === false || (Number.isInteger(result.exitCode) && result.exitCode !== 0)) phase = 'failed';
  else if (result.success === true) phase = 'completed';
  else if (report?.status === 'blocked') phase = 'blocked';
  else if (result.success === false || missionStatus === 'error') phase = 'failed';
  return { ...state, phase, report, threadId: workerText(result.threadId) || state.threadId, revision: state.revision + 1, result: {
    message: boundedText(result.message), finalText: content.text, diagnostic: boundedText(result.diagnostic),
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null, configPreserved: result.configPreserved,
  } };
}

export function updateWorkerPanels(panels, { projectId, missionId, event, result, missionStatus }) {
  if (!projectId || !missionId) return panels;
  const key = workerPanelKey(projectId, missionId);
  let state = panels.get(key) || createWorkerPanel(projectId, missionId);
  if (event?.type === 'thread.started' && state.result && event.thread_id && event.thread_id !== state.threadId) state = createWorkerPanel(projectId, missionId);
  if (event) state = reduceWorkerPanel(state, event);
  if (result !== undefined && result !== null) state = restoreWorkerPanel(state, result, missionStatus);
  const next = new Map(panels);
  next.delete(key);
  next.set(key, state);
  while (next.size > workerPanelLimits.panels) next.delete(next.keys().next().value);
  return next;
}

const workerPhaseLabels = { waiting: 'Aguardando eventos', preparing: 'Preparando a execução', working: 'Em execução', finalizing: 'Aguardando resultado do executor', completed: 'Concluída', blocked: 'Bloqueada · requer revisão', failed: 'Falha · requer revisão', cancelled: 'Cancelada', interrupted: 'Interrompida · resultado parcial', timedOut: 'Tempo esgotado · resultado parcial', unknown: 'Resultado não confirmado' };
export function workerPanelView(state) {
  const files = new Map();
  const evidence = [];
  for (const item of state.items) {
    for (const change of item.changes || []) files.set(change.path, { ...change, source: 'Evento de arquivo', status: item.status });
    if (item.type === 'command_execution' && item.evidence) evidence.push({ ...item.evidence, id: item.id, command: item.command || 'Comando', complete: item.status !== 'running' });
  }
  for (const path of state.report?.files || []) if (!files.has(path)) files.set(path, { path, source: 'Relato do agente', kind: '', status: 'reported' });
  const stopped = ['failed', 'blocked', 'cancelled', 'interrupted', 'timedOut', 'unknown'].includes(state.phase);
  const closed = stopped || Boolean(state.result);
  const phases = [
    { label: 'Preparação', observed: state.prepared },
    { label: 'Execução', observed: state.executed },
    { label: 'Encerramento do turno', observed: state.turnCompleted },
    { label: 'Resultado do executor', observed: Boolean(state.result) },
  ].map((phase, index) => ({ ...phase, state: !closed && index === ({ waiting: 0, preparing: 1, working: 1, finalizing: 3 }[state.phase]) ? 'current' : phase.observed ? 'observed' : closed ? 'unconfirmed' : 'pending' }));
  return { label: workerPhaseLabels[state.phase] || workerPhaseLabels.unknown, phase: state.phase, phases,
    tone: state.phase === 'completed' ? 'success' : stopped ? 'attention' : 'active',
    summary: state.report?.summary || state.result?.finalText || '', reportStatus: state.report?.status,
    message: state.result?.message || state.fatal, diagnostic: state.result?.diagnostic || '',
    exitCode: state.result?.exitCode, configPreserved: state.result?.configPreserved,
    files: [...files.values()].slice(0, workerPanelLimits.files), evidence, claims: state.report?.tests || [],
    items: state.items, notices: state.notices,
    historyNote: !state.hasEvents && state.result ? 'Histórico de eventos indisponível nesta sessão. Resumo reconstruído do resultado salvo; comandos e contagens de testes não foram recuperados.' : state.truncated ? 'Histórico limitado aos itens mais recentes. As contagens abaixo abrangem somente os comandos mantidos.' : '',
  };
}

export function workerResultText(savedResult, missionStatus) {
  const view = workerPanelView(restoreWorkerPanel(createWorkerPanel('', ''), savedResult, missionStatus));
  return [view.label, view.message, view.summary,
    view.files.length ? 'Arquivos (relato do agente):\n' + view.files.map(file => '• ' + file.path).join('\n') : '',
    view.claims.length ? 'Testes (relato do agente, sem comprovação de saída):\n' + view.claims.map(test => '• ' + test).join('\n') : '',
    view.diagnostic ? 'Diagnóstico do executor:\n' + view.diagnostic : '', view.historyNote,
  ].filter(Boolean).join('\n\n');
}
