import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSalesforceMcp } from '../src/integrations/salesforce-mcp.js';

test('MCP exposes only bounded schema discovery and rejects invalid arguments',async()=>{
  let calls=0;
  const server=createSalesforceMcp(async names=>{calls++;assert.deepEqual(names,['Account']);return {orgAlias:'fixture',source:'fixture',observedAt:'2026-11-13',objects:[]};});
  const client=new Client({name:'unit',version:'1.0.0'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  try {
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['discover_schema']);
    const result=await client.callTool({name:'discover_schema',arguments:{objects:['Account']}});
    assert.ok(!result.isError);assert.equal(calls,1);
    const invalid=await client.callTool({name:'discover_schema',arguments:{objects:['../Account']}});
    assert.equal(invalid.isError,true);assert.equal(calls,1);
    const denied=await client.callTool({name:'create_record',arguments:{}});
    assert.equal(denied.isError,true);
  } finally {await client.close();await server.close();}
});
