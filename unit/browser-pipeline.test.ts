import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { join,resolve } from 'node:path';
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
    assert.equal(report.status,'passed');assert.equal(report.created,2);assert.equal(report.cleaned,2);assert.equal(report.learning.status,'verified');assert.equal(report.validation,'offline-mocked-salesforce');assert.ok(f.records.has(outsider));assert.equal(f.records.size,1);
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
