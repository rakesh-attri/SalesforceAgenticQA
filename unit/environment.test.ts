import {localLaunchOptions} from '../src/execution/local-browser.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { authorizeEnvironment,environmentHash,type EnvironmentDefinition } from '../src/execution/environment.js';
import { ObservationPlanSchema,allowObservationRequest,installObservationBoundary,observationHash,observeProduction,verifyObservationSession } from '../src/execution/observation.js';
import { createBrowserSession } from '../src/integrations/browser-session.js';
import { probeSession } from '../src/integrations/session-gate.js';
import { SalesforceClient } from '../src/salesforce/client.js';
const identity={Id:'00D000000000001',userId:'005000000000001',IsSandbox:false};
const definition:EnvironmentDefinition={mode:'PRODUCTION_READ_ONLY_QA',allowedOrgIds:[identity.Id],personas:[{name:'QA',userId:identity.userId}],allowedOrigins:['https://org.example'],capabilities:['metadata','soql','browser-observe']};
const policy=(d=definition)=>({...d,approval:{operator:'fixture-reviewer',definitionHash:environmentHash(d),expiresAt:new Date(Date.now()+60000).toISOString()}});
const plan=()=>ObservationPlanSchema.parse({identity:{orgId:identity.Id,userId:identity.userId,persona:'QA'},sessionReceipt:'.auth/missing.json',documents:[{url:'https://org.example/observations',nonMutatingReviewed:true,source:'fixture:review'}],identityMarkers:{org:'org',user:'user',persona:'persona'},reads:[{page:0,criterionId:'AC1',testId:'status',expectedText:'Ready'}]});
test('all environment modes enforce exact identity, personas, origins, capabilities and named current approval',()=>{
  assert.equal(authorizeEnvironment(policy(),identity,'metadata','https://org.example','QA').mode,'PRODUCTION_READ_ONLY_QA');
  for(const change of [{Id:'00D000000000002'},{userId:'005000000000002'},{IsSandbox:true}])assert.throws(()=>authorizeEnvironment(policy(),{...identity,...change},'metadata','https://org.example'));
  for(const origin of ['https://org.example.evil','http://org.example','https://org.example/'])assert.throws(()=>authorizeEnvironment(policy(),identity,'metadata',origin));
  assert.throws(()=>authorizeEnvironment(policy(),identity,'metadata','https://org.example','Other'));
  assert.throws(()=>authorizeEnvironment({...policy(),allowedOrgIds:[identity.Id,'00D000000000002']},identity,'metadata','https://org.example'),/differs/);
  assert.throws(()=>authorizeEnvironment({...policy(),approval:{...policy().approval,operator:''}},identity,'metadata','https://org.example'));
  assert.throws(()=>authorizeEnvironment(policy(),identity,'metadata','https://org.example','QA',Date.now()+120000),/expired/);
  assert.throws(()=>authorizeEnvironment(policy(),identity,'sandbox-data','https://org.example'));
  assert.throws(()=>authorizeEnvironment(policy({...definition,mode:'PRODUCTION_CONTROLLED_QA'}),identity,'metadata','https://org.example'),/review only/);
  const sandbox=policy({...definition,mode:'SANDBOX_QA',capabilities:['sandbox-data','sandbox-ui']});
  assert.equal(authorizeEnvironment(sandbox,{...identity,IsSandbox:true},'sandbox-data','https://org.example').mode,'SANDBOX_QA');
  assert.throws(()=>authorizeEnvironment(policy({...definition,capabilities:['metadata','sandbox-data']}),identity,'metadata','https://org.example'),/mutations/);
});
test('production observation DSL accepts only reviewed reads and denies unknown operations or mutating routes',()=>{
  const p=plan();assert.equal(allowObservationRequest(p,{method:'GET',url:p.documents[0].url,resourceType:'document'}),true);
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal(allowObservationRequest(p,{method,url:p.documents[0].url,resourceType:'document'}),false);
  for(const resourceType of ['script','xhr','fetch','websocket','other'])assert.equal(allowObservationRequest({...p,assets:[p.documents[0].url]},{method:'GET',url:p.documents[0].url,resourceType}),false);
  assert.equal(allowObservationRequest(p,{method:'GET',url:'https://org.example/unknown',resourceType:'document'}),false);
  for(const url of ['https://org.example/save','https://org.example/x?action=delete','https://org.example/%64elete','https://other:password@org.example/observations'])assert.throws(()=>ObservationPlanSchema.parse({...p,documents:[{...p.documents[0],url}]}));
  assert.throws(()=>ObservationPlanSchema.parse({...p,click:'submit'}));assert.throws(()=>ObservationPlanSchema.parse({...p,reads:[{...p.reads[0],action:'fill'}]}));
});
test('production observation rejects mismatched plan approvals and API identities before any browser/session I/O',async()=>{
  const p=plan(),request={plan:p,approval:{operator:'fixture-reviewer',planHash:observationHash(p),expiresAt:new Date(Date.now()+60000).toISOString()}};
  await assert.rejects(observeProduction({...request,approval:{...request.approval,planHash:'bad'}},policy(),identity),/matching/);
  await assert.rejects(observeProduction(request,policy(),{...identity,userId:'005000000000002'}),/identity/);
  await assert.rejects(observeProduction(request,policy({...definition,mode:'PRODUCTION_CONTROLLED_QA'}),identity),/read-only mode/);
});
test('live client policy context expires and denies disallowed API reads without transport',async()=>{
  const client:SalesforceClient=Reflect.construct(SalesforceClient,['https://org.example','mock-token','v62.0']);
  Reflect.set(client,'environment',{identity,policy:policy({...definition,capabilities:['metadata']})});
  await assert.rejects(client.get('/services/data/v62.0/query?q=SELECT'),/not approved/);
  Reflect.set(client,'environment',{identity,policy:{...policy(),approval:{...policy().approval,expiresAt:'2000-01-01T00:00:00Z'}}});
  await assert.rejects(client.get('/services/data/v62.0/sobjects/'),/expired/);
  client.identity=async()=>({...identity,IsSandbox:true});Reflect.set(client,'environment',{identity:{...identity,IsSandbox:true},policy:policy({...definition,mode:'SANDBOX_QA',capabilities:['metadata','soql']})});
  await assert.rejects(client.authorizeCapability('sandbox-ui','https://org.example'),/not approved/);
});
test('general browser authentication and callbacks deny production before browser launch; readonly receipt issuance is bounded',async()=>{
  let called=false;
  await assert.rejects(createBrowserSession({origin:'https://org.example',allowedOrigins:['https://org.example'],persona:'QA',reviewer:'fixture-reviewer',verifySandbox:async()=>identity,authenticate:async()=>{called=true;},verify:async()=>true}),/verified sandbox/);
  await assert.rejects(probeSession('.auth/missing.json','https://org.example',['https://org.example'],async()=>{called=true;return {orgId:identity.Id,userId:identity.userId,persona:'QA'};},async()=>identity),/verified sandbox/);
  const p=plan();await assert.rejects(verifyObservationSession({plan:p,approval:{operator:'fixture-reviewer',planHash:observationHash(p),expiresAt:new Date(Date.now()+60000).toISOString()}},policy(),identity,'.auth/missing.json',3600001),/one hour/);assert.equal(called,false);
});
test('real headless boundary disables scripts and blocks form POST and unknown GET navigation on a synthetic HTTP fixture',async()=>{
  let writes=0,unknown=0,blocked=0;
  const server=createServer((req,res)=>{if(req.method==='POST')writes++;if(req.url!=='/observations')unknown++;res.setHeader('content-type','text/html');res.end('<div data-testid="status">Ready</div><script>document.querySelector("div").textContent="Changed";fetch("/mutation",{method:"POST"})</script><form method="POST" action="/observations"><button>Submit</button></form><a href="/unknown">Unknown</a>');});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
  const url=`http://127.0.0.1:${address.port}/observations`,p={...plan(),documents:[{url,nonMutatingReviewed:true as const,source:'synthetic:local'}]},browser=await chromium.launch(localLaunchOptions());
  try {const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});await installObservationBoundary(context,p,()=>blocked++);const page=await context.newPage();await page.goto(url);assert.equal(await page.getByTestId('status').textContent(),'Ready');
    const postDenied=page.waitForEvent('requestfailed',{predicate:r=>r.method()==='POST'});await page.getByRole('button').click().catch(()=>{});await postDenied;await page.close();
    const other=await context.newPage();await other.goto(url);const getDenied=other.waitForEvent('requestfailed',{predicate:r=>r.url().endsWith('/unknown')});await other.getByRole('link').click().catch(()=>{});await getDenied;
    assert.equal(writes,0);assert.equal(unknown,0);assert.ok(blocked>=2);
  }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
