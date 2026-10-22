'use strict';
const readline = require('node:readline');
const mode = process.env.SANDUBAH_FIXTURE_MODE;
readline.createInterface({ input:process.stdin }).on('line',line=>{
  const message=JSON.parse(line);
  if(message.id===undefined)return;
  if(message.method==='initialize')return send({protocolVersion:'2024-11-05',capabilities:{},serverInfo:{name:'test-fixture',version:'1'}});
  if(message.method==='tools/list')return send({tools:[{name:'mcp_status'}]});
  if(mode==='exit')return process.exit(3);
  if(mode==='oversize')return process.stdout.write('x'.repeat(4*1024*1024+1)+'\n');
  if(mode==='invalid')return process.stdout.write('not-json\n');
  if(mode==='timeout')return setTimeout(()=>send({late:true}),500);
  send({content:[{type:'text',text:JSON.stringify({arguments:message.params?.arguments,pid:process.pid})}]});
  function send(result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\n');}
});
