'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createInterface } = require('node:readline');
const { once } = require('node:events');

async function main() {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'sandubah-mcp-smoke-'));
  const server = spawn(process.execPath, [join(__dirname, 'sandubah-mcp.cjs')], {
    cwd: projectDirectory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let nextId = 1;
  let stderr = '';
  const lines = createInterface({ input: server.stdout });
  const stopped = once(server, 'exit');
  server.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  server.on('error', (error) => {
    for (const callbacks of pending.values()) callbacks.reject(error);
  });
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      const callbacks = pending.get(message.id);
      if (!callbacks) return;
      pending.delete(message.id);
      clearTimeout(callbacks.timer);
      if (message.error) callbacks.reject(new Error(JSON.stringify(message.error)));
      else callbacks.resolve(message.result);
    } catch (error) {
      for (const callbacks of pending.values()) callbacks.reject(error);
    }
  });
  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = nextId++;
      const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}; ${stderr}`)), 30000);
      pending.set(requestId, { resolve, reject, timer });
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
  }
  try {
    const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sandubah-smoke', version: '1.0.0' } });
    assert.ok(initialized.serverInfo?.name);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const catalog = await request('tools/list');
    assert.ok(Array.isArray(catalog.tools) && catalog.tools.length > 0);
    assert.ok(catalog.tools.some((tool) => tool.name === 'memory_search'));
    await request('ping');
    process.stdout.write(JSON.stringify({ success: true, source: join(__dirname, 'sandubah-mcp.cjs'), isolatedProject: true, server: initialized.serverInfo, toolCount: catalog.tools.length, methods: ['initialize', 'tools/list', 'ping'] }) + '\n');
  } finally {
    for (const callbacks of pending.values()) clearTimeout(callbacks.timer);
    server.stdin.end();
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await stopped;
    lines.close();
    rmSync(projectDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
