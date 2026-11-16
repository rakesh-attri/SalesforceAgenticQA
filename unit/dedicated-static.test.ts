import {localLaunchOptions} from '../src/execution/local-browser.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { prepareStaticReview,authorizeStaticReview,matchesStaticReview } from '../src/execution/dedicated-static.js';
import { installDedicatedBoundary,type DedicatedGuard } from '../src/execution/dedicated-browser.js';
import { fetchReviewedStatic,StaticTransportError,type StaticContextFactory } from '../src/execution/static-transport.js';
type GetOptions=Parameters<Awaited<ReturnType<StaticContextFactory>>['get']>[1];
const asset='https://b.static.lightning.force.com/framework/safe.js';
function approved(f:ReturnType<typeof dedicatedFixture>){const draft=prepareStaticReview({assets:[{url:asset,type:'script'}]},f.policy,f.identity,f.input.spec.version);return {...draft,approval:{...draft.approval,operator:f.policy.approval.operator}};}

test('static asset grants bind exact named org/user/policy/spec/URL and never enable actions or normal Production modes',()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try{const review=approved(f);authorizeStaticReview(review,f.policy,f.identity,f.input.spec.version);assert.equal(matchesStaticReview(review,{url:asset,type:'script',method:'GET'}),true);
    for(const request of [{url:asset,type:'document',method:'GET'},{url:asset,type:'script',method:'POST'},{url:asset+'?changed=1',type:'script',method:'GET'}])assert.equal(matchesStaticReview(review,request),false);
    for(const url of ['https://b.static.lightning.force.com/services/data/v62.0/sobjects/Account','https://b.static.lightning.force.com/secur/frontdoor.jsp?otp=private','https://b.static.lightning.force.com/framework/safe.js?access_token=private','https://evil.example/safe.js',`${f.browserOrigin}/apex/FinancialPage.js`,'https://other-org.my.salesforce.com/resource/safe.js'])assert.throws(()=>prepareStaticReview({assets:[{url,type:'script'}]},f.policy,f.identity,f.input.spec.version));
    assert.throws(()=>authorizeStaticReview(review,{...f.policy,mode:'PRODUCTION_READ_ONLY_QA'},f.identity,f.input.spec.version));assert.throws(()=>authorizeStaticReview(review,f.policy,{...f.identity,Id:'00D999999999999'},f.input.spec.version));assert.throws(()=>authorizeStaticReview(review,f.policy,f.identity,'changed'));assert.deepEqual(f.policy.allowedOrigins,[f.origin,f.browserOrigin]);
    const definition='https://b.static.lightning.force.com/ind138.sfdc-fixture/auraCmpDef?_def=markup%3A%2F%2Fforce%3ArecordHome&_uid=fixture';
    const metadata=prepareStaticReview({assets:[{url:definition,type:'script'}]},f.policy,f.identity,f.input.spec.version);assert.equal(metadata.plan.assets.length,1);
    for(const url of [definition+'&message=action',definition+'&access_token=private',definition.replace('auraCmpDef','aura'),definition.replace('/ind138.sfdc-fixture/','/services/')])assert.throws(()=>prepareStaticReview({assets:[{url,type:'script'}]},f.policy,f.identity,f.input.spec.version));
    assert.throws(()=>prepareStaticReview({assets:[{url:definition,type:'stylesheet'}]},f.policy,f.identity,f.input.spec.version));
  }finally{h.close();}
});

test('real headless static grant composes with other routes, strips authorization/referrer and blocks unknown CDN actions',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),browser=await chromium.launch(localLaunchOptions()),id='001000000000001',document=`${f.browserOrigin}/lightning/r/Account/${id}/view`;let assetRequests=0,blocked=0;
  try {const context=await browser.newContext({serviceWorkers:'block',extraHTTPHeaders:{Authorization:'Bearer private-header'}});await context.route('**/*',async route=>{
      if(route.request().url()===document)return route.fulfill({contentType:'text/html',body:`<h1>Owned fixture</h1><script src="${asset}"></script><script src="${asset.replace('safe.js','unapproved.js')}"></script>`});
      throw Error('Unexpected request escaped guard');
    });
    const guard:DedicatedGuard={policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[document],owned:[{object:'Account',id}],expiresAt:f.policy.approval.expiresAt,staticReview:approved(f)};await installDedicatedBoundary(context,guard,()=>blocked++,async(r,p,i,s,q)=>fetchReviewedStatic(r,p,i,s,q,async options=>{assert.deepEqual(options,{storageState:{cookies:[],origins:[]},ignoreHTTPSErrors:false});return {get:async(url:string,options:GetOptions)=>{assetRequests++;assert.equal(url,asset);assert.ok(!options?.headers);return {status:()=>200,headers:()=>({'content-type':'application/javascript','set-cookie':'private=value'}),body:async()=>Buffer.from('document.body.dataset.staticLoaded="yes";')};},dispose:async()=>{}} as unknown as Awaited<ReturnType<StaticContextFactory>>;}));
    const page=await context.newPage();await page.goto(document);assert.equal(await page.locator('body').getAttribute('data-static-loaded'),'yes');assert.equal(assetRequests,1);assert.ok(blocked>=1);
    const denied=await page.evaluate(async url=>fetch(url,{method:'POST',body:'mutate'}).then(()=>false,()=>true),asset);assert.equal(denied,true);assert.equal(assetRequests,1);
  }finally{await browser.close();h.close();}
});

test('browser cookies cannot reach a separately approved static origin or receive its Set-Cookie',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),browser=await chromium.launch(localLaunchOptions()),id='001000000000001',document=`${f.browserOrigin}/lightning/r/Account/${id}/view`;let staticRequests=0;
  try {const context=await browser.newContext({serviceWorkers:'block'});await context.addCookies([{name:'unexpected-session',value:'private-cookie',domain:'b.static.lightning.force.com',path:'/',secure:true}]);
    await context.route('**/*',route=>{if(route.request().url()===document)return route.fulfill({contentType:'text/html',body:`<h1>Owned fixture</h1><script src="${asset}"></script>`});staticRequests++;return route.abort();});
    await installDedicatedBoundary(context,{policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[document],owned:[{object:'Account',id}],expiresAt:f.policy.approval.expiresAt,staticReview:approved(f)},undefined,async(r,p,i,s,q)=>fetchReviewedStatic(r,p,i,s,q,async options=>{assert.deepEqual(options.storageState,{cookies:[],origins:[]});return {get:async(_url:string,options:GetOptions)=>{assert.ok(!options?.headers);return {status:()=>200,headers:()=>({'content-type':'text/javascript','set-cookie':'new-private=value'}),body:async()=>Buffer.from('document.body.dataset.staticLoaded="yes";')};},dispose:async()=>{}} as unknown as Awaited<ReturnType<StaticContextFactory>>;}));const page=await context.newPage();await page.goto(document);assert.equal(staticRequests,0);assert.equal(await page.locator('body').getAttribute('data-static-loaded'),'yes');assert.equal((await context.cookies(asset)).some(c=>c.name==='new-private'),false);
  }finally{await browser.close();h.close();}
});

test('isolated static transport denies redirects, HTML, oversized bodies and unknown URLs without credentials or retries',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);let status=200,type='application/javascript',size=2,disposed=0,calls=0;
  const factory:StaticContextFactory=async options=>{assert.deepEqual(options,{storageState:{cookies:[],origins:[]},ignoreHTTPSErrors:false});return {get:async(url:string,options:GetOptions)=>{calls++;assert.equal(url,asset);assert.equal(options?.maxRedirects,0);assert.equal(options?.maxRetries,0);assert.ok(!options?.headers);return {status:()=>status,headers:()=>({'content-type':type}),body:async()=>Buffer.alloc(size)};},dispose:async()=>{disposed++;}} as unknown as Awaited<ReturnType<StaticContextFactory>>;};
  const run=(url=asset)=>fetchReviewedStatic(approved(f),f.policy,f.identity,f.input.spec.version,{url,type:'script',method:'GET'},factory);
  try{const response=await run();assert.deepEqual(Object.keys(response.headers).sort(),['access-control-allow-origin','cache-control','content-type','x-content-type-options']);status=302;await assert.rejects(run(),e=>e instanceof StaticTransportError&&e.code==='static-redirect');status=200;type='text/html';await assert.rejects(run(),e=>e instanceof StaticTransportError&&e.code==='static-content');type='text/javascript';size=8*1024*1024+1;await assert.rejects(run(),e=>e instanceof StaticTransportError&&e.code==='static-size');const before=calls;await assert.rejects(run(asset+'?unapproved=1'));assert.equal(calls,before);assert.equal(disposed,calls);}
  finally{h.close();}
});

test('guarded browser evidence distinguishes a failed isolated resource from an unapproved URL without leaking provider details',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),browser=await chromium.launch(localLaunchOptions()),id='001000000000001',document=`${f.browserOrigin}/lightning/r/Account/${id}/view`,reasons:string[]=[];let escaped=0;
  try{const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',route=>{if(route.request().url()===document)return route.fulfill({contentType:'text/html',body:`<h1>Owned fixture</h1><script src="${asset}"></script><script src="${asset.replace('safe.js','unknown.js')}"></script>`});escaped++;return route.abort();});
    await installDedicatedBoundary(context,{policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[document],owned:[{object:'Account',id}],expiresAt:f.policy.approval.expiresAt,staticReview:approved(f)},(_request,reason)=>reasons.push(reason??'unclassified'),async(r,p,i,s,q)=>fetchReviewedStatic(r,p,i,s,q,async()=>({get:async()=>({status:()=>302,headers:()=>{throw Error('private-provider-location');},body:async()=>{throw Error('private-provider-body');}}),dispose:async()=>{}} as unknown as Awaited<ReturnType<StaticContextFactory>>)));
    const page=await context.newPage();await page.goto(document);assert.equal(escaped,0);assert.ok(reasons.includes('static-redirect'));assert.ok(reasons.includes('policy-denied'));assert.ok(!JSON.stringify(reasons).includes('private-'));
  }finally{await browser.close();h.close();}
});
