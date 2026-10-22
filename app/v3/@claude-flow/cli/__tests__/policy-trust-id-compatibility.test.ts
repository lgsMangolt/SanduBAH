import './helpers/isolated-policy-trust.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { policyTrustRoot } from '../src/services/policy-ledger-anchor.js';
import { autoMigratePolicyStateIfNeeded, loadPolicyState, setPolicyMode } from '../src/services/policy-runtime.js';

const directories: string[] = [];
const aliases: string[] = [];

afterEach(() => {
  for (const alias of aliases.splice(0)) unlinkSync(alias);
  for (const directory of directories.splice(0).reverse()) rmSync(directory, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'ruflo-trust-id-'));
  directories.push(root);
  mkdirSync(join(root, '.claude-flow'));
  return root;
}

async function legacyFixture() {
  const root = project();
  await autoMigratePolicyStateIfNeeded(root);
  await setPolicyMode('enforce', root);
  const canonicalId = createHash('sha256').update(realpathSync.native(root)).digest('hex');
  const canonical = join(policyTrustRoot(), canonicalId);
  const legacy = join(policyTrustRoot(), createHash('sha256').update(`legacy:${root}`).digest('hex'));
  directories.push(canonical, legacy);
  renameSync(canonical, legacy);
  const file = join(root, '.claude-flow', 'policy', 'state.json');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  state.mode = 'legacy';
  writeFileSync(file, JSON.stringify(state));
  return { root, canonical, legacy, file };
}

describe('canonical trust identity does not discard an existing authenticated anchor', () => {
  it.each(['missing', 'empty', 'key-only'])('refuses legacy ID reuse with a %s canonical directory', async mode => {
    const fixture = await legacyFixture();
    if (mode !== 'missing') mkdirSync(fixture.canonical);
    if (mode === 'key-only') writeFileSync(join(fixture.canonical, 'anchor.key'), 'incomplete publication');
    const anchor = readFileSync(join(fixture.legacy, 'state.anchor.json'));
    const key = readFileSync(join(fixture.legacy, 'anchor.key'));
    const state = readFileSync(fixture.file);
    const canonicalFiles = mode === 'missing' ? undefined : readdirSync(fixture.canonical);
    expect(() => loadPolicyState(fixture.root)).toThrow('policy-trust-migration-required');
    expect(readFileSync(join(fixture.legacy, 'state.anchor.json'))).toEqual(anchor);
    expect(readFileSync(join(fixture.legacy, 'anchor.key'))).toEqual(key);
    expect(readFileSync(fixture.file)).toEqual(state);
    expect(existsSync(fixture.canonical)).toBe(mode !== 'missing');
    if (canonicalFiles) expect(readdirSync(fixture.canonical)).toEqual(canonicalFiles);
  });

  it('also refuses the same legacy trust record through a directory alias', async () => {
    const fixture = await legacyFixture();
    const alias = `${fixture.root}-alias`;
    symlinkSync(fixture.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    aliases.push(alias);
    expect(() => loadPolicyState(alias)).toThrow('policy-trust-migration-required');
    expect(existsSync(fixture.canonical)).toBe(false);
  });

  it('does not block a different project because another project needs migration', async () => {
    const fixture = await legacyFixture();
    const anchor = readFileSync(join(fixture.legacy, 'state.anchor.json'));
    const unrelated = project();
    await autoMigratePolicyStateIfNeeded(unrelated);
    await setPolicyMode('enforce', unrelated);
    expect(loadPolicyState(unrelated).mode).toBe('enforce');
    expect(readFileSync(join(fixture.legacy, 'state.anchor.json'))).toEqual(anchor);
  });
});
