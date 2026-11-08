'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.RUNNER_OS !== 'Windows' || process.env.GITHUB_REPOSITORY !== 'lgsMangolt/SanduBAH') throw new Error('Upgrade test requires the authorized clean Windows VM.');

async function run() {
  const root = join(process.env.LOCALAPPDATA, 'SanduBAH/workspace');
  const downloads = resolve(process.env.SANDUBAH_VM_DOWNLOAD_DIRECTORY);
  const installed = resolve(process.env.SANDUBAH_INSTALLED_DIRECTORY);
  assert.equal(installed, resolve(process.env.LOCALAPPDATA, 'Programs/SanduBAH'));
  const runtime = JSON.parse(fs.readFileSync(join(root, 'build/sandubah/gui/runtime.json')));
  assert.equal(runtime.distribution.version, '0.3.0');
  const { DesktopUpdates, FEED } = require(join(root, 'src/sandubah-desktop/desktop-updates.cjs'));
  const config = JSON.parse(fs.readFileSync(join(installed, 'resources/update-public.json')));
  const bytes = fs.readFileSync(join(downloads, 'SanduBAH-update.json'));
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.version, '0.3.1');
  assert.equal(manifest.installer.sha256, process.env.SANDUBAH_EXPECTED_SHA256);
  const assetBase = 'https://github.com/lgsMangolt/SanduBAH/releases/download/v0.3.1/';
  const files = new Map([
    [assetBase + 'SanduBAH-update.json', join(downloads, 'SanduBAH-update.json')],
    [assetBase + 'SanduBAH-update.sig', join(downloads, 'SanduBAH-update.sig')],
    [manifest.installer.url, join(downloads, manifest.installer.name)],
  ]);
  // Before publication, the feed is staged from the audited draft assets.
  // Signature, version, URL, size and installer hash checks are the installed updater's own checks.
  const release = { tag_name: 'v0.3.1', draft: false, prerelease: false, assets: [...files].map(([url, path]) => ({ name: path.split(/[\\/]/).at(-1), browser_download_url: url, size: fs.statSync(path).size })) };
  const requests = [];
  async function* transport(url) {
    requests.push(url);
    if (url === FEED) { yield Buffer.from(JSON.stringify(release)); return; }
    assert.ok(files.has(url), 'Unexpected update URL.');
    yield* fs.createReadStream(files.get(url));
  }
  let approve = false, launches = 0;
  const confirmations = [];
  const updater = new DesktopUpdates({
    root, version: '0.3.0', publicKey: config.publicKey, isBusy: () => false, transport,
    confirm: async review => { confirmations.push({ stage: review.stage, approved: approve, version: review.version }); return approve; },
    launch: async filename => {
      assert.equal(++launches, 1);
      assert.equal(resolve(filename), resolve(root, 'build/sandubah/gui/updates', manifest.installer.name));
      const result = spawnSync(filename, ['/S', '/currentuser'], { windowsHide: true, timeout: 240000, stdio: 'ignore' });
      assert.equal(result.status, 0, result.error?.message);
    },
  });
  assert.equal((await updater.check()).phase, 'available');
  const beforeDownload = requests.length;
  assert.deepEqual(await updater.download(), { cancelled: true });
  assert.equal(requests.length, beforeDownload);
  approve = true;
  assert.equal((await updater.download()).phase, 'ready');
  assert.equal(launches, 0);
  approve = false;
  assert.deepEqual(await updater.install(), { cancelled: true });
  assert.equal(launches, 0);
  approve = true;
  assert.equal((await updater.install()).phase, 'installing');
  assert.equal(launches, 1);
  assert.deepEqual(confirmations.map(value => [value.stage, value.approved]), [['download', false], ['download', true], ['install', false], ['install', true]]);
  console.log(JSON.stringify({ passed: true, workerLimit: 1, modelCalls: 0, checks: ['actual-signed-0.3.0-to-0.3.1-update', 'update-download-install-separate-confirmations', 'staged-feed-from-audited-assets'], confirmations }));
}

run().catch(error => { console.error(error.stack); process.exitCode = 1; });
