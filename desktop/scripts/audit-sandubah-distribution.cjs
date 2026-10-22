'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {join,resolve,normalize}=require('node:path');
const {createHash,verify}=require('node:crypto');
const {createRequire}=require('node:module');
const {privatePattern}=require('./build-sandubah-installer.cjs');
const {validateManifest}=require('../src/sandubah-distribution/workspace-image.cjs');
const root=resolve(__dirname,'..'),directory=join(root,'build/sandubah/distribution'),receipt=JSON.parse(fs.readFileSync(join(directory,'latest-build.json'),'utf8'));
const validation=JSON.parse(fs.readFileSync(join(directory,'installer-validation.json'),'utf8')),asar=createRequire(join(root,'../package.json'))('@electron/asar');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function run(){
  const checksum=createHash('sha256');for await(const chunk of fs.createReadStream(receipt.installer))checksum.update(chunk);assert.equal(checksum.digest('hex'),receipt.sha256);assert.equal(validation.passed,true);assert.equal(validation.installerSha256,receipt.sha256);
  const resources=join(receipt.output,'win-unpacked/resources'),archive=join(resources,'app-image.asar'),manifest=validateManifest(JSON.parse(asar.extractFile(archive,'image-manifest.json').toString('utf8'))),expected=new Set(manifest.files.map(entry=>entry.path));let audited=0;
  const check=(path,bytes)=>{assert.equal(privatePattern.test(path),false,'Private identifier in payload path.');if(/\.(?:cjs|mjs|js|json|md|txt|py|html|css|sh|ts|ya?ml)$|(?:^|\/)LICENSE(?:\.[A-Za-z]+)?$/i.test(path))assert.equal(privatePattern.test(bytes.toString('utf8')),false,'Private identifier or credential pattern in '+path);};
  for(const path of asar.listPackage(archive).map(path=>path.replaceAll('\\','/').replace(/^\//,''))){const info=asar.statFile(archive,normalize(path),false);assert.equal('link'in info,false);if('files'in info)continue;if(path==='image-manifest.json')continue;assert.equal(expected.has(path),true,'Unlisted payload file.');assert.equal(/(?:^|\/)(?:harnesses|profile|brain|home|cloud|logs)(?:\/|$)|signing-key|\.credentials|auth\.json/i.test(path),false);audited++;}
  assert.equal(audited,manifest.files.length);
  for(const entry of manifest.files){const bytes=asar.extractFile(archive,normalize(entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);check(entry.path,bytes);}
  for(const path of asar.listPackage(join(resources,'app.asar')).map(path=>path.replaceAll('\\','/').replace(/^\//,'')))check(path,asar.extractFile(join(resources,'app.asar'),path));
  const config=JSON.parse(fs.readFileSync(join(resources,'update-public.json'),'utf8'));assert.equal(verify(null,fs.readFileSync(join(receipt.output,'SanduBAH-update.json')),config.publicKey,fs.readFileSync(join(receipt.output,'SanduBAH-update.sig'))),true);assert.equal(fs.existsSync(join(receipt.output,'win-unpacked/debug.log')),false);assert.equal(fs.existsSync(join(resources,'default_app.asar')),false);
  const result={passed:true,auditedAt:new Date().toISOString(),installerSha256:receipt.sha256,applicationFiles:audited,privateProjectsIncluded:false,credentialsIncluded:false,personalLogsIncluded:false,published:false,workerLimit:1};fs.writeFileSync(join(directory,'privacy-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
