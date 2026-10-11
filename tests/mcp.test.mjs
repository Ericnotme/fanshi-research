import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
test('stdio MCP handshake, tools and pure candidate call',async()=>{
 const p=spawn(process.execPath,['src/mcp.mjs'],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
 const requests=[{id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{method:'notifications/initialized'},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'strategy_candidates',arguments:{}}}];p.stdin.end(requests.map(x=>JSON.stringify({jsonrpc:'2.0',...x})).join('\n')+'\n');
 const code=await new Promise(resolve=>p.on('exit',resolve));assert.equal(code,0,err);const results=out.trim().split('\n').map(JSON.parse);assert.equal(results.length,3);assert.equal(results[0].result.serverInfo.name,'fanshi-research');assert.equal(results[1].result.tools.length,4);assert.equal(JSON.parse(results[2].result.content[0].text).candidates.length,8);
});
