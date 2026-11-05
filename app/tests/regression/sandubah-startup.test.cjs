'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const root=resolve(__dirname,'../..');
const ready=existsSync(join(root,'build/sandubah/gui/vendor/node_modules/playwright-core'))&&existsSync(join(root,'build/sandubah/gui/catalog.json'));

test('inicialização completa respeita CSP, navega e recupera falha de módulo em Electron isolado',{skip:ready?false:'Prepare o runtime local antes do ensaio Electron.',timeout:180000},()=>{
  const result=spawnSync(process.execPath,[join(root,'scripts/test-sandubah-startup-ui.cjs')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:170000,maxBuffer:512*1024});
  assert.equal(result.status,0,[result.error?.message,result.stdout,result.stderr].filter(Boolean).join('\n'));
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.passed,true);assert.equal(receipt.realModelCalls,0);assert.deepEqual(receipt.networkRequests,[]);
});
