import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserFixture} from './support/browser-policy.js';
import {digest,browserPlanHash} from '../src/execution/browser-policy.js';
import {recordLightningReadiness,requireLightningReadiness} from '../src/execution/lightning-proof.js';
import {acquireRenderedWorkflowEvidence} from '../src/agents/workflow-evidence.js';
import {lightningViewHash} from '../src/execution/lightning-view.js';
import {selectLightningObservationObject} from '../src/execution/lightning-review.js';
import {lightningEngineHash} from '../src/execution/lightning-engine.js';
import {BrowserDebugPolicySchema} from '../src/execution/browser-debug-policy.js';

test('Contact rendering receipts import exact Contact locators but cannot authorize an Account lifecycle',()=>{
 const b=browserFixture();try{b.plan.objects=['Contact'];b.plan.records=[{object:'Contact',id:'003000000000001',purpose:'observation-only'}];b.plan.engineProfileHash=lightningEngineHash();const view={version:1,object:'Contact',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('fixture-contact-view'),recordName:{by:'role',value:'heading',name:'{{record-name}}'},content:[{by:'role',value:'tab',name:'Details'}],busy:[],faults:[],stableMs:100};b.plan.renderContractHash=lightningViewHash(view);const review=b.approve();assert.equal(selectLightningObservationObject(review),'Contact');assert.throws(()=>selectLightningObservationObject(review,'Account'),/outside/);assert.throws(()=>selectLightningObservationObject(review,'Opportunity'));const proof=recordLightningReadiness(b.history,review,{status:'rendered-reviewed-view',object:'Contact',nativeDocumentVerified:true,independentReferenceUnchanged:true,validation:'offline-mocked-salesforce',measuredAt:new Date().toISOString()}),report={policyHash:review.approval.hash,referenceUnchanged:true,readinessProof:proof,validation:'offline-mocked-salesforce'};
 const evidence=acquireRenderedWorkflowEvidence(b.history,review,report,view);assert.ok(evidence.claims[0].text.includes('/Contact/'));assert.ok(evidence.claims.some(c=>c.text.includes('Details')));assert.throws(()=>acquireRenderedWorkflowEvidence(b.history,review,report,{...view,object:'Account'}),/differs/);const renamed=structuredClone(review);renamed.plan.referenceDisplayFields={Contact:'Name'};renamed.approval.hash=browserPlanHash(renamed.plan);assert.throws(()=>acquireRenderedWorkflowEvidence(b.history,renamed,{...report,policyHash:renamed.approval.hash},view),/display field/);const owned=structuredClone(review);owned.plan.records=[];owned.plan.ownedDataPlanHash=digest('fixture-data');owned.plan.liveReadinessProofHash=proof.hash;owned.approval.hash=browserPlanHash(owned.plan);assert.throws(()=>requireLightningReadiness(b.history,owned,'offline-mocked-salesforce'),/Contact proof/);
 }finally{b.history.close();}
});

test('rendered Account journal evidence preserves exact versions and cannot turn offline evidence into live mutation authority',()=>{
  const b=browserFixture();try{
    b.plan.engineProfileHash=lightningEngineHash();b.plan.renderContractHash=digest('view');const observed=structuredClone(b.approve()),result={status:'rendered-reviewed-view',object:'Account' as const,nativeDocumentVerified:true,independentReferenceUnchanged:true,validation:'offline-mocked-salesforce' as const,measuredAt:new Date().toISOString()},proof=recordLightningReadiness(b.history,observed,result),owned=structuredClone(observed);
    assert.equal(proof.mutationApprovalGranted,false);owned.plan.records=[];owned.plan.ownedDataPlanHash=digest('new-data-plan');owned.plan.liveReadinessProofHash=proof.hash;owned.approval.hash=browserPlanHash(owned.plan);
    assert.equal(requireLightningReadiness(b.history,owned,'offline-mocked-salesforce').mutationApprovalGranted,false);assert.throws(()=>requireLightningReadiness(b.history,owned,'live-salesforce'),/not live/);
    const changed=structuredClone(owned);changed.plan.sessionStateHash=digest('other-state');changed.approval.hash=browserPlanHash(changed.plan);assert.throws(()=>requireLightningReadiness(b.history,changed,'offline-mocked-salesforce'));
    assert.throws(()=>recordLightningReadiness(b.history,observed,{...result,status:'review-required'}));assert.throws(()=>recordLightningReadiness(b.history,observed,{...result,independentReferenceUnchanged:false}));
    b.history.db.prepare('UPDATE lightning_readiness SET payload=?').run('{}');assert.throws(()=>requireLightningReadiness(b.history,owned,'offline-mocked-salesforce'));
  }finally{b.history.close();}
});

test('visual-enabled readiness requires screenshot evidence and preserves the reviewed masking policy',()=>{
  const b=browserFixture();try{
    b.plan.engineProfileHash=lightningEngineHash();b.plan.renderContractHash=digest('view');b.plan.visualDebug=BrowserDebugPolicySchema.parse({permission:'approved-masked-local-only',maxCaptures:4,maxTotalBytes:1048576,maxCaptureMs:500,milestonesMs:[0],maskLocators:[],residualSensitiveContentAcknowledged:true});const observed=structuredClone(b.approve()),result={status:'rendered-reviewed-view',object:'Account' as const,nativeDocumentVerified:true,independentReferenceUnchanged:true,validation:'offline-mocked-salesforce' as const,measuredAt:new Date().toISOString()};
    assert.throws(()=>recordLightningReadiness(b.history,observed,result),/screenshot/);const proof=recordLightningReadiness(b.history,observed,{...result,visualEvidenceHash:digest('local-manifest-with-rendered-view-capture')}),owned=structuredClone(observed);owned.plan.records=[];owned.plan.ownedDataPlanHash=digest('data-plan');owned.plan.liveReadinessProofHash=proof.hash;owned.approval.hash=browserPlanHash(owned.plan);assert.equal(requireLightningReadiness(b.history,owned,'offline-mocked-salesforce').mutationApprovalGranted,false);
    owned.plan.visualDebug!.maxCaptures=5;owned.approval.hash=browserPlanHash(owned.plan);assert.throws(()=>requireLightningReadiness(b.history,owned,'offline-mocked-salesforce'),/visual evidence/);
  }finally{b.history.close();}
});
