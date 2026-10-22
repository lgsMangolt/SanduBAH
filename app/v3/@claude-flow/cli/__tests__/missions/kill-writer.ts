import { MissionService } from '../../src/missions/index.js';
import { closeSync, fsyncSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireLock } from '../../src/services/policy-runtime.js';
import { plan } from './helpers.js';

const root = process.argv[2];
const service = new MissionService({ projectRoot: root, channel: 'cli' });
const created = await service.create({ requestId: 'kill-create', objective: 'survive SIGKILL' });
if (!created.ok) throw new Error(created.message);
let revision = created.data.revision;
for (let index = 0; index < 25; index++) {
  const body = plan({ budget: { currency: 'USD', ceilingMinor: 1_000 + index } });
  const result = await service.plan({ requestId: `kill-plan-${index}`, missionId: created.data.missionId, expectedRevision: revision, plan: body });
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  revision = result.data.revision;
}
const missionDirectory = join(root, '.claude-flow', 'missions', created.data.missionId);
await acquireLock(join(missionDirectory, 'lock'));
const descriptor = openSync(join(missionDirectory, 'events.jsonl'), 'a');
try {
  writeFileSync(descriptor, '{"contract":"ruflo.mission-event/1","seq":');
  fsyncSync(descriptor);
} finally {
  closeSync(descriptor);
}
process.stdout.write(`ready ${created.data.missionId}\n`);
setInterval(() => {}, 1000);
