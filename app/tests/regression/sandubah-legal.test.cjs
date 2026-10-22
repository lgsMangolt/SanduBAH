'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync}=require('node:fs');
const {join,resolve,sep}=require('node:path');
const {spawnSync}=require('node:child_process');
const {LegalReference,selectLaws,parseLaw}=require('../../src/sandubah-desktop/legal-reference.cjs');
const {DesktopController,assertLocalWritePath}=require('../../src/sandubah-desktop/backend.cjs');
const {BrainSearch}=require('../../src/sandubah-desktop/brain-search.cjs');
const {KnowledgeLibrary}=require('../../src/sandubah-desktop/knowledge.cjs');
const {ProjectWorkspace}=require('../../src/sandubah-desktop/workspace.cjs');
const parent=resolve(__dirname,'../../build/sandubah/gui/tmp');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'legal-'));
test.after(()=>{assert.ok(realpathSync(directory).startsWith(realpathSync(parent)+sep));rmSync(directory,{recursive:true,force:true});});
const COMMIT='a'.repeat(40);
const LAW='---\ntitulo: "Norma sintética de teste"\nfonte: "https://www.planalto.gov.br/norma-ficticia-de-teste"\nbaixado_em: 2026-10-20\nrevogada: false\n---\n# Referência fictícia\n\n**Art. 1º** Texto sintético sobre cadastro de dados.\n\nI - finalidade de teste. FIM-ARTIGO-UM\n\n**Art. 2º** Outro artigo sintético para teste. FIM-ARTIGO-DOIS\n';
function fixture({body=LAW,fetchPublic}={}){
  const root=mkdtempSync(join(directory,'repo-')),calls=[];const guard=path=>assertLocalWritePath(root,path),write=(filename,content)=>{guard(filename);mkdirSync(require('node:path').dirname(filename),{recursive:true});writeFileSync(filename,content);};
  const fake=fetchPublic|| (async(url,options)=>{calls.push({url,options});return new Response(url.includes('api.github.com')?JSON.stringify({object:{sha:COMMIT}}):body);});
  let clock=Date.parse('2026-10-22T12:00:00Z');const legal=new LegalReference({directory:join(root,'legal-cache'),guard,write,fetchPublic:fake,now:()=>clock});return {root,legal,calls,guard,write,advance:()=>{clock+=2*86400000;}};
}
test('o roteamento jurídico é seletivo, não envia a pergunta e mantém fontes oficiais',async()=>{
  const {legal,calls}=fixture();await legal.prepare('Criar app de cadastro dados ClientePrivadoNaoEnviar');const report=legal.context('Criar app de cadastro dados ClientePrivadoNaoEnviar');
  assert.ok(report.included.length>0);assert.ok(calls.length>=2);for(const call of calls){assert.equal(call.options.redirect,'error');assert.doesNotMatch(call.url,/ClientePrivado|query=|search=/);assert.ok(call.url==='https://api.github.com/repos/ctresb/leis/git/ref/heads/main'||call.url.startsWith('https://raw.githubusercontent.com/ctresb/leis/'+COMMIT+'/'));}
  for(const row of report.included){assert.equal(row.commit,COMMIT);assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.match(row.source,/^https:\/\/www\.planalto\.gov\.br/);assert.ok(row.endLine>=row.startLine);}
  assert.match(report.content,/FIM-ARTIGO-UM/);assert.ok(report.content.length<=3500);assert.equal(report.estimatedTokens,Math.ceil(Buffer.byteLength(report.content)/3));assert.match(report.tokenMethod,/não são tokens cobrados/);
});
test('conversas sem assunto jurídico não baixam nada',async()=>{const {legal,calls}=fixture();await legal.prepare('Olá, bom dia');assert.equal(legal.context('Olá, bom dia'),null);assert.equal(calls.length,0);assert.ok(selectLaws('site acessível para crianças').some(row=>row.id==='criancas'));});
test('cache seletivo persiste e evita repetir downloads em uma nova sessão',async()=>{
  const {legal,calls,root,guard,write}=fixture();await legal.prepare('cadastro de dados');const count=calls.length;await legal.prepare('cadastro de dados');assert.equal(calls.length,count);
  const restored=new LegalReference({directory:join(root,'legal-cache'),guard,write,fetchPublic:async()=>{throw new Error('Não deveria acessar a rede');},now:()=>Date.parse('2026-10-22T13:00:00Z')});await restored.prepare('cadastro de dados');assert.equal(restored.context('cadastro de dados').included.length,1);
});
test('offline e cache antigo são pendências explícitas, nunca confirmação de vigência',async()=>{
  const {legal,advance}=fixture();await legal.prepare('cadastro de dados');advance();legal.fetch=async()=>{throw new Error('Offline');};await legal.prepare('cadastro de dados');assert.match(legal.context('cadastro de dados').content,/cache, se houver, é referência não atualizada/);
  const empty=fixture({fetchPublic:async()=>{throw new Error('Offline');}});await empty.legal.prepare('cadastro de dados');const result=empty.legal.context('cadastro de dados');assert.equal(result.included.length,0);assert.match(result.excluded[0].reason,/Não foi possível/);
});
test('artigos não são cortados para caber e modo Completo não implica acervo inteiro',async()=>{
  const {legal}=fixture({body:LAW.replace('Texto sintético sobre cadastro de dados.','dados '.repeat(1000)).replace('Outro artigo sintético para teste.','dados '.repeat(1000))});await legal.prepare('dados');const result=legal.context('dados',1800);assert.equal(result.included.length,0);assert.match(result.excluded[0].reason,/artigo inteiro/);assert.doesNotMatch(result.content,/FIM-ARTIGO/);assert.ok(result.content.length<=1800);assert.throws(()=>legal.context('dados',100));
});
test('cabeçalhos sem fonte oficial, redirecionamentos e respostas enormes são recusados',async()=>{
  assert.throws(()=>parseLaw(LAW.replace('www.planalto.gov.br','example.invalid')),/Origem oficial/);assert.throws(()=>parseLaw('Sem cabeçalho'),/Cabeçalho/);
  for(const body of [LAW.replace('https://www.planalto.gov.br','http://www.planalto.gov.br'),'x'.repeat(512001)]){const {legal}=fixture({body});await legal.prepare('dados');assert.equal(legal.context('dados').included.length,0);assert.match(legal.context('dados').excluded[0].reason,/inválida/);}
  const {legal}=fixture({fetchPublic:async()=>new Response('',{status:302,headers:{location:'https://example.invalid'}})});await legal.prepare('dados');assert.equal(legal.context('dados').included.length,0);
});
test('cache adulterado não entra no contexto e normas revogadas têm aviso',async()=>{
  const {legal,root,guard,write}=fixture();await legal.prepare('dados');const filename=join(root,'legal-cache/lgpd.json');const row=JSON.parse(readFileSync(filename));row.content+='TEXTO ADULTERADO';writeFileSync(filename,JSON.stringify(row));const restored=new LegalReference({directory:join(root,'legal-cache'),guard,write,fetchPublic:async()=>{throw new Error('Offline');}});await restored.prepare('dados');assert.equal(restored.context('dados').included.length,0);
  const revoked=fixture({body:LAW.replace('revogada: false','revogada: true')});await revoked.legal.prepare('dados');assert.match(revoked.legal.context('dados').content,/marcada como revogada/);
});
test('consultas simultâneas usam no máximo uma requisição pública por vez',async()=>{
  let active=0,maximum=0;const {legal}=fixture({fetchPublic:async url=>{active++;maximum=Math.max(maximum,active);await new Promise(done=>setTimeout(done,3));active--;return new Response(url.includes('api.github.com')?JSON.stringify({object:{sha:COMMIT}}):LAW);}});await Promise.all([legal.prepare('dados'),legal.prepare('loja pedidos')]);assert.equal(maximum,1);
});
test('cérebro expõe referência sem transformá-la em projeto e executor recebe só a seleção',async()=>{
  const {legal,root,write,guard}=fixture();await legal.prepare('app cadastro dados');const projects=new ProjectWorkspace({repositoryRoot:root,catalog:{entries:[]},guard,readLocal:path=>join(root,path)});const library=new KnowledgeLibrary({repositoryRoot:root,home:root,appData:root,projects,write,catalog:()=>({entries:[]}),roots:[]});library.legal=legal;projects.knowledgeLibrary=library;
  const snapshot=library.snapshot();assert.equal(snapshot.projects.length,0);assert.equal(snapshot.referenceSources[0].defaultEnabled,true);assert.equal(library.document('knowledge:legal-reference').editable,false);
  const project=projects.create({name:'Teste fictício',goal:'app cadastro dados'}),controller={projects,knowledge:library,legal,brainSearch:new BrainSearch(),cloud:{selection:{provider:'codex'}},legalQuery:DesktopController.prototype.legalQuery};
  for(const mode of ['economic','complete']){const result=DesktopController.prototype.plannerContextPreview.call(controller,{prompt:'cadastro dados',projectId:project.id,contextMode:mode});assert.equal(result.blocked,false);assert.ok(result.legalReference.included.length);assert.ok(result.included.some(row=>row.id==='knowledge:legal-reference'));assert.match(result.message,/não significa carregar o acervo/);}
  const prepared=projects.prepareCodex(project,{title:'Implementar app',instructions:'cadastro dados',files:[]},{name:'Agente de teste',role:'coder'});assert.match(prepared.prompt,/Consulta jurídica seletiva/);assert.match(prepared.prompt,/FIM-ARTIGO-UM/);assert.match(prepared.prompt,/exatamente um worker/);
});
test('instalador da skill é idempotente e não sobrescreve alterações do usuário',()=>{
  const home=mkdtempSync(join(directory,'codex-')),script=resolve(__dirname,'../../scripts/install-sandubah-legal-skill.cjs');const invoke=()=>spawnSync(process.execPath,[script],{env:{...process.env,CODEX_HOME:home},encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(invoke().status,0);assert.equal(invoke().status,0);const filename=join(home,'skills/leis-brasil/SKILL.md');writeFileSync(filename,'Personalização do usuário');const result=invoke();assert.equal(result.status,1);assert.match(result.stderr,/nada será sobrescrito/);assert.equal(readFileSync(filename,'utf8'),'Personalização do usuário');
});
test('o orçamento permanece limitado quando todos os temas são selecionados',async()=>{
  const {legal}=fixture(),query='cadastro dados app web site loja pedidos pagamento crianças licença software';await legal.prepare(query);for(const limit of [1800,3500,7000]){const result=legal.context(query,limit);assert.ok(result.content.length<=limit);assert.equal(result.included.length+result.excluded.length,selectLaws(query).length);}
});
