import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { prepareStaticReview,staticPlanHash } from '../src/execution/dedicated-static.js';
import { auditStaticDependencies } from '../src/execution/dependency-review.js';
const definition='https://b.static.lightning.force.com/ind138.sfdc-fixture/auraCmpDef?_def=markup%3A%2F%2Fforce%3ArecordHome&_uid=fixture&_style=old';
test('exact source-backed style variants remain unapproved and cannot be treated as causal or normalized into a grant',()=>{
  const history=new History(':memory:'),f=dedicatedFixture(history);try{const prior=prepareStaticReview({assets:[{url:definition,type:'script'}]},f.policy,f.identity,f.input.spec.version),observed={assets:[{url:definition.replace('_style=old','_style=first'),type:'script'},{url:definition.replace('_style=old','_style=second'),type:'script'}]},draft=prepareStaticReview({assets:[...prior.plan.assets,...observed.assets]},f.policy,f.identity,f.input.spec.version),audit=auditStaticDependencies(draft,prior,observed,f.policy);
    assert.equal(audit.addedResources,2);assert.equal(audit.removedResources,0);assert.equal(audit.additionalOrigins,0);assert.ok(audit.changes.every(c=>c.changedParameterNames.length===1&&c.changedParameterNames[0]==='_style'));assert.equal(audit.approvalActivated,false);assert.equal(audit.readOperationsAuthorized,0);assert.equal(audit.recordWritesAuthorized,0);assert.equal(audit.denialsProvenCausal,false);assert.ok(!JSON.stringify(audit).includes('https://'));
    assert.throws(()=>auditStaticDependencies(draft,prior,{assets:[]},f.policy),/source/);
  }finally{history.close();}
});
test('resource audit rejects changed org/version/policy/hash and unsupported credential-bearing sources',()=>{
  const history=new History(':memory:'),f=dedicatedFixture(history);try{const prior=prepareStaticReview({assets:[{url:definition,type:'script'}]},f.policy,f.identity,f.input.spec.version),observed={assets:[{url:definition,type:'script'}]};for(const change of [{orgId:'00D999999999999'},{specVersion:'foreign'}]){const plan={...prior.plan,...change};assert.throws(()=>auditStaticDependencies({plan,approval:{...prior.approval,hash:staticPlanHash(plan)}},prior,observed,f.policy),/binding/);}assert.throws(()=>auditStaticDependencies({...prior,approval:{...prior.approval,hash:'0'.repeat(64)}},prior,observed,f.policy));assert.throws(()=>auditStaticDependencies(prior,prior,observed,{...f.policy,mode:'PRODUCTION_READ_ONLY_QA'}));assert.throws(()=>auditStaticDependencies(prior,prior,{assets:[{url:definition+'&access_token=private',type:'script'}]},f.policy));
  }finally{history.close();}
});
