import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as bridge from '../src/memory/memory-bridge.js';
import { getHNSWStatus, storeEntry } from '../src/memory/memory-initializer.js';

let root: string;
let dbPath: string;
let database: Database.Database;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ruflo-2922-'));
  dbPath = join(root, 'memory.db');
  database = new Database(dbPath);
  bridge.__setMemoryBridgeRegistryForTests({
    getAgentDB: () => ({ database, embedder: null }),
    get: () => null,
  });
  vi.spyOn(bridge, 'shouldDisableNativeBridge').mockReturnValue(false);
});

afterEach(async () => {
  await bridge.shutdownBridge();
  vi.restoreAllMocks();
  database.close();
  rmSync(root, { recursive: true, force: true });
});

describe('#2922 active SQLite bridge reports its actual search algorithm', () => {
  it('does not claim HNSW acceleration when writes use the brute-force bridge', async () => {
    expect(await storeEntry({
      key: 'k1', value: 'hello world', namespace: 'test', dbPath, generateEmbeddingFlag: false,
    })).toMatchObject({ success: true });
    expect(getHNSWStatus()).toMatchObject({
      available: false, initialized: false, algorithm: 'brute-force-cosine',
    });
  });

  it('bridge vector search status explicitly identifies brute-force cosine', async () => {
    expect(await storeEntry({
      key: 'k1', value: 'hello', namespace: 'test', dbPath, generateEmbeddingFlag: false,
    })).toMatchObject({ success: true });
    const status = await bridge.bridgeGetVectorSearchStatus(dbPath);
    expect(status).not.toBeNull();
    expect(status!.algorithm).toBe('brute-force-cosine');
  });
});
