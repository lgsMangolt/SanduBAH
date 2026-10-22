import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants, existsSync, fstatSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRegularLedgerFile } from '../src/services/policy-file.js';

const io = vi.hoisted(() => ({
  mode: '' as 'absent' | 'existing' | 'identity' | '', file: '', target: '', opened: -1,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      if (!io.mode || String(args[0]) !== io.file) return actual.openSync(...args);
      const flags = args[1] as number;
      if (io.mode === 'absent' && (flags & actual.constants.O_EXCL)) {
        throw Object.assign(new Error('the raced link already exists'), { code: 'EEXIST' });
      }
      if (io.mode === 'existing' && !(flags & actual.constants.O_CREAT)) {
        throw Object.assign(new Error('the replacement target does not exist'), { code: 'ENOENT' });
      }
      io.opened = actual.openSync(io.target, args[1], args[2]);
      return io.opened;
    },
  };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ruflo-policy-file-race-'));
  io.file = join(root, 'ledger.jsonl');
  io.target = join(root, 'outside.jsonl');
  io.mode = '';
  io.opened = -1;
});
afterEach(() => {
  io.mode = '';
  rmSync(root, { recursive: true, force: true });
});

describe('Windows nofollow fallback keeps raced targets untouched', () => {
  it('creates an initially absent ledger exclusively so a raced link cannot create its target', () => {
    io.mode = 'absent';
    expect(() => openRegularLedgerFile(io.file, constants.O_RDWR | constants.O_CREAT, 0o600)).toThrow();
    expect(existsSync(io.target)).toBe(false);
  });

  it('does not recreate a missing replacement target after inspecting an existing ledger', () => {
    writeFileSync(io.file, 'original');
    io.mode = 'existing';
    expect(() => openRegularLedgerFile(io.file, constants.O_RDWR | constants.O_CREAT, 0o600)).toThrow();
    expect(existsSync(io.target)).toBe(false);
  });

  it('closes the borrowed descriptor if its file identity differs from the inspected ledger', () => {
    writeFileSync(io.file, 'original');
    writeFileSync(io.target, 'different inode');
    io.mode = 'identity';
    expect(() => openRegularLedgerFile(io.file, constants.O_RDONLY)).toThrow('policy-ledger-archive-not-regular');
    expect(io.opened).toBeGreaterThanOrEqual(0);
    expect(() => fstatSync(io.opened)).toThrow();
  });
});
