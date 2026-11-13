import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticKnowledge,redact } from '../src/knowledge/rag.js';
import { SalesforceClient } from '../src/salesforce/client.js';
import { discoverTooling,verifyRecord } from '../src/salesforce/operations.js';
import { mutationHash,type Mutation } from '../src/salesforce/approval.js';
test('live mutation transport performs fresh sandbox identity check before any network write',async()=>{
  const original=globalThis.fetch,previous=process.env.SFQA_WRITE_OBJECTS;let writes=0,sandbox=false;
  const mutation:Mutation={runId:'mock',object:'Account',operation:'create',values:{Name:'synthetic'}};
  const approval={orgId:'00D000000000001',reviewer:'human',expiresAt:'2099-01-01T00:00:00Z',hash:mutationHash(mutation),nonFinancialReviewed:true as const};
  process.env.SFQA_WRITE_OBJECTS='Account';
  globalThis.fetch=async(_url,init)=>{if(init?.method==='POST') {writes++;return new Response(JSON.stringify({id:'001000000000001',success:true}),{status:201});}return new Response(JSON.stringify({records:[{Id:approval.orgId,IsSandbox:sandbox}]}));};
  try {
    const client:SalesforceClient=Reflect.construct(SalesforceClient,['https://example.my.salesforce.com','mock-token','v62.0']);
    await assert.rejects(client.mutate(mutation,approval));assert.equal(writes,0);
    sandbox=true;assert.equal((await client.mutate(mutation,approval))?.success,true);assert.equal(writes,1);
  } finally {globalThis.fetch=original;if(previous===undefined) delete process.env.SFQA_WRITE_OBJECTS;else process.env.SFQA_WRITE_OBJECTS=previous;}
});
test('RAG persists redacted versioned chunks and sends all security filters to Chroma',async()=>{
  let upsert:any,query:any;
  const collection={async upsert(v:any){upsert=v;},async query(v:any){query=v;return {ids:[[]],documents:[[]],metadatas:[[]],distances:[[]],embeddings:null,include:[]};}};
  const rag=new SemanticKnowledge(collection as any,async texts=>texts.map(()=>[0.2,0.4]));
  const ids=await rag.ingest({id:'story:1',version:'v1',org:'sandbox',permission:'qa',status:'verified',text:'contact jane@example.com Bearer secret',capturedAt:new Date().toISOString()});
  assert.equal(ids.length,1);assert.ok(!upsert.documents[0].includes('secret'));assert.ok(!upsert.documents[0].includes('jane@'));
  await rag.retrieve('criteria',{org:'sandbox',permission:'qa',version:'v1'});
  assert.deepEqual(query.where,{$and:[{org:'sandbox'},{permission:'qa'},{version:'v1'},{status:'verified'}]});
  await assert.rejects(rag.retrieve('criteria',{org:'',permission:'qa',version:'v1'}));
  assert.equal(redact('001000000000001'),'[RECORD-ID]');
});
test('Tooling discovery preserves denied coverage and SOQL verifies independent state',async()=>{
  const client:SalesforceClient=Reflect.construct(SalesforceClient,['https://example.my.salesforce.com','fake','v62.0']);
  const paths:string[]=[];
  client.get=async<T>(path:string)=>{paths.push(path);if(decodeURIComponent(path).includes('FlowDefinition')) throw Error('denied');return {done:true,records:[{Id:'001000000000001',Name:'Verified'}]} as T;};
  const result=await discoverTooling(client,['ApexClass','FlowDefinition']);assert.equal(result[1].status,'unknown');
  assert.equal((await verifyRecord(client,'Account','001000000000001',{Name:'Verified'},1)).Name,'Verified');
  await assert.rejects(verifyRecord(client,'Account','001000000000001',{Name:'Wrong'},1));
  await assert.rejects(verifyRecord(client,'Account;DELETE','001000000000001',{Name:'Verified'},1));
  assert.ok(paths.some(p=>p.includes('/tooling/query?')));
});
