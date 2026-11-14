import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { HybridFactory } from '../src/agents/hybrid-factory.js';
import { createSpecPipeline,PipelineInputSchema,executionHash } from '../src/agents/pipeline.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { authorize,mutationHash,type Mutation } from '../src/salesforce/approval.js';
import { SessionReceiptSchema,checkSessionReceipt,issueSessionReceipt,readPrivateSessionState } from '../src/integrations/session-gate.js';
import { sandboxRuntime } from '../src/execution/readiness.js';
import { confirmDefect } from '../src/agents/intelligence.js';
import { createBrowserSession } from '../src/integrations/browser-session.js';
test('session receipts enforce content integrity, identity, expiry and private path',async()=>{
  await assert.rejects(createBrowserSession({origin:'https://sandbox.example',allowedOrigins:['https://sandbox.example'],persona:'QA',reviewer:'fixture-reviewer',root:resolve('outside-auth'),authenticate:async()=>{throw Error('Must not authenticate');},verify:async()=>false}),/inside ignored .auth/);
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/gate-test-')),state=join(root,'state.json'),path=join(root,'receipt.json');
  const expected={orgId:'00D000000000001',userId:'005000000000001',persona:'QA'},origins=['https://sandbox.example'];
  try {const text=JSON.stringify({cookies:[],origins:[]});await writeFile(state,text);
    const receipt=SessionReceiptSchema.parse({...expected,statePath:state,origins,hash:createHash('sha256').update(text).digest('hex'),reviewer:'fixture-reviewer',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
    await writeFile(path,JSON.stringify(receipt));assert.equal((await checkSessionReceipt(path,expected,origins)).persona,'QA');
    await assert.rejects(issueSessionReceipt({statePath:state,identity:expected,origins,reviewer:' ',ttlMs:60000,probe:async()=>{throw Error('Must not probe before review');},receiptPath:join(root,'new.json')}),/review required/);
    await assert.rejects(checkSessionReceipt(path,{...expected,userId:'005000000000002'},origins),/mismatch/);
    await writeFile(state,JSON.stringify({cookies:[],origins:[],changed:true}));await assert.rejects(checkSessionReceipt(path,expected,origins),/changed/);
    await writeFile(path,JSON.stringify({...receipt,expiresAt:'2000-01-01T00:00:00Z'}));await assert.rejects(checkSessionReceipt(path,expected,origins),/expired/);
    await writeFile(state,'{"cookies": private-cookie-secret');await assert.rejects(readPrivateSessionState(state),error=>error instanceof Error&&error.message.includes('content withheld')&&!error.message.includes('private-cookie-secret'));
    await writeFile(path,'{"reviewer": private-cookie-secret');await assert.rejects(checkSessionReceipt(path,expected,origins),error=>error instanceof Error&&error.message.includes('content withheld')&&!error.message.includes('private-cookie-secret'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('graph gates -> approved setup -> verified references -> authenticated browser -> cleanup; failures remain visible',{timeout:90000},async()=>{
  let exists=false,verifyFails=false,cleanupFails=false,gateFails=false;const calls:string[]=[];
  const server=createServer((req,res)=>{if(!req.headers.cookie?.includes('session=verified')){res.writeHead(403);res.end('unauthenticated');return;}res.end(`<div data-testid="state">${exists?'Ready':'Missing'}</div>`);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.state/readiness-')),authRoot=await mkdtemp(resolve('.auth/readiness-')),state=join(authRoot,'state.json');
  await writeFile(state,JSON.stringify({cookies:[{name:'session',value:'verified',domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]}));
  const h=new History(join(root,'history.sqlite')),org=OrgSnapshotSchema.parse({orgAlias:'fixture',source:'fixture',observedAt:'2026-11-13',objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true}]}]}),identity={Id:'00D000000000001',IsSandbox:true};
  const approve=async(m:Mutation)=>({orgId:identity.Id,hash:mutationHash(m),reviewer:'fixture-reviewer',expiresAt:'2099-01-01T00:00:00Z',nonFinancialReviewed:true as const});
  const factory=new HybridFactory(h,{api:{async identity(){return identity;},async mutate(m,a){authorize(m,a,identity,['Account']);calls.push(m.operation);if(m.operation==='delete'){if(cleanupFails)throw Error('seeded cleanup failure');exists=false;return;}exists=true;return {id:'001000000000001',success:true};},async verify(){calls.push('verify');if(verifyFails)return false;return {verified:true};}}},['Account']);
  const runtime={factory,approvalFor:approve,async preflight(){calls.push('session-gate');if(gateFails)throw Error('seeded session denial');return {storageState:state};}};
  const make=(runId:string)=>{const input=PipelineInputSchema.parse({runId,org,orgVersion:snapshotVersion(org),permission:'QA',allowedOrigins:[origin],spec:{id:'setup',title:'Reviewed account state',description:'Account page shows Ready',source:'fixture:spec',version:'1',objects:['Account'],acceptanceCriteria:[{id:'AC1',text:'Account page shows Ready',expectedText:'Ready'}]},mappings:[{criterionId:'AC1',workflow:{id:'account-state',criterion:'AC1',source:'fixture:workflow',reviewer:'fixture-reviewer',origin,path:'/record/{{record:Account}}',steps:[],assertion:{locator:{by:'testId',value:'state'},text:'Ready'}}}],dataSetup:{recipes:[{id:'account',object:'Account',version:'1',orgAlias:org.orgAlias,sourceVersion:snapshotVersion(org),reviewedBy:'fixture-reviewer',evidence:['fixture:Account'],mode:'api',fields:{Name:{kind:'synthetic',type:'string'}}}]}});input.executionApproval={reviewer:'fixture-reviewer',hash:executionHash(input)};return input;};
  const run=async(id:string)=>createSpecPipeline({history:h,knowledge:new KnowledgeIndex(h),root,runtime}).invoke({input:make(id)});
  try {
    const result=await run('complete');assert.equal(result.lifecycle.status,'passed');assert.equal(result.execution?.results[0].status,'passed');assert.equal(result.lifecycle.created,1);assert.equal(result.lifecycle.cleaned,1);assert.equal(exists,false);assert.deepEqual(calls,['session-gate','create','verify','delete']);
    const code=await readFile(join(root,'complete','execution','account-state.spec.ts'),'utf8');assert.ok(code.includes('/record/001000000000001'));assert.ok(!code.includes('{{record:'));
    await assert.rejects(run('complete'),/already executed/);
    gateFails=true;const denied=await run('denied');assert.equal(denied.lifecycle.status,'failed');assert.equal(denied.execution,undefined);assert.equal(denied.lifecycle.created,0);gateFails=false;
    verifyFails=true;const verification=await run('verification-failure');assert.equal(verification.lifecycle.status,'failed');assert.ok(verification.lifecycle.errors[0].includes('no affirmative evidence'));assert.equal(verification.lifecycle.cleaned,1);assert.equal(exists,false);verifyFails=false;
    cleanupFails=true;const cleanup=await run('cleanup-failure');assert.equal(cleanup.execution?.results[0].status,'passed');assert.equal(cleanup.lifecycle.status,'failed');assert.ok(cleanup.lifecycle.errors[0].includes('Cleanup failed'));cleanupFails=false;
    assert.ok(cleanup.investigations.some(i=>i.testId==='cleanup-failure-lifecycle'&&i.confidence==='hypothesis'));
    h.record({runId:'failed-evidence',testId:'account-state',status:'failed',durationMs:1,components:[],evidence:['fixture:failure'],at:new Date().toISOString()});
    await assert.rejects(confirmDefect(h,new KnowledgeIndex(h),{org:'fixture',permission:'QA'},{id:'fixture-proposal',fingerprint:'fixture',testId:'account-state',message:'fixture failure',expected:'Ready',evidence:['fixture:failure'],status:'proposed',confidence:'hypothesis',classification:'unknown',traces:[],related:[],duplicateCandidates:[]},{reviewer:'fixture-reviewer',rootCause:'fixture',fix:'fixture',regressionRun:'cleanup-failure'}),/lifecycle did not pass/);
    const live=sandboxRuntime({factory,approvalFor:approve,identity:async()=>({...identity,IsSandbox:false,userId:'005000000000001'}),verifySchema:async()=>{throw Error('Must not inspect production');},allowedOrgIds:[identity.Id],allowedOrigins:['https://sandbox.example'],probe:async()=>{throw Error('Must not probe production');}});
    await assert.rejects(live.preflight({...make('production'),org:{...org,source:'salesforce-api'},allowedOrigins:['https://sandbox.example'],sandbox:{orgId:identity.Id,userId:'005000000000001',persona:'QA',sessionReceipt:state,reviewer:'human',expiresAt:'2099-01-01T00:00:00Z',nonFinancialReviewed:true}}),/identity mismatch/);
  }finally{h.close();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});await rm(authRoot,{recursive:true,force:true});}
});
