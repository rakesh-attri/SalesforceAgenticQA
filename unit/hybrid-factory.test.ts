import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HybridFactory,type FactoryAdapter } from '../src/agents/hybrid-factory.js';
import { History } from '../src/core/history.js';
import { RecipeSchema } from '../src/agents/recipe-registry.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { authorize,mutationHash,type Mutation } from '../src/salesforce/approval.js';
import { verifyRecord } from '../src/salesforce/operations.js';
import { SalesforceClient } from '../src/salesforce/client.js';
test('metadata -> dependency recipes -> approved hybrid setup -> SOQL -> reverse owned cleanup',async()=>{
  const org=OrgSnapshotSchema.parse({orgAlias:'fixture',source:'fixture',observedAt:'2026-11-13',objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true}]},{name:'Contact',label:'Contact',createable:true,fields:[{name:'LastName',type:'string',nillable:false,createable:true},{name:'AccountId',type:'reference',nillable:false,createable:true,referenceTo:['Account']}]}]});
  const version=snapshotVersion(org),recipes=[RecipeSchema.parse({id:'contact',object:'Contact',mode:'ui',version:'1',orgAlias:'fixture',sourceVersion:version,reviewedBy:'human',evidence:['fixture:Contact'],fields:{LastName:{kind:'synthetic',type:'string'},AccountId:{kind:'parent',object:'Account'}}}),RecipeSchema.parse({id:'account',object:'Account',mode:'business-service',version:'1',orgAlias:'fixture',sourceVersion:version,reviewedBy:'human',evidence:['fixture:Account'],fields:{Name:{kind:'synthetic',type:'string'}}})];
  const history=new History(':memory:'),rows=new Map<string,Mutation['values']>(),calls:string[]=[],identity={Id:'00D000000000001',IsSandbox:true};
  const client:SalesforceClient=Reflect.construct(SalesforceClient,['https://example.my.salesforce.com','mock','v62.0']);
  client.get=async<T>(path:string)=>{const id=decodeURIComponent(path).match(/WHERE Id = '([^']+)'/)?.[1];return {done:true,records:id&&rows.has(id)?[{Id:id,...rows.get(id)}]:[]} as T;};
  const adapter=(mode:string):FactoryAdapter=>({async identity(){return identity;},async mutate(m,a){authorize(m,a,identity,['Account','Contact']);calls.push(`${mode}:${m.operation}:${m.object}`);if(m.operation==='delete'){rows.delete(m.id!);return;}const id=m.object==='Account'?'001000000000001':'003000000000001';rows.set(id,m.values);return {id,success:true};},async verify(m,id){return verifyRecord(client,m.object,id,m.values,1);}});
  const approve=async(m:Mutation)=>({orgId:identity.Id,reviewer:'fixture-reviewer',expiresAt:'2099-01-01T00:00:00Z',hash:mutationHash(m),nonFinancialReviewed:true as const});
  try {
    const factory=new HybridFactory(history,{'business-service':adapter('service'),ui:adapter('ui')},['Account','Contact']);
    const result=await factory.setup('mock-run',recipes,org,approve);assert.equal(result[0].object,'Account');assert.equal(rows.get(result[1].id)?.AccountId,result[0].id);
    await assert.rejects(factory.cleanup('other',result,approve),/not owned/);
    await factory.cleanup('mock-run',result,approve);assert.equal(rows.size,0);
    assert.deepEqual(calls,['service:create:Account','ui:create:Contact','ui:delete:Contact','service:delete:Account']);
    assert.throws(()=>factory.plan([{...recipes[0],sourceVersion:'0'.repeat(64)}],org));
  }finally{history.close();}
});
