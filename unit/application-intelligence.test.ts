import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applicationIntelligenceFixture,demonstrateApplicationIntelligence,fixtureApplicationAnswers} from '../src/demos/application-intelligence.js';
import {discoverApplication,ApplicationReviewStore,compileReviewedApplication,approveApplicationModel,indexApplicationKnowledge,applicationStudyHash} from '../src/agents/application-intelligence.js';
import {recordFixtureApplicationObservation,readFixtureApplicationObservation} from '../src/agents/application-observations.js';
import {History} from '../src/core/history.js';
import {KnowledgeIndex} from '../src/knowledge/index.js';
import {WorkflowModelStore} from '../src/agents/workflow-models.js';
import {fingerprint,digest} from '../src/execution/browser-policy.js';
import {writeApplicationReport} from '../src/agents/application-report.js';
import {discoverApplicationLayouts} from '../src/agents/application-layouts.js';
import {IntelligenceSchema,type IntelligenceReader} from '../src/agents/org-intelligence.js';
import {launchLocalBrowser} from '../src/execution/local-browser.js';
import {collectFixturePageFacts} from '../src/agents/application-observations.js';
import {exploreFixture} from '../src/agents/fixture-explorer.js';
import {lightningFixture} from '../fixtures/lightning-server.js';

let demonstration:ReturnType<typeof demonstrateApplicationIntelligence>|undefined;
const demo=()=>demonstration??=demonstrateApplicationIntelligence();
async function setup(){
 const d=await demo(),f=await applicationIntelligenceFixture(),source=new History(d.historyPath),h=new History(':memory:');let payload;
 try{payload=readFixtureApplicationObservation(source,d.fixtureEvidence!,f.org.orgAlias,'QA');}finally{source.close();}
 const hash=recordFixtureApplicationObservation(h,payload.scope,payload.report),study=discoverApplication({...f,permission:'QA',fixtureReceipts:[hash],changes:['Field:Contact.LastName']},h),reviews=new ApplicationReviewStore(h);reviews.put(study);return{f,h,study,reviews,payload,hash,answers:fixtureApplicationAnswers(study,payload.report.origin)};
}
const acceptAll=(s:Awaited<ReturnType<typeof setup>>)=>{for(const answer of s.answers)s.reviews.review(s.study.scope,answer);};
const compile=(s:Awaited<ReturnType<typeof setup>>)=>compileReviewedApplication({...s.f,study:s.study},s.h);

test('real headless local fixture and shared MCP discover states, reviewed navigation, masked images and guarded proposals',async()=>{
 const d=await demo();assert.equal(d.beforeReview,'review-required');assert.equal(d.observedTransitions,1);assert.equal(d.suggestedTransitions,1);assert.equal(d.states,5);assert.ok(d.locators>=10);assert.equal(d.maskedScreenshots,4);assert.equal(d.mcpSameContext,true);assert.equal(d.proposedFiles,3);assert.equal(d.knowledge.verifiedExecutionLessons,0);assert.equal(d.salesforceRequests,0);assert.equal(d.externalModelRequests,0);assert.deepEqual(d.verifiedRetrievalKinds,['requirement']);
 const report=JSON.parse(await readFile(d.json,'utf8'));assert.equal(report.design.files.filter((f:any)=>f.kind==='playwright-typescript').length,2);assert.ok(report.design.files.filter((f:any)=>f.kind==='playwright-typescript').every((f:any)=>f.code.includes('REVIEW_REQUIRED-test-design-guard.json')));assert.equal(report.readiness.permissionsGranted,0);assert.equal(report.readiness.executionAuthorized,false);
});
test('source-linked questions prioritize missing requirements and metadata relationships never prove runtime navigation',async()=>{
 const s=await setup();try{assert.equal(s.study.questions.length,10);assert.ok(s.study.questions.every(q=>q.sources.length>0));assert.equal(s.study.questions[0].kind,'business-rule');assert.ok(s.study.transitions.find(t=>t.from==='Contact')!.reason.includes('unobserved'));
  const result=await compile(s);assert.equal(result.model,undefined);assert.ok(result.questions.length>0);const reverse=s.answers.find(a=>s.study.questions.find(q=>q.id===a.questionId)?.transitionId===s.study.transitions.find(t=>t.status==='suggested')!.id)!;
  assert.throws(()=>s.reviews.review(s.study.scope,{...reverse,decision:'accept',answer:{transitionId:s.study.transitions.find(t=>t.status==='suggested')!.id}}),/manufacture/);
 }finally{s.h.close();}
});
test('compiled steps retain exact states, conditions, directed transitions and separate model review with no execution authority',async()=>{
 const s=await setup();try{acceptAll(s);const c=await compile(s);assert.equal(c.status,'model-review-required');assert.equal(c.model!.review,undefined);assert.ok(c.model!.steps.every(step=>step.states!.length>0&&step.conditions!.length>0));assert.deepEqual(c.model!.steps[0].transitions.map(t=>t.target),['Contact']);assert.equal(c.model!.steps[1].transitions.length,0);assert.equal(c.design!.files.length,0);
  assert.throws(()=>approveApplicationModel(s.h,{scope:s.study.scope,studyVersion:s.study.version,modelVersion:c.model!.version,id:c.model!.id,operator:'REVIEW_REQUIRED'}));
  const approved=approveApplicationModel(s.h,{scope:s.study.scope,studyVersion:s.study.version,modelVersion:c.model!.version,id:c.model!.id,operator:'Fixture Reviewer'});assert.equal(approved.review!.hash,approved.version);assert.equal(c.executionAuthorized,false);
 }finally{s.h.close();}
});
test('review rejects missing provenance, invented fields, wrong persona and cross-org study access',async()=>{
 const s=await setup();try{const a=s.answers.find(a=>s.study.questions.find(q=>q.id===a.questionId)?.kind==='business-rule')!;
  assert.throws(()=>s.reviews.review(s.study.scope,{...a,operator:'REVIEW_REQUIRED'}));assert.throws(()=>s.reviews.review(s.study.scope,{...a,sources:[{source:digest('foreign'),version:digest('foreign')}]}),/outside/);assert.throws(()=>s.reviews.get({...s.study.scope,permission:'Administrator'},s.study.version),/scope/);assert.throws(()=>s.reviews.get({...s.study.scope,org:'foreign'},s.study.version),/scope/);
  assert.throws(()=>s.reviews.review(s.study.scope,{...a,answer:{...(a.answer as any),persona:'Administrator'}}),/persona/);assert.throws(()=>s.reviews.review(s.study.scope,{...a,answer:{...(a.answer as any),dataRequirements:[{object:'Contact',field:'Invented__c',constraint:'missing'}]}}),/source-backed/);assert.throws(()=>s.reviews.review(s.study.scope,{...a,answer:{...(a.answer as any),expected:'Invented outcome'}}),/source-backed/);
 }finally{s.h.close();}
});
test('accept/reject/correct is append-only and exact supersession invalidates previously compiled models and reviewed knowledge',async()=>{
 const s=await setup();try{acceptAll(s);const c=await compile(s),index=new KnowledgeIndex(s.h);await indexApplicationKnowledge(s.h,s.study,index);const q=s.study.questions.find(q=>q.kind==='business-rule')!,head=s.reviews.head(s.study,q.id)!;assert.equal((await index.retrieve('fixture-status',s.study.scope)).length,2);
  assert.throws(()=>s.reviews.review(s.study.scope,{...head.decision,reason:'Silent overwrite'}),/Correction/);assert.throws(()=>s.reviews.review(s.study.scope,{...head.decision,decision:'correct',supersedes:digest('wrong')}),/Correction/);
  const correction={...head.decision,decision:'correct',supersedes:head.id,reason:'Clarify synthetic prerequisite',answer:{...(head.decision.answer as any),prerequisites:['Corrected independently approved synthetic fixture prerequisite']}};const corrected=s.reviews.review(s.study.scope,correction);assert.equal(s.reviews.review(s.study.scope,correction).id,corrected.id);assert.throws(()=>new WorkflowModelStore(s.h).get(s.study.scope,c.model!.id,c.model!.version),/stale/);assert.ok(!index.all(s.study.scope).some(d=>d.version===head.id&&d.status==='verified'));
  await indexApplicationKnowledge(s.h,s.study,index);const current=s.reviews.head(s.study,q.id)!;s.reviews.review(s.study.scope,{...current.decision,decision:'reject',supersedes:current.id,reason:'Rule withdrawn',answer:undefined});assert.equal((await compile(s)).model,undefined);assert.ok(!index.all(s.study.scope).some(d=>d.version===current.id&&d.status==='verified'));
 }finally{s.h.close();}
});
test('new source versions invalidate study reviews and knowledge publication without automatic renewal',async()=>{
 const s=await setup();try{const source=s.study.sources.find(s=>s.kind==='browser')!;new WorkflowModelStore(s.h).observe([{...source,version:digest('new-browser-version')}]);assert.ok(s.reviews.stale(s.study).includes(source.id));assert.throws(()=>s.reviews.review(s.study.scope,s.answers[0]),/refresh discovery/);await assert.rejects(compile(s),/Current application/);await assert.rejects(indexApplicationKnowledge(s.h,s.study,new KnowledgeIndex(s.h)),/Current application/);
 }finally{s.h.close();}
});
test('changed browser source immediately deprecates dependent reviewed requirements and observed facts before later retrieval',async()=>{
 const s=await setup();try{acceptAll(s);const index=new KnowledgeIndex(s.h);await indexApplicationKnowledge(s.h,s.study,index);assert.equal((await index.retrieve('fixture-status',s.study.scope)).length,2);const source=s.study.sources.find(s=>s.kind==='browser')!;new WorkflowModelStore(s.h).observe([{...source,version:digest('changed-page')}]);assert.deepEqual(await index.retrieve('fixture-status',s.study.scope),[]);assert.ok(index.all(s.study.scope).some(d=>d.kind==='workflow'&&d.status==='deprecated'));}finally{s.h.close();}
});
test('reviewed answers cannot generate unobserved UI actions, locators, unknown API fields or changed expectations',async()=>{
 for(const alteration of ['locator','action','api','outcome']){const s=await setup();try{const q=s.study.questions.find(q=>q.kind==='workflow'&&q.object==='Account')!,a=s.answers.find(a=>a.questionId===q.id)!;const answer=structuredClone(a.answer) as any;
   if(alteration==='locator')answer.workflow.assertion.locator={by:'testId',value:'invented-status'};
   if(alteration==='action')answer.workflow.steps.push({locator:{by:'role',value:'button',name:'Delete'},action:'click'});
   if(alteration==='api')answer.api={object:'Account',fields:['Invented__c'],expected:{Invented__c:'true'}};
   if(alteration==='outcome')answer.workflow.assertion.text='Invented success';
   for(const item of s.answers)s.reviews.review(s.study.scope,item.questionId===q.id?{...item,answer}:item);const c=await compile(s);assert.equal(c.model,undefined,alteration);assert.ok(c.questions.length>0);
  }finally{s.h.close();}}
});
test('host fixture evidence is org/persona/version bound and cannot be relabeled as actual Salesforce',async()=>{
 const s=await setup();try{assert.throws(()=>readFixtureApplicationObservation(s.h,s.hash,'foreign','QA'),/scoped/);assert.throws(()=>readFixtureApplicationObservation(s.h,s.hash,s.study.scope.org,'Other'),/scoped/);
  const changed=structuredClone(s.f.org);changed.source='salesforce-api';assert.throws(()=>discoverApplication({...s.f,org:changed,permission:'QA',fixtureReceipts:[s.hash]},s.h));
  s.h.db.prepare('UPDATE fixture_application_observations SET payload=? WHERE hash=?').run('{}',s.hash);assert.throws(()=>readFixtureApplicationObservation(s.h,s.hash,s.study.scope.org,'QA'),/changed/);
 }finally{s.h.close();}
});
test('observed facts and hypotheses stay outside verified retrieval; only reviewed requirements enter trusted local knowledge',async()=>{
 const s=await setup();try{acceptAll(s);const index=new KnowledgeIndex(s.h),counts=await indexApplicationKnowledge(s.h,s.study,index,[{text:'Unverified Contact reverse navigation hypothesis',sourceIds:[s.study.pages[1].source]}]);assert.equal(counts.verifiedExecutionLessons,0);assert.equal(index.all(s.study.scope).filter(d=>d.status==='observed').length,3);assert.equal(index.all(s.study.scope).filter(d=>d.status==='proposed').length,1);assert.ok((await index.retrieve('Contact Account fixture',s.study.scope)).every(d=>d.kind==='requirement'));assert.deepEqual(await index.retrieve('Contact', {...s.study.scope,permission:'foreign'}),[]);await assert.rejects(indexApplicationKnowledge(s.h,s.study,index,[{text:'No source',sourceIds:[digest('unknown')]}]));
 }finally{s.h.close();}
});
test('application report escapes operator text, retains source versions and does not grant execution',async()=>{
 const s=await setup();try{const q=s.study.questions.find(q=>q.kind==='page')!,a=s.answers.find(a=>a.questionId===q.id)!;s.reviews.review(s.study.scope,{...a,answer:{text:'<script>unsafe()</script>'}});const r=await writeApplicationReport(s.h,{study:s.study,org:s.f.org}),html=await readFile(r.html,'utf8');assert.ok(!html.includes('<script>unsafe()'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Observed and suggested multi-object workflows'));assert.ok(html.includes(s.study.version));assert.equal(r.executionAuthorized,false);
  const tampered=structuredClone(s.study);tampered.objects.push('Invented');assert.notEqual(applicationStudyHash(tampered),tampered.version);await assert.rejects(writeApplicationReport(s.h,{study:tampered,org:s.f.org}));
 }finally{s.h.close();}
});
test('application publication rejects embedding/remote adapters before any transmission or knowledge write',async()=>{
 const s=await setup();let requests=0;try{acceptAll(s);const index=new KnowledgeIndex(s.h,async()=>{requests++;return[[1,0]];});await assert.rejects(indexApplicationKnowledge(s.h,s.study,index),/local-only/);assert.equal(requests,0);assert.equal(index.all(s.study.scope).length,0);}finally{s.h.close();}
});
test('visible alerts and busy indicators remain facts; hidden signals, inspection bounds and inaccessible internals stay explicit',async()=>{
 const server=lightningFixture();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await launchLocalBrowser();try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}/s/contacts`);await page.setContent('<div role="alert"></div><div class="slds-spinner" style="width:10px;height:10px"></div><div aria-busy="true" hidden></div><h1>Workspace</h1>');const facts=await collectFixturePageFacts(page,digest('state'));assert.equal(facts.visible.loading,1);await page.locator('[role=alert]').evaluate(e=>{(e as HTMLElement).style.cssText='width:10px;height:10px';});assert.equal((await collectFixturePageFacts(page,digest('alert-state'))).visible.errors,1);assert.ok(facts.unknowns.some(u=>u.includes('inaccessible')));
  await page.setContent('<h1>Workspace</h1>'+Array.from({length:520},()=>'<div></div>').join(''));const bounded=await collectFixturePageFacts(page,digest('bounded-state'));assert.equal(bounded.complete,false);assert.ok(bounded.unknowns.some(u=>u.includes('node bound')));
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
test('fixture navigation needs exact reviewed target, cannot escape origin and cannot reuse an action on a different page',async()=>{
 const s=await setup(),server=lightningFixture();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,path='/lightning/o/Account',target='/s/contacts',input={mode:'FIXTURE',syntheticOnly:true,origin,reviewer:'Fixture Reviewer',source:'fixture:explicit-navigation',paths:[path,target],actions:[{path,locator:{by:'role',value:'link',name:'View contacts'},action:'click',navigation:{targetPath:target,source:'fixture:read-navigation',readOnlyReviewed:true}},{path,locator:{by:'role',value:'heading',name:'Synthetic account draft'},action:'click'}],maxActions:2,maxMs:5000},application={scope:s.payload.scope,history:s.h};
 try{const r=await exploreFixture(input,{application});assert.equal(r.actions,1);assert.deepEqual(r.executedActionRefs,[0]);assert.equal(r.transitions[0].toPath,target);const unknown=structuredClone(input);delete (unknown.actions[0] as any).navigation;await assert.rejects(exploreFixture(unknown,{application}));const escaped=structuredClone(input);escaped.actions[0].navigation!.targetPath='//external.invalid/path';await assert.rejects(exploreFixture(escaped,{application}),/navigation/);}finally{s.h.close();await new Promise<void>(r=>server.close(()=>r()));}
});

async function layoutFixture(){const f=await applicationIntelligenceFixture();return IntelligenceSchema.parse({orgAlias:f.org.orgAlias,observedAt:new Date().toISOString(),identity:{Id:'00D000000000001',userId:'005000000000001',IsSandbox:true},catalogCount:2,selection:{selected:[],unresolved:[],omitted:[],status:'proposed'},snapshot:f.org,sections:[],unknowns:[]});}
test('documented View layout adapter binds identity, bounds reads and adds source-linked layout-only field dependencies',async()=>{
 const input=await layoutFixture(),paths:string[]=[],client={apiVersion:'v65.0',identity:async()=>input.identity,get:async(path:string)=>{paths.push(path);return{objectApiName:'Account',sections:[{layoutRows:[{layoutItems:[{required:true,layoutComponents:[{componentType:'Field',apiName:'Name'},{componentType:'Field',apiName:'Invented__c'}]}]}]}]};}} as unknown as IntelligenceReader,result=await discoverApplicationLayouts(client,input,{maxObjects:1});assert.equal(paths.length,1);assert.ok(paths[0].endsWith('/ui-api/layout/Account?layoutType=Full&mode=View&formFactor=Large'));assert.equal(result.intelligence.sections[0].status,'partial');assert.ok(result.intelligence.unknowns.includes('Application layout object budget omitted objects'));assert.equal(result.graph.nodes.find(n=>n.id==='LayoutField:Account.Name')!.details!.scope,'layout-only');assert.ok(result.graph.edges.some(e=>e.relation==='presents'));assert.ok(!result.graph.nodes.some(n=>n.id.includes('Invented__c')));
});
test('layout denied/malformed/foreign responses remain unknown with safe diagnostics; cross-user identity prevents reads',async()=>{
 const input=await layoutFixture();let calls=0;const client={apiVersion:'v65.0',identity:async()=>({...input.identity,userId:'005000000000002'}),get:async()=>{calls++;throw Error('Bearer secret-provider-body');}} as unknown as IntelligenceReader;await assert.rejects(discoverApplicationLayouts(client,input),/identity/);assert.equal(calls,0);client.identity=async()=>input.identity;
 for(const get of [async()=>{throw Error('Bearer secret-provider-body');},async()=>({objectApiName:'Contact',sections:[]}),async()=>({objectApiName:'Account',sections:'malformed'})]){client.get=get as IntelligenceReader['get'];const result=await discoverApplicationLayouts(client,input,{maxObjects:1});assert.equal(result.intelligence.sections[0].status,'unknown');assert.ok(!JSON.stringify(result).includes('secret-provider-body'));}
});
