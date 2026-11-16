import {localLaunchOptions} from '../src/execution/local-browser.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { browserFixture } from './support/browser-policy.js';
import { probeReviewedBrowser } from '../src/execution/browser-runtime.js';
import { parseBrowserBuild } from '../src/execution/browser-build.js';
import { authorizeBrowserSession, browserPlanHash, fingerprint, digest, type BrowserReview } from '../src/execution/browser-policy.js';
import { prepareNativeInitializationReview } from '../src/execution/browser-review.js';
import { currentAppAction } from '../src/execution/browser-native-contracts.js';
import { sanitizeBrowserHar, compareBrowserTraces, browserTraceScope, summarizeBrowserExchange } from '../src/execution/browser-trace.js';
import { SalesforceClient } from '../src/salesforce/client.js';
import { browserNetworkDecision } from '../src/execution/browser-network.js';
import { chromium } from '@playwright/test';
import { installReviewedBrowserBoundary } from '../src/execution/browser-runtime.js';

test('undocumented current-app request needs a separate exact risk receipt and cannot be relabeled pure', () => {
  const b=browserFixture();
  try {
    const source={requestShapes:[{actionHash:digest(currentAppAction),exactSingleAction:true,query:{fingerprint:digest('?aura.OneController.getCurrentApp=1'),duplicateKeys:false},envelope:{unknownKeys:0,duplicateKeys:false},context:{frameworkHash:b.plan.buildHash,appHash:b.plan.appHash},parameters:{exactKeys:true,unknownKeys:0,valueHash:b.plan.selectedAppIdHash}}]};
    const candidate=prepareNativeInitializationReview(b.plan,source,b.f.policy.approval.operator);
    assert.throws(()=>authorizeBrowserSession(candidate,b.f.policy,b.f.identity,b.build));
    candidate.approval.operator=b.f.policy.approval.operator;
    assert.throws(()=>authorizeBrowserSession(candidate,b.f.policy,b.f.identity,b.build),/separate exact/);
    candidate.initializationApprovals[0].approval.operator=b.f.policy.approval.operator;
    candidate.initializationApprovals[0].approval.expiresAt=candidate.approval.expiresAt;
    authorizeBrowserSession(candidate,b.f.policy,b.f.identity,b.build);
    const request={url:b.f.browserOrigin+'/aura?aura.OneController.getCurrentApp=1',method:'POST',type:'xhr',body:b.body([{id:'1',descriptor:currentAppAction,params:{appContextIdOrName:b.appId}}])};
    assert.equal(browserNetworkDecision(candidate.plan,b.plan.records,request).allow,true);
    assert.equal(browserNetworkDecision(candidate.plan,b.plan.records,{...request,url:request.url.replace(b.f.browserOrigin,b.f.origin)}).allow,false);
    assert.equal(browserNetworkDecision(candidate.plan,b.plan.records,{...request,body:request.body+'&aura.pageURI=%2Fsetup'}).allow,false);
    const changed=structuredClone(candidate);changed.plan.contracts[0].parameters.extra={kind:'hash',valueHash:digest('extra')};changed.approval.hash=browserPlanHash(changed.plan);
    assert.throws(()=>authorizeBrowserSession(changed,b.f.policy,b.f.identity,b.build));
    candidate.plan.contracts[0].behavior.unknownEffects=false;candidate.approval.hash=browserPlanHash(candidate.plan);
    assert.throws(()=>authorizeBrowserSession(candidate,b.f.policy,b.f.identity,b.build),/cannot be declared/);
    assert.throws(()=>prepareNativeInitializationReview(b.plan,{requestShapes:[{...source.requestShapes[0],actionHash:digest('unknown')}]},b.f.policy.approval.operator));
  } finally { b.history.close(); }
});

test('headless native-reference and cached transport render scoped fixture only after explicit bootstrap and preserve original values', {timeout:30000}, async()=>{
  await mkdir('.auth',{recursive:true});const dir=await mkdtemp(resolve('.auth/browser-proof-')),state=join(dir,'state.json'),b=browserFixture();
  await writeFile(state,JSON.stringify({cookies:[],origins:[]}));
  b.plan.budgets.maxMs=8000;b.plan.transports=['native-reference','validated-cache'];b.plan.contracts=[b.contract()];
  const display='PRIVATE_ACCOUNT_DISPLAY_CANARY',script=`fetch('/aura?aura.OneController.getCurrentApp=1',{method:'POST',body:${JSON.stringify(b.body())}}).then(r=>r.json()).then(r=>{if(r.actions[0].state==='SUCCESS'){const h=document.createElement('h1');h.textContent=${JSON.stringify(display)};document.body.append(h);}});`;
  const review=b.approve();let apiChecks=0,bootstrapCalls=0;
  const input={review,parent:b.f.policy,history:b.history,statePath:state,apiOrigin:b.f.origin,identity:async()=>b.f.identity,verifyReferences:async()=>{apiChecks++;return{references:b.plan.records,privateDisplays:[{object:'Account' as const,id:b.recordId,display}],proof:{referenceVersions:[digest('unchanged')]}};},verifyContext:async()=>{},nativeBuild:async()=>parseBrowserBuild(b.native),
    prepareContext:async(context:import('@playwright/test').BrowserContext)=>{await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/aura'){bootstrapCalls++;return route.fulfill({json:{actions:[{state:'SUCCESS',returnValue:{appId:b.appId}}]}});}if(u.origin==='https://b.static.lightning.force.com')return route.fulfill({contentType:'application/javascript',body:script});return route.fulfill({contentType:'text/html',body:`<!doctype html><body>${b.native}<script src="${b.resource.replaceAll('&','&amp;')}"></script></body>`});});},resourceFetch:async()=>new Response(script,{headers:{'content-type':'application/javascript'}})};
  try {
    const reference=await probeReviewedBrowser({...input,transport:'native-reference'});
    const cached=await probeReviewedBrowser({...input,transport:'validated-cache',reference:reference.metrics!.trace});
    for(const report of [reference,cached]){assert.equal(report.validation,'offline-mocked-salesforce');assert.equal(report.referenceUnchanged,true);assert.equal((report.pages[0] as {recordNameVisible:boolean}).recordNameVisible,true);assert.equal(report.recordsCreated,0);assert.equal(report.generatedTestsExecuted,0);assert.equal(report.verifiedLearning,false);assert.equal(report.metrics!.blocked,0);assert.ok(!JSON.stringify(report).includes('PRIVATE_'));}
    assert.equal(bootstrapCalls,2);assert.equal(apiChecks,4);assert.equal(cached.metrics!.cacheMisses,1);assert.equal(cached.referenceComparison.rootCause,'unresolved');
    await assert.rejects(probeReviewedBrowser({...input,transport:'validated-cache'}),/budget exhausted/);
  }finally{b.history.close();await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('HAR comparison retains no credentials or values, distinguishes HTTP 200 Aura ERROR and never grants permissions',()=>{
  const b=browserFixture();try{
    const url=b.f.browserOrigin+'/aura?aura.OneController.getCurrentApp=1',body=b.body([{id:'1',descriptor:currentAppAction,params:{appContextIdOrName:b.appId}}]);
    const raw={log:{entries:[{request:{url,method:'POST',headers:[{name:'Authorization',value:'PRIVATE_TOKEN'}],cookies:[{value:'PRIVATE_COOKIE'}],postData:{text:body}},response:{status:200,content:{mimeType:'application/json',text:JSON.stringify({actions:[{state:'ERROR',returnValue:{Name:'PRIVATE_NAME',message:'PRIVATE_ERROR'}}]})}}}]}};
    const reference=sanitizeBrowserHar(raw,b.plan,b.plan.records),entry=summarizeBrowserExchange({url,method:'POST',type:'xhr',body},0,undefined,{allow:false,kind:'denied',contracts:[],reason:'unknown-action-or-query'});
    const controlled={...reference,scope:browserTraceScope(b.plan,b.plan.records),provenance:'framework-controlled',identityVerified:true,entries:[entry]};
    const comparison=compareBrowserTraces(reference,controlled);assert.equal(comparison.blockedDifferences[0].referenceSucceeded,false);assert.equal(comparison.permissionsGranted,0);assert.equal(comparison.rootCause,'unresolved');assert.ok(!JSON.stringify(reference).includes('PRIVATE_'));assert.ok(!JSON.stringify(reference).includes(b.appId));
    assert.throws(()=>compareBrowserTraces(reference,{...controlled,scope:{...controlled.scope,org:digest('other-org')}}));
  }finally{b.history.close();}
});

test('native public-resource credential denial is explicit while cached transport never forwards browser credentials',{timeout:20000},async()=>{
 const b=browserFixture(),browser=await chromium.launch(localLaunchOptions());b.plan.transports=['native-reference','validated-cache'];let publicEffects=0;
 try{const review=b.approve();
  for(const transport of ['native-reference','validated-cache'] as const){
   const context=await browser.newContext({serviceWorkers:'block'});await context.addCookies([{name:'sid',value:'PRIVATE_CDN_COOKIE',url:'https://b.static.lightning.force.com',secure:true,sameSite:'Lax'}]);
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin==='https://b.static.lightning.force.com'){publicEffects++;return route.fulfill({contentType:'application/javascript',body:'window.fixture=true;'});}return route.fulfill({contentType:'text/html',body:`<!doctype html><script src="${b.resource.replaceAll('&','&amp;')}"></script><h1>Fixture</h1>`});});
   const boundary=await installReviewedBrowserBoundary(context,{review,parent:b.f.policy,identity:b.f.identity,build:b.build,history:b.history,records:b.plan.records,transport,resourceFetch:async(_url,init)=>{assert.equal(init?.credentials,'omit');assert.ok(!JSON.stringify(init?.headers).includes('PRIVATE_'));return new Response('window.fixture=true;',{headers:{'content-type':'application/javascript'}});}});
   const page=await context.newPage();await page.goto(`${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`,{waitUntil:'domcontentloaded'});
   const metrics=await boundary.finish();assert.equal(metrics.publicCredentialRequests,1);assert.ok(!JSON.stringify(metrics).includes('PRIVATE_'));
   if(transport==='native-reference'){assert.equal(metrics.blocked,1);assert.ok(metrics.trace.entries.some(entry=>entry.reason==='public-resource-credentials'));}else{assert.equal(metrics.blocked,0);assert.equal(metrics.cacheMisses,1);}
   await context.close();
  }
  assert.equal(publicEffects,0);
 }finally{await browser.close();b.history.close();}
});

test('reviewed browser API facade reads only exact approved reference, checks active actor/app and exposes no write or generic transport',async()=>{
  const b=browserFixture(),originalFetch=globalThis.fetch,originalAuthenticate=Reflect.get(SalesforceClient,'authenticate'),client:SalesforceClient=Reflect.construct(SalesforceClient,[b.f.origin,'PRIVATE_TOKEN','v62.0']);
  client.identity=async()=>b.f.identity;Reflect.set(SalesforceClient,'authenticate',async()=>client);const queries:string[]=[];let active=true;
  globalThis.fetch=async(url,init)=>{assert.equal(init?.method,'GET');const u=new URL(String(url)),query=u.searchParams.get('q')??'';queries.push(query);return new Response(JSON.stringify(u.pathname.endsWith('/ui-api/apps/selected')?{appId:b.appId,developerName:'FixtureApp'}:query.includes('FROM User ')?{records:[{Id:b.f.identity.userId,IsActive:active}]}:{records:[{Id:b.recordId,Name:'PRIVATE_DISPLAY',LastModifiedDate:'2026-11-15T00:00:00Z'}]}));};
  try {const review:BrowserReview=b.approve(),api=await SalesforceClient.connectReviewedBrowser(b.f.policy,review);await api.preflight();const proof=await api.verifyReferences();assert.equal('get' in api,false);assert.equal('mutate' in api,false);assert.equal('dedicatedData' in api,false);assert.equal('dedicatedBrowserBridge' in api,false);assert.ok(!JSON.stringify(proof.proof).includes('PRIVATE_'));assert.equal(proof.proof.referenceVersions.length,1);assert.ok(queries.some(query=>query===`SELECT Id,Name,LastModifiedDate FROM Account WHERE Id='${b.recordId}' LIMIT 1`));active=false;await assert.rejects(api.verifyReferences(),/active exact/);assert.equal(b.f.writes.length,0);}
  finally{globalThis.fetch=originalFetch;Reflect.set(SalesforceClient,'authenticate',originalAuthenticate);b.history.close();}
});
