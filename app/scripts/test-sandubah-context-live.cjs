'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { DesktopController, LocalMcpClient, localEnvironment, createValidator } = require('../src/sandubah-desktop/backend.cjs');
const { PlanningReview, executionReview } = require('../src/sandubah-desktop/planning-review.cjs');
const { confirmedComparison } = require('../src/sandubah-desktop/x-tudo.cjs');
const { codexSettings, hashFile } = require('../src/sandubah-desktop/codex-worker.cjs');

const root = resolve(__dirname, '..');
const build = join(root, 'build/sandubah/gui');
const fixture = fs.mkdtempSync(join(tmpdir(), 'sandubah-context-luna-'));
const runtime = { ...require(join(build, 'runtime.json')), codexExecutable: process.env.SANDUBAH_LIVE_CODEX };
assert.ok(process.argv.includes('--live'), 'Use --live somente com autorização para uma execução Luna real.');
assert.ok(runtime.codexExecutable && fs.existsSync(runtime.codexExecutable), 'Informe o executável Codex instalado.');
const profile = codexSettings();
const originalConfigHash = profile.configHash;
const catalog = require(join(build, 'catalog.json'));
const Ajv = require(join(build, 'vendor/node_modules/ajv'));
const controller = new DesktopController({ repositoryRoot: fixture, runtime, catalog, validator: createValidator(Ajv), confirm: async () => false });
controller.createProjectClient = directory => new LocalMcpClient({ nodeExecutable: runtime.nodeExecutable, launcher: join(root, 'scripts/sandubah-mcp.cjs'), cwd: directory, env: localEnvironment(root, runtime.nodeExecutable, process.env, directory) });
const projects = controller.projects;
let project = projects.create({ name: 'Ensaio fictício · contexto Luna', goal: 'Corrigir o total de pedidos fictícios usando uma regra consultada pelo MCP e avaliar no X-Tudo.' });
project = projects.update(project.id, 'agent', { name: 'Construtor do ensaio', role: 'coder' });
projects.write(join(fixture, 'docs/rules.md'), '# Regras fictícias\nSome totalCents apenas de pedidos state=paid. Exclua cancelled. Não altere a entrada. A regra de rastreio deste ensaio é REGRATEST-08.\n');
project = projects.update(project.id, 'context', { path: 'docs/rules.md' });
const instructions = 'Consulte obrigatoriamente read_mission_context no servidor MCP sandubah_context, seção references, e use a regra retornada. Crie candidate.cjs exportando totalCents(rows). Leia orders.json e baseline.cjs, preservando ambos e checks.json. Crie candidate.test.cjs com node:test para o resultado da fixture, entrada vazia e entrada preservada. Execute os testes seriais com o Node local indicado no contexto. Crie run-comparison.cjs que execute baseline e candidate sobre a mesma orders.json e grave before.json e after.json com totalCents e inputPreserved. Execute-o. Crie EVIDENCE.md citando a regra de rastreio recebida pela ferramenta, servidor/ferramenta consultados, comandos e limites. Use somente arquivos do workspace, sem rede, downloads ou subprocessos de agentes. Um worker. Não publique nem altere gateway, Corel ou impressão. Responda ao final no schema solicitado, completed somente se os testes e os dois JSON foram realmente produzidos.';
project = projects.update(project.id, 'mission', { agentId: project.agents[0].id, engine: 'codex', model: 'gpt-6-luna', effort: 'low', title: 'Consultar contexto e corrigir total fictício', instructions });
const workspace = projects.workspace(project.id);
const put = (name, value) => projects.write(join(workspace, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
put('orders.json', [{ id: 'demo-1', state: 'paid', totalCents: 1000 }, { id: 'demo-2', state: 'cancelled', totalCents: 500 }, { id: 'demo-3', state: 'paid', totalCents: 225 }]);
put('baseline.cjs', 'exports.totalCents = rows => rows.reduce((sum, row) => sum + row.totalCents, 0);\n');
put('checks.json', { checks: [{ id: 'total', path: 'totalCents', expected: 1225, critical: true }, { id: 'input', path: 'inputPreserved', expected: true, critical: true }] });
const protectedFiles = ['orders.json', 'baseline.cjs', 'checks.json'].map(name => join(workspace, name));
const protectedHashes = protectedFiles.map(hashFile);
const events = [];
controller.on('worker', ({ event }) => {
  events.push(event);
  if (['turn.completed', 'turn.failed', 'error'].includes(event.type) || event.item?.type === 'mcp_tool_call') console.log(JSON.stringify(event));
});
const receipt = { schema: 1, createdAt: new Date().toISOString(), fixture, projectId: project.id, model: 'gpt-6-luna', effort: 'low', workerLimit: 1, invocationLimit: 1, passed: false };
const save = () => fs.writeFileSync(join(fixture, 'validation.json'), JSON.stringify(receipt, null, 2));
let application, page, broker, invocations = 0, confirmations = 0;
const originalWorker = controller.createCodexWorker.bind(controller);
controller.createCodexWorker = () => {
  const worker = originalWorker();
  const run = worker.run.bind(worker);
  worker.run = input => { assert.equal(++invocations, 1, 'Limite de uma chamada real ao Codex.'); return run(input); };
  return worker;
};

async function reviewAndRespond(operation, approve, name) {
  await page.locator('#planning-review[open]').waitFor();
  await page.locator('#planning-review').screenshot({ path: join(fixture, name + '.png') });
  await page.locator(approve ? '#planning-review-approve' : '#planning-review-cancel').click();
  return operation;
}

async function run() {
  assert.ok(controller.cloud.models('codex').some(model => model.id === 'gpt-6-luna'), 'Luna ausente do catálogo da conta.');
  const source = join(root, 'src/sandubah-desktop');
  const html = fs.readFileSync(join(source, 'index.html'), 'utf8').replace('<head>', '<head><base href="' + pathToFileURL(source + '/').href + '">').replace('<script type="module" src="bootstrap.mjs"></script>', '');
  const pageFile = join(fixture, 'review.html'); fs.writeFileSync(pageFile, html);
  const { _electron: electron } = require(join(build, 'vendor/node_modules/playwright-core'));
  const executablePath = require(require.resolve('electron', { paths: [root] }));
  const env = { ...process.env, SANDUBAH_PUBLIC_TEST_PROFILE: join(fixture, 'ui-profile'), SANDUBAH_PUBLIC_TEST_FILE: pageFile };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ executablePath, args: [join(root, 'tests/regression/fixtures/sandubah-public-main.cjs'), '--disable-gpu'], env, timeout: 60000 });
  page = await application.firstWindow(); page.setDefaultTimeout(30000);
  await page.waitForLoadState('domcontentloaded');
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setBackgroundThrottling(false);
    window.showInactive();
  });
  await page.exposeFunction('liveReviewResponse', value => broker.respond(value));
  await page.evaluate(async url => { const { createPlanningReview } = await import(url); createPlanningReview({ onPlanningReview: handler => { window.liveReviewHandler = handler; }, respondPlanningReview: value => window.liveReviewResponse(value) }); }, pathToFileURL(join(source, 'planning-review.mjs')).href);
  broker = new PlanningReview(review => { page.evaluate(value => window.liveReviewHandler(value), review).catch(error => { console.error(error.message); broker.cancel(); }); });
  controller.confirm = request => {
    assert.equal(request.entry.kind, 'harness');
    assert.equal(request.project, projects.location(project.id));
    assert.equal(request.arguments.workerLimit, 1);
    const missions = request.arguments.missions;
    assert.equal(missions.length, 1);
    assert.equal(missions[0].model, 'gpt-6-luna');
    assert.equal(missions[0].instructions, instructions);
    assert.equal(missions[0].contextSnapshot.project.id, project.id);
    confirmations++;
    return broker.ask(executionReview(request, JSON.stringify(request.arguments, null, 2)));
  };
  const cancelled = await reviewAndRespond(controller.runProject({ id: project.id }), false, 'execution-cancel');
  assert.equal(cancelled.cancelled, true); assert.equal(invocations, 0);
  console.log(JSON.stringify({ stage: 'reviewed-live-execution', model: 'gpt-6-luna', workerLimit: 1, fictionalOnly: true }));
  const result = await reviewAndRespond(controller.runProject({ id: project.id }), true, 'execution-approved');
  receipt.invocations = invocations; receipt.confirmations = confirmations;
  const mission = projects.get(project.id).missions[0];
  receipt.missionStatus = mission.status;
  receipt.execution = JSON.parse(mission.result || '{}');
  receipt.usage = receipt.execution.usage || null;
  fs.writeFileSync(join(fixture, 'events.json'), JSON.stringify(events, null, 2)); save();
  assert.equal(result.success, true, mission.result);
  const calls = events.filter(event => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call' && event.item.server === 'sandubah_context' && event.item.tool === 'read_mission_context');
  assert.ok(calls.some(event => event.item.arguments?.section === 'references'), 'Sem evidência da chamada real ao MCP de referências.');
  receipt.mcpCalls = calls.map(event => event.item);
  assert.deepEqual(protectedFiles.map(hashFile), protectedHashes);
  const independentlyChecked = spawnSync(runtime.nodeExecutable, ['--permission', '--allow-fs-read=' + workspace, '--allow-fs-write=' + workspace, join(workspace, 'run-comparison.cjs')], { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(independentlyChecked.status, 0, independentlyChecked.stderr);
  const comparisonReview = preview => broker.ask({ title: 'Salvar comparação no X-Tudo?', provider: 'Validador local', model: 'Determinístico', project: project.name, prompt: `${preview.baselinePassed}/${preview.total} na base; ${preview.candidatePassed}/${preview.total} no candidato.`, history: [], sources: [], context: JSON.stringify(preview, null, 2), parameters: JSON.stringify(preview, null, 2), notice: 'Salva o recibo desta comparação. A proposta continua aguardando revisão.', approvalLabel: 'Salvar comparação' });
  const options = { projects, id: project.id, input: { contract: 'checks.json', baseline: 'before.json', candidate: 'after.json' }, confirm: comparisonReview };
  const comparisonCancelled = await reviewAndRespond(confirmedComparison(options), false, 'x-tudo-cancel');
  assert.equal(comparisonCancelled.cancelled, true);
  receipt.comparison = await reviewAndRespond(confirmedComparison(options), true, 'x-tudo-approved');
  assert.equal(receipt.comparison.decision, 'review');
  assert.equal(receipt.comparison.adopted, false);
  assert.equal(receipt.comparison.candidatePassed, 2);
  assert.equal(receipt.comparison.baselinePassed, 1);
  receipt.passed = true; receipt.configPreserved = hashFile(profile.configPath) === originalConfigHash; save();
  console.log(JSON.stringify({ passed: true, fixture, usage: receipt.usage, mcpCalls: calls.length, comparison: { baseline: receipt.comparison.baselinePassed, candidate: receipt.comparison.candidatePassed, total: receipt.comparison.total, decision: receipt.comparison.decision }, configPreserved: receipt.configPreserved }));
}

run().catch(error => { receipt.error = error.message; save(); console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  broker?.cancel(); controller.close(); if (application) await application.close();
  const copiedAuth = join(fixture, 'build/sandubah/gui/codex-profile/auth.json');
  if (fs.existsSync(copiedAuth)) fs.unlinkSync(copiedAuth);
  assert.equal(hashFile(profile.configPath), originalConfigHash);
});
