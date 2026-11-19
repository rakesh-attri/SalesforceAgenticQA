import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { join,resolve,relative,isAbsolute } from 'node:path';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { browserFixture } from './support/browser-policy.js';
import { installFixtureDocuments } from './support/browser-guard-fixture.js';
import { runDedicatedWorkflow } from '../src/execution/dedicated-pipeline.js';
import { dedicatedPlanHash } from '../src/salesforce/dedicated-qa.js';
import { dedicatedUiHash } from '../src/execution/dedicated-browser.js';
import { browserPlanHash,resolveBrowserRecords,reserveBrowserSession,fingerprint } from '../src/execution/browser-policy.js';
import { installReviewedBrowserBoundary } from '../src/execution/browser-runtime.js';
import { parseBrowserBuild } from '../src/execution/browser-build.js';
import { BrowserActionBroker } from '../src/execution/browser-actions.js';
import { BrowserBudget } from '../src/execution/browser-resources.js';
import { WorkflowSchema } from '../src/agents/workflows.js';
import {withBrowserStage,BrowserExecutionDiagnosticSchema,readBrowserExecutionDiagnostics} from '../src/execution/browser-diagnostics.js';
import {DedicatedSessionError} from '../src/execution/dedicated-browser.js';

test('lifecycle preflight retains closed stage evidence before factory dispatch without leaking provider errors',async t=>{
  for(const kind of ['identity','timeout','unknown'] as const)await t.test(kind,async()=>{
    await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/lifecycle-preflight-diagnostic-')),history=new History(':memory:'),b=browserFixture(history),f=b.f;
    b.plan.records=[];b.plan.objects=['Account','Contact'];b.plan.runId=f.input.data.plan.runId;b.plan.ownedDataPlanHash=dedicatedPlanHash(f.input.data.plan);b.plan.sourceVersion=f.input.spec.version;b.plan.budgets.maxMs=f.input.ui.plan.maxMs;
    const review=b.approve();f.input.ui.plan.browserSessionPolicyHash=browserPlanHash(review.plan);f.input.ui.approval.hash=dedicatedUiHash(f.input.ui.plan);
    try{
      const error=kind==='identity'?new DedicatedSessionError('identity-http'):new Error('PRIVATE_PROVIDER_TOKEN_AND_RECORD_BODY');
      if(kind==='timeout')error.name='TimeoutError';if(kind==='unknown')Object.assign(error,{code:'PRIVATE_PROVIDER_TOKEN_AND_RECORD_BODY'});
      const report=await runDedicatedWorkflow(f.input,{history,knowledge:new KnowledgeIndex(history),data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>({statePath:'.auth/unopened-fixture.json'}),browserReview:review,browserPreflight:async(_r,_p,_i,_s,_a,observer)=>withBrowserStage(observer,'context-identity',async()=>{throw error;}),validation:'offline-mocked-salesforce'});
      assert.equal(report.status,'failed');assert.equal(report.created,0);assert.equal(report.cleaned,0);assert.equal(f.writes.length,0);assert.equal(f.records.size,0);assert.equal(history.results().length,0);assert.equal(report.learning.verifiedLessonPublished,false);
      const diagnostic=BrowserExecutionDiagnosticSchema.parse(report.preflightDiagnostics),first=diagnostic.events.find(event=>event.status==='failed');
      assert.equal(first?.stage,'context-identity');assert.equal(first?.code,kind==='identity'?'identity-http':kind==='timeout'?'timeout':'unknown');
      assert.equal(diagnostic.validation,'offline-mocked-salesforce');assert.equal(diagnostic.rawValuesRetained,false);
      assert.deepEqual(readBrowserExecutionDiagnostics(history,f.input.data.plan.runId,browserPlanHash(review.plan))[0],JSON.parse(JSON.stringify(diagnostic)));
      assert.ok(!(await readFile(report.reportPath,'utf8')).includes('PRIVATE_PROVIDER_TOKEN_AND_RECORD_BODY'));
      assert.equal(history.db.prepare('SELECT COUNT(*) AS n FROM dedicated_runs').get()?.n,0);
      await assert.rejects(runDedicatedWorkflow(f.input,{history,knowledge:new KnowledgeIndex(history),data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,browserReview:review,browserPreflight:async()=>{throw Error('must not replay');},validation:'offline-mocked-salesforce'}),/UNIQUE/);assert.equal(f.writes.length,0);
    }finally{history.close();const rel=relative(resolve('.state'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
  });
});

test('reviewed browser profile connects existing full lifecycle to actual generated headless tests, SOQL, owned cleanup and reportingLabs offline',{timeout:90000},async()=>{
  await mkdir('.state',{recursive:true});await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.state/browser-pipeline-')),auth=await mkdtemp(resolve('.auth/browser-pipeline-')),state=join(auth,'state.json'),journal=join(root,'history.sqlite'),history=new History(journal),b=browserFixture(history),f=b.f;
  await writeFile(state,JSON.stringify({cookies:[],origins:[]}));
  b.plan.records=[];b.plan.objects=['Account','Contact'];b.plan.runId=f.input.data.plan.runId;b.plan.ownedDataPlanHash=dedicatedPlanHash(f.input.data.plan);b.plan.sourceVersion=f.input.spec.version;b.plan.budgets.maxMs=f.input.ui.plan.maxMs;b.plan.budgets.sessions=3;
  const review=b.approve();f.input.ui.plan.browserSessionPolicyHash=browserPlanHash(review.plan);f.input.ui.approval.hash=dedicatedUiHash(f.input.ui.plan);
  const outsider='001999999999999';f.records.set(outsider,{Id:outsider,object:'Account',Name:'Unrelated',Description:'foreign',CreatedById:f.identity.userId});
  const services={history,knowledge:new KnowledgeIndex(history),data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>({statePath:state}),browserReview:review,ownershipJournal:journal,browserPreflight:async()=>parseBrowserBuild(b.native),
    browserBoundary:async(context:import('@playwright/test').BrowserContext,onBlocked:NonNullable<Parameters<typeof installReviewedBrowserBoundary>[1]['onBlocked']>)=>{await installFixtureDocuments(context,history);reserveBrowserSession(review,history,'selector-observation');await installReviewedBrowserBoundary(context,{review,parent:f.policy,identity:f.identity,build:b.build,history,records:resolveBrowserRecords(b.plan,history),onBlocked});},guardModule:resolve('unit/support/browser-guard-fixture.ts').replaceAll('\\','/'),validation:'offline-mocked-salesforce' as const};
  try {
    await assert.rejects(runDedicatedWorkflow(f.input,{...services,validation:'live-salesforce'}),/Mock browser/);assert.equal(f.writes.length,0);
    const report=await runDedicatedWorkflow(f.input,services);
    assert.equal(report.status,'passed');assert.equal(report.created,2);assert.equal(report.cleaned,2);assert.equal(report.learning.status,'review-required');assert.equal(report.learning.verifiedLessonPublished,false);assert.equal(report.validation,'offline-mocked-salesforce');assert.ok(f.records.has(outsider));assert.equal(f.records.size,1);
    const result=JSON.parse(await readFile(report.reportPath,'utf8'));assert.equal(result.execution.results.length,2);assert.ok(result.execution.results.every((r:{status:string})=>r.status==='passed'));assert.equal(result.execution.reportingLabs.status,'generated');assert.equal(result.execution.reportingLabs.validation,'offline-mocked-salesforce');
    assert.ok(report.stages.includes('reviewed-lightning-build-and-app-preflight-complete'));assert.ok(report.stages.includes('post-browser-independent-soql-verification-complete'));assert.equal(history.db.prepare('SELECT COUNT(*) AS count FROM browser_execution_sessions').get()?.count,3);
  }finally{history.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});await rm(auth,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('one-use reviewed agent action cannot replay across resource-policy changes or after uncertain failure',async()=>{
  const b=browserFixture(),f=b.f;try {
    await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);b.plan.records=[];b.plan.objects=['Account','Contact'];b.plan.ownedDataPlanHash=dedicatedPlanHash(f.input.data.plan);b.plan.budgets.actions=2;
    const record=resolveBrowserRecords(b.plan,b.history)[0],workflow=WorkflowSchema.parse({id:'details',criterion:'AC1',source:'fixture-reviewed',reviewer:f.policy.approval.operator,origin:f.browserOrigin,path:`/lightning/r/${record.object}/${record.id}/view`,steps:[{action:'click',locator:{by:'role',value:'button',name:'Details'}},{action:'click',locator:{by:'role',value:'button',name:'Related'}}],assertion:{locator:{by:'role',value:'heading'},text:'unchanged'}});
    b.plan.agentWorkflowHashes=[fingerprint(workflow)];let effects=0;
    const execute=()=>{const review=b.approve();return new BrowserActionBroker(b.history,review,f.policy,f.identity,b.build,new BrowserBudget(review));};
    await execute().execute(workflow,0,async()=>{effects++;});await assert.rejects(execute().execute(workflow,0,async()=>{effects++;}));
    b.plan.resources[0].queryKeys.push('newVariant');await assert.rejects(execute().execute(workflow,0,async()=>{effects++;}));
    await assert.rejects(execute().execute(workflow,1,async()=>{effects++;throw Error('unknown result');}),/replay denied/);await assert.rejects(execute().execute(workflow,1,async()=>{effects++;}));assert.equal(effects,2);
    const template=WorkflowSchema.parse({...workflow,id:'pre-reviewed-template',path:`/lightning/r/${record.object}/{{record:${record.object}}}/view`,assertion:{...workflow.assertion,text:'{{synthetic:Account.Name}}'}});
    b.plan.agentWorkflowHashes=[fingerprint(template)];
    const materialized={...template,path:`/lightning/r/${record.object}/${record.id}/view`,assertion:{...template.assertion,text:f.input.data.plan.creates.Account.Name}};
    await assert.rejects(execute().execute({...materialized,assertion:{...materialized.assertion,text:'Invented outcome'}},0,async()=>{effects++;}));
    await execute().execute(materialized,0,async()=>{effects++;});assert.equal(effects,3);
    await f.data.cleanup(f.input.data);f.data.finish(f.input.data);assert.equal(f.records.size,0);
  }finally{b.history.close();}
});
