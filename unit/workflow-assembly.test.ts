import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workflowIntelligenceFixture} from '../src/demos/workflow-intelligence.js';
import {prepareMultiObjectJourney} from '../src/agents/workflow-assembly.js';
import {JourneyEvidenceSchema,reviewJourneyEvidence} from '../src/agents/workflow-evidence.js';
import {journeyModelHash} from '../src/agents/workflow-models.js';
import {planWorkflowJourney} from '../src/agents/workflow-planning.js';
import {History} from '../src/core/history.js';
import {KnowledgeIndex} from '../src/knowledge/index.js';
import {WorkflowModelStore} from '../src/agents/workflow-models.js';
import {digest} from '../src/execution/browser-policy.js';

test('multi-object assembly preserves real Describe relationships and permission uncertainty, leaving missing pages/outcomes as questions',async()=>{
 const f=await workflowIntelligenceFixture(),input={spec:f.spec,org:f.org,graph:f.graph,permission:'QA',pages:[]},prepared=prepareMultiObjectJourney(input);
 assert.equal(prepared.status,'source-incomplete');assert.equal(prepared.model,undefined);assert.ok(prepared.relationships.some(s=>s.claims.some(c=>c.text.includes('AccountId'))));assert.ok(prepared.permissions.every(s=>s.claims[0].text.includes('"executionPermissionGranted":false')));assert.ok(prepared.questions.some(q=>q.includes('Contact: journal-backed')));assert.equal(prepared.executionAuthorized,false);
 const foreign=JourneyEvidenceSchema.parse({id:digest('foreign'),version:digest('v'),org:'foreign',permission:'QA',kind:'browser',claims:[{kind:'locator',text:'https://qa.lightning.force.com/lightning/r/Account/template/view',component:'SObject:Account'}],sourceHashes:[digest('source')],verification:'rendered-reviewed-view',validation:'offline-mocked-salesforce'});assert.throws(()=>prepareMultiObjectJourney({...input,pages:[{object:'Account',evidence:foreign}]}),/scoped/);assert.throws(()=>prepareMultiObjectJourney({...input,pages:[{object:'Account',evidence:{...foreign,org:f.model.scope.org,validation:'live-salesforce'}}]}),/host rendering journal/);
});

test('reviewed observed Account -> Contact transitions compile through existing planner; invented locators or inferred metadata transitions fail',async()=>{
 const f=await workflowIntelligenceFixture(),history=new History(':memory:');try{
 const bindings=f.model.steps.map(step=>({object:step.object,criterionId:step.outcomes[0].criterionId,kind:step.outcomes[0].kind,workflow:{...step.outcomes[0].workflow!,origin:'https://qa.lightning.force.com',path:`/lightning/r/${step.object}/{{record:${step.object}}}/view`}}));
 const pages=bindings.map(b=>({object:b.object,evidence:reviewJourneyEvidence(JourneyEvidenceSchema.parse({id:digest(`page:${b.object}`),version:digest('v1'),org:f.model.scope.org,permission:'QA',kind:'browser',claims:[{kind:'prerequisite',text:'Synthetic reviewed fixture data only; no live authority'},{kind:'locator',text:new URL(b.workflow.path,b.workflow.origin).href,component:`SObject:${b.object}`},{kind:'locator',text:JSON.stringify(b.workflow.assertion.locator),component:`SObject:${b.object}`}],sourceHashes:[digest('fixture-rendered-page')],verification:'rendered-reviewed-view',validation:'offline-mocked-salesforce'}),'Fixture Reviewer')}));
 const transition=reviewJourneyEvidence(JourneyEvidenceSchema.parse({id:digest('transition'),version:digest('v1'),org:f.model.scope.org,permission:'QA',kind:'browser',claims:[{kind:'transition',text:JSON.stringify({from:'Account',to:'Contact'})}],sourceHashes:[digest('fixture-observed-transition')],verification:'rendered-reviewed-view',validation:'offline-mocked-salesforce'}),'Fixture Reviewer');
 const input={...f,permission:'QA',pages,bindings,transitions:[transition]},prepared=prepareMultiObjectJourney(input);assert.equal(prepared.status,'model-review-required');assert.ok(prepared.model);assert.equal(prepared.model.steps[0].transitions[0].target,'Contact');
 const model=prepared.model;model.sources=model.sources.map(s=>reviewJourneyEvidence(s,'Fixture Reviewer'));model.version=journeyModelHash(model);model.review={reviewer:'Fixture Reviewer',hash:model.version};new WorkflowModelStore(history).observe(model.sources);const plan=await planWorkflowJourney(model,f.spec,f.org,f.graph,new KnowledgeIndex(history),history,['SObject:Account']);assert.equal(plan.files.length,2);assert.equal(plan.executionAuthorized,false);assert.ok(plan.files.every(file=>file.code.includes('REVIEW_REQUIRED-journey-guard.json')));
 assert.throws(()=>prepareMultiObjectJourney({...input,bindings:[{...bindings[0],workflow:{...bindings[0].workflow,assertion:{...bindings[0].workflow.assertion,locator:{by:'testId',value:'invented'}}}}]}),/locator/);assert.throws(()=>prepareMultiObjectJourney({...input,transitions:prepared.relationships}),/Transitions/);
 }finally{history.close();}
});
