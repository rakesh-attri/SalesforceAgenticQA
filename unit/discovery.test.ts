import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverOrg, type DiscoveryReader } from '../src/agents/org-discovery.js';
const describe={name:'Account',label:'Account',createable:true,fields:[{name:'Status',type:'picklist',nillable:true,createable:true,picklistValues:[{value:'Active',active:true},{value:'Old',active:false}]}]};
function reader(value:unknown):DiscoveryReader {return {apiVersion:'v62.0',async get<T>() {return value as T;}};}
test('Describe validates responses, filters inactive picklists and preserves unknown coverage',async()=>{
  const result=await discoverOrg(reader(describe),['Account','Account']);
  assert.equal(result.objects.length,1);
  assert.deepEqual(result.objects[0].fields[0].picklistValues,['Active']);
  assert.equal(result.coverage?.find(c=>c.area==='flows')?.status,'unknown');
  assert.equal(result.coverage?.[0].source,'/services/data/v62.0/sobjects/Account/describe');
});
test('invalid and unbounded discovery makes no requests',async()=>{
  let calls=0;const client:DiscoveryReader={apiVersion:'v62.0',async get<T>(){calls++;return {} as T;}};
  for(const names of [[],['Account/../User'],Array(51).fill('Account')]) await assert.rejects(discoverOrg(client,names));
  assert.equal(calls,0);
});
test('malformed and mismatched API responses fail closed',async()=>{
  await assert.rejects(discoverOrg(reader({...describe,createable:'true'}),['Account']));
  await assert.rejects(discoverOrg(reader(describe),['Contact']));
});
