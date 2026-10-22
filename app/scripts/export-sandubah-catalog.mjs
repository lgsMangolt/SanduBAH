import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import backend from '../src/sandubah-desktop/backend.cjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] || join(repositoryRoot, 'build/sandubah/gui/catalog.json'));
backend.assertLocalWritePath(repositoryRoot,destination);
const compiledRoot = join(repositoryRoot, 'v3/@claude-flow/cli/dist/src');
const { getCommandAsync, getCommandNames, getCommandsByCategory } = await import(pathToFileURL(join(compiledRoot, 'commands/index.js')).href);
const { CommandParser } = await import(pathToFileURL(join(compiledRoot, 'parser.js')).href);
const { listMCPTools } = await import(pathToFileURL(join(compiledRoot, 'mcp-client.js')).href);
const entries = [];
const unavailable = [];
const categoryByCommand = new Map();
for (const [category, commands] of Object.entries(await getCommandsByCategory())) {
  for (const command of commands) categoryByCommand.set(command.name, category);
}

function optionMetadata(option) {
  return {
    name: option.name, short: option.short, description: option.description, type: option.type,
    default: option.default, required: Boolean(option.required), choices: option.choices,
    customValidation: typeof option.validate === 'function',
  };
}

function addCommand(command, parents = [], category = 'outras') {
  const commandPath = [...parents, command.name];
  entries.push({
    id: `cli:${commandPath.join(' ')}`, kind: 'cli', name: commandPath.join(' '),
    title: commandPath.join(' '), description: command.description || '', category,
    commandPath, aliases: command.aliases || [], options: (command.options || []).map(optionMetadata),
    examples: command.examples || [], hidden: Boolean(command.hidden), hasAction: typeof command.action === 'function',
  });
  for (const child of command.subcommands || []) addCommand(child, commandPath, category);
}

const visited = new Set();
for (const name of getCommandNames().sort()) {
  const command = await getCommandAsync(name);
  if (!command) {
    unavailable.push({ kind: 'cli', name, reason: 'O registro local não conseguiu carregar este comando.' });
    continue;
  }
  if (visited.has(command.name)) continue;
  visited.add(command.name);
  addCommand(command, [], categoryByCommand.get(command.name) || 'outras');
}

for (const tool of listMCPTools()) {
  entries.push({ ...tool, id: `mcp:${tool.name}`, kind: 'mcp', title: tool.name.replaceAll('_', ' '), category: tool.category || 'outras' });
}

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.claude-flow', '.hive-mind', '.swarm', '.cache', 'verification', '__tests__', 'tests', 'fixtures']);
function metadataFromMarkdown(content, fallback) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fields = frontmatter?.[1] || '';
  const scalar = (name) => fields.match(new RegExp(`^${name}:\\s*([^\\r\\n]+)`, 'm'))?.[1]?.replace(/^["']|["']$/g, '').trim();
  return { name: scalar('name') || fallback, description: scalar('description') || content.replace(/^---[\s\S]*?---/, '').replace(/^#+\s+.*$/gm, '').trim().split(/\r?\n\r?\n/)[0]?.slice(0,600) || '' };
}

function inventory(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    const absolutePath = join(directory, item.name);
    const sourcePath = relative(repositoryRoot, absolutePath).replaceAll('\\', '/');
    if (item.isDirectory()) {
      if (!ignoredDirectories.has(item.name)) inventory(absolutePath);
      continue;
    }
    if (item.name === 'SKILL.md' || (item.name.endsWith('.md') && sourcePath.includes('/agents/') && item.name.toLowerCase() !== 'agents.md')) {
      const kind = item.name === 'SKILL.md' ? 'skill' : 'agent';
      if(statSync(absolutePath).size>256000){unavailable.push({kind,name:sourcePath,reason:'Documento maior que 256 KiB; abra no editor.'});continue;}
      const content = readFileSync(absolutePath, 'utf8');
      const metadata = metadataFromMarkdown(content, item.name === 'SKILL.md' ? dirname(sourcePath).split('/').at(-1) : item.name.slice(0, -3));
      const category = sourcePath.startsWith('plugins/') ? sourcePath.split('/')[1] : kind === 'skill' ? 'skills locais' : 'agentes locais';
      entries.push({ id: `${kind}:${sourcePath}`, kind, ...metadata, title: metadata.name, category, sourcePath });
    }
  }
}
inventory(repositoryRoot);
for (const item of readdirSync(join(repositoryRoot, 'plugins'), { withFileTypes: true })) {
  if (!item.isDirectory() || item.isSymbolicLink()) continue;
  const manifestPath = join(repositoryRoot, 'plugins', item.name, '.claude-plugin/plugin.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  entries.push({ id: `plugin:${item.name}`, kind: 'plugin', name: manifest.name, title: manifest.name, description: manifest.description || '', version: manifest.version, category: 'plugins locais', sourcePath: relative(repositoryRoot, manifestPath).replaceAll('\\', '/') });
}

const uniqueEntries = [...new Map(entries.map(entry => [entry.id, entry])).values()];
const sourceFiles = ['v3/@claude-flow/cli/dist/src/commands/index.js', 'v3/@claude-flow/cli/dist/src/mcp-client.js', 'v3/@claude-flow/cli/bin/cli.js'];
const catalog = {
  name: 'SanduBAH', version: JSON.parse(readFileSync(join(repositoryRoot, 'v3/@claude-flow/cli/package.json'), 'utf8')).version,
  generatedAt: new Date().toISOString(), repositoryRoot, entries: uniqueEntries, unavailable,
  globalOptions: new CommandParser().getGlobalOptions().map(optionMetadata),
  counts: Object.fromEntries(['mcp','cli','skill','agent','plugin'].map(kind => [kind, uniqueEntries.filter(entry => entry.kind === kind).length])),
  sourceHashes: Object.fromEntries(sourceFiles.map(sourcePath => [sourcePath, createHash('sha256').update(readFileSync(join(repositoryRoot, sourcePath))).digest('hex')])),
};
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(catalog, null, 2) + '\n');
process.stdout.write(JSON.stringify({ catalog: destination, counts: catalog.counts, unavailable: unavailable.length }) + '\n');
