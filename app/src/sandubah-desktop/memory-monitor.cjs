'use strict';

const {spawn}=require('node:child_process');
const {join}=require('node:path');
const {freemem,totalmem}=require('node:os');

function normalizeMemory(value,sampledAt){
  const bytes=number=>Number.isSafeInteger(number)&&number>=0;
  const valid=entry=>entry&&bytes(entry.total)&&entry.total>0&&bytes(entry.free)&&entry.free<=entry.total;
  let ram=null,gpu=null;
  if(valid(value?.ram)){
    const entry=value.ram;
    ram={total:entry.total,free:entry.free,commitFree:bytes(entry.commitFree)&&bytes(entry.commitTotal)&&entry.commitFree<=entry.commitTotal?entry.commitFree:null};
  }
  if(valid(value?.gpu)&&bytes(value.gpu.used)&&value.gpu.used<=value.gpu.total){
    const entry=value.gpu;gpu={total:entry.total,free:entry.free,used:entry.used};
  }
  return {sampledAt,ram,gpu};
}

class MemoryMonitor {
  constructor({root,guard,python,launch=spawn,now=Date.now,timeoutMs=3000,readRam=()=>({total:totalmem(),free:freemem()})}){
    Object.assign(this,{root,guard,python,launch,now,timeoutMs,readRam});
    this.cached=null;this.pending=null;this.child=null;this.closed=false;
  }
  status(){
    if(this.closed)return Promise.resolve(normalizeMemory(null,this.now()));
    if(this.pending)return this.pending;
    if(this.cached&&this.now()-this.cached.sampledAt<5000)return Promise.resolve(this.cached);
    this.pending=this.probe().catch(error=>({...normalizeMemory({ram:this.readRam()},this.now()),error:String(error.message).slice(0,300)})).then(value=>{this.cached=value;return value;}).finally(()=>{this.pending=null;});
    return this.pending;
  }
  probe(){
    return new Promise((resolve,reject)=>{
      const environment={PYTHONIOENCODING:'utf-8'};
      for(const name of ['SystemRoot','WINDIR'])if(process.env[name])environment[name]=process.env[name];
      const child=this.launch(this.guard(this.python),['-I','-B',this.guard(join(this.root,'scripts/sandubah-memory.py'))],{cwd:this.root,env:environment,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      this.child=child;
      let output='',diagnostic='',size=0,finished=false;
      const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);this.child=null;error?reject(error):resolve(value);};
      const stop=()=>{finish(new Error('Leitura de memória indisponível.'));child.kill();};
      const timer=setTimeout(stop,this.timeoutMs);
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-1200);});
      child.stdout.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>8192){stop();return;}output+=chunk;});
      child.once('error',error=>finish(error));
      child.once('close',code=>{
        if(code!==0){finish(new Error(`Leitor local encerrou com código ${code}: ${diagnostic.trim().split(/\r?\n/).at(-1)||'sem diagnóstico'}`));return;}
        try{finish(null,normalizeMemory(JSON.parse(output),this.now()));}catch(error){finish(error);}
      });
    });
  }
  close(){this.closed=true;this.child?.kill();}
}

module.exports={MemoryMonitor,normalizeMemory};
