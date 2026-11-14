import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { dedicatedFixture } from './support/dedicated.js';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { runDedicatedWorkflow } from '../src/execution/dedicated-pipeline.js';
import { intelligentSpecPlan } from '../src/agents/spec-intelligence.js';
import { dedicatedUiHash } from '../src/execution/dedicated-browser.js';
import { observeDedicatedSelectors } from '../src/execution/dedicated-selectors.js';
import { installFixtureResponses } from './support/dedicated-guard-fixture.js';
test('dedicated spec/discovery/approved factories -> mock-session guarded generated Playwright -> SOQL -> cleanup/report -> verified execution learning',{timeout:90000},async()=>{
  await mkdir('.state',{recursive:true});await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.state/dedicated-e2e-')),auth=await mkdtemp(resolve('.auth/dedicated-e2e-')),state=join(auth,'state.json'),h=new History(join(root,'history.sqlite')),f=dedicatedFixture(h),index=new KnowledgeIndex(h);
  await writeFile(state,JSON.stringify({cookies:[],origins:[]}));const outsider='001999999999999';f.records.set(outsider,{Id:outsider,object:'Account',CreatedById:f.identity.userId,Name:'Existing unrelated Account',Description:'not-owned'});
  try {const report=await runDedicatedWorkflow(f.input,{history:h,knowledge:index,data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>({statePath:state}),observe:input=>observeDedicatedSelectors({...input,prepareContext:context=>installFixtureResponses(context,input.guard)}),guardModule:resolve('unit/support/dedicated-guard-fixture.ts').replaceAll('\\','/'),validation:'offline-mocked-salesforce'});
    assert.equal(report.status,'passed');assert.equal(report.created,2);assert.equal(report.cleaned,2);assert.equal(report.validation,'offline-mocked-salesforce');assert.equal(report.learning.status,'verified');assert.equal(h.results().filter(r=>r.status==='passed').length,2);assert.ok(report.stages.includes('post-browser-independent-soql-verification-complete'));assert.equal(f.records.size,1);assert.ok(f.records.has(outsider));
    assert.ok(f.queries.some(q=>q.includes('CreatedById')));assert.equal(f.writes.filter(w=>w.operation==='create').length,2);assert.equal(f.writes.filter(w=>w.id===outsider).length,0);assert.ok(JSON.parse(await readFile(report.reportPath,'utf8')).execution.results.every((r:{status:string})=>r.status==='passed'));
    assert.equal(report.selectors.status,'reviewed');assert.ok(report.stages.includes('approved-selectors-observed-and-source-reviewed'));
    const future=await intelligentSpecPlan(f.input.spec,f.org,index,h,f.input.permission,f.input.ui.plan.workflows.map(workflow=>({criterionId:workflow.criterion,workflow,preconditions:['Reviewed dedicated synthetic factory']})),{reviewer:'fixture-operator',sourceVersion:f.input.spec.version});assert.ok(future.selection.every(s=>s.mandatory));assert.equal(future.mandatoryRegression.length,2);
    await assert.rejects(runDedicatedWorkflow(f.input,{history:h,knowledge:index,data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>({statePath:state})}));assert.equal(f.writes.length,4);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});await rm(auth,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
test('dedicated session denial occurs before any data write and cannot create verified learning',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/dedicated-session-denial-')),h=new History(':memory:'),f=dedicatedFixture(h,'session-denied'),index=new KnowledgeIndex(h);
  try {const report=await runDedicatedWorkflow(f.input,{history:h,knowledge:index,data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org,session:async()=>{throw Error('No reviewed browser state');},validation:'offline-mocked-salesforce'});assert.equal(report.status,'failed');assert.equal(f.writes.length,0);assert.equal(h.results().length,0);assert.equal(report.learning.status,'blocked');assert.equal(index.all({org:f.org.orgIdentityHash!,permission:f.input.permission}).filter(d=>d.kind==='lesson').length,0);
    const duplicate=structuredClone(f.input);duplicate.ui.plan.workflows[1].criterion=duplicate.ui.plan.workflows[0].criterion;duplicate.ui.approval.hash=dedicatedUiHash(duplicate.ui.plan);await assert.rejects(runDedicatedWorkflow(duplicate,{history:h,knowledge:index,data:f.data,root,apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org}),/all reviewed criteria/);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
