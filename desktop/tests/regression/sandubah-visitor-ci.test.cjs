'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {join,resolve,dirname}=require('node:path');
const {readFileSync}=require('node:fs');
const root=resolve(__dirname,'../..');
const {providerDefinition,providerExecutable,authorizationUrl,isUnauthenticated}=require('../../src/sandubah-journey-ci/providers.cjs');
for(const filename of ['visitor.cjs','installed.cjs'])test(`visitor VM guard blocks local execution of ${filename}`,()=>{
  const environment={PATH:dirname(process.execPath)};for(const name of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[name])environment[name]=process.env[name];
  const result=spawnSync(process.execPath,[join(root,'src/sandubah-journey-ci',filename),'download'],{env:environment,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:128*1024});assert.equal(result.status,1);assert.match(result.stderr,/Only the authorized fresh GitHub-hosted VM/);
});
test('the visitor application test waits for IPC status outside synchronous browser polling',()=>{
  const source=readFileSync(join(root,'src/sandubah-journey-ci/installed.cjs'),'utf8');assert.doesNotMatch(source,/waitForFunction\(async/);assert.match(source,/update=await page\.evaluate/);assert.match(source,/assert\.equal\(update\.phase,'current'/);
});
test('the VM process environment is rebuilt without runner or personal authentication tokens',()=>{
  const source=readFileSync(join(root,'src/sandubah-journey-ci/journey.ps1'),'utf8');assert.ok(source.indexOf("GITHUB_ACTIONS -ne 'true'")<source.indexOf('New-Item'));assert.match(source,/Environment\.Clear\(\)/);assert.doesNotMatch(source,/Environment\['(?:GH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|ACTIONS_RUNTIME_TOKEN)'\]/);
});

test('Codex uses the documented default native installation without a discovery workaround',()=>{
  assert.equal(providerExecutable('codex','empty-home','local-app-data'),join('local-app-data','Programs/OpenAI/Codex/bin/codex.exe'));assert.equal(providerDefinition('codex').release,'0.163.0');assert.throws(()=>providerDefinition('unexpected'));const source=readFileSync(join(root,'src/sandubah-journey-ci/journey.ps1'),'utf8');assert.doesNotMatch(source,/Environment\['CODEX_INSTALL_DIR'\]/);assert.match(source,/provider\.packageSha256/);assert.match(source,/if \(-not \$installed\.passed\)/);
});

test('Codex OAuth is accepted only from official HTTPS hosts with state and client ID',()=>{
  const url='https://auth.openai.com/oauth/authorize?client_id=public-test-client&state=synthetic-test-state';assert.equal(authorizationUrl('codex','Open '+url).hostname,'auth.openai.com');for(const invalid of [url.replace('https:','http:'),url.replace('auth.openai.com','auth.openai.com.example.invalid'),url.replace('auth.openai.com','user@auth.openai.com'),url.replace('auth.openai.com','auth.openai.com:8443'),url.replace('&state=synthetic-test-state',''),url.replace('auth.openai.com','claude.ai')])assert.equal(authorizationUrl('codex',invalid),null);
});

test('CLI failures cannot be mistaken for a clean unauthenticated state',()=>{
  assert.equal(isUnauthenticated('codex',{status:1,stderr:'Not logged in'}),true);assert.equal(isUnauthenticated('codex',{status:1,stderr:'Network unavailable'}),false);assert.equal(isUnauthenticated('codex',{status:0,stderr:'Not logged in'}),false);assert.equal(isUnauthenticated('claude',{status:1,stdout:'{"loggedIn":false}'}),true);assert.equal(isUnauthenticated('claude',{status:1,stdout:'invalid'}),false);
});

test('Codex validation keeps the existing Claude evidence and all public release files',()=>{
  const source=readFileSync(join(root,'scripts/run-sandubah-site-journey.cjs'),'utf8');assert.match(source,/visitor-codex-github\.json/);assert.match(source,/base_tree:baseCommit\.tree\.sha/);const workflow=readFileSync(join(root,'src/sandubah-journey-ci/workflow.yml'),'utf8');assert.equal((workflow.match(/runs-on:/g)||[]).length,1);assert.match(workflow,/group: sandubah-desktop-release/);assert.doesNotMatch(workflow,/secrets\./);
});
