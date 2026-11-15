import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { prepareStaticReview } from '../src/execution/dedicated-static.js';
import { prepareDedicatedDiagnostics,authorizeDedicatedDiagnostics,deletedJournalReferences,diagnosticExecutionSource } from '../src/execution/diagnostic-review.js';
import { SalesforceClient } from '../src/salesforce/client.js';
async function fixture(){const history=new History(':memory:'),f=dedicatedFixture(history,'diagnostic-completed');await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);await f.data.cleanup(f.input.data);f.data.finish(f.input.data);const assets=prepareStaticReview({assets:[{url:'https://b.static.lightning.force.com/framework/fixture.js',type:'script'}]},f.policy,f.identity,f.input.spec.version),draft=prepareDedicatedDiagnostics(f.input,f.policy,assets,history);return {history,f,draft};}
test('independent read-only diagnostic authorization never renews an expired parent or factory review',async()=>{
  const {history,f,draft}=await fixture();try{f.policy.approval.expiresAt=new Date(Date.now()-1000).toISOString();f.input.data.approval.expiresAt=f.policy.approval.expiresAt;const before=JSON.stringify(f.policy),review={...draft,approval:{...draft.approval,operator:f.policy.approval.operator,expiresAt:new Date(Date.now()+60000).toISOString()}},authority=authorizeDedicatedDiagnostics(review,f.policy,f.identity,f.origin);
    assert.equal(authority.review.plan.recordWrites,false);assert.equal(authority.review.plan.businessRpc,false);assert.equal(JSON.stringify(f.policy),before);assert.notEqual(authority.policy.approval.expiresAt,f.policy.approval.expiresAt);assert.equal(deletedJournalReferences(history,review.plan).length,2);assert.equal(diagnosticExecutionSource(f.input,review).data.plan.runId,review.plan.runId);assert.throws(()=>diagnosticExecutionSource({...f.input,data:{...f.input.data,plan:{...f.input.data.plan,runId:'foreign-run'}}},review),/source/);await assert.rejects(f.data.check(f.input.data));assert.equal(f.writes.length,4);
  }finally{history.close();}
});
test('diagnostic grants fail closed for wrong org/user/operator/mode/hash, expiry and writable plans',async()=>{
  const {history,f,draft}=await fixture();try{const review={...draft,approval:{...draft.approval,operator:f.policy.approval.operator,expiresAt:new Date(Date.now()+60000).toISOString()}};
    assert.throws(()=>authorizeDedicatedDiagnostics(draft,f.policy,f.identity,f.origin));
    for(const identity of [{...f.identity,Id:'00D999999999999'},{...f.identity,userId:'005999999999999'}])assert.throws(()=>authorizeDedicatedDiagnostics(review,f.policy,identity,f.origin));
    for(const mode of ['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA'])assert.throws(()=>authorizeDedicatedDiagnostics(review,{...f.policy,mode},f.identity,f.origin));
    for(const approval of [{...review.approval,hash:'0'.repeat(64)},{...review.approval,operator:'other'},{...review.approval,expiresAt:new Date(Date.now()-1).toISOString()},{...review.approval,expiresAt:new Date(Date.now()+7200000).toISOString()}])assert.throws(()=>authorizeDedicatedDiagnostics({...review,approval},f.policy,f.identity,f.origin));
    assert.throws(()=>authorizeDedicatedDiagnostics({...review,plan:{...review.plan,recordWrites:true}},f.policy,f.identity,f.origin));assert.throws(()=>authorizeDedicatedDiagnostics(review,f.policy,f.identity,'https://foreign.my.salesforce.com'));
  }finally{history.close();}
});

test('native diagnostic facade exposes no generic read/write transport and verifies only signed absent IDs',async()=>{
  const {history,f,draft}=await fixture(),originalFetch=globalThis.fetch,originalAuthenticate=Reflect.get(SalesforceClient,'authenticate'),client:SalesforceClient=Reflect.construct(SalesforceClient,[f.origin,'private-mock-token','v62.0']),calls:string[]=[];
  client.identity=async()=>f.identity;Reflect.set(SalesforceClient,'authenticate',async()=>client);globalThis.fetch=async(url,init)=>{assert.equal(init?.method,'GET');const u=new URL(String(url));assert.equal(u.origin,f.origin);calls.push(decodeURIComponent(u.pathname+u.search));return new Response(JSON.stringify(await f.api.get(u.pathname+u.search)));};
  try{const review={...draft,approval:{...draft.approval,operator:f.policy.approval.operator,expiresAt:new Date(Date.now()+60000).toISOString()}},reader=await SalesforceClient.connectDedicatedDiagnostics(f.policy,review);assert.equal('get' in reader,false);assert.equal('mutate' in reader,false);assert.equal('dedicatedData' in reader,false);assert.equal('readMetadata' in reader,false);assert.ok(!JSON.stringify(reader).includes('private-mock-token'));
    assert.equal((await reader.verifyAbsence()).absent,2);assert.equal(calls.filter(c=>/FROM (Account|Contact) WHERE Id='[A-Za-z0-9]+' LIMIT 1$/.test(c)).length,2);f.records.set(review.plan.references[0].id,{Id:review.plan.references[0].id});await assert.rejects(reader.verifyAbsence(),/present/);assert.equal(f.writes.length,4);
  }finally{globalThis.fetch=originalFetch;Reflect.set(SalesforceClient,'authenticate',originalAuthenticate);history.close();}
});
test('deleted diagnostic references cannot borrow a foreign ID, active run or uncertain mutation',async()=>{
  const {history,f,draft}=await fixture();try{const changed={...draft.plan,references:[{object:'Account' as const,id:'001999999999999'}]};assert.throws(()=>deletedJournalReferences(history,changed));history.db.prepare("UPDATE dedicated_runs SET status='open' WHERE run=?").run(draft.plan.runId);assert.throws(()=>deletedJournalReferences(history,draft.plan));history.db.prepare("UPDATE dedicated_runs SET status='complete' WHERE run=?").run(draft.plan.runId);history.db.prepare("UPDATE dedicated_mutations SET status='pending' WHERE operation='delete' AND object='Account'").run();assert.throws(()=>deletedJournalReferences(history,draft.plan));assert.equal(f.records.size,0);assert.equal(f.writes.length,4);
  }finally{history.close();}
});
