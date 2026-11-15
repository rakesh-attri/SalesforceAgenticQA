import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserFixture} from './support/browser-policy.js';
import {digest,browserPlanHash} from '../src/execution/browser-policy.js';
import {recordLightningReadiness,requireLightningReadiness} from '../src/execution/lightning-proof.js';
import {lightningEngineHash} from '../src/execution/lightning-engine.js';

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
