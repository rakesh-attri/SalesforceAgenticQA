import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {browserFixture} from './support/browser-policy.js';
import {prepareDedicatedChromeProfile,dedicatedChromeProfileHash} from '../src/execution/dedicated-chrome-profile.js';
import {lightningEngineHash} from '../src/execution/lightning-engine.js';
import {parseBrowserBuild} from '../src/execution/browser-build.js';
import {LightningSession} from '../src/execution/lightning-session.js';
import {dedicatedPlanHash} from '../src/salesforce/dedicated-qa.js';
import {resolveBrowserRecords,digest} from '../src/execution/browser-policy.js';
import {WorkflowSchema} from '../src/agents/workflows.js';
import {observeOwnedSelectorsMcp} from '../src/execution/owned-mcp-selectors.js';
import {reviewObservedSelectors} from '../src/execution/dedicated-selectors.js';
import {EventEmitter} from 'node:events';
import {observeNormalNetworking} from '../src/execution/normal-comparison.js';
import {attachReviewedBrowserContext} from '../src/execution/browser-runtime.js';
import {runDedicatedWorkflow} from '../src/execution/dedicated-pipeline.js';
import {dedicatedUiHash} from '../src/execution/dedicated-browser.js';
import {KnowledgeIndex} from '../src/knowledge/index.js';

test('owned Account/Contact selector observation uses real headless Chrome and restricted MCP with unchanged synthetic expectations',{timeout:60000},async()=>{
 const b=browserFixture(),f=b.f;await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/owned-mcp-test-')),state=join(root,'state.json');
 try{await writeFile(state,JSON.stringify({cookies:[],origins:[]}));const outsider='001999999999999';f.records.set(outsider,{Id:outsider,object:'Account',Name:'Unrelated fixture record',Description:'not-owned'});await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);
 b.plan.engineProfileHash=lightningEngineHash();b.plan.ownedDataPlanHash=dedicatedPlanHash(f.input.data.plan);b.plan.records=[];b.plan.objects=['Account','Contact'];b.plan.budgets.maxMs=20000;b.plan.budgets.sessions=4;
 const profile=prepareDedicatedChromeProfile(b.approve());profile.approval.operator=f.policy.approval.operator;profile.approval.expiresAt=new Date(Date.now()+3600000).toISOString();b.plan.executionProfile='DEDICATED_QA_NORMAL_CHROME';b.plan.profileHash=dedicatedChromeProfileHash(profile);
 const references=async()=>{const references=resolveBrowserRecords(b.plan,b.history);return{references,privateDisplays:references.map(r=>({object:r.object,id:r.id,display:String(f.records.get(r.id)![r.object==='Account'?'Name':'LastName'])})),proof:{referenceVersions:references.map(r=>digest(r.id+'unchanged'))}};};
 const fixtures={connect:(async()=>({apiOrigin:f.origin,preflight:async()=>f.identity,verifyReferences:references})) as any,open:((input:any)=>LightningSession.open({...input,verifyContext:async()=>{},nativeBuild:async()=>parseBrowserBuild(b.native),prepareContext:async(context:any)=>{await context.route('**/*',(route:any)=>{const object=route.request().url().includes('/Contact/')?'Contact':'Account',name=object==='Account'?f.input.data.plan.creates.Account.Name:f.input.data.plan.creates.Contact.LastName;return route.fulfill({contentType:'text/html',body:`<!doctype html>${b.native}${object==='Account'?'<h1>'+name+'</h1>':'<span>'+name+'</span>'}<button role="tab">Related</button><button role="tab">Details</button>`});});}})) as typeof LightningSession.open};
 const binding={runId:b.plan.runId,planHash:b.plan.ownedDataPlanHash,policyHash:b.plan.parentPolicyHash,sourceVersion:b.plan.sourceVersion};
 const ownedReferences=(await references()).references;
 const fakeContext=new EventEmitter() as any;let closes=0;fakeContext.close=async()=>{closes++;};
 const native=observeNormalNetworking(fakeContext,b.approve(),'dedicated-native-execution',ownedReferences),page={mainFrame:()=>frame},frame={page:()=>page};
 const request=(id:string)=>({isNavigationRequest:()=>true,frame:()=>frame,url:()=>`${f.browserOrigin}/lightning/r/Account/${id}/view`});
 fakeContext.emit('request',request(ownedReferences.find(r=>r.object==='Account')!.id));assert.equal(closes,0);
 fakeContext.emit('request',request('001999999999999'));assert.equal(closes,1);assert.equal((await native.finish()).closedForBudget,true);
 await assert.rejects(attachReviewedBrowserContext(fakeContext,{review:b.approve(),parent:f.policy,identity:f.identity,history:b.history,records:[{...ownedReferences[0],id:'001999999999999'}],statePath:state,apiOrigin:f.origin,dedicatedChromeProfile:profile}),/ownership journal/);
 for(const object of ['Account','Contact'] as const){const record=(await references()).privateDisplays.find(r=>r.object===object)!,workflow=WorkflowSchema.parse({id:'owned-'+object,source:'fixture://reviewed-owned-workflow',criterion:'AC-'+object,origin:f.browserOrigin,path:`/lightning/r/${object}/${record.id}/view`,steps:[],assertion:{locator:object==='Account'?{by:'role',value:'heading',name:record.display}:{by:'text',value:record.display},text:record.display},apiAssertions:[],reviewer:f.policy.approval.operator});
 const input={review:b.approve(),parent:f.policy,profile,history:b.history,statePath:state,workflow,binding};
 const result=await observeOwnedSelectorsMcp(input,fixtures);assert.equal(result.observations[0].status,'observed');assert.equal(result.mcpSessions?.[0].validation,'offline-mocked-salesforce');assert.equal(result.mcpSessions?.[0].connected,true);assert.equal(result.mcpSessions?.[0].approvedDocument,true);assert.equal(result.mcpSessions?.[0].referenceUnchanged,true);assert.equal(reviewObservedSelectors(result,binding,[workflow],[new URL(workflow.path,workflow.origin).href]).status,'reviewed');
 await assert.rejects(observeOwnedSelectorsMcp({...input,workflow:{...workflow,assertion:{...workflow.assertion,text:'Invented expected result'}}},fixtures),/original synthetic expectation/);
 await assert.rejects(observeOwnedSelectorsMcp({...input,binding:{...binding,runId:'other-run'}},fixtures),/exact reviewed/);
 await assert.rejects(observeOwnedSelectorsMcp({...input,workflow:{...workflow,path:'/lightning/r/'+object+'/'+(object==='Account'?'001':'003')+'999999999999/view'}},fixtures),/reference/);
 await assert.rejects(observeOwnedSelectorsMcp({...input,workflow:{...workflow,steps:[{action:'click',locator:{by:'text',value:'Delete'}}]}},fixtures),/exact reviewed/);
 }
 assert.equal(f.writes.length,2);await f.data.cleanup(f.input.data);assert.equal((await f.data.verifyCleanup(f.input.data)).absent,2);assert.equal(f.records.size,1);assert.equal(f.records.get(outsider)?.Name,'Unrelated fixture record');assert.equal(f.writes.filter(w=>w.id===outsider).length,0);
 }finally{b.history.close();const rel=relative(resolve('.auth'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('requesting managed MCP without an exact native session/profile stops the lifecycle before any data effect',async()=>{
 const b=browserFixture(),f=b.f;try{f.input.ui.plan.selectorTransport='managed-mcp';f.input.ui.plan.selectorSessions='per-workflow';f.input.ui.approval.hash=dedicatedUiHash(f.input.ui.plan);
 await assert.rejects(runDedicatedWorkflow(f.input,{history:b.history,knowledge:new KnowledgeIndex(b.history),data:f.data,root:'.state/unexecuted-owned-mcp',apiOrigin:f.origin,identity:async()=>f.identity,policy:async()=>f.policy,discover:async()=>f.org}),/exact native profile/);
 assert.equal(f.writes.length,0);assert.equal(f.records.size,0);assert.equal(b.history.db.prepare('SELECT COUNT(*) AS n FROM dedicated_runs').get()?.n,0);
 }finally{b.history.close();}
});
