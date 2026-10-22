'use strict';
const {existsSync,readFileSync,lstatSync}=require('node:fs');
const {join}=require('node:path');
const MAX_BYTES=256*1024;
class PreviewData{
  constructor(projects){this.projects=projects;}
  filename(id){
    this.projects.get(id);
    const manifest=join(this.projects.workspace(id),'preview-storage.json');this.projects.guard(manifest);
    if(!existsSync(manifest)||lstatSync(manifest).size>1024)throw new Error('Esta prévia não habilitou dados locais.');
    const settings=JSON.parse(readFileSync(manifest,'utf8'));
    if(settings.version!==1||settings.persistence!=='local-demo')throw new Error('Persistência da prévia não autorizada.');
    const filename=join(this.projects.location(id),'preview-data.json');this.projects.guard(filename);return filename;
  }
  load(id){
    const filename=this.filename(id);if(!existsSync(filename))return {revision:0,value:null};
    if(lstatSync(filename).size>MAX_BYTES)throw new Error('Os dados locais excedem 256 KB.');
    const saved=JSON.parse(readFileSync(filename,'utf8'));
    if(!Number.isSafeInteger(saved.revision)||saved.revision<1||!saved.value||typeof saved.value!=='object'||Array.isArray(saved.value))throw new Error('Dados locais inválidos; nada foi substituído.');
    return saved;
  }
  save(id,{revision,value}){
    if(!Number.isSafeInteger(revision)||revision<0||!value||typeof value!=='object'||Array.isArray(value))throw new Error('Dados da prévia inválidos.');
    const serialized=JSON.stringify({revision:revision+1,value});
    if(Buffer.byteLength(serialized)>MAX_BYTES)throw new Error('A prévia aceita até 256 KB de dados locais.');
    const saved=this.load(id);if(saved.revision!==revision)throw new Error('Os dados mudaram em outra janela. Atualize a prévia antes de continuar.');
    this.projects.write(this.filename(id),serialized+'\n');return {revision:revision+1};
  }
}
module.exports={PreviewData};
