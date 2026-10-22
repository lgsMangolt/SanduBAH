'use strict';

const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { localEnvironment, assertLocalWriteTree } = require('../src/sandubah-desktop/backend.cjs');

const root = resolve(__dirname, '..');
const output = join(root, 'build/sandubah/gui');
const dependencies = createRequire(join(root, '../package.json'));
const packageRoot = name => dirname(dependencies.resolve(`${name}/package.json`));
assertLocalWriteTree(root,output);
mkdirSync(output, { recursive: true });
for (const directory of ['node', 'vendor/node_modules', 'home/AppData/Roaming', 'home/AppData/Local', 'home/.cache', 'home/.config', 'project', 'tmp', 'profile', 'test-profile', 'logs', 'screenshots']) mkdirSync(join(output, directory), { recursive: true });

const electronSource = join(packageRoot('electron'), 'dist');
const electronTarget = join(output, 'runtime');
if (!existsSync(join(electronTarget, 'electron.exe'))) cpSync(electronSource, electronTarget, { recursive: true });
const nodeExecutable = join(output, 'node/node.exe');
if (!existsSync(nodeExecutable)) cpSync(process.execPath, nodeExecutable);

const copied = new Set();
function copyPackage(name, importer = dependencies) {
  if (copied.has(name)) return;
  copied.add(name);
  const manifestPath = importer.resolve(`${name}/package.json`);
  const source = dirname(manifestPath);
  cpSync(source, join(output, 'vendor/node_modules', name), { recursive: true });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resolver = createRequire(manifestPath);
  for (const child of Object.keys(manifest.dependencies || {})) copyPackage(child, resolver);
}
copyPackage('ajv');
copyPackage('playwright-core');
const runtime = {
  nodeExecutable,
  stateDirectory: join(output, 'project'),
  electronExecutable: join(electronTarget, 'electron.exe'),
  codexExecutable: process.argv[2] || '',
  electronVersion: JSON.parse(readFileSync(join(packageRoot('electron'), 'package.json'), 'utf8')).version,
  nodeVersion: process.version,
  preparedAt: new Date().toISOString(),
};
writeFileSync(join(output, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n');
const result = spawnSync(nodeExecutable, [join(__dirname, 'export-sandubah-catalog.mjs')], { cwd: root, env: localEnvironment(root, nodeExecutable), shell: false, windowsHide: true, stdio: 'inherit', timeout: 120000 });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Falha ao exportar catálogo: ${result.status}`);
process.stdout.write(`Runtime local pronto: ${output}\n`);
