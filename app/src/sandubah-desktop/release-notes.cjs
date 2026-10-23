'use strict';
const {existsSync,lstatSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const RELEASES=[{
  id:'2026.10.21.1',date:'2026-10-21',title:'Tutoriais e novidades, sem complicação',
  changes:[
    {title:'Tutoriais no menu lateral',description:'Nove guias com busca, categorias, passos expansíveis e atalhos para as áreas do SanduBAH.'},
    {title:'Produto e missões separados',description:'Planejamento, Protótipo, MVP e Produção têm critérios próprios. Concluir uma missão não declara o produto pronto.'},
    {title:'Saiba o que mudou ao abrir',description:'Este resumo aparece quando há uma revisão ainda não vista. Depois, você pode consultá-lo novamente em Tutoriais.'},
    {title:'Você continua no controle',description:'Ler novidades ou guias não inicia agentes, downloads ou integrações. As confirmações das ações protegidas permanecem.'}
  ]
},{
  id:'2026.10.22.1',date:'2026-10-22',title:'Projetos, Cérebro e avisos mais claros',
  changes:[
    {title:'Novo projeto em destaque',description:'O menu lateral ganhou hierarquia mais clara, ação principal destacada e uma apresentação mais leve.'},
    {title:'Opções que acompanham o projeto',description:'Entrevista, organização de agentes e revisão do harness orientam o planejamento sem inserir comandos na conversa. As confirmações continuam obrigatórias.'},
    {title:'Estudos organizados e contexto seletivo',description:'Tipos de fonte, escopo Central ou projeto e configuração de executor, modelo e força ajudam a reaproveitar conhecimento sem carregar tudo no contexto.'},
    {title:'Avisos com a identidade SanduBAH',description:'Contador de não lidos, de 1 a 9 e 9+, no botão de avisos e no ícone do Windows. É possível ler um aviso, ler todos ou testar sem chamar a IA.'}
  ]
},{
  id:'0.2.0',date:'2026-10-23',title:'SanduBAH 0.2.0: aprender, analisar e construir',
  changes:[
    {title:'Tutoriais no seu ritmo',description:'21 guias por nível, exercícios locais e roteiro para criar seu primeiro projeto conversando com a IA.'},
    {title:'Tech e X-Tudo Harness²',description:'Prepare análises autorizadas, revise o harness e compare resultados com critérios explícitos. REA é opcional e precisa estar instalado.'},
    {title:'Runtime do executor corrigido',description:'As missões recebem o caminho real do Node incluído no aplicativo. A detecção do Codex inclui o instalador nativo atual do Windows.'},
    {title:'Seus dados continuam locais',description:'Projetos ficam separados dos arquivos do programa. Envio, execução e atualizações mantêm suas confirmações.'}
  ]
}];
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
class ReleaseNotes{
  constructor({directory,guard,write,releases=RELEASES}){
    if(!Array.isArray(releases)||!releases.length||releases.length>10||new Set(releases.map(release=>release.id)).size!==releases.length||releases.some(release=>!validId(release.id)||!/^\d{4}-\d{2}-\d{2}$/.test(release.date)||typeof release.title!=='string'||!release.title||release.title.length>160||!Array.isArray(release.changes)||!release.changes.length||release.changes.length>12||release.changes.some(change=>typeof change.title!=='string'||!change.title||change.title.length>160||typeof change.description!=='string'||!change.description||change.description.length>1200)))throw new Error('Notas desta revisão inválidas.');
    this.filename=join(directory,'whats-new.json');this.guard=guard;this.write=write;this.releases=JSON.parse(JSON.stringify(releases));
  }
  read(){
    this.guard(this.filename);if(!existsSync(this.filename))return null;
    const info=lstatSync(this.filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink>1||info.size>2048)throw new Error('Registro de novidades inválido; arquivo preservado.');
    const saved=JSON.parse(readFileSync(this.filename,'utf8'));
    if(saved?.version!==1||!validId(saved.releaseId)||!Number.isFinite(Date.parse(saved.seenAt)))throw new Error('Registro de novidades inválido; arquivo preservado.');return saved;
  }
  snapshot(){
    let saved=null,warning=null;try{saved=this.read();}catch{warning='Não foi possível ler quais novidades você já viu. O arquivo anterior foi preservado.';}
    const index=this.releases.findIndex(release=>release.id===saved?.releaseId),available=JSON.parse(JSON.stringify(this.releases));
    return {currentId:available.at(-1).id,available,unread:index<0?available:available.slice(index+1),warning,automaticUpdates:false};
  }
  seen(releaseId){
    if(releaseId!==this.releases.at(-1).id)throw new Error('A revisão mudou. Reabra as novidades antes de confirmar.');
    this.read();this.write(this.filename,JSON.stringify({version:1,releaseId,seenAt:new Date().toISOString()},null,2)+'\n');return this.snapshot();
  }
}
module.exports={ReleaseNotes,RELEASES};
