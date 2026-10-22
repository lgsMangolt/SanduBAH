'use strict';

const { statSync } = require('node:fs');
const { delimiter, dirname, join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

function createLaunchSpec({ repositoryRoot = resolve(__dirname, '..'), nodeExecutable = process.execPath, cwd = process.cwd(), env = process.env } = {}) {
  const cliEntry = join(repositoryRoot, 'v3', '@claude-flow', 'cli', 'bin', 'cli.js');
  const compiledEntry = join(repositoryRoot, 'v3', '@claude-flow', 'cli', 'dist', 'src', 'index.js');
  for (const requiredFile of [cliEntry, compiledEntry]) {
    try {
      if (!statSync(requiredFile).isFile()) throw new Error('not a file');
    } catch {
      throw new Error(`SanduBAH requires the local build: ${requiredFile}. Run scripts/dev-local.ps1 build; no registry fallback is allowed.`);
    }
  }
  return {
    command: nodeExecutable,
    args: [cliEntry, 'mcp', 'start'],
    cwd,
    env: {
      ...env,
      PATH: [dirname(nodeExecutable), join(repositoryRoot, 'v3', 'node_modules', '.pnpm', 'node_modules', '.bin'), env.PATH || env.Path || ''].join(delimiter),
      CLAUDE_FLOW_CWD: cwd,
      CLAUDE_FLOW_MCP_TRANSPORT: 'stdio',
      CLAUDE_FLOW_AUTO_UPDATE: 'false',
      RUFLO_HELPERS_LOCKED: 'true',
      RUFLO_DAEMON_AUTOSTART: '0',
      RUFLO_MCP_SKIP_NPX: '1',
      RUFLO_MCP_CLI_OVERRIDE: cliEntry,
    },
  };
}

async function main() {
  const launchSpec = createLaunchSpec();
  if (process.argv[2] === '--describe') {
    process.stdout.write(JSON.stringify({ name: 'SanduBAH', command: launchSpec.command, args: launchSpec.args, cwd: launchSpec.cwd, fallback: false }, null, 2) + '\n');
    return;
  }
  Object.assign(process.env, launchSpec.env);
  process.argv = [launchSpec.command, ...launchSpec.args];
  await import(pathToFileURL(launchSpec.args[0]).href);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[SanduBAH] ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { createLaunchSpec };
