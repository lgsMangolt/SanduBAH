'use strict';
class CompletionNotifier{
  constructor({Notification,window,send,hidden=false,icon,onBadge=()=>{},load=()=>null,persist=()=>{}}){this.Notification=Notification;this.window=window;this.send=send;this.hidden=hidden;this.icon=icon;this.onBadge=onBadge;this.persist=persist;this.items=[];const saved=load();if(saved?.version===1&&Array.isArray(saved.items)&&saved.items.length<=30&&saved.items.every(item=>item&&typeof item.id==='string'&&/^[a-f0-9-]{36}$/.test(item.id)&&typeof item.title==='string'&&item.title.length<=250&&typeof item.body==='string'&&item.body.length<=1000&&typeof item.read==='boolean'&&['planner','harness'].includes(item.view)&&typeof item.projectId==='string'&&(!item.projectId||/^[a-f0-9-]{36}$/.test(item.projectId))&&Number.isFinite(Date.parse(item.at))))this.items=saved.items;this.onBadge(this.snapshot().unreadCount);}
  snapshot(){const unreadCount=this.items.filter(item=>!item.read).length;return {items:this.items,unreadCount,badge:unreadCount>9?'9+':unreadCount?String(unreadCount):''};}
  changed(){const state=this.snapshot();try{this.persist({version:1,items:this.items});}catch{state.warning='Não foi possível salvar os avisos no disco; o contador permanece nesta janela.';}try{this.onBadge(state.unreadCount);}catch{}this.send({type:'state',...state});return state;}
  read({id,all=false}={}){if(all!==true&&typeof id!=='string')throw new Error('Escolha o aviso que deseja dispensar.');for(const item of this.items)if(all===true||item.id===id)item.read=true;return this.changed();}
  done({title='Resposta pronta',body='O SanduBAH terminou de responder.',projectId='',view='planner'}){
    const item={id:require('node:crypto').randomUUID(),title,body,projectId,view,read:false,at:new Date().toISOString()};this.items.unshift(item);this.items=this.items.slice(0,30);this.changed();this.send({...item,...this.snapshot()});
    if(!this.hidden&&this.Notification.isSupported()){try{const notification=new this.Notification({title,body,icon:this.icon,silent:false});notification.on('click',()=>{this.read({id:item.id});if(this.window.isMinimized())this.window.restore();this.window.show();this.window.focus();this.send({...item,open:true,...this.snapshot()});});notification.on('failed',()=>{});notification.show();}catch{}}
    return item;
  }
}
module.exports={CompletionNotifier};
