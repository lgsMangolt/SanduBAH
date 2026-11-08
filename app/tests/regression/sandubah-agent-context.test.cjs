'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { ProjectWorkspace } = require('../../src/sandubah-desktop/workspace.cjs');
const { DesktopController, assertLocalWritePath } = require('../../src/sandubah-desktop/backend.cjs');
const { buildSnapshot, loadSnapshot, configuration, hash, TOOL } = require('../../src/sandubah-desktop/agent-context.cjs');
const { createBroker } = require('../../src/sandubah-desktop/context-broker.cjs');
const { workerArguments } = require('../../src/sandubah-desktop/codex-worker.cjs');
const { workerEnvironment } = require('../../src/sandubah-desktop/codex-worker.cjs');
const { confirmedComparison, receipts } = require('../../src/sandubah-desktop/x-tudo.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'sb-md2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const projects = new ProjectWorkspace({ repositoryRoot: root, catalog: { entries: [] }, nodeExecutable: process.execPath, guard: path => assertLocalWritePath(root, path), readLocal: path => join(root, path) });
  projects.write(join(root, 'docs/reference.md'), '# Referência fictícia\nConteúdo selecionado da missão.');
  let project = projects.create({ name: 'Oficina fictícia', goal: 'Validar contexto seletivo' });
  project = projects.update(project.id, 'agent', { name: 'Construtor fictício', role: 'coder' });
  project = projects.update(project.id, 'context', { path: 'docs/reference.md' });
  project = projects.update(project.id, 'mission', { title: 'Construir exemplo', instructions: 'Crie um exemplo com dados fictícios.', engine: 'codex', agentId: project.agents[0].id });
  return { root, projects, project, mission: project.missions[0], agent: project.agents[0] };
}

function brokerFor(prepared) {
  const broker = createBroker(prepared.context.filename, prepared.context.sha256);
  const request = (method, params) => broker({ jsonrpc: '2.0', id: 1, method, params });
  request('initialize', { protocolVersion: '2025-11-25' });
  return request;
}

test('CLI filha usa seu sandbox sem identidade desktop herdada e preserva perfis restritivos', () => {
  const runtime = { nodeExecutable: process.execPath }, settings = { home: 'private-profile' };
  const inherited = { CODEX_WINDOWS_REGISTERED_CORE: '1', CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY: 'parent-package', CODEX_APP_TOOLS_PIPE_PATH: 'parent-pipe', CODEX_PERMISSION_PROFILE: ':danger-full-access' };
  const env = workerEnvironment(runtime, settings, inherited);
  assert.equal(env.CODEX_WINDOWS_REGISTERED_CORE, undefined);
  assert.equal(env.CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY, undefined);
  assert.equal(env.CODEX_APP_TOOLS_PIPE_PATH, undefined);
  assert.equal(env.CODEX_PERMISSION_PROFILE, undefined);
  assert.equal(workerEnvironment(runtime, settings, { CODEX_PERMISSION_PROFILE: ':read-only' }).CODEX_PERMISSION_PROFILE, ':read-only');
  assert.equal(inherited.CODEX_WINDOWS_REGISTERED_CORE, '1');
});

test('raízes equivalentes usam o caminho nativo sem conceder acesso a outro workspace', t => {
  const { root, projects, project, mission, agent } = fixture(t);
  const prepared = projects.prepareCodex(project, mission, agent, buildSnapshot(projects, project, mission, agent));
  const env = workerEnvironment({ nodeExecutable: process.execPath }, { home: root }, { TEMP: root, TMP: root, TMPDIR: root });
  if (process.platform === 'win32') {
    assert.equal(env.CODEX_HOME, fs.realpathSync.native(root));
    assert.equal(env.TEMP, fs.realpathSync.native(root));
    assert.equal(env.TMP, fs.realpathSync.native(root));
    assert.equal(env.TMPDIR, fs.realpathSync.native(root));
  }
  const config = configuration({ workspace: fs.realpathSync.native(prepared.workspace), runDirectory: fs.realpathSync.native(prepared.runDirectory), context: prepared.context, runtime: { nodeExecutable: process.execPath } });
  assert.ok(config.some(value => value.includes('read_mission_context')));
  const other = projects.create({ name: 'Outra raiz', goal: 'Verificar isolamento' });
  fs.mkdirSync(projects.workspace(other.id));
  assert.throws(() => configuration({ workspace: projects.workspace(other.id), runDirectory: prepared.runDirectory, context: prepared.context, runtime: { nodeExecutable: process.execPath } }), /outra execução/);
});

test('snapshot usa o projeto e a missão selecionados, com fontes e omissões verificáveis', t => {
  const { root, projects, project, mission, agent } = fixture(t);
  const other = projects.create({ name: 'Outro projeto fictício', goal: 'Conteúdo particular do outro projeto' });
  const original = '# Fonte\n' + 'Conteúdo de referência. '.repeat(400);
  projects.write(join(root, 'docs/reference.md'), original);
  const snapshot = buildSnapshot(projects, project, mission, agent);
  assert.equal(snapshot.project.id, project.id);
  assert.equal(snapshot.references[0].sha256, hash(original));
  assert.equal(snapshot.references[0].content.length, 6000);
  assert.equal(snapshot.references[0].omittedCharacters, original.length - 6000);
  assert.ok(!JSON.stringify(snapshot).includes(other.goal));
  assert.throws(() => buildSnapshot(projects, other, mission, agent), /fora do projeto/);
  projects.write(join(root, 'docs/reference.md'), 'api_key=' + 'a'.repeat(32));
  assert.throws(() => buildSnapshot(projects, project, mission, agent), /segredo/);
});

test('projeto anterior recebe snapshot na execução sem reescrever seus Markdown', t => {
  const { projects, project, mission, agent } = fixture(t);
  const before = projects.document('HARNESS.md', project.id).version;
  const approved = buildSnapshot(projects, project, mission, agent);
  const prepared = projects.prepareCodex(project, mission, agent, approved);
  assert.equal(loadSnapshot(prepared.context.filename, prepared.context.sha256).mission.id, mission.id);
  assert.equal(projects.document('HARNESS.md', project.id).version, before);
  assert.match(prepared.prompt, /read_mission_context/);
  assert.ok(!prepared.prompt.includes('Conteúdo selecionado da missão.'));
  assert.equal(brokerFor(prepared)('tools/call', { name: TOOL, arguments: { section: 'references' } }).result.structuredContent.data[0].content, '# Referência fictícia\nConteúdo selecionado da missão.');
});

test('MCP recusa escrita, outro projeto, caminhos e snapshot adulterado', t => {
  const { projects, project, mission, agent } = fixture(t);
  const approved = buildSnapshot(projects, project, mission, agent);
  const prepared = projects.prepareCodex(project, mission, agent, approved);
  const call = brokerFor(prepared);
  assert.deepEqual(call('tools/list').result.tools.map(tool => tool.name), [TOOL]);
  for (const params of [
    { name: 'write_project', arguments: { section: 'project' } },
    { name: TOOL, arguments: { section: 'project', projectId: 'other' } },
    { name: TOOL, arguments: { section: '../auth.json' } },
    { name: TOOL, arguments: { section: 'project', path: 'docs/reference.md' } },
  ]) assert.ok(call('tools/call', params).error);
  assert.ok(call('resources/read', { uri: 'file:///outside' }).error);
  fs.writeFileSync(prepared.context.filename, JSON.stringify({ ...approved, schemaVersion: 2 }));
  assert.equal(call('tools/call', { name: TOOL, arguments: { section: 'project' } }).result.isError, true);
  assert.throws(() => configuration({ workspace: prepared.workspace, runDirectory: prepared.runDirectory, context: prepared.context, runtime: { nodeExecutable: process.execPath } }), /mudou/);
});

test('mudança após revisão bloqueia a preparação, antes de copiar arquivos', t => {
  const { root, projects, project, mission, agent } = fixture(t);
  const approved = buildSnapshot(projects, project, mission, agent);
  projects.write(join(root, 'docs/reference.md'), 'Fonte mudou após a revisão');
  assert.throws(() => projects.prepareCodex(project, mission, agent, approved), /mudou após/);
  assert.equal(fs.existsSync(projects.workspace(project.id)), false);
});

test('dados ausentes, vínculos físicos e excesso de consultas bloqueiam a leitura', t => {
  const { root, projects, project, mission, agent } = fixture(t);
  const prepared = projects.prepareCodex(project, mission, agent, buildSnapshot(projects, project, mission, agent));
  const call = brokerFor(prepared);
  for (let index = 0; index < 24; index++) {
    assert.equal(call('tools/call', { name: TOOL, arguments: { section: 'project' } }).result.isError, false);
  }
  assert.ok(call('tools/call', { name: TOOL, arguments: { section: 'project' } }).error);
  const alias = join(root, 'linked-context.json');
  fs.linkSync(prepared.context.filename, alias);
  assert.throws(() => loadSnapshot(prepared.context.filename, prepared.context.sha256), /Arquivo de contexto/);
  fs.unlinkSync(alias);
  assert.throws(() => loadSnapshot(join(root, 'missing.json'), prepared.context.sha256));
  const wrongRun = { ...prepared.context, filename: join(root, 'mission-context.json') };
  assert.throws(() => configuration({ workspace: prepared.workspace, runDirectory: prepared.runDirectory, context: wrongRun, runtime: { nodeExecutable: process.execPath } }), /outra execução/);
});

test('processo MCP real funciona por stdio com filesystem somente leitura', t => {
  const { projects, project, mission, agent } = fixture(t);
  const prepared = projects.prepareCodex(project, mission, agent, buildSnapshot(projects, project, mission, agent));
  const configs = configuration({ workspace: prepared.workspace, runDirectory: prepared.runDirectory, context: prepared.context, runtime: { nodeExecutable: process.execPath } });
  const args = JSON.parse(configs.find(line => line.startsWith('mcp_servers.sandubah_context.args=')).split('=').slice(1).join('='));
  assert.ok(args.includes('--permission'));
  assert.ok(!args.some(arg => /allow-(fs-write|net|child-process)/.test(arg)));
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: TOOL, arguments: { section: 'mission' } } },
  ];
  const result = spawnSync(process.execPath, args, { input: requests.map(value => JSON.stringify(value)).join('\n') + '\n', encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(output.length, 2);
  assert.equal(output[1].result.structuredContent.missionId, mission.id);
  assert.equal(output[1].result.structuredContent.data.instructions, mission.instructions);
  const worker = workerArguments({ workspace: prepared.workspace, outputPath: join(prepared.runDirectory, 'last-message.txt'), settings: {}, context: prepared.context, runtime: { nodeExecutable: process.execPath } });
  assert.ok(worker.includes('--ignore-user-config'));
  assert.ok(worker.some(arg => arg === 'mcp_servers.sandubah_context.enabled_tools=["read_mission_context"]'));
});

test('entrada normal do controlador mantém cancelamento e passa o snapshot ao worker', async t => {
  const { root } = fixture(t);
  const mcp = new EventEmitter(); mcp.ready = false; mcp.close = () => {};
  let approved = false, runs = 0, review;
  const controller = new DesktopController({ repositoryRoot: root, runtime: { nodeExecutable: process.execPath, codexExecutable: process.execPath }, catalog: require('../../build/sandubah/gui/catalog.json'), validator: () => true, mcpClient: mcp, confirm: async value => { review = value; return approved; } });
  t.after(() => controller.close());
  controller.cloud.selection = { provider: 'codex', model: 'fixture', effort: 'low' };
  controller.cloud.models = () => [{ id: 'fixture', effortLevels: ['low', 'medium'] }];
  controller.createProjectClient = () => ({ close() {} });
  controller.callTool = async () => ({ isError: false });
  controller.createCodexWorker = () => ({ async run(input) {
    runs++;
    const result = brokerFor(input)('tools/call', { name: TOOL, arguments: { section: 'project' } });
    assert.equal(result.result.structuredContent.projectId, id);
    return { success: true, interrupted: false, finalMessage: 'Worker fictício; MCP de contexto consultado.' };
  } });
  const created = await controller.buildProject({ prompt: 'Criar exemplo fictício', selection: { provider: 'codex', model: 'fixture', effort: 'low' } });
  const id = created.projectId;
  assert.equal(created.cancelled, true);
  assert.equal(runs, 0);
  assert.equal(review.arguments.missions[0].contextTool.mode, 'read-only');
  const confirmation = require('../../src/sandubah-desktop/planning-review.cjs').executionReview(review, JSON.stringify(review.arguments));
  assert.match(confirmation.context, /Contexto disponível por MCP somente leitura/);
  assert.ok(confirmation.context.includes(id));
  approved = true;
  const result = await controller.runProject({ id });
  assert.equal(result.success, true, JSON.stringify(result.project.missions));
  assert.equal(runs, 1);
});

test('X-Tudo compara base e candidato nos mesmos critérios e salva só após revisão', async t => {
  const { projects, project, mission, agent } = fixture(t);
  const other = projects.create({ name: 'Projeto secundário', goal: 'Assunto alheio desta comparação' });
  const prepared = projects.prepareCodex(project, mission, agent, buildSnapshot(projects, project, mission, agent));
  const call = brokerFor(prepared);
  const candidate = {
    scopedRead: call('tools/call', { name: TOOL, arguments: { section: 'project' } }).result.structuredContent.projectId === project.id,
    isolatedProject: !JSON.stringify(call('tools/call', { name: TOOL, arguments: { section: 'project' } })).includes(other.goal),
    selectiveReference: !prepared.prompt.includes('Conteúdo selecionado da missão.'),
  };
  const legacy = projects.codexPrompt(project, mission, agent);
  const baseline = { scopedRead: legacy.includes('read_mission_context'), isolatedProject: !legacy.includes(other.goal), selectiveReference: !legacy.includes('Conteúdo selecionado da missão.') };
  const checks = Object.keys(candidate).map(id => ({ id, path: id, expected: true, critical: true }));
  for (const [name, value] of Object.entries({ contract: { checks }, baseline, candidate })) projects.write(join(prepared.workspace, name + '.json'), JSON.stringify(value));
  const input = { contract: 'contract.json', baseline: 'baseline.json', candidate: 'candidate.json' };
  assert.deepEqual(await confirmedComparison({ projects, id: project.id, input, confirm: async () => false }), { cancelled: true });
  assert.equal(receipts(projects, project.id).length, 0);
  const result = await confirmedComparison({ projects, id: project.id, input, confirm: async () => true });
  assert.equal(result.decision, 'review');
  assert.equal(result.adopted, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.candidatePassed, 3);
  assert.equal(result.baselinePassed, 1);
  t.diagnostic(JSON.stringify({ evaluation: 'md2-context-mechanism', baselinePassed: result.baselinePassed, candidatePassed: result.candidatePassed, total: result.total, regressions: result.regressions, decision: result.decision, adopted: result.adopted, modelCalls: result.modelCalls }));
});
