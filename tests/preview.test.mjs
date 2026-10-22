// Testes da prévia web — rodam sem dependências: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const pages = ['index.html', 'prototype.html'];
const scripts = ['app.mjs'];
const allowedHosts = new Set([
  'github.com',
  'code.claude.com',
  'learn.chatgpt.com',
  'www.w3.org', // namespace do SVG, não é requisição
]);

test('todos os arquivos locais referenciados nas páginas existem', () => {
  for (const page of pages) {
    const refs = [...read(page).matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.ok(existsSync(join(root, ref)), `${page} aponta para ${ref}, que não existe`);
    }
  }
  for (const script of scripts) {
    for (const [asset] of read(script).matchAll(/assets\/[\w./-]+/g)) {
      assert.ok(existsSync(join(root, asset)), `${script} usa ${asset}, que não existe`);
    }
  }
});

test('os scripts não têm erro de sintaxe', () => {
  for (const script of scripts) {
    execFileSync(process.execPath, ['--check', join(root, script)]);
  }
});

test('a página principal mantém a Content-Security-Policy restritiva', () => {
  const html = read('index.html');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src 'none'/, 'a prévia não deve fazer requisições de rede');
  assert.match(html, /default-src 'none'/);
});

test('a prévia não faz chamadas de rede nem guarda dados no navegador', () => {
  for (const script of scripts) {
    const code = read(script);
    for (const api of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sendBeacon']) {
      assert.ok(!code.includes(api), `${script} usa ${api}`);
    }
  }
});

test('links externos apontam só para domínios conhecidos', () => {
  for (const file of [...pages, ...scripts]) {
    for (const [url] of read(file).matchAll(/https?:\/\/[^"'`\s)]+/g)) {
      const host = new URL(url).hostname;
      assert.ok(allowedHosts.has(host), `${file} tem link para domínio inesperado: ${host}`);
    }
  }
});

test('links externos abrem em nova aba com rel="noopener"', () => {
  const html = read('index.html');
  for (const [tag] of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) {
    assert.match(tag, /rel="[^"]*noopener/, `link sem noopener: ${tag}`);
  }
});
