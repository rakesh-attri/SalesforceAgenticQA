import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {testDesignFixture,demonstrateTestDesign} from '../src/demos/test-design.js';
import {designSalesforceTests,reasonAboutTestDesign,testDesignAIPayload,apiVerificationProposal} from '../src/agents/test-design.js';
import {analyzeChangeImpact} from '../src/agents/component-graph.js';
import {analyzeRequirementConditions} from '../src/agents/spec-intelligence.js';
import {parseUnstructured,parseText} from '../src/specs/ingest.js';
import {WorkflowModelStore,journeyModelHash} from '../src/agents/workflow-models.js';
import {reviewJourneyEvidence} from '../src/agents/workflow-evidence.js';
import {History} from '../src/core/history.js';
import {KnowledgeIndex} from '../src/knowledge/index.js';
import {fingerprint} from '../src/execution/browser-policy.js';
import {writeTestDesignReport} from '../src/agents/test-design-report.js';
import type {StructuredChat} from '../src/ai/types.js';
async function setup(){const f=await testDesignFixture(),history=new History(':memory:'),index=new KnowledgeIndex(history);new WorkflowModelStore(history).observe(f.model.sources);return{f,history,index,input:{...f,permission:'QA',changes:['Field:Contact.LastName']}};}

test('analyst retains literal Given/When/Then, numeric bounds and personas without inventing sparse-story outcomes',()=>{
 const text='As a sales rep I want Contact validation\nAcceptance criteria:\n- Given a Contact When at most 80 characters are entered Then the approved result is shown\n- Given a read-only persona When permission is denied Then access denied';
 const spec=parseUnstructured(text,'fixture:conditions','1'),analysis=analyzeRequirementConditions(spec);assert.equal(analysis.actors[0].name,'sales rep');assert.equal(analysis.criteria[0].boundaries[0].text,'at most 80 characters');assert.ok(analysis.criteria[0].clauses.some(c=>c.role==='when'));assert.equal(spec.acceptanceCriteria[1].kind,'permission');assert.equal(analysis.criteria[0].expected,undefined);
 const sparse=parseUnstructured('As an analyst I want to review Contact changes','fixture:sparse','1');assert.equal(sparse.requiresReview,true);assert.equal(sparse.acceptanceCriteria[0].expectedText,undefined);assert.ok(analyzeRequirementConditions(sparse).questions.length);
 assert.equal(parseText('AC1: [regression] Known defect must remain fixed','fixture:kind','1').acceptanceCriteria[0].kind,'regression');
});
test('typed impact includes field consumers, Apex/LWC, declared Flow effects and evidence paths; unknowns and bounds remain explicit',async()=>{
 const {graph}=await testDesignFixture(),field=analyzeChangeImpact(graph,['Field:Contact.LastName']);for(const id of ['ApexClass:ContactRules','LWC:Draft','SObject:Contact','ValidationRule:Contact.Name'])assert.ok(field.components.includes(id));assert.ok(field.paths.every(p=>p.evidence.length));
 const flow=analyzeChangeImpact(graph,['Flow:Routing']);assert.ok(flow.components.includes('SObject:Contact'));assert.ok(flow.paths.some(p=>p.direction==='declared-effect'));assert.equal(flow.runtimeReachabilityVerified,false);assert.equal(analyzeChangeImpact(graph,['Unknown:Flow']).coverage,'incomplete');assert.equal(analyzeChangeImpact(graph,['Flow:Routing'],1).truncated,true);
});
test('seven-kind source-grounded design preserves literal outcomes, guarded proposals and API contracts; absent models emit no tests',async()=>{
 const s=await setup();try{const d=await designSalesforceTests(s.input,s);assert.equal(d.scenarios.length,7);assert.equal(d.files.length,7);assert.ok(d.files.filter(f=>f.kind==='playwright-typescript').every(f=>f.code.includes('REVIEW_REQUIRED-test-design-guard.json')));assert.equal(d.scenarios.find(s=>s.kind==='visual')!.status,'review-required');assert.ok(d.traceability.every(r=>r.evidence.length&&r.prerequisites.length&&r.dataRequirements.length));assert.equal(d.permissionsGranted,0);
  const noModel=await designSalesforceTests({...s.input,model:undefined},s);assert.equal(noModel.files.length,0);assert.ok(noModel.scenarios.every(c=>c.status==='review-required'));await assert.rejects(designSalesforceTests({...s.input,graph:{...s.f.graph,org:'foreign'}},s),/org\/source/);const tampered=structuredClone(s.f.graph);tampered.nodes[0].name='Changed without version';await assert.rejects(designSalesforceTests({...s.input,graph:tampered},s),/content changed/);
 }finally{s.history.close();}
});
test('reviewer blocks contradictory same-condition outcomes and unknown fields rather than changing assertions',async()=>{
 const s=await setup();try{const m=structuredClone(s.f.model),source=m.sources.find(s=>s.claims.some(c=>c.kind==='business-rule'))!;
  const a=JSON.parse(source.claims[1].text),b=JSON.parse(source.claims[2].text);b.when=a.when;source.claims[2].text=JSON.stringify(b);source.version=fingerprint(source.claims);Object.assign(source,reviewJourneyEvidence(source,'Fixture Reviewer'));m.version=journeyModelHash(m);m.review={reviewer:'Fixture Reviewer',hash:m.version};new WorkflowModelStore(s.history).observe(m.sources);
  const result=await designSalesforceTests({...s.input,model:m},s);assert.equal(result.contradictions.length,1);assert.ok(result.scenarios.filter(c=>['AC2','AC3'].includes(c.criterionId)).every(c=>c.status==='review-required'));assert.equal(result.files.some(f=>f.id==='design-negative'),false);
  const invalid=JSON.parse(source.claims[0].text);invalid.dataRequirements[0].field='Invented__c';source.claims[0].text=JSON.stringify(invalid);source.version=fingerprint(source.claims);Object.assign(source,reviewJourneyEvidence(source,'Fixture Reviewer'));m.version=journeyModelHash(m);m.review={reviewer:'Fixture Reviewer',hash:m.version};new WorkflowModelStore(s.history).observe(m.sources);const blocked=await designSalesforceTests({...s.input,model:m},s);assert.equal(blocked.files.some(f=>f.id==='design-positive'),false);
 }finally{s.history.close();}
});
test('persistent semantic retrieval and mocked Gemini influence ranking only after exact payload review; historical confirmation changes regression selection',async()=>{
 const demo=await demonstrateTestDesign();assert.equal(demo.scenarios,7);assert.equal(demo.historyInfluence.after>demo.historyInfluence.before,true);assert.equal(demo.historyInfluence.mandatory,true);assert.equal(demo.retrieval.persisted,true);assert.ok(demo.embeddingRequests>0);assert.equal(demo.chatRequests,1);assert.equal(demo.salesforceRequests,0);assert.equal(demo.liveModelRequests,0);
});
test('model suggestions reject unknown scenario IDs/citations, expired payloads and extra authority; cross-persona history cannot force selection',async()=>{
 const s=await setup();try{await s.index.ingest({id:'foreign-defect',version:'1',org:s.f.model.scope.org,permission:'Administrator',kind:'defect',status:'verified',text:'Account Contact known regression',testIds:['design-regression'],evidence:['fixture:foreign'],reviewer:'Fixture Reviewer',capturedAt:new Date().toISOString(),schemaVersion:s.f.model.scope.metadataVersion});const design=await designSalesforceTests(s.input,s);assert.ok(!design.scenarios.some(s=>s.mandatory));
  const payload=testDesignAIPayload(design),review={operator:'Fixture Reviewer',bundleHash:fingerprint(payload),destinations:['gemini-chat'],expiresAt:new Date(Date.now()+60000).toISOString()};let calls=0;const chat={generate:async()=>{calls++;return{priorities:[{scenarioId:'invented',priority:'high',citations:['unobserved']}],questions:[]};}} as unknown as StructuredChat;
  await assert.rejects(reasonAboutTestDesign(design,chat,{...review,bundleHash:'wrong'}));assert.equal(calls,0);await assert.rejects(reasonAboutTestDesign(design,chat,{...review,operator:'REVIEW_REQUIRED'}));assert.equal(calls,0);await assert.rejects(reasonAboutTestDesign(design,chat,review));assert.equal(calls,1);for(const value of [{priorities:[],questions:[],execute:true},{priorities:[{scenarioId:design.scenarios[0].id,priority:'high',citations:['foreign-citation']}],questions:[]}])await assert.rejects(reasonAboutTestDesign(design,{generate:async()=>value} as unknown as StructuredChat,review));await assert.rejects(reasonAboutTestDesign(design,chat,{...review,expiresAt:'2020-01-01T00:00:00Z'}));assert.equal(calls,1);
 }finally{s.history.close();}
});
test('independent API verification TypeScript validates exact row/ID/outcome with no HTTP authority; report escapes source markup',async()=>{
 await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/design-api-')),file=join(root,'verify.ts');const s=await setup();try{await writeFile(file,apiVerificationProposal('Account',['Name'],{Name:'Synthetic'}));const api=await import(pathToFileURL(file).href);assert.ok(api.queryForApprovedRecord('001000000000001').includes("WHERE Id='001000000000001' LIMIT 1"));assert.throws(()=>api.queryForApprovedRecord("x' OR Name!='"));assert.equal(api.verifyApprovedResponse({records:[{Id:'001000000000001',Name:'Synthetic'}]},'001000000000001').executionAuthority,false);assert.throws(()=>api.verifyApprovedResponse({records:[{Id:'001000000000001',Name:'Wrong'}]},'001000000000001'));
  const d=await designSalesforceTests(s.input,s);d.scenarios[0].expected='<script>unsafe()</script>';const report=await writeTestDesignReport(d),html=await readFile(report.html,'utf8');assert.ok(html.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));assert.ok(!html.includes('<script>unsafe()'));
 }finally{s.history.close();const rel=relative(resolve('.state'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
