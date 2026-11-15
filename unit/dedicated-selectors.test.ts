import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { DedicatedGuardSchema } from '../src/execution/dedicated-browser.js';
import { observeDedicatedSelectors,reviewObservedSelectors,diagnoseDedicatedSelectors } from '../src/execution/dedicated-selectors.js';
import { runDedicatedWorkflow } from '../src/execution/dedicated-pipeline.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { checkDedicatedReadiness } from '../src/execution/dedicated-readiness.js';
import { DedicatedSessionError } from '../src/execution/dedicated-browser.js';
import { summarizeDeniedRequest } from '../src/execution/browser-diagnostics.js';
import { diagnoseUiDependencies } from '../src/execution/dependency-diagnostics.js';

test('cleaned owned-page metadata diagnosis blocks all business RPCs and cannot assert or learn a pass',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/dependency-metadata-')),state=join(root,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h,'metadata-diagnosis');await writeFile(state,JSON.stringify({cookies:[],origins:[]}));let businessEscaped=0;
  try {await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);await f.data.cleanup(f.input.data);f.data.finish(f.input.data);const references=await f.data.cleanedMetadataReferences(f.input.data);assert.equal(references.length,2);assert.equal(f.records.size,0);
    const guard=DedicatedGuardSchema.parse({policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:references.map(r=>`${f.browserOrigin}/lightning/r/${r.object}/${r.id}/view`),owned:references,expiresAt:f.policy.approval.expiresAt});
    const report=await diagnoseUiDependencies({guard,statePath:state,maxMs:5000,prepareContext:async context=>{await context.route('**/*',route=>{if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<h1>Negative metadata fixture</h1><script>fetch("/services/data/v62.0/ui-api/records/001000000000001?fields=Account.Name").catch(()=>{});fetch("/aura",{method:"POST",body:"message=%7B%7D"}).catch(()=>{});</script>'});businessEscaped++;return route.abort();});}});
    assert.equal(report.assertionsExecuted,0);assert.equal(report.recordsCreated,0);assert.equal(report.learningPublished,false);assert.equal(report.businessRequestsExecuted,0);assert.ok(report.blockedRequests>=2);assert.equal(businessEscaped,0);assert.equal(f.writes.length,4);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('denied browser diagnostics retain operation shape without URLs, record values or credential-bearing parameters',()=>{
  const report=summarizeDeniedRequest({url:'https://qa.example/aura?token=private-query-token',method:'POST',type:'xhr',body:new URLSearchParams({message:JSON.stringify({actions:[{descriptor:'aura://RecordUiController/ACTION$getRecord',params:{recordId:'private-record-id',fields:['private-field-value'],credentials:'private-key'}},{descriptor:'apex://private-class/ACTION$pay',params:{secret:'private-secret'}}]}),'aura.token':'private-aura-token'}).toString()});
  assert.deepEqual(report.descriptors,['aura://RecordUiController/ACTION$getRecord']);assert.deepEqual(report.parameterNames,['fields','recordId']);assert.equal(report.unknownDescriptors,1);assert.ok(!JSON.stringify(report).includes('private-'));assert.ok(!JSON.stringify(report).includes('https://'));
  const spoof=summarizeDeniedRequest({url:'https://qa.example/aura',method:'POST',type:'xhr',body:new URLSearchParams({message:JSON.stringify({actions:[{descriptor:'serviceComponent://privateCredential.RecordUiController/ACTION$getRecord'},{descriptor:'aura://RecordUiController/ACTION$privateCredential'}]})}).toString()});
  assert.deepEqual(spoof.descriptors,[]);assert.equal(spoof.unknownDescriptors,2);assert.ok(!JSON.stringify(spoof).includes('privateCredential'));
  assert.equal(report.actionHints[0].kind,'read-like');assert.equal(report.actionHints[0].supportedDescriptor,true);assert.equal(report.actionHints[1].supportedDescriptor,false);assert.ok(report.actionHints.every(h=>/^[a-f0-9]{64}$/.test(h.descriptorHash)));assert.equal(spoof.actionHints[0].supportedDescriptor,false);
});

test('source-bound browser gap diagnosis never confirms causality, grants operations or counts observation as execution',()=>{
  const binding={runId:'diagnosis-only',planHash:'fixture-plan',policyHash:'fixture-policy',sourceVersion:'fixture-v1'},evidence={...binding,capturedAt:new Date().toISOString(),observations:[{workflowId:'account-view',criterion:'AC-1',documentHash:'fixture-document',expectedHash:'fixture-expected',locator:{by:'role',value:'heading',name:'Synthetic owned fixture'},status:'review-required',reason:'not-observed',count:0}],blockedRequests:2,deniedRequests:[summarizeDeniedRequest({url:'https://qa.example/aura',method:'POST',type:'xhr',body:new URLSearchParams({message:JSON.stringify({actions:[{descriptor:'apex://Unreviewed/ACTION$unknown'}]})}).toString()}),summarizeDeniedRequest({url:'https://qa.example/resource/unknown.js',method:'GET',type:'script'})]};
  const diagnosis=diagnoseDedicatedSelectors(evidence,binding);assert.equal(diagnosis.classification,'framework-policy-or-workflow-gap');assert.equal(diagnosis.unknownActionSamples,1);assert.equal(diagnosis.observedSelectors,0);assert.equal(diagnosis.rootCause,'unconfirmed');assert.equal(diagnosis.deniedRequestsProvenCausal,false);assert.equal(diagnosis.generatedExecutionProven,false);assert.equal(diagnosis.learningEligible,false);assert.ok(diagnosis.recommendations.includes('review-exact-static-dependencies'));assert.throws(()=>diagnoseDedicatedSelectors(evidence,{...binding,sourceVersion:'other'}),/binding/);
  const observed=diagnoseDedicatedSelectors({...evidence,blockedRequests:0,deniedRequests:[],observations:[{...evidence.observations[0],status:'observed',reason:'unique-exact-match',count:1}]},binding);assert.equal(observed.status,'selectors-observed');assert.equal(observed.generatedExecutionProven,false);assert.equal(observed.learningEligible,false);
  const dependency={binding,runtime:{resources:[],unapprovedStatic:[],deniedContracts:[],authenticationRedirects:0,scriptErrors:{TypeError:1},networkFailures:0,pages:[]}},joined=diagnoseDedicatedSelectors(evidence,binding,dependency);assert.equal((joined.dependencyFindings as {context:string}).context,'known-deleted-negative-page-metadata-only');assert.equal(joined.rootCause,'unconfirmed');assert.throws(()=>diagnoseDedicatedSelectors(evidence,binding,{...dependency,binding:{...binding,runId:'foreign-run'}}),/binding/);
});

test('a missing first selector cannot consume the second owned page observation budget',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/fair-selector-budget-')),state=join(root,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h);await writeFile(state,JSON.stringify({cookies:[],origins:[]}));
  try{const owned=[{object:'Account' as const,id:'001000000000001'},{object:'Contact' as const,id:'003000000000001'}],workflows=f.input.ui.plan.workflows.map((raw,index)=>{const workflow=structuredClone(raw),record=owned[index];workflow.path=`/lightning/r/${record.object}/${record.id}/view`;workflow.assertion.text=`Expected ${record.object} fixture`;workflow.assertion.locator={by:'role' as const,value:'heading',name:workflow.assertion.text};return workflow;}),documents=workflows.map(w=>new URL(w.path,w.origin).href),guard=DedicatedGuardSchema.parse({policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents,owned,expiresAt:f.policy.approval.expiresAt}),binding={runId:'fair-budget',planHash:f.input.data.approval.planHash,policyHash:f.input.ui.plan.policyHash,sourceVersion:f.input.spec.version};
    const evidence=await observeDedicatedSelectors({guard,workflows,statePath:state,maxMs:5000,binding,prepareContext:async context=>{await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:route.request().url()===documents[0]?'<h1>Unobserved Account fixture</h1>':'<h1>Expected Contact fixture</h1>'}));}});
    assert.equal(evidence.observations[0].status,'review-required');assert.equal(evidence.observations[1].status,'observed');assert.equal(evidence.observations[1].finalPage?.sameRecord,true);assert.throws(()=>reviewObservedSelectors(evidence,binding,workflows,documents),/review required/);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('readiness checks never reserve runs or create data, and browser failure is reported without provider secrets',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try {const services={data:f.data,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>{throw new DedicatedSessionError('session-cookie');}};
    const denied=await checkDedicatedReadiness(f.input,services);assert.equal(denied.status,'blocked');assert.equal(denied.gates.at(-1)?.reason,'session-cookie');assert.equal(f.writes.length,0);assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM dedicated_runs').get()!.count,0);
    const ready=await checkDedicatedReadiness(f.input,{...services,session:async()=>({statePath:'.auth/mocked-only.json'})});assert.equal(ready.status,'ready-for-owned-ui-discovery');assert.equal(ready.liveWorkflowPassed,false);assert.equal(ready.selectorsObserved,false);assert.equal(f.writes.length,0);
  }finally{h.close();}
});

test('real headless observation proves only a unique exact approved locator and rejects stale or altered evidence',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/selector-evidence-')),state=join(root,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h);await writeFile(state,JSON.stringify({cookies:[],origins:[]}));
  try {const workflow=structuredClone(f.input.ui.plan.workflows[0]),id='001000000000001',text=f.input.data.plan.creates.Account.Name;workflow.path=workflow.path.replace('{{record:Account}}',id);workflow.assertion.text=text;workflow.assertion.locator.name=text;
    const guard=DedicatedGuardSchema.parse({policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[new URL(workflow.path,workflow.origin).href],owned:[{object:'Account',id}],expiresAt:f.policy.approval.expiresAt}),binding={runId:'qa-run',planHash:f.input.data.approval.planHash,policyHash:f.input.ui.plan.policyHash,sourceVersion:f.input.spec.version};
    const observe=(duplicate=false)=>observeDedicatedSelectors({guard,workflows:[workflow],statePath:state,maxMs:5000,binding,prepareContext:async context=>{await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<h1>${text}</h1>${duplicate?`<h1>${text}</h1>`:''}`}));}});
    const evidence=await observe();assert.equal(reviewObservedSelectors(evidence,binding,[workflow],guard.documents).status,'reviewed');
    assert.throws(()=>reviewObservedSelectors(evidence,{...binding,sourceVersion:'changed'},[workflow],guard.documents),/binding/);
    assert.throws(()=>reviewObservedSelectors({...evidence,capturedAt:new Date(Date.now()-360000).toISOString()},binding,[workflow],guard.documents),/stale/);
    const changed=structuredClone(evidence);changed.observations[0].locator={by:'testId',value:'invented-repair'};assert.throws(()=>reviewObservedSelectors(changed,binding,[workflow],guard.documents),/review required/);
    const ambiguous=await observe(true);assert.equal(ambiguous.observations[0].reason,'ambiguous');assert.equal(ambiguous.observations[0].count,2);assert.throws(()=>reviewObservedSelectors(ambiguous,binding,[workflow],guard.documents),/review required/);
    const foreign={...workflow,path:'/lightning/r/Account/001999999999999/view'};await assert.rejects(observeDedicatedSelectors({guard,workflows:[foreign],statePath:state,maxMs:5000,binding}),/exact owned/);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('unobserved approved selectors stop test execution, clean owned data and cannot publish learning',async()=>{
  await mkdir('.state',{recursive:true});await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.state/selector-denial-')),auth=await mkdtemp(resolve('.auth/selector-denial-')),state=join(auth,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h,'selector-denial'),knowledge=new KnowledgeIndex(h);await writeFile(state,JSON.stringify({cookies:[],origins:[]}));let testsInvoked=false;
  try {const report=await runDedicatedWorkflow(f.input,{history:h,knowledge,data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>({statePath:state}),observe:async input=>({...input.binding,capturedAt:new Date().toISOString(),observations:input.workflows.map(w=>({workflowId:w.id,criterion:w.criterion,documentHash:'not-real',expectedHash:'not-real',locator:w.assertion.locator,status:'review-required' as const,reason:'not-observed' as const,count:0})),blockedRequests:1,deniedRequests:[]}),runTests:async()=>{testsInvoked=true;throw Error('must never execute');},validation:'offline-mocked-salesforce'});
    assert.equal(report.status,'failed');assert.equal(report.selectors.status,'review-required');assert.equal(testsInvoked,false);assert.equal(report.created,2);assert.equal(report.cleaned,2);assert.equal(f.records.size,0);assert.equal(report.learning.status,'blocked');assert.equal(h.results().length,0);assert.equal(knowledge.all({org:f.org.orgIdentityHash!,permission:f.input.permission}).filter(k=>k.kind==='lesson').length,0);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});await rm(auth,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
