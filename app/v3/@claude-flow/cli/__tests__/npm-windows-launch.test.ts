import { describe, expect, it } from 'vitest';
import { resolveNpmLaunch } from '../src/runtime/browser-command.js';

describe('npm launch without a Windows shell', () => {
  it('resolves the npm next to Node as a literal JavaScript entry', () => {
    const entry = 'C:\\Node & tools\\node_modules\\npm\\bin\\npm-cli.js';
    expect(resolveNpmLaunch({
      platform: 'win32', nodeExecutable: 'C:\\Node & tools\\node.exe',
      fileExists: file => file === entry,
      lookup: () => { throw new Error('PATH is not needed'); },
    })).toEqual({ command: 'C:\\Node & tools\\node.exe', argsPrefix: [entry] });
  });

  it('resolves a pnpm-generated npm shim without executing the batch file', () => {
    const entry = 'C:\\packages\\npm\\bin\\npm-cli.js';
    expect(resolveNpmLaunch({
      platform: 'win32', nodeExecutable: 'C:\\runtime\\node.exe',
      lookup: () => 'C:\\packages\\.bin\\npm.cmd\r\n',
      readFile: () => 'node "%~dp0\\..\\npm\\bin\\npm-cli.js" %*',
      fileExists: file => file === entry,
    })).toEqual({ command: 'C:\\runtime\\node.exe', argsPrefix: [entry] });
  });

  it('refuses a shim with no real npm entry instead of enabling a shell', () => {
    expect(resolveNpmLaunch({
      platform: 'win32', nodeExecutable: 'C:\\runtime\\node.exe',
      lookup: () => 'C:\\unavailable\\npm.cmd', fileExists: () => false, readFile: () => '@echo unsafe',
    })).toBeNull();
  });

  it('retains the shell-free POSIX command', () => {
    expect(resolveNpmLaunch({ platform: 'linux' })).toEqual({ command: 'npm', argsPrefix: [] });
  });
});
