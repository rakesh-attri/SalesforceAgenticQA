import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {chromium} from '@playwright/test';
import {browserFixture} from './support/browser-policy.js';
import {preflightReviewedBrowser} from '../src/execution/browser-guard.js';
import {verifyDedicatedSession} from '../src/execution/dedicated-browser.js';
import {SalesforceClient} from '../src/salesforce/client.js';
import {digest} from '../src/execution/browser-policy.js';
import {BrowserExecutionDiagnostics,browserFailureSummary,browserFailureCode,browserErrorDiagnostic,withBrowserStage} from '../src/execution/browser-diagnostics.js';
import {liveObservationFailure} from '../src/agents/live-exploration-runtime.js';

async function fixture(){
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/lifecycle-preflight-')),statePath=join(root,'fixture.json'),b=browserFixture();
  const cookies=b.f.policy.allowedOrigins.map(origin=>({name:'sid',value:'PRIVATE_SESSION_CANARY',domain:new URL(origin).hostname,path:'/',expires:-1,secure:true,httpOnly:true,sameSite:'Lax' as const})),state={cookies,origins:[]};
  await writeFile(statePath,JSON.stringify(state));b.plan.sessionStateHash=digest(JSON.stringify(state));
  const diagnostics=new BrowserExecutionDiagnostics(b.history,{runId:'offline-lifecycle-preflight',policyHash:b.approve().approval.hash,validation:'offline-mocked-salesforce'});
  return{b,root,statePath,cookies,diagnostics,async dispose(){b.history.close();const rel=relative(resolve('.auth'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function response(body:unknown,status=200,html=false){return{ok:()=>status>=200&&status<300,status:()=>status,headers:()=>({'content-type':html?'text/html':'application/json'}),json:async()=>body,text:async()=>html?String(body):JSON.stringify(body)};}
function browserTransport(f:Fixture,options:{build?:'timeout'|'http'|'source'|'drift';identityRedirect?:boolean;cookieDrift?:boolean;outerClose?:boolean;innerClose?:boolean}={}){
  let launches=0,closed=0,requests=0;
  const launch=mock.method(chromium,'launch',async()=>{
    const outer=++launches===1;
    return{newContext:async()=>({
      cookies:async(origin?:string)=>{const cookies=origin?f.cookies.filter(c=>c.domain===new URL(origin).hostname):f.cookies;return outer&&options.cookieDrift?cookies.map(c=>({...c,value:'PRIVATE_CHANGED_SESSION'})):cookies;},
      clearCookies:async()=>{},
      request:{get:async(url:string)=>{requests++;const u=new URL(url);
        if(!outer){assert.equal(u.pathname,'/services/oauth2/userinfo');return response({organization_id:f.b.f.identity.Id,user_id:f.b.f.identity.userId},options.identityRedirect?302:200);}
        assert.equal(u.pathname,'/lightning/page/home');
        if(options.build==='timeout')throw Object.assign(Error('PRIVATE_NATIVE_URL_AND_BODY'),{name:'TimeoutError'});
        return response(options.build==='source'?'<html>PRIVATE_UNSUPPORTED_SOURCE</html>':options.build==='drift'?f.b.native.replace('fixture-build','changed-build'):f.b.native,options.build==='http'?503:200,true);
      }},
    }),close:async()=>{closed++;if(outer?options.outerClose:options.innerClose)throw Error('PRIVATE_DISPOSAL_PROVIDER_ERROR');}} as never;
  });
  return{launch,counts:()=>({launches,closed,requests})};
}

test('actual preflight preserves the primary failure across disposal, sanitized wrapping and outer catches',async()=>{
  const f=await fixture(),transport=browserTransport(f,{build:'timeout',outerClose:true}),original=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('No provider calls in native fixture');};
  try{
    await assert.rejects(withBrowserStage(f.diagnostics.observe,'context-initialization',()=>preflightReviewedBrowser(f.b.approve(),f.b.f.policy,f.b.f.identity,f.statePath,f.b.f.origin,f.diagnostics.observe)),error=>{
      assert.deepEqual(browserFailureSummary(error),{stage:'browser-build',reason:'timeout',category:'transport'});
      assert.equal(browserErrorDiagnostic(error)?.code,'timeout');assert.equal(liveObservationFailure(error).diagnostic?.stage,'browser-build');
      assert.ok(!String(error).includes('PRIVATE_'));return true;
    });
    const snapshot=f.diagnostics.snapshot();assert.ok(snapshot.events.some(e=>e.stage==='cleanup'&&e.status==='failed'));
    assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_'));assert.deepEqual(transport.counts(),{launches:2,closed:2,requests:3});assert.equal(f.b.f.writes.length,0);
  }finally{globalThis.fetch=original;transport.launch.mock.restore();await f.dispose();}
});

test('actual preflight distinguishes native identity, actual cookies, HTTP build, unsupported source and build drift',async t=>{
  for(const [kind,stage,reason]of[
    ['identity','context-identity','identity-redirect'],['cookies','context-identity','context-state-mismatch'],
    ['http','browser-build','build-http'],['source','browser-build','build-source'],['drift','browser-build','build-or-scope-mismatch'],
  ]as const)await t.test(kind,async()=>{
    const f=await fixture(),transport=browserTransport(f,{identityRedirect:kind==='identity',cookieDrift:kind==='cookies',...(['http','source','drift'].includes(kind)?{build:kind as 'http'|'source'|'drift'}:{})});
    try{await assert.rejects(preflightReviewedBrowser(f.b.approve(),f.b.f.policy,f.b.f.identity,f.statePath,f.b.f.origin,f.diagnostics.observe),error=>{
      assert.equal(browserFailureSummary(error).stage,stage);assert.equal(browserFailureSummary(error).reason,reason);assert.ok(!String(error).includes('PRIVATE_'));return true;
    });assert.equal(f.b.f.writes.length,0);assert.ok(!JSON.stringify(f.diagnostics.snapshot()).includes('PRIVATE_'));}finally{transport.launch.mock.restore();await f.dispose();}
  });
});

test('native session translation retains its identity failure even if verifier disposal fails',async()=>{
  const f=await fixture();
  // This direct service call has no enclosing preflight browser.
  const launch=async()=>{const browser=await chromium.launch();return browser;};
  const direct=mock.method(chromium,'launch',async()=>({newContext:async()=>({cookies:async(origin:string)=>f.cookies.filter(c=>c.domain===new URL(origin).hostname),clearCookies:async()=>{},request:{get:async()=>response({},302)}}),close:async()=>{throw Error('PRIVATE_CLOSE');}} as never));
  try{await assert.rejects(verifyDedicatedSession(f.statePath,f.b.f.policy,f.b.f.identity,f.b.f.origin,undefined,{launch,onStage:f.diagnostics.observe}),error=>{assert.deepEqual(browserFailureSummary(error),{stage:'context-identity',reason:'identity-redirect',category:'session-or-scope'});assert.ok(!String(error).includes('PRIVATE_'));return true;});assert.ok(f.diagnostics.snapshot().events.some(e=>e.stage==='cleanup'&&e.status==='failed'));}finally{direct.mock.restore();await f.dispose();}
});

test('a disposal-only failure blocks a successful native proof; unchanged proof passes with no page or action',async()=>{
  for(const outerClose of[false,true]){const f=await fixture(),transport=browserTransport(f,{outerClose});
    try{const operation=preflightReviewedBrowser(f.b.approve(),f.b.f.policy,f.b.f.identity,f.statePath,f.b.f.origin,f.diagnostics.observe);
      if(outerClose)await assert.rejects(operation,error=>{assert.equal(browserFailureSummary(error).stage,'cleanup');assert.ok(!String(error).includes('PRIVATE_'));return true;});
      else assert.equal((await operation).buildHash,f.b.plan.buildHash);
      assert.deepEqual(transport.counts(),{launches:2,closed:2,requests:3});assert.equal(f.b.f.writes.length,0);
    }finally{transport.launch.mock.restore();await f.dispose();}
  }
});

test('changed state and expired or foreign authorization reject before native browser launch',async()=>{
  for(const kind of['state','expiry','org','user']as const){const f=await fixture(),review=f.b.approve();let launches=0;const launch=mock.method(chromium,'launch',async()=>{launches++;throw Error('must not launch');});
    try{if(kind==='state')await writeFile(f.statePath,JSON.stringify({cookies:[],origins:[]}));if(kind==='expiry')review.approval.expiresAt=new Date(Date.now()-1).toISOString();const identity={...f.b.f.identity,...(kind==='org'?{Id:'00D999999999999'}:{}),...(kind==='user'?{userId:'005999999999999'}:{})};
      await assert.rejects(preflightReviewedBrowser(review,f.b.f.policy,identity,f.statePath,f.b.f.origin,f.diagnostics.observe));assert.equal(launches,0);assert.equal(f.b.f.writes.length,0);
    }finally{launch.mock.restore();await f.dispose();}
  }
});

test('actual reviewed API preflight separates actor and app rejection without exposing generic transport',async t=>{
  for(const kind of['inactive','actor-shape','actor-denied','app-shape','app-drift','app-denied','success']as const)await t.test(kind,async()=>{
    const f=await fixture(),original=globalThis.fetch,authenticate=Reflect.get(SalesforceClient,'authenticate'),client:SalesforceClient=Reflect.construct(SalesforceClient,[f.b.f.origin,'PRIVATE_OAUTH_CANARY','v62.0']);
    client.identity=async()=>f.b.f.identity;Reflect.set(SalesforceClient,'authenticate',async()=>client);let calls=0;
    globalThis.fetch=async(url,init)=>{calls++;assert.equal(init?.method,'GET');const app=new URL(String(url)).pathname.endsWith('/ui-api/apps/selected');
      const body=app?(kind==='app-shape'?{appId:'PRIVATE_APP_VALUE'}:{appId:kind==='app-drift'?'06m000000000002':f.b.appId,developerName:'FixtureApp'}):kind==='actor-shape'?{records:[{Id:f.b.f.identity.userId,IsActive:'true'}]}:{records:[{Id:f.b.f.identity.userId,IsActive:kind!=='inactive'}]};
      return new Response(JSON.stringify(body),{status:(app&&kind==='app-denied'||!app&&kind==='actor-denied')?403:200});
    };
    try{const api=await SalesforceClient.connectReviewedBrowser(f.b.f.policy,f.b.approve());assert.equal('get'in api,false);assert.equal('dedicatedData'in api,false);
      if(kind==='success'){assert.equal((await api.preflight(f.diagnostics.observe)).userId,f.b.f.identity.userId);assert.equal(calls,2);}
      else await assert.rejects(api.preflight(f.diagnostics.observe),error=>{const summary=browserFailureSummary(error);assert.equal(summary.stage,kind.startsWith('app')?'app-selection':'actor-access');assert.equal(summary.reason,{'inactive':'actor-access','actor-shape':'actor-response','actor-denied':'api-http','app-shape':'app-response','app-drift':'app-context','app-denied':'api-http'}[kind]);assert.ok(!String(error).includes('PRIVATE_'));return true;});
      assert.equal(f.b.f.writes.length,0);assert.ok(!JSON.stringify(f.diagnostics.snapshot()).includes('PRIVATE_'));
    }finally{globalThis.fetch=original;Reflect.set(SalesforceClient,'authenticate',authenticate);await f.dispose();}
  });
});

test('closed error codes cannot inherit object properties and survive wrapping without an observer',async()=>{
  for(const text of['constructor','__proto__','toString','PRIVATE_UNKNOWN_PROVIDER'])assert.equal(browserFailureCode(Error(text)),'unknown');
  const error=Object.assign(Error('PRIVATE_TIMEOUT_VALUE'),{name:'TimeoutError'});await assert.rejects(withBrowserStage(undefined,'browser-build',async()=>{throw error;}));
  assert.deepEqual(browserFailureSummary(error),{stage:'browser-build',reason:'timeout',category:'transport'});assert.ok(!JSON.stringify(browserFailureSummary(error)).includes('PRIVATE_'));
});
