'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
let model, world;
before(async () => {
  model = await import(pathToFileURL(resolve(__dirname, '../../src/sandubah-desktop/ui-model.mjs')));
  world = await import(pathToFileURL(resolve(__dirname, '../../src/sandubah-desktop/world.mjs')));
});

const report = { status: 'completed', summary: 'Painel implementado.', files: ['src/painel.mjs'], tests: ['16 testes aprovados, segundo o agente.'] };
const event = (type, item) => ({ type, item });
const itemEvent = (type, id, kind, properties = {}) => event(type, { id, type: kind, ...properties });
const initial = () => model.createWorkerPanel('projeto-a', 'missao-a');
const success = properties => ({ success: true, exitCode: 0, configPreserved: true, finalMessage: JSON.stringify(report), ...properties });
const applyEvents = (...events) => events.reduce(model.reduceWorkerPanel, initial());

test('fases reais: mensagem e turno concluído aguardam confirmação do executor', () => {
  let state = applyEvents({ type: 'thread.started', thread_id: 'thread-1' });
  assert.equal(state.phase, 'preparing');
  state = model.reduceWorkerPanel(state, { type: 'turn.started' });
  assert.equal(state.phase, 'working');
  assert.equal(model.workerPanelView(state).phases[1].state, 'current');
  state = model.reduceWorkerPanel(state, itemEvent('item.completed', 'final', 'agent_message', { text: JSON.stringify(report) }));
  assert.equal(state.phase, 'working');
  state = model.reduceWorkerPanel(state, { type: 'turn.completed' });
  assert.equal(state.phase, 'finalizing');
  state = model.reduceWorkerPanel(state, { type: 'turn.started' });
  state = model.reduceWorkerPanel(state, { type: 'turn.updated' });
  assert.equal(state.phase, 'finalizing');
  assert.match(model.workerPanelView(state).label, /Aguardando resultado/);
  state = model.restoreWorkerPanel(state, success());
  assert.equal(state.phase, 'completed');
  assert.ok(model.workerPanelView(state).phases.every(phase => phase.observed));
});

test('thread/turn updated e completed não inventam resultado ou encerramento de turno', () => {
  const state = applyEvents({ type: 'thread.started' }, { type: 'thread.updated' }, { type: 'turn.updated' }, { type: 'thread.completed' });
  assert.equal(state.phase, 'finalizing');
  assert.equal(state.turnCompleted, false);
  assert.equal(state.result, null);
});

test('avisos item.error, item de tipo error e warning não viram falha nem sucesso', () => {
  let state = applyEvents({ type: 'turn.started' }, itemEvent('item.completed', 'warning', 'error', { message: 'Tentativa temporária indisponível.' }), { type: 'item.error', item: { id: 'warning2' }, message: 'Ainda aguardando.' }, { type: 'warning', message: 'Reconectando.' });
  assert.equal(state.phase, 'working');
  assert.equal(state.fatal, '');
  assert.equal(state.items.length, 2);
  assert.deepEqual(state.notices, ['Reconectando.']);
  state = model.reduceWorkerPanel(state, { type: 'turn.completed' });
  assert.equal(state.phase, 'finalizing');
  assert.equal(model.restoreWorkerPanel(state, success()).phase, 'completed');
});

test('turn.failed, thread.failed e erro de protocolo são falhas explícitas persistentes', () => {
  for (const type of ['turn.failed', 'thread.failed', 'error']) {
    let state = applyEvents({ type, error: { message: 'Falha real no turno.' } }, { type: 'turn.completed' });
    assert.equal(state.phase, 'failed');
    assert.equal(model.workerPanelView(state).message, 'Falha real no turno.');
    state = model.restoreWorkerPanel(state, success());
    assert.equal(state.phase, 'failed');
  }
});

test('cancelamento, interrupção, timeout e resultado desconhecido têm estados próprios', () => {
  for (const [properties, phase] of [[{ cancelled: true, interrupted: true }, 'cancelled'], [{ interrupted: true }, 'interrupted'], [{ timedOut: true, interrupted: true }, 'timedOut'], [{}, 'unknown']]) {
    const state = model.restoreWorkerPanel(initial(), properties, 'unknown');
    assert.equal(state.phase, phase);
    assert.notEqual(model.workerPanelView(state).tone, 'success');
  }
  for (const [type, phase] of [['turn.cancelled', 'cancelled'], ['thread.interrupted', 'interrupted'], ['turn.timeout', 'timedOut'], ['turn.timed_out', 'timedOut']]) {
    assert.equal(applyEvents({ type }, { type: 'turn.completed' }).phase, phase);
  }
});

test('resultado bloqueado, código de saída e configuração preservada são respeitados', () => {
  assert.equal(model.restoreWorkerPanel(initial(), success({ success: false, finalMessage: JSON.stringify({ ...report, status: 'blocked' }) })).phase, 'blocked');
  assert.equal(model.restoreWorkerPanel(initial(), success({ exitCode: 1 })).phase, 'failed');
  assert.equal(model.restoreWorkerPanel(initial(), success({ configPreserved: false })).phase, 'failed');
  assert.equal(model.restoreWorkerPanel(initial(), { success: false, message: 'Não concluiu.' }).phase, 'failed');
});

test('comando falho e arquivo falho ficam locais; a missão pode se recuperar', () => {
  const state = applyEvents(itemEvent('item.started', 'cmd', 'command_execution', { command: 'node --test' }), itemEvent('item.updated', 'cmd', 'command_execution', { aggregated_output: 'erro', exit_code: 1 }), itemEvent('item.failed', 'file', 'file_change', { changes: [{ path: 'src/a.mjs', kind: 'update' }] }));
  assert.equal(state.items[0].command, 'node --test');
  assert.equal(state.items[0].status, 'failed');
  assert.equal(state.items[1].status, 'failed');
  assert.equal(state.phase, 'working');
  assert.equal(model.restoreWorkerPanel(state, success()).phase, 'completed');
});

test('Node: totais da saída com ANSI e CRLF, sem inferir valores ausentes', () => {
  assert.deepEqual(model.extractWorkerTests('\x1b[32mℹ tests 12\x1b[0m\r\nℹ pass 10\r\nℹ fail 2\r\n'), { total: 12, passed: 10, failed: 2, source: 'Resumo Node/TAP' });
  assert.deepEqual(model.extractWorkerTests('# pass 4\n'), { total: null, passed: 4, failed: null, source: 'Resumo Node/TAP' });
  assert.equal(model.extractWorkerTests('O agente disse: 12 testes passaram.'), null);
  assert.equal(model.extractWorkerTests('node --test\nexit 0\n'), null);
  assert.deepEqual(model.extractWorkerTests('# tests 5\n# pass 5\n# fail 0\n# tests 2\n'), { total: 2, passed: null, failed: null, source: 'Resumo Node/TAP' });
});

test('TAP: resumos explícitos, suites aninhadas, SKIP/TODO e planos', () => {
  assert.deepEqual(model.extractWorkerTests('TAP version 13\n  ok 1 - filho\nok 1 - suite\nnot ok 2 - falha\nok 3 - opcional # SKIP\nnot ok 4 - futuro # TODO\n1..4\n'), { total: 4, passed: 1, failed: 1, source: 'Asserções TAP (nível principal)' });
  assert.deepEqual(model.extractWorkerTests('ok 1 - suite\n# tests 3\n# pass 2\n# fail 1\n'), { total: 3, passed: 2, failed: 1, source: 'Resumo Node/TAP' });
  assert.deepEqual(model.extractWorkerTests('TAP version 13\n1..0 # SKIP\n'), { total: 0, passed: 0, failed: 0, source: 'Plano TAP (sem resultados de asserções)' });
  assert.deepEqual(model.extractWorkerTests('TAP version 13\n1..3\n'), { total: 3, passed: null, failed: null, source: 'Plano TAP (sem resultados de asserções)' });
});

test('saída agregada e ID repetido atualizam a evidência uma vez, inclusive após conclusão', () => {
  let state = applyEvents(itemEvent('item.started', 'cmd', 'command_execution', { command: 'node --test' }), itemEvent('item.updated', 'cmd', 'command_execution', { aggregated_output: '# tests 2\n# pass 1\n# fail 1\n' }));
  assert.equal(model.workerPanelView(state).evidence[0].complete, false);
  const done = itemEvent('item.completed', 'cmd', 'command_execution', { exit_code: 0, aggregated_output: '# tests 2\n# pass 2\n# fail 0\n' });
  state = model.reduceWorkerPanel(model.reduceWorkerPanel(state, done), done);
  state = model.reduceWorkerPanel(state, itemEvent('item.started', 'cmd', 'command_execution'));
  const view = model.workerPanelView(state);
  assert.equal(view.evidence.length, 1);
  assert.equal(view.evidence[0].passed, 2);
  assert.equal(view.evidence[0].failed, 0);
  assert.equal(view.evidence[0].complete, true);
  assert.equal(state.items.length, 1);
});

test('relatório JSON puro, cercado e com introdução vira resumo, arquivos e relato de testes', () => {
  for (const text of [JSON.stringify(report), '```json\n' + JSON.stringify(report) + '\n```', 'Relatório final:\n' + JSON.stringify(report)]) {
    const state = applyEvents(itemEvent('item.completed', 'final', 'agent_message', { text }));
    const view = model.workerPanelView(state);
    assert.equal(view.summary, report.summary);
    assert.deepEqual(view.claims, report.tests);
    assert.equal(view.files[0].path, report.files[0]);
    assert.equal(view.files[0].source, 'Relato do agente');
    assert.equal(view.evidence.length, 0);
    assert.equal(state.items[0].text, report.summary);
    assert.equal(state.phase, 'working');
  }
});

test('eventos de arquivo prevalecem sobre relato duplicado e mantêm origem explícita', () => {
  const state = applyEvents(itemEvent('item.completed', 'files', 'file_change', { changes: [{ path: 'src/painel.mjs', kind: 'update' }, { path: 'src/painel.mjs', kind: 'update' }] }), itemEvent('item.completed', 'report', 'agent_message', { text: JSON.stringify(report) }));
  assert.equal(model.workerPanelView(state).files.length, 1);
  assert.equal(model.workerPanelView(state).files[0].source, 'Evento de arquivo');
});

test('relatório parcial e resultado salvo truncado nunca mostram JSON bruto', () => {
  for (const partial of ['{', '{"st', '```json\n{"status":"completed","summary":']) {
    const state = applyEvents(itemEvent('item.updated', 'final', 'agent_message', { text: partial }));
    assert.match(state.items[0].text, /incompleto/);
    assert.doesNotMatch(state.items[0].text, /\{/);
  }
  const text = model.workerResultText('{"success":true,"finalMessage":', 'done');
  assert.match(text, /incompleto/);
  assert.doesNotMatch(text, /\{"success/);
});

test('reabertura reconstrói resultado salvo string/objeto, sem fabricar histórico ou testes', () => {
  for (const saved of [success(), JSON.stringify(success())]) {
    const view = model.workerPanelView(model.restoreWorkerPanel(initial(), saved, 'done'));
    assert.equal(view.phase, 'completed');
    assert.equal(view.summary, report.summary);
    assert.equal(view.evidence.length, 0);
    assert.equal(view.items.length, 0);
    assert.equal(view.phases[0].state, 'unconfirmed');
    assert.match(view.historyNote, /Histórico de eventos indisponível/);
    const text = model.workerResultText(saved, 'done');
    assert.match(text, /Arquivos \(relato/);
    assert.match(text, /sem comprovação/);
    assert.doesNotMatch(text, /"status"\s*:/);
  }
  assert.match(model.workerResultText('Falha ao iniciar o processo.', 'error'), /Falha ao iniciar/);
  const live = applyEvents(itemEvent('item.completed', 'old', 'agent_message', { text: JSON.stringify(report) }));
  const latest = model.workerPanelView(model.restoreWorkerPanel(live, success({ finalMessage: 'Resultado final em texto.' })));
  assert.equal(latest.summary, 'Resultado final em texto.');
  assert.deepEqual(latest.claims, []);
});

test('eventos tardios não revertem resultado final nem promovem erro a sucesso', () => {
  let state = model.restoreWorkerPanel(initial(), success({ cancelled: true }));
  state = model.reduceWorkerPanel(state, { type: 'turn.completed' });
  state = model.reduceWorkerPanel(state, itemEvent('item.completed', 'late', 'agent_message', { text: JSON.stringify(report) }));
  assert.equal(state.phase, 'cancelled');
});

test('nova thread na mesma missão reinicia a tentativa, mas evento repetido preserva o resultado', () => {
  let panels = model.updateWorkerPanels(new Map(), { projectId: 'a', missionId: 'm', result: success({ threadId: 'old' }) });
  panels = model.updateWorkerPanels(panels, { projectId: 'a', missionId: 'm', event: { type: 'thread.started', thread_id: 'old' } });
  assert.equal(panels.get(model.workerPanelKey('a', 'm')).phase, 'completed');
  panels = model.updateWorkerPanels(panels, { projectId: 'a', missionId: 'm', event: { type: 'thread.started', thread_id: 'new' } });
  assert.equal(panels.get(model.workerPanelKey('a', 'm')).phase, 'preparing');
  assert.equal(panels.get(model.workerPanelKey('a', 'm')).report, null);
});

test('histórico por projeto e missão evita mistura, inclusive eventos em projeto inativo', () => {
  let panels = new Map();
  for (const [projectId, missionId, text] of [['a', '1', 'Primeira'], ['a', '2', 'Segunda'], ['b', '1', 'Outro projeto']]) {
    panels = model.updateWorkerPanels(panels, { projectId, missionId, event: itemEvent('item.completed', 'same-id', 'agent_message', { text }) });
  }
  assert.equal(panels.size, 3);
  assert.equal(panels.get(model.workerPanelKey('a', '1')).items[0].text, 'Primeira');
  assert.equal(panels.get(model.workerPanelKey('a', '2')).items[0].text, 'Segunda');
  assert.equal(panels.get(model.workerPanelKey('b', '1')).items[0].text, 'Outro projeto');
  assert.equal(model.updateWorkerPanels(panels, { projectId: 'a', event: { type: 'turn.started' } }), panels);
  assert.notEqual(model.workerPanelKey('a/b', 'c'), model.workerPanelKey('a', 'b/c'));
});

test('limites de itens, texto e painéis impedem histórico sem fim e duplicatas recentes removidas', () => {
  let state = initial();
  for (let index = 0; index < model.workerPanelLimits.items + 10; index++) state = model.reduceWorkerPanel(state, itemEvent('item.completed', String(index), 'agent_message', { text: 'mensagem ' + index }));
  assert.equal(state.items.length, model.workerPanelLimits.items);
  assert.match(model.workerPanelView(state).historyNote, /limitado/);
  assert.equal(model.reduceWorkerPanel(state, itemEvent('item.completed', '0', 'agent_message', { text: 'repetido' })), state);
  state = model.reduceWorkerPanel(state, itemEvent('item.completed', 'long', 'command_execution', { aggregated_output: 'x'.repeat(50000) + '\n# tests 1\n# pass 1\n# fail 0\n' }));
  assert.ok(state.items.at(-1).output.length < 17000);
  assert.equal(state.items.at(-1).evidence.passed, 1);
  let panels = new Map();
  for (let index = 0; index < 40; index++) panels = model.updateWorkerPanels(panels, { projectId: 'p', missionId: String(index), event: { type: 'turn.started' } });
  assert.equal(panels.size, model.workerPanelLimits.panels);
});

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.className = ''; this._text = ''; this._value = ''; this._scrollTop = 0; this.clientHeight = 200;
    this.classList = { toggle: (name, enabled) => { const classes = new Set(this.className.split(/\s+/)); if (enabled) classes.add(name); else classes.delete(name); this.className = [...classes].join(' '); } };
  }
  set innerHTML(_) { throw new Error('innerHTML é proibido para dados do agente'); }
  insertAdjacentHTML() { throw new Error('HTML dinâmico é proibido'); }
  set textContent(value) { this.children.forEach(child => child.parentNode = null); this.children = []; this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { this.textContent = ''; this.append(...children); }
  insertBefore(child, reference) { child.remove(); child.parentNode = this; const index = this.children.indexOf(reference); this.children.splice(index < 0 ? this.children.length : index, 0, child); }
  remove() { if (this.parentNode) { const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; } }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  async dispatch(type, properties = {}) { for (const listener of this.listeners.get(type) || []) await listener({ target: this, preventDefault() {}, ...properties }); }
  querySelectorAll(selector) {
    const matches = child => selector.startsWith('.') ? child.className.split(/\s+/).includes(selector.slice(1)) : selector === '[data-reading-id]' ? child.dataset.readingId !== undefined : selector.startsWith('#') ? child.id === selector.slice(1) : child.tagName === selector.toUpperCase();
    const result = []; for (const child of this.children) { if (matches(child)) result.push(child); result.push(...child.querySelectorAll(selector)); } return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get options() { return this.children; }
  add(option) { this.append(option); }
  get value() { return this._value || (this.tagName === 'SELECT' ? this.children[0]?.value || '' : ''); }
  set value(value) { this._value = value; }
  get isConnected() { return this.tagName === 'BODY' || Boolean(this.parentNode?.isConnected); }
  get scrollHeight() { return this._scrollHeight ?? Math.max(600, this.textContent.length); }
  set scrollHeight(value) { this._scrollHeight = value; }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(value) { this._scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
  getBoundingClientRect() { return { top: 0, bottom: 0 }; }
  focus() { global.document.activeElement = this; }
}

async function withDOM(action) {
  const originals = { document: global.document, Option: global.Option, localStorage: global.localStorage };
  const body = new Element('body');
  global.document = { body, createElement: tag => new Element(tag), getElementById: id => body.querySelector('#' + id) };
  global.Option = class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } };
  const saved = new Map(); global.localStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  try { await action(global.document, body); }
  finally { Object.assign(global, originals); }
}

test('renderização segura mostra texto malicioso literalmente em mensagens, arquivos e saída', async () => withDOM(async (document, body) => {
  const attack = '<img src=x onerror="globalThis.injetado=true"><script>alert(1)</script>';
  const maliciousReport = { ...report, summary: attack, files: [attack], tests: [attack] };
  const state = model.restoreWorkerPanel(applyEvents(itemEvent('item.completed', 'message', 'agent_message', { text: attack }), itemEvent('item.completed', 'command', 'command_execution', { command: attack, aggregated_output: attack, exit_code: 1 }), itemEvent('item.completed', 'warning', 'error', { message: attack })), success({ finalMessage: JSON.stringify(maliciousReport), diagnostic: attack }));
  const container = document.createElement('div'); body.append(container);
  world.renderWorkerPanelContent(container, state);
  assert.ok(container.textContent.includes(attack));
  assert.equal(container.querySelectorAll('img').length, 0);
  assert.equal(container.querySelectorAll('script').length, 0);
  assert.match(container.textContent, /Aviso do Codex \(item\)/);
  assert.match(container.textContent, /Relato do agente/);
  assert.equal(global.injetado, undefined);
}));

test('apresentação de relatório não mostra JSON; atualização por ID preserva comando aberto e foco', async () => withDOM(async (document, body) => {
  const container = document.createElement('div'); body.append(container);
  let state = applyEvents(itemEvent('item.started', 'cmd', 'command_execution', { command: 'node --test', aggregated_output: 'Executando…' }), itemEvent('item.completed', 'final', 'agent_message', { text: JSON.stringify(report) }));
  world.renderWorkerPanelContent(container, state);
  const details = container.querySelector('details'); details.open = true; details.focus();
  state = model.reduceWorkerPanel(state, itemEvent('item.completed', 'cmd', 'command_execution', { exit_code: 0, aggregated_output: '# tests 2\n# pass 2\n# fail 0\n' }));
  world.renderWorkerPanelContent(container, state);
  world.renderWorkerPanelContent(container, state);
  assert.equal(container.querySelectorAll('.worker-item').length, 2);
  assert.equal(container.querySelector('details'), details);
  assert.equal(details.open, true);
  assert.equal(document.activeElement, details);
  assert.match(container.textContent, /Aprovados: 2 · Falhos: 0/);
  assert.doesNotMatch(container.textContent, /"status"\s*:/);
  assert.match(container.textContent, /Painel implementado/);
  assert.match(container.textContent, /src\/painel.mjs/);
  assert.match(container.textContent, /sem comprovação/);
}));

function project(id, missionProperties = {}) {
  return { id, name: 'Projeto ' + id, goal: 'Melhorar painel', agents: [{ id: 'agent', name: 'Construtor', role: 'coder' }], context: [], missions: [{ id: 'm', title: 'Missão ' + id, engine: 'codex', tool: 'codex', status: 'running', ...missionProperties }] };
}
async function mountWorld(projects) {
  const main = document.createElement('main'); main.id = 'main-content'; const development = document.createElement('section'); development.id = 'development-view'; main.append(development); document.body.append(main);
  localStorage.setItem('sandubah-project', projects[0].id);
  const handlers = {}, calls = [];
  const api = {
    project: async request => request.action === 'list' ? projects : projects.find(item => item.id === request.id), artifacts: async () => [],
    onProject: callback => handlers.project = callback, onWorker: callback => handlers.worker = callback,
    runProject: async request => { calls.push(['runProject', request]); return { cancelled: true }; },
    stopQueue: async () => { calls.push(['stopQueue']); return { message: 'Fila interrompida.' }; },
    interruptWorker: async () => { calls.push(['interruptWorker']); return { message: 'Codex interrompido.' }; },
  };
  const controller = world.createWorld({ api, catalog: { entries: [] }, notify() {}, output: (...args) => calls.push(['output', ...args]), navigate() {} });
  await new Promise(setImmediate); controller.show('harness'); return { handlers, calls, controller };
}

test('integração: troca de missão/projeto isola histórico, recebe eventos inativos e restaura salvo', async () => withDOM(async document => {
  const a = project('a'); a.missions.push({ id: 'm2', title: 'Missão segunda', engine: 'codex', status: 'done', result: JSON.stringify(success()) });
  const b = project('b'); const { handlers } = await mountWorld([a, b]);
  handlers.worker({ projectId: 'a', missionId: 'm', event: itemEvent('item.completed', 'same', 'agent_message', { text: 'Somente missão A.' }) });
  handlers.worker({ projectId: 'b', missionId: 'm', event: itemEvent('item.completed', 'same', 'agent_message', { text: 'Somente projeto B.' }) });
  assert.match(document.getElementById('worker-log').textContent, /Somente missão A/);
  assert.doesNotMatch(document.getElementById('worker-log').textContent, /Somente projeto B/);
  const missions = document.getElementById('worker-mission'); missions.value = 'm2'; await missions.dispatch('change');
  assert.match(document.getElementById('worker-log').textContent, /Histórico de eventos indisponível/);
  assert.match(document.getElementById('worker-log').textContent, /Painel implementado/);
  assert.doesNotMatch(document.getElementById('worker-log').textContent, /Somente missão A/);
  const projects = document.getElementById('project-select'); projects.value = 'b'; await projects.dispatch('change');
  assert.match(document.getElementById('worker-log').textContent, /Somente projeto B/);
  projects.value = 'a'; await projects.dispatch('change');
  document.getElementById('worker-mission').value = 'm'; await document.getElementById('worker-mission').dispatch('change');
  assert.match(document.getElementById('worker-log').textContent, /Somente missão A/);
}));

test('integração: leitura pausada persiste em eventos/onProject/aba; acompanhar volta ao fim', async () => withDOM(async document => {
  const p = project('a'); const { handlers, controller } = await mountWorld([p]);
  const log = document.getElementById('worker-log'); log.scrollHeight = 2000; log.scrollTop = 140; await log.dispatch('scroll');
  handlers.worker({ projectId: 'a', missionId: 'm', event: itemEvent('item.completed', 'a', 'agent_message', { text: 'Nova mensagem' }) });
  assert.equal(log.scrollTop, 140);
  const follow = document.body.querySelectorAll('button').find(button => button.getAttribute('aria-controls') === 'worker-log');
  assert.match(follow.textContent, /há atualizações/);
  handlers.project({ ...p }); assert.equal(document.getElementById('worker-log'), log); assert.equal(log.scrollTop, 140);
  await follow.dispatch('click'); assert.equal(log.scrollTop, 1800); assert.equal(follow.getAttribute('aria-pressed'), 'true');
  handlers.worker({ projectId: 'a', missionId: 'm', event: itemEvent('item.completed', 'b', 'agent_message', { text: 'Mais uma mensagem' }) });
  assert.equal(log.scrollTop, 1800);
  log.scrollTop = 240; await log.dispatch('scroll'); controller.show('all');
  log.scrollTop = 0; // Hidden browser layouts can reset element scroll positions.
  handlers.worker({ projectId: 'a', missionId: 'm', event: itemEvent('item.completed', 'c', 'agent_message', { text: 'Mensagem enquanto a aba estava oculta' }) });
  controller.show('harness'); assert.equal(log.scrollTop, 240);
}));

test('integração: expansão de item anterior mantém a âncora de leitura no item visível', async () => withDOM(async document => {
  const { handlers } = await mountWorld([project('a')]);
  const send = (id, text) => handlers.worker({ projectId: 'a', missionId: 'm', event: itemEvent('item.updated', id, 'agent_message', { text }) });
  send('a', 'Mensagem anterior'); send('b', 'Estou lendo aqui');
  const log = document.getElementById('worker-log'); log.scrollHeight = 2000;
  const [a, b] = log.querySelectorAll('.worker-item');
  a.getBoundingClientRect = () => ({ top: 100 - log.scrollTop, bottom: 300 - log.scrollTop });
  b.getBoundingClientRect = () => { const position = a.textContent.includes('ampliada') ? 460 : 300; return { top: position - log.scrollTop, bottom: position + 100 - log.scrollTop }; };
  log.querySelectorAll('[data-reading-id]').find(row => row.dataset.readingId === 'activity').getBoundingClientRect = () => ({ top: 100 - log.scrollTop, bottom: 900 - log.scrollTop });
  log.scrollTop = 350; await log.dispatch('scroll'); const readingOffset = b.getBoundingClientRect().top;
  send('a', 'Mensagem anterior ampliada');
  assert.equal(log.scrollTop, 510);
  assert.equal(b.getBoundingClientRect().top, readingOffset);
}));

test('integração: confirmação, interrupção e fila continuam nas APIs existentes e um worker', async () => withDOM(async document => {
  const p = project('a'); const { controller, calls, handlers } = await mountWorld([p]); controller.status({ busy: true });
  const interrupt = document.getElementById('interrupt-worker'); const stop = document.getElementById('stop-queue');
  assert.equal(interrupt.disabled, false); assert.equal(stop.disabled, false); assert.equal(document.getElementById('run-queue').disabled, true);
  await interrupt.dispatch('click'); await stop.dispatch('click');
  assert.deepEqual(calls.slice(0, 2), [['interruptWorker'], ['stopQueue']]);
  p.missions[0].status = 'pending'; handlers.project(p); controller.status({ busy: false });
  assert.equal(document.getElementById('interrupt-worker').disabled, true);
  await document.getElementById('run-queue').dispatch('click');
  assert.deepEqual(calls.at(-1), ['runProject', { id: 'a', missionId: undefined }]);
  assert.match(document.body.textContent, /1 worker/);
}));

test('integração: onProject final mostra resultado legível e nova tentativa limpa resultado anterior', async () => withDOM(async document => {
  const p = project('a'); const { handlers } = await mountWorld([p]);
  handlers.worker({ projectId: 'a', missionId: 'm', event: { type: 'turn.started' } });
  handlers.project(project('a', { status: 'done', result: JSON.stringify(success()) }));
  assert.equal(document.body.querySelector('.worker-status').textContent, 'Concluída');
  assert.match(document.getElementById('worker-log').textContent, /Painel implementado/);
  handlers.project(project('a', { status: 'pending' }));
  assert.equal(document.body.querySelector('.worker-status').textContent, 'Aguardando eventos');
  assert.doesNotMatch(document.getElementById('worker-log').textContent, /Painel implementado/);
}));

test('integração: voltar de projeto sem missão Codex recupera o conteúdo do painel', async () => withDOM(async document => {
  const a = project('a'); const empty = project('empty'); empty.missions = [];
  const { handlers } = await mountWorld([a, empty]);
  handlers.worker({ projectId: 'a', missionId: 'm', event: itemEvent('item.completed', 'msg', 'agent_message', { text: 'Histórico preservado.' }) });
  const projects = document.getElementById('project-select'); projects.value = 'empty'; await projects.dispatch('change');
  assert.match(document.getElementById('worker-log').textContent, /Nenhuma missão Codex/);
  projects.value = 'a'; await projects.dispatch('change');
  assert.match(document.getElementById('worker-log').textContent, /Histórico preservado/);
}));
