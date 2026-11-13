import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSalesforceMcp } from '../src/integrations/salesforce-mcp.js';
test('operational MCP requires a preexisting local approval ID and cannot accept data payloads',async()=>{
  let calls=0;const server=createSalesforceMcp(undefined,{async execute(id){if(id!=='reviewed') throw Error('denied');calls++;return 'owned-record';}});
  const client=new Client({name:'unit',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  try {
    assert.equal((await client.callTool({name:'execute_reviewed_data',arguments:{approvalId:'missing'}})).isError,true);
    assert.equal((await client.callTool({name:'execute_reviewed_data',arguments:{approvalId:'reviewed'}})).isError,undefined);assert.equal(calls,1);
  } finally {await client.close();await server.close();}
});
