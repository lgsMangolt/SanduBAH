'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {join,resolve}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {DesktopUpdates,FEED}=require('../src/sandubah-desktop/desktop-updates.cjs');
const root=resolve(__dirname,'..'),directory=join(root,'build/sandubah/distribution');
const build=JSON.parse(fs.readFileSync(join(directory,'latest-build.json'),'utf8'));
const checkpoint=JSON.parse(fs.readFileSync(join(directory,'release-github-0.2.0.json'),'utf8'));
const publicConfig=JSON.parse(fs.readFileSync(join(build.output,'win-unpacked/resources/update-public.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function publicBytes(url,limit){
  const response=await fetch(url,{headers:{'User-Agent':'SanduBAH-public-release-validation'},signal:AbortSignal.timeout(45000)});assert.equal(response.status,200);
  const final=new URL(response.url);assert.equal(final.protocol,'https:');assert.ok(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(final.hostname));
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;assert.ok(size<=limit);chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
}
async function run(){
  assert.equal(checkpoint.published,true);assert.equal(checkpoint.installerSha256,build.sha256);assert.equal(digest(Buffer.from(publicConfig.publicKey)),build.publicKeyFingerprint);
  const release=JSON.parse((await publicBytes(FEED,256*1024)).toString('utf8'));assert.equal(release.id,checkpoint.releaseId);assert.equal(release.tag_name,'v'+build.version);assert.equal(release.draft,false);assert.equal(release.prerelease,false);
  const expected=['SanduBAH-Setup-0.2.0-x64.exe','SanduBAH-update.json','SanduBAH-update.sig','SHA256SUMS.txt',checkpoint.vmEvidence];assert.deepEqual(release.assets.map(asset=>asset.name).sort(),expected.sort());
  for(const asset of checkpoint.assets.filter(asset=>asset.name!=='SanduBAH-test-controller.zip')){const remote=release.assets.find(item=>item.name===asset.name);assert.equal(remote.size,asset.bytes);assert.equal(remote.digest,'sha256:'+asset.sha256);}
  const reportAsset=release.assets.find(asset=>asset.name===checkpoint.vmEvidence);assert.equal(reportAsset.browser_download_url,`https://github.com/lgsMangolt/SanduBAH/releases/download/v${build.version}/${checkpoint.vmEvidence}`);
  const evidenceBytes=await publicBytes(reportAsset.browser_download_url,128*1024);assert.equal(digest(evidenceBytes),checkpoint.vmEvidenceSha256);const evidence=JSON.parse(evidenceBytes);assert.equal(evidence.passed,true);assert.equal(evidence.installerSha256,build.sha256);assert.equal(evidence.privateProjectsIncluded,false);assert.equal(evidence.personalCredentialsIncluded,false);
  const verificationRoot=join(directory,'public-update-check-'+randomUUID()),states=[];
  for(const version of [build.version,'0.0.0']){const updater=new DesktopUpdates({root:verificationRoot,version,publicKey:publicConfig.publicKey,confirm:async()=>{throw new Error('Public verification must not ask to download.');},isBusy:()=>false,launch:async()=>{throw new Error('Public verification must never install.');}});const state=await updater.check();assert.equal(state.phase,version===build.version?'current':'available',state.message);states.push({version,phase:state.phase});}
  assert.equal(fs.existsSync(verificationRoot),false);
  const result={passed:true,checkedAt:new Date().toISOString(),releaseUrl:release.html_url,installerSha256:build.sha256,validationRun:checkpoint.validationRun,publicAssets:release.assets.map(asset=>asset.name),anonymousPublicFeed:true,pinnedSignatureVerified:true,states,downloadedInstaller:false,installedOnHost:false,workerLimit:1};fs.writeFileSync(join(directory,'public-release-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
