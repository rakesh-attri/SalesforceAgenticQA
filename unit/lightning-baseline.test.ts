import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserFixture} from './support/browser-policy.js';
import {digest,fingerprint,authorizeBrowserSession,browserPlanHash} from '../src/execution/browser-policy.js';
import {lightningEngineProfile,lightningEngineHash} from '../src/execution/lightning-engine.js';
import {prepareNormalBaseline,importNormalBaseline,compareNormalBaseline} from '../src/execution/lightning-baseline.js';
import {prepareLightningArchitecture} from '../src/execution/lightning-review.js';

test('normal baseline requires named exact provenance and native identity/build; capture never grants unknown requests or rendering',()=>{
  const b=browserFixture();try{
    const review=b.approve(),declaration={transport:'normal-playwright-without-framework-routing',headless:true,driverVersion:lightningEngineProfile().driverVersion,capturedAt:new Date().toISOString(),captureEvidenceHash:digest('operator-capture-script')},raw={log:{entries:[{request:{url:`${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`,method:'GET',headers:[{value:'PRIVATE_HEADER_CANARY'}]},response:{status:200,content:{mimeType:'text/html',text:b.native}}}]}},bytes=Buffer.from(JSON.stringify(raw)),receipt=prepareNormalBaseline(bytes,review,declaration);
    assert.equal(receipt.approval.operator,'REVIEW_REQUIRED');assert.throws(()=>importNormalBaseline(bytes,review,receipt),/named/);
    receipt.approval.operator=review.approval.operator;const baseline=importNormalBaseline(bytes,review,receipt);assert.equal(baseline.permissionsGranted,0);assert.equal(baseline.renderingEstablished,false);assert.equal(baseline.trace.identityVerified,false);assert.ok(!JSON.stringify(baseline).includes('PRIVATE_'));assert.ok(!JSON.stringify(baseline).includes(b.recordId));
    const controlled={...baseline.trace,provenance:'framework-controlled',identityVerified:true};const comparison=compareNormalBaseline(baseline,controlled);assert.equal(comparison.rootCause,'unresolved');assert.equal(comparison.permissionsGranted,0);
    assert.throws(()=>prepareNormalBaseline(bytes,review,{...declaration,transport:'framework-native-reference'}));
    assert.throws(()=>prepareNormalBaseline(Buffer.from(JSON.stringify(raw).replace(b.f.identity.Id,'00D999999999999')),review,declaration),/identity/);
    assert.throws(()=>importNormalBaseline(Buffer.from(JSON.stringify({...raw,extra:'PRIVATE_VALUE'})),review,receipt),/named/);
  }finally{b.history.close();}
});

test('architecture preparation reuses resource/contracts without activating old grants or replaying run IDs',()=>{
  const b=browserFixture();try{
    const review=b.approve(),before=fingerprint(review),prepared=prepareLightningArchitecture(review,{runId:'new-reviewed-browser-run',stateHash:digest('new-reviewed-state')});
    assert.equal(fingerprint(review),before);assert.equal(prepared.review.approval.operator,'REVIEW_REQUIRED');assert.equal(prepared.review.plan.engineProfileHash,lightningEngineHash());assert.deepEqual(prepared.review.plan.resources,review.plan.resources);assert.deepEqual(prepared.review.plan.contracts,review.plan.contracts);assert.equal(prepared.summary.renderContract,'missing-actual-selector-review');assert.equal(prepared.summary.normalBaseline,'not-provided');
    assert.throws(()=>authorizeBrowserSession(prepared.review,b.f.policy,b.f.identity,b.build));assert.throws(()=>prepareLightningArchitecture(review,{runId:review.plan.runId,stateHash:digest('other')}));
    assert.equal(browserPlanHash(prepared.review.plan),prepared.review.approval.hash);
  }finally{b.history.close();}
});
