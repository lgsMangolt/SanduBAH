'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const definitions={
  claude:{id:'claude',name:'Claude',bootstrapUrl:'https://claude.ai/install.ps1',bootstrapSha256:'cd17c6b555f761d60373659824bf805e1510538226e4c7028e19d7494937a333',documentationHosts:['code.claude.com'],setupCommand:'irm https://claude.ai/install.ps1 | iex',authHosts:['claude.ai','claude.com','platform.claude.com','console.anthropic.com','accounts.anthropic.com'],statusArguments:['auth','status'],loginArguments:['auth','login']},
  codex:{id:'codex',name:'Codex',bootstrapUrl:'https://chatgpt.com/codex/install.ps1',bootstrapSha256:'91df20fe060155af16f55c2b073f713048a48fe7fd7c0e099a1cae959de63922',release:'0.163.0',packageSha256:'901028b285614a9974f431f9d9f6534b3e5ed8d62eba4ba64f4762c00f040522',documentationHosts:['learn.chatgpt.com','developers.openai.com'],setupCommand:'irm https://chatgpt.com/codex/install.ps1 | iex',authHosts:['auth.openai.com','auth0.openai.com','chatgpt.com'],statusArguments:['login','status'],loginArguments:['login']}
};
function providerDefinition(name){assert.ok(Object.hasOwn(definitions,name),'An explicitly supported provider is required.');return definitions[name];}
function providerExecutable(name,home,localAppData){providerDefinition(name);return name==='codex'?join(localAppData,'Programs/OpenAI/Codex/bin/codex.exe'):join(home,'.local/bin/claude.exe');}
function authorizationUrl(name,output){const provider=providerDefinition(name),clean=output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'');for(const candidate of clean.match(/https:\/\/[^\s<>"']+/g)||[]){try{const url=new URL(candidate);if(provider.authHosts.includes(url.hostname)&&!url.username&&!url.password&&(!url.port||url.port==='443')&&url.searchParams.has('client_id')&&url.searchParams.has('state'))return url;}catch{}}return null;}
function isUnauthenticated(name,result){if(result.status!==1)return false;if(name==='codex')return /not logged in/i.test((result.stdout||'')+(result.stderr||''));try{const authentication=JSON.parse(result.stdout);return authentication.authMethod==='none'||authentication.loggedIn===false;}catch{return false;}}
module.exports={providerDefinition,providerExecutable,authorizationUrl,isUnauthenticated};
