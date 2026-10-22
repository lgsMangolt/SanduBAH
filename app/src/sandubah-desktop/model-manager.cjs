'use strict';

const {EventEmitter}=require('node:events');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {existsSync,readFileSync,writeFileSync,mkdirSync,statSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {MODELS,modelById,modelDirectory}=require('./model-catalog.cjs');

class ModelManager extends EventEmitter {
  constructor({root,guard,planner,isBusy,execute,terminate,launch=spawn}){
    super();Object.assign(this,{root,guard,planner,isBusy,execute,terminate,launch});
    this.tasks=[];this.current=null;this.child=null;this.closed=false;
    this.settings=guard(join(root,'build/sandubah/airllm/model-selection.json'));
    try{if(statSync(this.settings).size<4096){const saved=JSON.parse(readFileSync(this.settings,'utf8'));if(modelById(saved.selected).supported)this.planner.select(saved.selected);}}catch{}
  }
  snapshot(){return {selected:this.planner.modelId,workerLimit:1,models:MODELS.map(model=>{
    const directory=modelDirectory(this.root,model.id);let downloaded=false,installed=false;
    try{const file=this.guard(join(directory,'model-receipt.json'));if(statSync(file).size<100000){const receipt=JSON.parse(readFileSync(file,'utf8'));downloaded=receipt.downloadVerified===true&&receipt.model===model.repository&&receipt.revision===model.revision;}}catch{}
    const validation=model.supported?this.planner.status(model.id):{ready:false};
    try{const file=this.guard(join(directory,'receipts/prepare.json'));if(statSync(file).size<100000){const receipt=JSON.parse(readFileSync(file,'utf8'));installed=receipt.ok===true&&(receipt.modelId===model.id||model.id==='qwen-2b'&&!receipt.modelId);}}catch{}
    return {...model,downloaded,ready:validation.ready,installed,reason:model.supported?validation.message:model.description};
  }),tasks:this.tasks.map(({id,modelId,label,state,phase,message,percent,error})=>({id,modelId,label,state,phase,message,percent,error}))};}
  changed(){this.emit('change',this.snapshot());}
  select(id){if(!modelById(id).supported)throw new Error('Esta IA é incompatível com este PC. Escolha um Qwen local.');if(this.isBusy()||this.current)throw new Error('Aguarde a tarefa atual antes de trocar a IA.');this.planner.select(id);mkdirSync(this.guard(dirname(this.settings)),{recursive:true});writeFileSync(this.guard(this.settings),JSON.stringify({selected:id}));this.changed();return this.snapshot();}
  enqueue(id,action='install'){
    const model=modelById(id);
    if(this.closed)throw new Error('Fila encerrada.');
    if(!model.supported)throw new Error('Kimi K3 não é compatível com este adaptador nem com o teto de 3,9 GB. Consulte Info.');
    if(!['install','validate'].includes(action))throw new Error('Ação inválida.');
    if(!existsSync(this.planner.python))throw new Error('Instale o runtime local do SanduBAH primeiro.');
    if(this.tasks.some(task=>task.modelId===id&&['queued','running'].includes(task.state)))throw new Error('Este modelo já está na fila.');
    if(this.tasks.filter(task=>task.state==='queued').length>=10)throw new Error('Fila cheia.');
    const task={id:randomUUID(),modelId:id,action,label:`${action==='install'?'Baixar e instalar':'Validar'} ${model.name}`,state:'queued',phase:'queued',message:'Aguardando o único worker',percent:null};
    this.tasks=this.tasks.filter(item=>['queued','running'].includes(item.state)).concat(this.tasks.filter(item=>!['queued','running'].includes(item.state)).slice(-20));
    this.tasks.push(task);this.changed();this.pump();return {id:task.id};
  }
  async pump(){
    if(this.closed||this.current||this.isBusy())return;
    const task=this.tasks.find(item=>item.state==='queued');if(!task)return;
    this.current=task;task.state='running';this.changed();
    try{
      await this.execute(task.label,async()=>{
        if(task.action==='install'){
          await this.step(task,'download','Baixando e verificando SHA-256',['scripts/download-sandubah-model.py','--model',task.modelId],7200000);
          await this.step(task,'prepare','Instalando e preparando NF4 automaticamente',['scripts/sandubah-qwen-worker.py','--model',task.modelId,'--mode','prepare'],900000);
        }
        await this.step(task,'validate','Testando conversa e diagrama antes de liberar',['scripts/sandubah-qwen-worker.py','--model',task.modelId,'--mode','smoke','--image',join(this.root,'build/sandubah/airllm/images/harness-diagram.png')],900000);
        if(!this.planner.status(task.modelId).ready)throw new Error('O recibo não aprovou este modelo. O painel continua bloqueado.');
        return {success:true};
      });
      task.state='done';task.percent=100;task.message='Instalado e validado. Selecione para conversar.';
    }catch(error){task.state=task.cancelled?'cancelled':'error';task.error=String(error.message).slice(0,1000);task.message=task.cancelled?'Cancelado; arquivos parciais podem ser reutilizados na próxima tentativa.':task.error;task.percent=null;}
    finally{this.current=null;this.changed();queueMicrotask(()=>this.pump());}
  }
  step(task,phase,message,args,timeout){
    if(task.cancelled||this.closed)throw new Error('Tarefa cancelada.');
    task.phase=phase;task.message=message;task.percent=null;this.changed();
    const script=this.guard(join(this.root,args[0]));
    const environment={PYTHONIOENCODING:'utf-8'};
    for(const name of ['SystemRoot','WINDIR','COMSPEC','PATH','NUMBER_OF_PROCESSORS'])if(process.env[name])environment[name]=process.env[name];
    return new Promise((resolve,reject)=>{
      const child=this.launch(this.planner.python,['-I','-u',script,...args.slice(1)],{cwd:this.root,env:environment,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});this.child=child;
      let buffer='',diagnostic='',failure=null,result=null,bytes=0,finished=false;
      const fail=error=>{failure=error;this.terminate(child);};
      const timer=setTimeout(()=>fail(new Error('Tempo limite da etapa. Nenhuma tarefa foi repetida.')),timeout);
      const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);this.child=null;error?reject(error):resolve(result);};
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-2000);});
      child.stdout.on('data',chunk=>{
        bytes+=Buffer.byteLength(chunk);buffer+=chunk;
        if(bytes>4*1024*1024){fail(new Error('Protocolo acima do limite.'));return;}
        let newline;
        while((newline=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
          try{
            const event=JSON.parse(line);
            if(event.type==='error')failure=new Error(String(event.message));
            if(event.type==='result')result=event;
            if(event.type==='progress'){
              task.message=String(event.message||message).slice(0,500);
              task.percent=phase==='download'&&Number.isFinite(event.percent)?Math.min(100,Math.max(0,event.percent)):null;
              this.changed();
            }
          }catch{fail(new Error('Protocolo local inválido.'));return;}
        }
      });
      child.once('error',finish);
      child.once('close',code=>finish(failure||(task.cancelled?new Error('Cancelado.'):code!==0?new Error(`A etapa ${phase} encerrou com código ${code}. ${diagnostic.trim().split(/\r?\n/).at(-1)||'Sem diagnóstico do processo.'} Os arquivos baixados foram preservados.`):result?.ok!==true?new Error(`A etapa ${phase} terminou sem resultado válido. O modelo não foi liberado.`):null)));
    });
  }
  cancel(id){const task=this.tasks.find(item=>item.id===id);if(!task||!['queued','running'].includes(task.state))throw new Error('Tarefa não está pendente.');task.cancelled=true;if(task===this.current){task.message='Interrompendo somente este worker…';this.terminate(this.child);}else{task.state='cancelled';task.message='Removida da fila.';}this.changed();return {cancelled:true};}
  close(){this.closed=true;for(const task of this.tasks.filter(item=>['queued','running'].includes(item.state)))this.cancel(task.id);}
}

module.exports={ModelManager};
