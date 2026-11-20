import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {chromium} from '@playwright/test';
import {browserFixture} from './support/browser-policy.js';
import {preflightReviewedBrowser} from '../src/execution/browser-guard.js';
import {verifyDedicatedSession,pruneExpiredDedicatedState,pruneExpiredDedicatedImport} from '../src/execution/dedicated-browser.js';
import {launchLocalBrowser} from '../src/execution/local-browser.js';
import {SalesforceClient,browserPreflightApiPaths} from '../src/salesforce/client.js';
import {digest} from '../src/execution/browser-policy.js';
import {BrowserExecutionDiagnostics,browserFailureSummary,browserFailureCode,browserErrorDiagnostic,withBrowserStage,readBrowserExecutionDiagnostics,preserveBrowserDiagnostic,NativeIdentityProofSchema} from '../src/execution/browser-diagnostics.js';
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

test('canonical exact API paths admit actual preflight requests and reject altered user/query/origin/parameters',async()=>{
  const f=await fixture(),original=globalThis.fetch,authenticate=Reflect.get(SalesforceClient,'authenticate'),client:SalesforceClient=Reflect.construct(SalesforceClient,[f.b.f.origin,'PRIVATE_FIXTURE_TOKEN','v62.0']);
  client.identity=async()=>f.b.f.identity;Reflect.set(SalesforceClient,'authenticate',async()=>client);
  const paths=browserPreflightApiPaths('v62.0',f.b.f.identity.userId),allowed=new Set(paths),permitted=(url:URL)=>url.origin===f.b.f.origin&&!url.hash&&!url.username&&!url.password&&allowed.has(url.pathname+url.search);
  const oldActorPath=`/services/data/v62.0/query?q=${encodeURIComponent(`SELECT Id,IsActive FROM User WHERE Id='${f.b.f.identity.userId}' LIMIT 1`)}`;
  assert.notEqual(oldActorPath,paths[2]);assert.ok(paths[2].includes('%27'));assert.equal(new URL(paths[2],f.b.f.origin).searchParams.get('q'),new URL(oldActorPath,f.b.f.origin).searchParams.get('q'));
  let requests=0;globalThis.fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.ok(permitted(url));requests++;return new Response(JSON.stringify(url.pathname.endsWith('/ui-api/apps/selected')?{appId:f.b.appId,developerName:'FixtureApp'}:{records:[{Id:f.b.f.identity.userId,IsActive:true}]}));};
  try{const api=await SalesforceClient.connectReviewedBrowser(f.b.f.policy,f.b.approve());await api.preflight(f.diagnostics.observe);assert.equal(requests,2);assert.equal(f.b.f.writes.length,0);
    for(const path of paths)assert.equal(new URL(path,f.b.f.origin).pathname+new URL(path,f.b.f.origin).search,path);
    const actor=new URL(paths[2],f.b.f.origin),extra=new URL(actor);extra.searchParams.append('extra','value');assert.equal(permitted(extra),false);
    const duplicate=new URL(actor);duplicate.searchParams.append('q',actor.searchParams.get('q')!);assert.equal(permitted(duplicate),false);
    const otherUser=new URL(browserPreflightApiPaths('v62.0','005999999999999')[2],f.b.f.origin);assert.equal(permitted(otherUser),false);
    const otherQuery=new URL(actor);otherQuery.searchParams.set('q','SELECT Id FROM Account');assert.equal(permitted(otherQuery),false);
    const otherOrigin=new URL(actor);otherOrigin.hostname='foreign.example';assert.equal(permitted(otherOrigin),false);
    const fragment=new URL(actor);fragment.hash='unexpected';assert.equal(permitted(fragment),false);
    for(const [version,userId]of[['v62.0?unexpected','005000000000001'],['v62.0',"005000000000001' OR IsActive=true"],['v62.0','001000000000001']])assert.throws(()=>browserPreflightApiPaths(version,userId));
  }finally{globalThis.fetch=original;Reflect.set(SalesforceClient,'authenticate',authenticate);await f.dispose();}
});

test('review-required expiry pruning preserves every mandatory session and future cookie without changing origins or flags',async()=>{
  const f=await fixture(),now=Date.now(),state={cookies:[...f.cookies,{name:'expired-fixture',value:'PRIVATE_EXPIRED',domain:new URL(f.b.f.origin).hostname,path:'/',expires:now/1000-60,secure:true,httpOnly:false,sameSite:'Lax'},{name:'future-fixture',value:'PRIVATE_FUTURE',domain:new URL(f.b.f.origin).hostname,path:'/',expires:now/1000+7200,secure:true,httpOnly:true,sameSite:'Lax'}],origins:[{origin:f.b.f.origin,localStorage:[{name:'fixture',value:'PRIVATE_LOCAL_STORAGE'}]}]},before=JSON.stringify(state);
  try{const proposed=pruneExpiredDedicatedState(state,f.b.f.policy,now);assert.equal(proposed.reviewRequired,true);assert.equal(proposed.removed.length,1);assert.deepEqual(proposed.state.cookies,state.cookies.filter(c=>c.name!=='expired-fixture'));assert.deepEqual(proposed.state.origins,state.origins);assert.equal(proposed.stableUntil,new Date(now+7200000).toISOString());assert.equal(JSON.stringify(state),before);assert.ok(!JSON.stringify(proposed.removed).includes('PRIVATE_'));assert.equal(proposed.state.cookies.filter(c=>c.name==='sid').length,2);}finally{await f.dispose();}
});

test('expiry proposals reject expired or missing mandatory sessions, foreign cookies and ordinary modes',async()=>{
  const f=await fixture(),now=Date.now();try{
    assert.throws(()=>pruneExpiredDedicatedState({cookies:f.cookies.map(c=>({...c,expires:now/1000-1})),origins:[]},f.b.f.policy,now),/session-cookie/);
    assert.throws(()=>pruneExpiredDedicatedState({cookies:f.cookies.slice(1),origins:[]},f.b.f.policy,now),/session-cookie/);
    assert.throws(()=>pruneExpiredDedicatedState({cookies:[...f.cookies,{...f.cookies[0],name:'expired-foreign',domain:'foreign.example',expires:now/1000-1}],origins:[]},f.b.f.policy,now),/state-origin/);
    for(const mode of['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA']as const)assert.throws(()=>pruneExpiredDedicatedState({cookies:f.cookies,origins:[]},{...f.b.f.policy,mode},now),/Dedicated QA import proposal/);
  }finally{await f.dispose();}
});

test('expiry import writes a separate inactive proposal and cannot overwrite its source or escape auth storage',async()=>{
  const f=await fixture(),source=JSON.stringify({cookies:[...f.cookies,{...f.cookies[0],name:'expired-fixture',expires:Date.now()/1000-60}],origins:[]}),output=join(f.root,'normalized.json');await writeFile(f.statePath,source);
  try{const proposal=await pruneExpiredDedicatedImport(f.statePath,output,f.b.f.policy);assert.equal(proposal.reviewRequired,true);assert.equal(proposal.originalUnchanged,true);assert.equal(proposal.sourceHash,digest(source));assert.equal(await readFile(f.statePath,'utf8'),source);assert.equal(JSON.parse(await readFile(output,'utf8')).cookies.length,2);assert.equal(f.b.f.writes.length,0);
    await assert.rejects(pruneExpiredDedicatedImport(f.statePath,f.statePath,f.b.f.policy),/private-state/);await assert.rejects(pruneExpiredDedicatedImport(f.statePath,resolve('.state/not-authorized-state.json'),f.b.f.policy),/private-state/);await assert.rejects(pruneExpiredDedicatedImport(f.statePath,output,f.b.f.policy),/EEXIST/);
  }finally{await f.dispose();}
});

test('installed headless Chrome drops only the expired fixture entry and exactly imports its reviewed proposal offline',async()=>{
  const f=await fixture(),state={cookies:[...f.cookies,{...f.cookies[0],name:'expired-fixture',expires:Date.now()/1000-60},{...f.cookies[0],name:'future-fixture',expires:Date.now()/1000+7200}],origins:[]},output=join(f.root,'normalized.json'),originalFetch=globalThis.fetch;await writeFile(f.statePath,JSON.stringify(state));globalThis.fetch=async()=>{throw Error('Offline import must never authenticate');};const browser=await launchLocalBrowser();let requests=0;
  const keys=(cookies:Array<{name:string;domain:string;path:string;value:string;secure:boolean;httpOnly:boolean}>)=>cookies.map(c=>digest(JSON.stringify([c.name,c.domain,c.path,c.value,c.secure,c.httpOnly]))).sort();
  try{const source=await browser.newContext({storageState:f.statePath,javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});source.on('request',()=>{requests++;});await source.route('**/*',r=>r.abort());assert.notDeepEqual(keys(await source.cookies()),keys(state.cookies));await source.close();
    const proposal=await pruneExpiredDedicatedImport(f.statePath,output,f.b.f.policy),expected=JSON.parse(await readFile(proposal.statePath,'utf8')),context=await browser.newContext({storageState:proposal.statePath,javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});context.on('request',()=>{requests++;});await context.route('**/*',r=>r.abort());assert.deepEqual(keys(await context.cookies()),keys(expected.cookies));assert.equal(proposal.removed.length,1);assert.deepEqual(expected.cookies.filter((c:{name:string})=>c.name==='sid'),f.cookies);assert.equal(requests,0);assert.equal(f.b.f.writes.length,0);await context.close();
  }finally{await browser.close();globalThis.fetch=originalFetch;await f.dispose();}
});

test('native identity failures retain the fixed proof operation and HTTP status through disposal without provider content',async()=>{
  for(const kind of['userinfo-http','userinfo-redirect','soap-http','html-redirect','html-content','transport']as const){
    const f=await fixture(),calls:string[]=[],original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Fixture forbids external calls');};
    const launch=async()=>({newContext:async()=>({cookies:async(origin:string)=>f.cookies.filter(c=>c.domain===new URL(origin).hostname),clearCookies:async()=>{},request:{
      get:async(url:string,options:{maxRedirects:number;timeout:number})=>{assert.equal(options.maxRedirects,0);assert.equal(options.timeout,15000);const u=new URL(url);if(u.pathname==='/lightning/page/home'){calls.push('html');return response('PRIVATE_RESPONSE_BODY',kind==='html-redirect'?302:200,false);}assert.equal(u.pathname,'/services/oauth2/userinfo');calls.push('userinfo');if(kind==='transport')throw Object.assign(Error('PRIVATE_TRANSPORT_URL_HEADER'),{name:'TimeoutError'});const status=kind==='userinfo-http'?503:kind==='userinfo-redirect'?302:kind==='soap-http'?401:calls.length===1?200:401;return response({organization_id:f.b.f.identity.Id,user_id:f.b.f.identity.userId,ignored:'PRIVATE_BODY'},status);},
      post:async(url:string,options:{maxRedirects:number;timeout:number;headers:Record<string,string>})=>{calls.push('soap');assert.match(new URL(url).pathname,/^\/services\/Soap\/u\/\d+\.\d+$/);assert.equal(options.headers.SOAPAction,'getUserInfo');assert.equal(options.maxRedirects,0);assert.equal(options.timeout,15000);return response('PRIVATE_SOAP_BODY',500);},
    }}),close:async()=>{throw Error('PRIVATE_DISPOSAL_ERROR');}} as never);
    const nativeProof=kind==='soap-http'?{operation:'soap-get-user-info',sessionOrigin:'api',httpStatus:500}:kind.startsWith('html')?{operation:'lightning-home-html',sessionOrigin:'lightning',httpStatus:kind==='html-redirect'?302:200}:{operation:'oauth-userinfo',sessionOrigin:'api',...(kind==='transport'?{}:{httpStatus:kind==='userinfo-http'?503:302})};
    try{await assert.rejects(withBrowserStage(undefined,'context-initialization',()=>verifyDedicatedSession(f.statePath,f.b.f.policy,f.b.f.identity,f.b.f.origin,undefined,{launch,onStage:f.diagnostics.observe})),error=>{assert.deepEqual(browserErrorDiagnostic(error)?.nativeProof,nativeProof);assert.equal(browserFailureSummary(error).reason,kind==='transport'?'timeout':kind.endsWith('redirect')?'identity-redirect':'identity-http');assert.ok(!String(error).includes('PRIVATE_'));return true;});
      const persisted=readBrowserExecutionDiagnostics(f.b.history,'offline-lifecycle-preflight',f.b.approve().approval.hash)[0];assert.ok(persisted.events.some(e=>e.status==='failed'&&JSON.stringify(e.nativeProof)===JSON.stringify(nativeProof)));assert.ok(persisted.events.some(e=>e.stage==='cleanup'&&e.status==='failed'));assert.ok(!JSON.stringify(persisted).includes('PRIVATE_'));assert.equal(calls.length,kind==='soap-http'?2:kind.startsWith('html')?3:1);assert.equal(f.b.f.writes.length,0);
    }finally{globalThis.fetch=original;await f.dispose();}
  }
});

test('native proof telemetry preserves the existing bounded SOAP and HTML fallbacks and independent identity checks',async()=>{
  const f=await fixture(),calls:string[]=[],launch=async()=>({newContext:async()=>({cookies:async(origin:string)=>f.cookies.filter(c=>c.domain===new URL(origin).hostname),clearCookies:async()=>{},request:{get:async(url:string,options:{maxRedirects:number;timeout:number})=>{assert.equal(options.maxRedirects,0);assert.equal(options.timeout,15000);if(new URL(url).pathname==='/services/oauth2/userinfo'){calls.push('userinfo');return response({},401);}assert.equal(new URL(url).pathname,'/lightning/page/home');calls.push('html');return response(f.b.native,200,true);},post:async(url:string,options:{maxRedirects:number;timeout:number;headers:Record<string,string>})=>{calls.push('soap');assert.match(new URL(url).pathname,/^\/services\/Soap\/u\/\d+\.\d+$/);assert.equal(options.headers.SOAPAction,'getUserInfo');assert.equal(options.maxRedirects,0);assert.equal(options.timeout,15000);return response(`<Envelope><Body><getUserInfoResponse><result><organizationId>${f.b.f.identity.Id}</organizationId><userId>${f.b.f.identity.userId}</userId></result></getUserInfoResponse></Body></Envelope>`,200,true);}}}),close:async()=>{}} as never);
  try{const result=await verifyDedicatedSession(f.statePath,f.b.f.policy,f.b.f.identity,f.b.f.origin,undefined,{launch,onStage:f.diagnostics.observe});assert.equal(result.userId,f.b.f.identity.userId);assert.deepEqual(calls,['userinfo','soap','userinfo','html']);const snapshot=f.diagnostics.snapshot();assert.deepEqual(snapshot.events.find(e=>e.stage==='context-identity'&&e.status==='passed')?.nativeProof,{operation:'lightning-home-html',sessionOrigin:'lightning',httpStatus:200});assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_'));assert.ok(!JSON.stringify(snapshot).includes(f.b.f.identity.Id));assert.equal(f.b.f.writes.length,0);}finally{await f.dispose();}
});

test('closed native-proof evidence survives observer-free wrapping and rejects unknown or protected fields',async()=>{
  const nativeProof={operation:'soap-get-user-info',sessionOrigin:'api',httpStatus:503}as const,primary=Object.assign(Error('PRIVATE_PROVIDER_DETAILS'),{name:'TimeoutError'});await assert.rejects(withBrowserStage(undefined,'context-identity',async()=>{throw primary;},()=>nativeProof));const wrapped=preserveBrowserDiagnostic(primary,Error('Sanitized fixture wrapper'));assert.deepEqual(browserErrorDiagnostic(wrapped)?.nativeProof,nativeProof);assert.equal(browserFailureSummary(wrapped).reason,'timeout');assert.ok(!JSON.stringify(browserErrorDiagnostic(wrapped)).includes('PRIVATE_'));
  const legacy=Error('PRIVATE_LEGACY_OBSERVER');await assert.rejects(withBrowserStage((stage,status,code)=>({stage,status,code,elapsedMs:0,totalMs:0}),'context-identity',async()=>{throw legacy;},()=>nativeProof));assert.deepEqual(browserErrorDiagnostic(legacy)?.nativeProof,nativeProof);
  for(const invalid of[{...nativeProof,httpStatus:0},{...nativeProof,httpStatus:600},{...nativeProof,operation:'PRIVATE_CONTROLLER'},{...nativeProof,headers:{Authorization:'PRIVATE_TOKEN'}},{...nativeProof,url:'https://PRIVATE_URL'}])assert.equal(NativeIdentityProofSchema.safeParse(invalid).success,false);
  const unsupported=Error('PRIVATE_UNSUPPORTED');await assert.rejects(withBrowserStage(undefined,'context-identity',async()=>{throw unsupported;},()=>({...nativeProof,token:'PRIVATE_TOKEN'})as never),e=>e===unsupported);assert.equal(browserErrorDiagnostic(unsupported)?.nativeProof,undefined);const callbackError=Error('PRIVATE_CALLBACK_ERROR'),original=Error('PRIVATE_ORIGINAL');await assert.rejects(withBrowserStage(undefined,'context-identity',async()=>{throw original;},()=>{throw callbackError;}),e=>e===original);assert.equal(browserErrorDiagnostic(original)?.nativeProof,undefined);
});
