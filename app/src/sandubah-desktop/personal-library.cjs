'use strict';

const { readdirSync, lstatSync, realpathSync, readFileSync } = require('node:fs');
const { join, resolve, relative, isAbsolute, sep } = require('node:path');
const { createHash } = require('node:crypto');

const hash = value => createHash('sha256').update(value).digest('hex');
const label = (value, maximum = 220) => typeof value === 'string' ? value.replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, maximum) : '';
const inside = (root, filename) => { const path = relative(root, filename); return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep); };

class PersonalLibrary {
  constructor({ home }) {
    this.roots = [join(home, '.codex', 'skills'), join(home, '.agents', 'skills')];
    this.cache = join(home, '.codex', 'plugins', 'cache');
    this.records = new Map();
    this.scanned = false;
  }
  safe(root, filename, file = false) {
    root = resolve(root); filename = resolve(filename);
    if (!inside(root, filename)) throw new Error('Fonte fora da biblioteca pessoal.');
    let cursor = filename;
    while (true) {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) throw new Error('Links de biblioteca não são seguidos.');
      const parent = resolve(cursor, '..');
      if (parent === cursor) break;
      cursor = parent;
    }
    if (!inside(realpathSync(root), realpathSync(filename))) throw new Error('Fonte fora da raiz permitida.');
    const stat = lstatSync(filename);
    if (file && (!stat.isFile() || stat.nlink > 1 || stat.size > 256000)) throw new Error('Documento de biblioteca inválido ou maior que 256 KiB.');
    return filename;
  }
  children(root, directory) {
    try { return readdirSync(this.safe(root, directory), { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true })); }
    catch { return []; }
  }
  read(root, filename) { return readFileSync(this.safe(root, filename, true), 'utf8'); }
  add(root, filename, kind, metadata = {}) {
    if (this.records.size >= 3000) return null;
    try {
      const content = this.read(root, filename);
      const id = 'personal:' + hash(filename.toLowerCase()).slice(0, 24);
      const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
      const name = label(metadata.name || front.match(/^name:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, '') || relative(root, resolve(filename, '..')).replaceAll('\\', '/'));
      const description = label(metadata.description || front.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, '') || 'Instruções pessoais disponíveis localmente.', 1200);
      const entry = { id, sourcePath: id, sourceLabel: filename, name, title: name, description, kind, category: 'pessoal', origin: 'personal', pluginId: metadata.pluginId,
        version: label(metadata.version), availability: 'Disponível localmente; ativação não verificada',
        policy: { mode: 'blocked', label: 'Referência pessoal · somente leitura', reason: 'Pode ser conectada ao contexto do harness. Não instala, ativa nem executa plugins, hooks ou servidores automaticamente.' } };
      this.records.set(id, { root, filename, entry });
      return entry;
    } catch { return null; }
  }
  skills(root, directory = root, pluginId, depth = 0) {
    if (depth > 6 || this.records.size >= 3000) return;
    this.add(root, join(directory, 'SKILL.md'), 'skill', { pluginId });
    for (const entry of this.children(root, directory)) {
      if (['node_modules', '.git', 'dist', 'build', 'references', 'assets', 'scripts'].includes(entry.name)) continue;
      this.skills(root, join(directory, entry.name), pluginId, depth + 1);
    }
  }
  scan() {
    if (this.scanned) return;
    this.scanned = true;
    for (const root of this.roots) this.skills(root);
    for (const marketplace of this.children(this.cache, this.cache)) {
      const marketRoot = join(this.cache, marketplace.name);
      for (const plugin of this.children(this.cache, marketRoot)) {
        const pluginRoot = join(marketRoot, plugin.name);
        const versions = this.children(this.cache, pluginRoot).reverse();
        for (const version of versions) {
          const directory = join(pluginRoot, version.name);
          let manifest, filename;
          for (const prefix of ['.codex-plugin', '.claude-plugin']) {
            try { filename = join(directory, prefix, 'plugin.json'); manifest = JSON.parse(this.read(this.cache, filename)); break; } catch {}
          }
          if (!manifest) continue;
          const entry = this.add(this.cache, filename, 'plugin', { name: manifest.interface?.displayName || manifest.name || plugin.name, description: manifest.description, version: manifest.version || version.name });
          if (!entry) continue;
          const skillPaths = new Set(['skills', '.codex-plugin/migrated-command-skills']);
          for (const path of Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills]) if (typeof path === 'string') skillPaths.add(path);
          for (const path of skillPaths) {
            const destination = resolve(directory, path);
            if (inside(directory, destination)) this.skills(this.cache, destination, entry.id);
          }
          break;
        }
      }
    }
  }
  entries() { this.scan(); return [...this.records.values()].map(record => record.entry); }
  document(id) {
    this.scan();
    const record = this.records.get(id);
    if (!record) throw new Error('Documento pessoal fora do índice permitido.');
    const original = this.read(record.root, record.filename);
    const { entry } = record;
    const links = entry.kind === 'plugin' ? this.entries().filter(item => item.pluginId === id).map(item => ({ path: item.id, title: item.title })) : entry.pluginId ? [{ path: entry.pluginId, title: this.records.get(entry.pluginId)?.entry.title }] : [];
    const content = entry.kind === 'plugin' ? `# ${entry.title}\n\n${entry.description}\n\nVersão: ${entry.version}\n\n${entry.availability}\n\nSomente metadados e instruções. Ferramentas externas exigem configuração e autorização próprias; não estão habilitadas no executor do harness.\n\n## Skills disponíveis\n${links.map(link => `- [${link.title}](${link.path})`).join('\n')}\n` : original;
    return { path: id, title: entry.title, sourceLabel: entry.sourceLabel, origin: 'personal', editable: false, version: hash(content), content, links };
  }
}

module.exports = { PersonalLibrary };
