'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {join,resolve}=require('node:path');
const {createHash}=require('node:crypto');
const {verifyAudit,gitBlobHash,verifyRemoteTree}=require('./publish-sandubah-preview.cjs');
const root=resolve(__dirname,'..'),directory=join(root,'build/sandubah/gui'),stage=join(root,'build/sandubah/public-preview');
const checkpoint=JSON.parse(fs.readFileSync(join(directory,'publication-github.json'),'utf8')),releaseCheckpoint=JSON.parse(fs.readFileSync(join(root,'build/sandubah/distribution/release-github.json'),'utf8'));
const site='https://lgsmangolt.github.io/SanduBAH/',api='https://api.github.com/repos/lgsMangolt/SanduBAH';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bytes(url,limit=4*1024*1024){
  const response=await fetch(url,{headers:{'User-Agent':'SanduBAH-public-page-validation'},signal:AbortSignal.timeout(45000)});assert.equal(response.status,200,`Public response is not ready: ${url}`);const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;assert.ok(size<=limit);chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
}
async function run(){
  const audit=verifyAudit();assert.equal(checkpoint.pages,site);assert.equal(checkpoint.repositoryId,1428889858);
  for(const entry of audit.files){const downloaded=await bytes(site+entry.path);assert.equal(digest(downloaded),entry.sha256,`Pages deployment is not the audited version yet: ${entry.path}`);}
  const remote=JSON.parse(await bytes(`${api}/git/trees/${checkpoint.tree}?recursive=1`,256*1024)),staged=audit.files.map(entry=>({path:entry.path,mode:'100644',type:'blob',sha:gitBlobHash(fs.readFileSync(join(stage,entry.path)))}));verifyRemoteTree(remote,staged,checkpoint.preservedFiles);
  for(const [path,expected]of Object.entries(releaseCheckpoint.ciHashes)){const source=JSON.parse(await bytes(`${api}/contents/${path}?ref=${checkpoint.commit}`,128*1024));assert.equal(digest(Buffer.from(source.content.replace(/\s/g,''),'base64')),expected);}
  const release=JSON.parse(await bytes(`${api}/releases/latest`,256*1024));assert.equal(release.id,releaseCheckpoint.releaseId);const installer=release.assets.find(asset=>asset.name==='SanduBAH-Setup-0.1.0-x64.exe');assert.equal(installer.digest,'sha256:'+releaseCheckpoint.installerSha256);
  const html=fs.readFileSync(join(stage,'index.html'),'utf8');assert.ok(html.includes(`href="${installer.browser_download_url}"`));const head=await fetch(installer.browser_download_url,{method:'HEAD',signal:AbortSignal.timeout(45000)});assert.equal(head.status,200);assert.ok(['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(new URL(head.url).hostname));
  const result={passed:true,checkedAt:new Date().toISOString(),site,guide:site+'#install',commit:checkpoint.commit,publicFiles:audit.files.length,preservedReleaseFiles:checkpoint.preservedFiles.length,releaseInstallerSha256:releaseCheckpoint.installerSha256,installerHeadStatus:head.status,installerDownloaded:false,workerLimit:1,modelCalls:0,privateDataPublished:false};fs.writeFileSync(join(directory,'public-preview-live-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
