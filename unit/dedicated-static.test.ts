import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { prepareStaticReview,authorizeStaticReview,matchesStaticReview } from '../src/execution/dedicated-static.js';
import { installDedicatedBoundary,type DedicatedGuard } from '../src/execution/dedicated-browser.js';
const asset='https://b.static.lightning.force.com/framework/safe.js';
function approved(f:ReturnType<typeof dedicatedFixture>){const draft=prepareStaticReview({assets:[{url:asset,type:'script'}]},f.policy,f.identity,f.input.spec.version);return {...draft,approval:{...draft.approval,operator:f.policy.approval.operator}};}

test('static asset grants bind exact named org/user/policy/spec/URL and never enable actions or normal Production modes',()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try{const review=approved(f);authorizeStaticReview(review,f.policy,f.identity,f.input.spec.version);assert.equal(matchesStaticReview(review,{url:asset,type:'script',method:'GET'}),true);
    for(const request of [{url:asset,type:'document',method:'GET'},{url:asset,type:'script',method:'POST'},{url:asset+'?changed=1',type:'script',method:'GET'}])assert.equal(matchesStaticReview(review,request),false);
    for(const url of ['https://b.static.lightning.force.com/services/data/v62.0/sobjects/Account','https://b.static.lightning.force.com/secur/frontdoor.jsp?otp=private','https://b.static.lightning.force.com/framework/safe.js?access_token=private','https://evil.example/safe.js',`${f.browserOrigin}/apex/FinancialPage.js`,'https://other-org.my.salesforce.com/resource/safe.js'])assert.throws(()=>prepareStaticReview({assets:[{url,type:'script'}]},f.policy,f.identity,f.input.spec.version));
    assert.throws(()=>authorizeStaticReview(review,{...f.policy,mode:'PRODUCTION_READ_ONLY_QA'},f.identity,f.input.spec.version));assert.throws(()=>authorizeStaticReview(review,f.policy,{...f.identity,Id:'00D999999999999'},f.input.spec.version));assert.throws(()=>authorizeStaticReview(review,f.policy,f.identity,'changed'));assert.deepEqual(f.policy.allowedOrigins,[f.origin,f.browserOrigin]);
  }finally{h.close();}
});

test('real headless static grant composes with other routes, strips authorization/referrer and blocks unknown CDN actions',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),browser=await chromium.launch({headless:true}),id='001000000000001',document=`${f.browserOrigin}/lightning/r/Account/${id}/view`;let assetRequests=0,blocked=0;
  try {const context=await browser.newContext({serviceWorkers:'block',extraHTTPHeaders:{Authorization:'Bearer private-header'}});await context.route('**/*',async route=>{
      if(route.request().url()===document)return route.fulfill({contentType:'text/html',body:`<h1>Owned fixture</h1><script src="${asset}"></script><script src="${asset.replace('safe.js','unapproved.js')}"></script>`});
      if(route.request().url()===asset){assetRequests++;const headers=await route.request().allHeaders();assert.ok(!headers.authorization);assert.ok(!headers.referer);return route.fulfill({contentType:'application/javascript',body:'document.body.dataset.staticLoaded="yes";'});}throw Error('Unexpected request escaped guard');
    });
    const guard:DedicatedGuard={policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[document],owned:[{object:'Account',id}],expiresAt:f.policy.approval.expiresAt,staticReview:approved(f)};await installDedicatedBoundary(context,guard,()=>blocked++);
    const page=await context.newPage();await page.goto(document);assert.equal(await page.locator('body').getAttribute('data-static-loaded'),'yes');assert.equal(assetRequests,1);assert.ok(blocked>=1);
    const denied=await page.evaluate(async url=>fetch(url,{method:'POST',body:'mutate'}).then(()=>false,()=>true),asset);assert.equal(denied,true);assert.equal(assetRequests,1);
  }finally{await browser.close();h.close();}
});

test('unexpected cookies cannot be sent to a separately approved static origin',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),browser=await chromium.launch({headless:true}),id='001000000000001',document=`${f.browserOrigin}/lightning/r/Account/${id}/view`;let staticRequests=0;
  try {const context=await browser.newContext({serviceWorkers:'block'});await context.addCookies([{name:'unexpected-session',value:'private-cookie',domain:'b.static.lightning.force.com',path:'/',secure:true}]);
    await context.route('**/*',route=>{if(route.request().url()===document)return route.fulfill({contentType:'text/html',body:`<script src="${asset}"></script>`});staticRequests++;return route.abort();});
    await installDedicatedBoundary(context,{policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[document],owned:[{object:'Account',id}],expiresAt:f.policy.approval.expiresAt,staticReview:approved(f)});const page=await context.newPage();await page.goto(document);assert.equal(staticRequests,0);
  }finally{await browser.close();h.close();}
});
