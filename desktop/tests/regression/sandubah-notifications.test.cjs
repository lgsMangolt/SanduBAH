'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {badgeLabel,badgeBitmap,createTaskbarBadge}=require('../../src/sandubah-desktop/taskbar-badge.cjs');
const {CompletionNotifier}=require('../../src/sandubah-desktop/completion.cjs');
function fixture(options={}){const sent=[],badges=[],notifications=[],actions=[];let saved;class Notification{static isSupported(){return true;}constructor(input){this.input=input;this.handlers={};notifications.push(this);}on(event,handler){this.handlers[event]=handler;}show(){this.shown=true;}}const notifier=new CompletionNotifier({Notification,window:{isMinimized:()=>true,restore:()=>actions.push('restore'),show:()=>actions.push('show'),focus:()=>actions.push('focus')},send:item=>sent.push(item),onBadge:count=>badges.push(count),persist:value=>{saved=JSON.parse(JSON.stringify(value));},...options});return {notifier,sent,badges,notifications,actions,get saved(){return saved;}};}
test('contador usa 1 a 9 e 9+, com bitmap transparente fora do círculo',()=>{
  assert.equal(badgeLabel(0),'');for(let count=1;count<=9;count++)assert.equal(badgeLabel(count),String(count));for(const count of [10,99,1000])assert.equal(badgeLabel(count),'9+');for(const value of [-1,1.5,NaN,'1'])assert.throws(()=>badgeLabel(value));
  assert.equal(badgeBitmap(0).every(byte=>byte===0),true);const bitmap=badgeBitmap(1);assert.equal(bitmap.length,4096);assert.equal(bitmap[3],0);assert.ok(bitmap.some((byte,index)=>index%4===3&&byte===255));assert.deepEqual(badgeBitmap(10),badgeBitmap(99));
});
test('overlay do Windows é limitado a 16px, cacheado e removido ao ler tudo',()=>{
  const overlays=[],images=[];const badge=createTaskbarBadge({platform:'win32',window:{isDestroyed:()=>false,setOverlayIcon:(...args)=>overlays.push(args)},nativeImage:{createFromBitmap:(bytes,size)=>({resize:options=>{assert.equal(bytes.length,4096);assert.deepEqual(size,{width:32,height:32});assert.equal(options.width,16);const image={};images.push(image);return image;}})}});
  badge.update(1);badge.update(1);badge.update(10);badge.update(0);assert.equal(images.length,2);assert.equal(overlays[0][0],overlays[1][0]);assert.equal(overlays.at(-1)[0],null);assert.equal(badge.count,0);
  createTaskbarBadge({platform:'linux',window:{},nativeImage:{}}).update(1);
});
test('avisos persistem, não contam novamente e exibem todos os pendentes, não só cinco',()=>{
  const fixtureState=fixture({hidden:true});for(let index=0;index<12;index++)fixtureState.notifier.done({title:'Teste'});assert.equal(fixtureState.notifier.snapshot().unreadCount,12);assert.equal(fixtureState.notifier.snapshot().badge,'9+');assert.equal(fixtureState.notifications.length,0);
  const id=fixtureState.notifier.snapshot().items[0].id;fixtureState.notifier.read({id});fixtureState.notifier.read({id});assert.equal(fixtureState.notifier.snapshot().unreadCount,11);const restored=fixture({load:()=>fixtureState.saved});assert.equal(restored.notifier.snapshot().unreadCount,11);restored.notifier.read({all:true});assert.equal(restored.notifier.snapshot().badge,'');assert.throws(()=>restored.notifier.read({}));
});
test('histórico limita a trinta e rejeita dados persistidos inválidos',()=>{
  const source=fixture({hidden:true});for(let index=0;index<35;index++)source.notifier.done({});assert.equal(source.notifier.snapshot().items.length,30);const malformed=source.saved;malformed.items[0].view='execute';assert.equal(fixture({load:()=>malformed}).notifier.snapshot().items.length,0);
});
test('clicar no aviso só navega e marca como lido; falhas do Windows não perdem o aviso',()=>{
  const current=fixture();current.notifier.done({});assert.equal(current.notifications[0].shown,true);current.notifications[0].handlers.click();assert.deepEqual(current.actions,['restore','show','focus']);assert.equal(current.notifier.snapshot().unreadCount,0);assert.equal(current.sent.at(-1).open,true);
  class BrokenNotification{static isSupported(){return true;}constructor(){throw new Error('OS offline');}}
  const fallback=fixture({Notification:BrokenNotification,persist:()=>{throw new Error('Disco indisponível');}});assert.doesNotThrow(()=>fallback.notifier.done({}));assert.equal(fallback.notifier.snapshot().unreadCount,1);assert.match(fallback.sent.find(item=>item.type==='state').warning,/salvar/);
});
