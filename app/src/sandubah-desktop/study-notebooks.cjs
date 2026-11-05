'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {readFileSync,lstatSync}=require('node:fs');
const {join}=require('node:path');
const FILES=['INDEX.md','CONCEPTS.md','SOURCES.md','QUESTIONS.md'];
const TITLES=['Mapa do estudo','Conceitos e notas','Fontes e referências','Dúvidas e próximos estudos'];
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');

class StudyNotebooks{
  constructor({directory,guard,write,hasSecret}){this.directory=directory;this.guard=guard;this.write=write;this.hasSecret=hasSecret;}
  location(id){if(!validId(id))throw new Error('Estudo inválido.');const directory=join(this.directory,id);this.guard(directory);return directory;}
  readText(filename){this.guard(filename);const info=lstatSync(filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>256000)throw new Error('Nota inválida ou maior que o limite.');const content=readFileSync(filename,'utf8');if(this.hasSecret(content))throw new Error('Possível credencial: leitura da nota bloqueada.');return content;}
  load(id){const text=this.readText(join(this.location(id),'notebook.json')),data=JSON.parse(text);if(data.schema!==1||data.id!==id||!validId(data.revision))throw new Error('Registro de estudo inválido.');this.fields(data.fields);return {...data,version:hash(text)};}
  fields(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Notas de estudo inválidas.');
    const fields={};
    for(const [key,maximum]of [['notes',60000],['sources',8000],['questions',8000]]){const value=input[key]??'';if(typeof value!=='string'||value.length>maximum||value.includes('\0')||this.hasSecret(value))throw new Error('Nota em formato inválido, acima do limite ou com possível credencial.');fields[key]=value.trim();}
    if(input.reviewed!==undefined&&typeof input.reviewed!=='boolean')throw new Error('Revisão inválida.');fields.reviewed=input.reviewed===true;
    fields.urls=[...new Set(fields.sources.split(/\r?\n/).map(value=>value.trim()).filter(Boolean))];
    if(fields.urls.length>40)throw new Error('Use até 40 fontes por estudo.');
    for(const value of fields.urls){let url;try{url=new URL(value);}catch{throw new Error('Cada fonte deve ser uma URL HTTPS, uma por linha.');}if(url.protocol!=='https:'||url.username||url.password||!url.hostname)throw new Error('Use fontes HTTPS sem credenciais.');}
    if(fields.reviewed&&!fields.notes)throw new Error('Para disponibilizar a referência, revise as notas e informe as fontes.');
    return {notes:fields.notes,sources:fields.urls.join('\n'),questions:fields.questions,reviewed:fields.reviewed};
  }
  documents(record,fields){
    const links=FILES.map((filename,index)=>`- [${TITLES[index]}](${filename})`).join('\n');
    const references=(record.localReferences||[]).map(item=>`- ${item.title} · ${item.id} · SHA-256: ${item.sha256}`).join('\n');
    const status=fields.reviewed?'Revisado pelo usuário para consulta seletiva. Fontes e conclusões não foram verificadas automaticamente.':'Rascunho de estudo: ainda fora do contexto automático dos projetos.';
    return {
      'INDEX.md':`# ${record.topic}\n\n${status}\n\n## Mapa de conhecimento\n${links}\n\nEste caderno organiza conhecimento e referências. Não cria aplicativo, SaaS, agentes ou missões de implementação.\n`,
      'CONCEPTS.md':`# Conceitos · ${record.topic}\n\n${status}\n\n${fields.notes||'Aguardando notas da pesquisa. Nenhuma pesquisa foi declarada concluída.'}\n\n[Mapa do estudo](INDEX.md) · [Fontes](SOURCES.md)\n`,
      'SOURCES.md':`# Fontes · ${record.topic}\n\nOrigem das notas: registro revisável do usuário; a pesquisa pode ser feita no Perplexity web. Abrir uma busca não comprova a leitura ou validação das fontes.\n\n## Links registrados\n${fields.sources||'Nenhum link registrado.'}\n\n## Referências locais selecionadas\n${references||'Nenhuma referência local selecionada.'}\n\n[Conceitos](CONCEPTS.md) · [Dúvidas](QUESTIONS.md)\n`,
      'QUESTIONS.md':`# Dúvidas · ${record.topic}\n\n${fields.questions||'Registre lacunas, contradições e assuntos a aprofundar.'}\n\n[Mapa do estudo](INDEX.md) · [Fontes](SOURCES.md)\n`
    };
  }
  store(record,fields){
    fields=this.checkedFields(record,fields);const revision=randomUUID(),directory=this.location(record.id),documents=this.documents(record,fields);
    for(const filename of FILES)this.write(join(directory,'revisions',revision,filename),documents[filename]);
    this.write(join(directory,'notebook.json'),JSON.stringify({schema:1,id:record.id,revision,updatedAt:new Date().toISOString(),fields},null,2)+'\n');
    return this.view(record);
  }
  create(record){return this.store(record,{notes:'',sources:'',questions:'',reviewed:false});}
  checkedFields(record,input){const fields=this.fields(input);if(fields.reviewed&&!fields.sources&&!record.localReferences?.length)throw new Error('Informe ao menos uma fonte HTTPS ou selecione referências locais antes de disponibilizar as notas.');return fields;}
  version(record,data){return hash(data.version+JSON.stringify([record.type,record.scope,record.targetProjectId]));}
  view(record){const data=this.load(record.id);return {...record,...data,version:this.version(record,data),files:FILES.map((filename,index)=>({path:filename,title:TITLES[index],content:this.readText(join(this.location(record.id),'revisions',data.revision,filename))}))};}
  preview(record,input){const data=this.load(record.id),version=this.version(record,data);if(input.version!==version)throw new Error('As notas ou o alcance mudaram. Reabra o estudo antes de salvar; seu texto não foi aplicado.');const fields=this.checkedFields(record,input.fields);return {version,fields,files:this.documents(record,fields),changed:JSON.stringify(fields)!==JSON.stringify(data.fields)};}
  save(record,input){const preview=this.preview(record,input);return preview.changed?this.store(record,preview.fields):this.view(record);}
  document(record,filename){if(!FILES.includes(filename))throw new Error('Markdown fora deste estudo.');const data=this.load(record.id),content=this.readText(join(this.location(record.id),'revisions',data.revision,filename));return {path:`knowledge:study:${record.id}:${filename}`,title:`${record.topic} · ${TITLES[FILES.indexOf(filename)]}`,sourceLabel:`Cérebro/estudos/${record.id}/${filename}`,content,version:hash(content),origin:'knowledge',editable:false,links:FILES.filter(item=>item!==filename).map(item=>({path:`knowledge:study:${record.id}:${item}`,title:TITLES[FILES.indexOf(item)]}))};}
}
module.exports={StudyNotebooks,FILES,TITLES};
