import { afterEach, vi } from 'vitest';
import { linkSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const simulatedLinks = vi.hoisted(() => new Set<string>());

vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => {
      const stats = actual.lstatSync(...args);
      if (!stats || !simulatedLinks.has(resolve(String(args[0])))) return stats;
      return Object.assign(Object.create(stats), { isSymbolicLink: () => true, isFile: () => false });
    },
  };
});

afterEach(() => simulatedLinks.clear());

export function createFileLinkFixture(target: string, file: string): void {
  if (process.platform !== 'win32') {
    symlinkSync(target, file);
    return;
  }
  linkSync(target, file);
  simulatedLinks.add(resolve(file));
}
