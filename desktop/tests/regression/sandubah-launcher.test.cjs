'use strict';

const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, dirname, join } = require('node:path');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { createLaunchSpec } = require('../../scripts/sandubah-mcp.cjs');

test('pins the built checkout, preserves project cwd and disables registry fallback', () => {
  const projectDirectory = join(tmpdir(), 'SanduBAH project with spaces');
  const launchSpec = createLaunchSpec({ cwd: projectDirectory, env: { PATH: 'existing-path', CLAUDE_FLOW_CWD: 'stale-project', RUFLO_MCP_CLI_OVERRIDE: 'upstream.js', CUSTOM_SETTING: 'keep' } });
  assert.equal(launchSpec.command, process.execPath);
  assert.deepEqual(launchSpec.args.slice(1), ['mcp', 'start']);
  assert.ok(launchSpec.args[0].endsWith(join('v3', '@claude-flow', 'cli', 'bin', 'cli.js')));
  assert.equal(launchSpec.cwd, projectDirectory);
  assert.equal(launchSpec.env.CLAUDE_FLOW_CWD, projectDirectory);
  assert.equal(launchSpec.env.RUFLO_MCP_CLI_OVERRIDE, launchSpec.args[0]);
  assert.equal(launchSpec.env.RUFLO_MCP_SKIP_NPX, '1');
  assert.equal(launchSpec.env.CLAUDE_FLOW_AUTO_UPDATE, 'false');
  assert.equal(launchSpec.env.RUFLO_HELPERS_LOCKED, 'true');
  assert.equal(launchSpec.env.RUFLO_DAEMON_AUTOSTART, '0');
  assert.equal(launchSpec.env.CUSTOM_SETTING, 'keep');
  assert.equal(launchSpec.env.PATH.split(delimiter)[0], dirname(process.execPath));
});

test('fails closed when source or compiled output is missing', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'sandubah-missing-build-'));
  try {
    assert.throws(() => createLaunchSpec({ repositoryRoot: fixtureRoot }), /requires the local build/);
    const binDirectory = join(fixtureRoot, 'v3', '@claude-flow', 'cli', 'bin');
    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(join(binDirectory, 'cli.js'), '');
    assert.throws(() => createLaunchSpec({ repositoryRoot: fixtureRoot }), /no registry fallback/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('does not mutate the parent environment', () => {
  const environment = Object.freeze({ Path: 'inherited-path', RUFLO_DAEMON_AUTOSTART: '1' });
  const launchSpec = createLaunchSpec({ env: environment });
  assert.equal(environment.RUFLO_DAEMON_AUTOSTART, '1');
  assert.ok(launchSpec.env.PATH.endsWith('inherited-path'));
});

test('both local CLI entry points show SanduBAH in the fast version path', () => {
  const repositoryRoot = join(__dirname, '..', '..');
  const cliRoot = join(repositoryRoot, 'v3', '@claude-flow', 'cli');
  const packageVersion = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8')).version;
  for (const entryPath of [join(repositoryRoot, 'bin', 'cli.js'), join(cliRoot, 'bin', 'cli.js')]) {
    for (const versionFlag of ['--version', '-V']) {
      const result = spawnSync(process.execPath, [entryPath, versionFlag], { cwd: repositoryRoot, encoding: 'utf8', timeout: 5000, windowsHide: true });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `SanduBAH v${packageVersion}\n`);
    }
  }
});

test('rejects test arguments that could enable extra workers before launching Vitest', { skip: process.platform !== 'win32' }, () => {
  const powerShellExecutable = join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'powershell', 'pwsh.exe');
  const result = spawnSync(powerShellExecutable, ['-NoLogo', '-NoProfile', '-File', join(__dirname, '..', '..', 'scripts', 'sandubah.ps1'), 'test', '--maxWorkers=4'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SanduBAH usa um worker/);
});
