'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

function storage(initial={}){const data=new Map(Object.entries(initial));return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),data};}

test('o layout é guardado por projeto e some sem quebrar quando o armazenamento falha',async()=>{
  const {layoutStore}=await import('../../src/sandubah-desktop/panels.mjs');
  globalThis.localStorage=storage();
  const first=layoutStore('project:a'),second=layoutStore('project:b');
  first.set('dockWidth',620);first.set('collapsed:track',true);
  assert.equal(first.get('dockWidth',null),620);assert.equal(first.get('collapsed:track',false),true);assert.equal(second.get('dockWidth',null),null);
  first.set('collapsed:track',undefined);assert.equal(first.get('collapsed:track',false),false);assert.deepEqual(JSON.parse(localStorage.getItem('sandubah-layout:project:a')),{dockWidth:620});
  globalThis.localStorage=storage({'sandubah-layout:project:a':'{não é json'});assert.equal(layoutStore('project:a').get('dockWidth',480),480);
  globalThis.localStorage=storage({'sandubah-layout:project:a':'[1,2]'});assert.equal(layoutStore('project:a').get('dockWidth',480),480);
  globalThis.localStorage={getItem(){throw new Error('bloqueado');},setItem(){throw new Error('bloqueado');}};
  const blocked=layoutStore('project:a');assert.doesNotThrow(()=>blocked.set('dockWidth',700));assert.equal(blocked.get('dockWidth',480),480);
  delete globalThis.localStorage;
});
