'use strict';
const fs=require('node:fs');
const {join,resolve,relative,dirname,sep,basename}=require('node:path');
const {createHash}=require('node:crypto');
const {homedir}=require('node:os');
const {assertLocalWriteTree}=require('../src/sandubah-desktop/backend.cjs');
const {privatePattern,cleanPng}=require('./build-sandubah-installer.cjs');
const root=resolve(__dirname,'..'),destination=join(root,'build/sandubah/source-export');
const scripts=['SanduBAH.cs','audit-sandubah-distribution.cjs','brand-sandubah-runtime.cjs','build-sandubah-gui.cjs','build-sandubah-gui.ps1','build-sandubah-installer.cjs','dev-local.ps1','diagnose-sandubah-qwen.py','download-sandubah-model.py','download-sandubah-qwen.py','export-sandubah-catalog.mjs','export-sandubah-source.cjs','install-sandubah-airllm.ps1','install-sandubah-legal-skill.cjs','install-sandubah.ps1','publish-sandubah-preview.cjs','release-sandubah.cjs','run-sandubah-site-journey.cjs','sandubah-config.py','sandubah-mcp.cjs','sandubah-memory.py','sandubah-qwen-worker.py','sandubah.ps1','smoke-sandubah-mcp.cjs','stage-sandubah-test-controller.cjs','test-sandubah-public-preview.cjs','verify-sandubah-public-preview.cjs','verify-sandubah-release.cjs'];
const docs=['SANDUBAH-CLAUDE-HOWTO.md','SANDUBAH-ESTUDOS.md','SANDUBAH-CONVERSAS-MODELOS.md','SANDUBAH-LEIS.md','SANDUBAH-INSTALADOR.md','SANDUBAH-INTERATIVO.md','SANDUBAH-AIRLLM.md'];
function auditText(content,privateTerms=[]){
  if(privatePattern.test(content)||/[a-z]:[\\/]+Users[\\/]+|(?:^|[\s"'`])\/home\/[A-Za-z0-9_.-]+\//i.test(content))throw new Error('Possível dado privado ou segredo: exportação bloqueada.');
  const normalized=content.toLocaleLowerCase('pt-BR');if(privateTerms.some(term=>typeof term==='string'&&term.length>=5&&normalized.includes(term.toLocaleLowerCase('pt-BR'))))throw new Error('Referência a ambiente ou projeto privado: exportação bloqueada.');
}
function privateTerms(){const terms=[basename(homedir()),basename(resolve(root,'..'))],harnesses=join(root,'build/sandubah/gui/harnesses');if(fs.existsSync(harnesses))for(const item of fs.readdirSync(harnesses,{withFileTypes:true})){if(!item.isDirectory()||item.isSymbolicLink())continue;const filename=join(harnesses,item.name,'harness.json');try{const info=fs.lstatSync(filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink>1||info.size>2000000)continue;const project=JSON.parse(fs.readFileSync(filename,'utf8'));if(typeof project.name==='string')terms.push(project.name);}catch{}}return terms;}
function prepare(){
  const entries=[],terms=privateTerms(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');assertLocalWriteTree(root,destination);fs.mkdirSync(destination,{recursive:true});
  function put(source,target='desktop/'+source){
    const filename=join(root,source),info=fs.lstatSync(filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||!fs.realpathSync(filename).startsWith(fs.realpathSync(root)+sep))throw new Error('Fonte vinculada ou fora do workspace.');
    let bytes=fs.readFileSync(filename);if(source.endsWith('.png'))bytes=cleanPng(bytes);else try{auditText(bytes.toString('utf8'),terms);}catch(error){throw new Error(`${error.message} Arquivo: ${source}`);}
    const output=join(destination,target);assertLocalWriteTree(root,output);fs.mkdirSync(dirname(output),{recursive:true});fs.writeFileSync(output,bytes);entries.push({path:target,bytes:bytes.length,sha256:hash(bytes)});
  }
  function walk(directory){for(const item of fs.readdirSync(join(root,directory),{withFileTypes:true})){if(item.isSymbolicLink()||item.name.startsWith('.')&&item.name!=='.nojekyll'&&item.name!=='.gitignore')throw new Error('Fonte oculta ou vinculada não revisada.');const filename=directory+'/'+item.name;if(item.isDirectory())walk(filename);else put(filename);}}
  for(const directory of ['src/sandubah-desktop','src/sandubah-distribution','src/sandubah-legal-skill','src/sandubah-public-preview','src/sandubah-journey-ci','src/sandubah-release-ci'])walk(directory);
  for(const filename of scripts)put('scripts/'+filename);
  put('scripts/plan-commerce-mvp.cjs');
  for(const filename of docs)put('docs/customization/'+filename,'desktop/docs/'+filename);
  put('docs/customization/SANDUBAH-SOURCE.md','desktop/README.md');put('docs/customization/SANDUBAH-HANDOFF.md','desktop/CLAUDE.md');put('LICENSE','desktop/LICENSE');
  for(const item of fs.readdirSync(join(root,'tests/regression'),{withFileTypes:true}))if(item.isFile()&&/^(?:sandubah-.*\.test\.cjs|test_sandubah_.*\.py)$/.test(item.name))put('tests/regression/'+item.name);
  for(const filename of ['sandubah-public-main.cjs','sandubah-mcp.cjs'])put('tests/regression/fixtures/'+filename);put('tests/sandubah-distribution.test.cjs');
  const attributesPath=join(destination,'desktop/.gitattributes'),attributes=Buffer.from('* -text\n');assertLocalWriteTree(root,attributesPath);fs.writeFileSync(attributesPath,attributes);entries.push({path:'desktop/.gitattributes',bytes:attributes.length,sha256:hash(attributes)});
  entries.sort((first,second)=>first.path.localeCompare(second.path));const manifest={schema:1,createdAt:new Date().toISOString(),kind:'source-overlay',files:entries,privateDataIncluded:false,installerRebuilt:false};
  const manifestPath=join(destination,'desktop/SOURCE-MANIFEST.json');assertLocalWriteTree(root,manifestPath);fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  return {destination,manifest,files:[...entries,{path:'desktop/SOURCE-MANIFEST.json',bytes:fs.statSync(manifestPath).size,sha256:hash(fs.readFileSync(manifestPath))}]};
}
module.exports={auditText,prepare};
if(require.main===module){try{const result=prepare();console.log(JSON.stringify({prepared:true,files:result.files.length,bytes:result.files.reduce((total,item)=>total+item.bytes,0),privateDataIncluded:false,installerRebuilt:false}));}catch(error){console.error(error.message);process.exitCode=1;}}
