import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/cli.js');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('one-shot CLI shutdown drains pending callbacks', () => {
  it.each([0, 7])('preserves exit code %s without discarding outstanding work', exitCode => {
    const root = mkdtempSync(join(tmpdir(), 'ruflo-cli-shutdown-'));
    roots.push(root);
    const bin = join(root, 'bin', 'cli.js');
    const implementation = join(root, 'dist', 'src', 'index.js');
    const marker = join(root, 'callback-completed');
    mkdirSync(dirname(bin), { recursive: true });
    mkdirSync(dirname(implementation), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'shutdown-fixture', type: 'module', version: '0.0.0' }));
    copyFileSync(source, bin);
    writeFileSync(implementation, `
import { writeFileSync } from 'node:fs';
export class CLI {
  async run() {
    process.exitCode = ${exitCode};
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, 'drained'), 50);
  }
}
`);
    const result = spawnSync(process.execPath, [bin, 'fixture-one-shot'], {
      cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(exitCode);
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toBe('drained');
  });
});
