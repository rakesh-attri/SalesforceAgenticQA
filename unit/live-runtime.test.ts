import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SalesforceClient } from '../src/salesforce/client.js';
import { configuredSandboxRuntime } from '../src/integrations/live-runtime.js';
import { History } from '../src/core/history.js';
import { PipelineInputSchema } from '../src/agents/pipeline.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { createHash } from 'node:crypto';
test('fresh OAuth identity is matched to Organization response and never accepts cross-org token claims',async()=>{
  const original=globalThis.fetch,client:SalesforceClient=Reflect.construct(SalesforceClient,['https://example.my.salesforce.com','mock','v62.0']);
  let claimed='00D000000000001';
  globalThis.fetch=async()=>new Response(JSON.stringify({organization_id:claimed,user_id:'005000000000001'}));
  client.get=async<T>()=>({records:[{Id:'00D000000000001',IsSandbox:true}]} as T);
  try {assert.deepEqual(await client.identity(),{Id:claimed,IsSandbox:true,userId:'005000000000001'});claimed='00D000000000002';await assert.rejects(client.identity(),/identity mismatch/);}finally{globalThis.fetch=original;}
});
test('configured live runtime re-describes reviewed objects and denies schema drift before browser or data dispatch',async()=>{
  const history=new History(':memory:'),client:SalesforceClient=Reflect.construct(SalesforceClient,['https://example.my.salesforce.com','mock','v62.0']);
  client.identity=async()=>({Id:'00D000000000001',IsSandbox:true,userId:'005000000000001'});
  client.get=async<T>()=>({name:'Account',label:'Account',createable:false,fields:[]} as T);
  const org=OrgSnapshotSchema.parse({orgAlias:'sandbox',source:'salesforce-api',observedAt:new Date().toISOString(),objects:[{name:'Account',label:'Account',createable:true,fields:[]}]});
  const input=PipelineInputSchema.parse({runId:'drift',spec:{id:'S',title:'Schema',description:'Schema',source:'fixture',version:'1',objects:['Account'],acceptanceCriteria:[{id:'AC1',text:'Ready',expectedText:'Ready'}]},org,orgVersion:snapshotVersion(org),permission:'QA',allowedOrigins:['https://sandbox.example'],mappings:[],sandbox:{orgId:'00D000000000001',userId:'005000000000001',persona:'QA',sessionReceipt:'.auth/missing.json',reviewer:'fixture-reviewer',expiresAt:new Date(Date.now()+60000).toISOString(),nonFinancialReviewed:true}});
  try {const runtime=configuredSandboxRuntime(history,client,{allowedOrgIds:[input.sandbox!.orgId],allowedOrigins:input.allowedOrigins,allowedObjects:[],approvals:{},browserProbe:{path:'/',orgIdTestId:'observed-org',userIdTestId:'observed-user',personaTestId:'observed-persona'}});await assert.rejects(runtime.preflight(input),/schema differs/);
    input.org.objects[0].createable=false;input.org.orgIdentityHash=createHash('sha256').update(input.sandbox!.orgId).digest('hex');input.orgVersion=snapshotVersion(input.org);input.sandbox!.sessionReceipt=`.auth/nonexistent-unit-${process.pid}.json`;
    await assert.rejects(runtime.preflight(input),/ENOENT/); // Matching identity-bound schema reaches the independent session gate.
  }finally{history.close();}
});
