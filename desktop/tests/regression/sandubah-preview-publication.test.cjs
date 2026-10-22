'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {publicationPlan,verifyRemoteTree,gitBlobHash}=require('../../scripts/publish-sandubah-preview.cjs');
const file=(path,text)=>({path,mode:'100644',type:'blob',sha:gitBlobHash(Buffer.from(text))});
test('preview updates preserve existing release workflows and other unowned files',()=>{
  const before=file('index.html','old'),next=file('index.html','new'),workflow=file('.github/workflows/sandubah-desktop-release.yml','trusted workflow'),controller=file('ci/installed-desktop.cjs','trusted controller');
  const base={tree:[before,workflow,controller]},plan=publicationPlan(base,{tree:[before]},[next]);assert.equal(plan.changed,true);assert.deepEqual(plan.preserved,[workflow,controller]);assert.doesNotThrow(()=>verifyRemoteTree({tree:[next,workflow,controller]},[next],plan.preserved));assert.throws(()=>verifyRemoteTree({tree:[next]},[next],plan.preserved));assert.throws(()=>verifyRemoteTree({tree:[next,{...workflow,sha:'changed'},controller]},[next],plan.preserved));
});
test('externally changed, deleted or linked preview files block publication',()=>{
  const previous=file('index.html','old'),staged=file('index.html','new');for(const tree of [[file('index.html','external')],[],[{...previous,mode:'120000'}]])assert.throws(()=>publicationPlan({tree},{tree:[previous]},[staged]),/externamente/);
});
test('retry can adopt already identical files without replacing unrelated history',()=>{
  const previous=file('index.html','old'),staged=file('index.html','new'),workflow=file('.github/workflows/sandubah-desktop-release.yml','workflow');const plan=publicationPlan({tree:[staged,workflow]},{tree:[previous]},[staged]);assert.equal(plan.changed,false);assert.deepEqual(plan.preserved,[workflow]);
});
test('truncated trees cannot authorize a publication or its verification',()=>{
  const staged=[file('index.html','new')];assert.throws(()=>publicationPlan({truncated:true,tree:[]},null,staged));assert.throws(()=>publicationPlan({tree:[]},{truncated:true,tree:[]},staged));assert.throws(()=>verifyRemoteTree({truncated:true,tree:staged},staged,[]));
});
