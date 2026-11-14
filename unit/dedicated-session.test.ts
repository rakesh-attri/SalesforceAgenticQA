import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile,rm,access } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import type { Browser } from '@playwright/test';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { validateDedicatedState,verifyDedicatedSession,checkedDedicatedSession,DedicatedSessionError,minimizeDedicatedState,minimizeDedicatedImport } from '../src/execution/dedicated-browser.js';
import { checkSessionReceipt } from '../src/integrations/session-gate.js';
import { uiBridgeFailure,claimBridgeUse,UiBridgeError } from '../src/salesforce/ui-bridge.js';
import { prepareAuthReview,authorizeAuthHandoffs,allowAuthHandoff } from '../src/execution/dedicated-auth-review.js';
import { environmentHash } from '../src/execution/environment.js';
import { parseLightningIdentity,sameSalesforceIdentity } from '../src/execution/lightning-identity.js';
const bootstrap=(org:string,user:string)=>`<script>var auraConfig={context:{globalValueProviders:[{type:"$SObjectType",values:{CurrentUser:{Id:${JSON.stringify(user)}}}}]}};$A.addValueProvider("$ContentAsset",new ContentAssetGlobalValueProvider(${JSON.stringify(org)},"ignored"));</script>`;

test('observed Lightning identity parser never executes scripts or accepts ambiguous providers and normalizes only valid exact Salesforce IDs',()=>{
  const html=bootstrap('00D000000000001','005000000000001'),proof=parseLightningIdentity(html+'<script>throw new Error("must not execute")</script>');assert.equal(proof.user_id,'005000000000001');assert.equal(proof.organization_id,'00D000000000001');assert.match(proof.documentHash,/^[a-f0-9]{64}$/);
  assert.equal(sameSalesforceIdentity('00D000000000001','00D000000000001EAA'),true);assert.equal(sameSalesforceIdentity('00D000000000001','00D000000000001AAA'),false);assert.equal(sameSalesforceIdentity('00D000000000001','00D000000000002'),false);
  assert.throws(()=>parseLightningIdentity(html+html),/ambiguous/);assert.throws(()=>parseLightningIdentity(html.replace('CurrentUser','OtherUser')),/Unsupported/);assert.throws(()=>parseLightningIdentity(html.replace('new ContentAssetGlobalValueProvider','new UnreviewedProvider')),/Unsupported/);
});
const cookies=(origins:string[])=>origins.map((origin,i)=>({name:'sid',value:`private-browser-session-${i}`,domain:new URL(origin).hostname,path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'None'}));

test('single-use bridge journal rejects cached URL replay and persists only its hash',()=>{
  const h=new History(':memory:'),url='https://qa-fixture.my.salesforce.com/secur/frontdoor.jsp?otp=private-one-use-value';try{claimBridgeUse(h,url);assert.throws(()=>claimBridgeUse(h,url),e=>e instanceof UiBridgeError&&e.code==='Cached_One_Time_Url'&&!String(e).includes('private-one-use-value'));
    const rows=h.db.prepare('SELECT * FROM dedicated_bridge_uses').all();assert.equal(rows.length,1);assert.match(String(rows[0].hash),/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(rows).includes('private-one-use-value'));
  }finally{h.close();}
});

test('authentication-only handoffs require separate exact named review and cannot grant UI/data actions or normal Production access',()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try {const observed={approved:false,definitionHash:environmentHash(f.policy),operator:'fixture-operator',observations:[{origin:'https://login.salesforce.com',path:'/secur/sessionserver.jsp',resourceType:'document',method:'GET'}]},draft=prepareAuthReview(observed,f.policy);assert.throws(()=>authorizeAuthHandoffs(draft,f.policy,f.identity));
    const signed={...draft,approval:{...draft.approval,operator:'fixture-operator'}},review=authorizeAuthHandoffs(signed,f.policy,f.identity),url='https://login.salesforce.com/secur/sessionserver.jsp?retURL=%2Flightning';assert.equal(allowAuthHandoff(review,{url,type:'document',method:'GET'}),true);
    for(const request of [{url,type:'xhr',method:'GET'},{url,type:'document',method:'POST'},{url:'https://evil.example/secur/sessionserver.jsp',type:'document',method:'GET'},{url:'https://login.salesforce.com/services/data/v62.0/sobjects/Account',type:'document',method:'GET'}])assert.equal(allowAuthHandoff(review,request),false);
    assert.throws(()=>authorizeAuthHandoffs(signed,{...f.policy,mode:'PRODUCTION_READ_ONLY_QA'},f.identity));assert.throws(()=>authorizeAuthHandoffs(signed,f.policy,{...f.identity,userId:'005999999999999'}));
    assert.throws(()=>prepareAuthReview({...observed,observations:[{...observed.observations[0],path:'unsupported'}]},f.policy));assert.deepEqual(f.policy.allowedOrigins,[f.origin,f.browserOrigin]);
  }finally{h.close();}
});

test('UI Bridge classifies documented OAuth failures without echoing provider secrets',async()=>{
  for(const code of ['Invalid_Scope','Bad_OAuth_Token','Missing_OAuth_Token','Invalid_Param','No_Access','Wrong_Org']){const error=await uiBridgeFailure(new Response(JSON.stringify({error:code,error_description:'private-consumer-key private-otp private-token'}),{status:403}));assert.equal(error.code,code);assert.ok(!error.message.includes('private-'));}
  const unknown=await uiBridgeFailure(new Response('unknown-provider-message private-token',{status:500}));assert.equal(unknown.code,'Unrecognized');assert.ok(!unknown.message.includes('unknown-provider-message'));
});

test('imported state rejects unapproved origins, broad cookies, insecure and expired sessions without exposing values',()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try{const state={cookies:cookies(f.policy.allowedOrigins),origins:[]};validateDedicatedState(state,f.policy);
    for(const changed of [{...state,origins:[{origin:'https://unapproved.example'}]},{...state,cookies:[{...state.cookies[0],domain:'.salesforce.com'}]},{...state,cookies:[{...state.cookies[0],secure:false}]},{...state,cookies:[{...state.cookies[0],expires:1}]}])assert.throws(()=>validateDedicatedState(changed,f.policy),e=>e instanceof DedicatedSessionError&&!String(e).includes('private-browser'));
  }finally{h.close();}
});

test('explicit minimization narrows an approved full export without changing cookie values or the original file',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/minimized-import-')),state=join(root,'original.json'),output=join(root,'copy.json'),h=new History(':memory:'),f=dedicatedFixture(h),original={cookies:[...cookies(f.policy.allowedOrigins),{...cookies(f.policy.allowedOrigins)[0],domain:'login.salesforce.com',value:'private-unrelated'}],origins:[{origin:f.origin,localStorage:[]},{origin:'https://unapproved.example',localStorage:[]}]};const bytes=JSON.stringify(original);await writeFile(state,bytes);
  try {const result=minimizeDedicatedState(original,f.policy);assert.deepEqual(result.removed,{cookies:1,origins:1});assert.deepEqual(result.state.cookies,cookies(f.policy.allowedOrigins));
    const copied=await minimizeDedicatedImport(state,output,f.policy);assert.equal(copied.originalUnchanged,true);assert.equal(await readFile(state,'utf8'),bytes);assert.equal(JSON.parse(await readFile(output,'utf8')).cookies.length,2);await assert.rejects(minimizeDedicatedImport(state,state,f.policy));
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('native import proves every approved origin cookie in an isolated verifier and binds a private receipt',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/native-import-')),state=join(root,'state.json'),receipt=join(root,'receipt.json'),h=new History(':memory:'),f=dedicatedFixture(h),saved={cookies:cookies(f.policy.allowedOrigins).map(c=>({...c,httpOnly:false})),origins:[]};await writeFile(state,JSON.stringify(saved));let contexts=0,cleared=0,closed=0;const verified:string[]=[];
  const browser={newContext:async(options:Record<string,unknown>)=>{contexts++;if(contexts===1){assert.equal(options.storageState,state);return {cookies:async(origin:string)=>saved.cookies.filter(c=>c.domain===new URL(origin).hostname)};}
    assert.ok(!('storageState' in options));return {clearCookies:async()=>{cleared++;},request:{get:async(url:string,options:{headers:{Authorization:string};maxRedirects:number})=>{assert.equal(url,`${f.origin}/services/oauth2/userinfo`);assert.equal(options.maxRedirects,0);verified.push(options.headers.Authorization);return {ok:()=>true,json:async()=>({organization_id:f.identity.Id,user_id:f.identity.userId})};}}};},close:async()=>{closed++;}} as unknown as Browser;
  try {await verifyDedicatedSession(state,f.policy,f.identity,f.origin,receipt,{launch:async()=>browser});assert.equal(contexts,2);assert.equal(cleared,2);assert.deepEqual(verified,saved.cookies.map(c=>`Bearer ${c.value}`));assert.equal(closed,1);
    const proof=await checkSessionReceipt(receipt,{orgId:f.identity.Id,userId:f.identity.userId,persona:f.policy.dedicatedQa!.persona},f.policy.allowedOrigins);assert.equal(proof.reviewer,'fixture-operator');assert.ok(!JSON.stringify(proof).includes('private-browser-session'));
    const forged=JSON.parse(await readFile(receipt,'utf8'));forged.reviewer='another-operator';await writeFile(receipt,JSON.stringify(forged));await assert.rejects(checkedDedicatedSession(receipt,f.policy,f.identity,f.origin),e=>e instanceof DedicatedSessionError&&e.code==='receipt');
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('a different Lightning cookie identity cannot borrow a valid API-origin cookie or create a receipt',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/mixed-import-')),state=join(root,'state.json'),receipt=join(root,'receipt.json'),h=new History(':memory:'),f=dedicatedFixture(h),saved={cookies:cookies(f.policy.allowedOrigins),origins:[]};await writeFile(state,JSON.stringify(saved));let contexts=0,calls=0;
  const browser={newContext:async()=>++contexts===1?{cookies:async(origin:string)=>saved.cookies.filter(c=>c.domain===new URL(origin).hostname)}:{clearCookies:async()=>{},request:{get:async()=>({ok:()=>true,json:async()=>({organization_id:f.identity.Id,user_id:++calls===1?f.identity.userId:'005999999999999'})})}},close:async()=>{}} as unknown as Browser;
  try {await assert.rejects(verifyDedicatedSession(state,f.policy,f.identity,f.origin,receipt,{launch:async()=>browser}),e=>e instanceof DedicatedSessionError&&e.code==='identity-mismatch'&&!String(e).includes('private-browser'));assert.equal(calls,2);await assert.rejects(access(receipt));}
  finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('normal UI sessions rejected by OAuth userinfo require exact read-only SOAP getUserInfo proof with the same cookie',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/soap-import-')),state=join(root,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h),saved={cookies:cookies(f.policy.allowedOrigins),origins:[]};await writeFile(state,JSON.stringify(saved));let contexts=0,posts=0,wrong=false;
  const browser={newContext:async()=>++contexts===1?{cookies:async(origin:string)=>saved.cookies.filter(c=>c.domain===new URL(origin).hostname)}:{clearCookies:async()=>{},request:{get:async(_url:string,options:{headers:{Authorization:string}})=>options.headers.Authorization.endsWith('session-0')?{ok:()=>false,status:()=>401}:{ok:()=>true,json:async()=>({organization_id:f.identity.Id,user_id:f.identity.userId})},post:async(url:string,options:{data:string;headers:Record<string,string>;maxRedirects:number})=>{assert.ok(url.startsWith(`${f.origin}/services/Soap/u/`));assert.equal(options.maxRedirects,0);assert.equal(options.headers.SOAPAction,'getUserInfo');assert.ok(options.data.includes('private-browser-session-'));assert.ok(!/login|create|update|delete/.test(options.data));posts++;return {ok:()=>true,text:async()=>`<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><getUserInfoResponse><result><organizationId>${f.identity.Id}</organizationId><userId>${wrong?'005999999999999':f.identity.userId}</userId></result></getUserInfoResponse></env:Body></env:Envelope>`};}}},close:async()=>{}} as unknown as Browser;
  try {await verifyDedicatedSession(state,f.policy,f.identity,f.origin,undefined,{launch:async()=>browser});assert.equal(posts,1);contexts=0;wrong=true;await assert.rejects(verifyDedicatedSession(state,f.policy,f.identity,f.origin,undefined,{launch:async()=>browser}),e=>e instanceof DedicatedSessionError&&e.code==='identity-mismatch');}
  finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('Lightning child session requires a same-origin authenticated static bootstrap proving both org/user without running page scripts',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/lightning-import-')),state=join(root,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h),saved={cookies:cookies(f.policy.allowedOrigins),origins:[]};await writeFile(state,JSON.stringify(saved));let contexts=0,documents=0,wrong=false;
  const browser={newContext:async(options:{javaScriptEnabled?:boolean})=>++contexts===1?{cookies:async(origin:string)=>saved.cookies.filter(c=>c.domain===new URL(origin).hostname),request:{get:async(url:string,options:{maxRedirects:number})=>{assert.equal(url,`${f.browserOrigin}/lightning/page/home`);assert.equal(options.maxRedirects,0);documents++;return {ok:()=>true,headers:()=>({'content-type':'text/html'}),text:async()=>bootstrap(wrong?'00D000000000002':f.identity.Id,f.identity.userId)};}}}:{clearCookies:async()=>{},request:{get:async(_url:string,options:{headers:{Authorization:string}})=>options.headers.Authorization.endsWith('session-0')?{ok:()=>true,json:async()=>({organization_id:f.identity.Id,user_id:f.identity.userId})}:{ok:()=>false,status:()=>403}}},close:async()=>{}} as unknown as Browser;
  try {await verifyDedicatedSession(state,f.policy,f.identity,f.origin,undefined,{launch:async()=>browser});assert.equal(documents,1);contexts=0;wrong=true;await assert.rejects(verifyDedicatedSession(state,f.policy,f.identity,f.origin,undefined,{launch:async()=>browser}),e=>e instanceof DedicatedSessionError&&e.code==='identity-mismatch');assert.equal(documents,2);}
  finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('state changes and provider transport failures cannot issue a browser receipt or leak credentials',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/state-change-')),state=join(root,'state.json'),receipt=join(root,'receipt.json'),h=new History(':memory:'),f=dedicatedFixture(h),saved={cookies:cookies(f.policy.allowedOrigins),origins:[]};await writeFile(state,JSON.stringify(saved));let contexts=0;
  const browser={newContext:async()=>++contexts===1?{cookies:async(origin:string)=>saved.cookies.filter(c=>c.domain===new URL(origin).hostname)}:{clearCookies:async()=>{},request:{get:async()=>{await writeFile(state,JSON.stringify({...saved,origins:[{origin:f.origin,localStorage:[]}]}));return {ok:()=>true,json:async()=>({organization_id:f.identity.Id,user_id:f.identity.userId})};}}},close:async()=>{}} as unknown as Browser;
  try {await assert.rejects(verifyDedicatedSession(state,f.policy,f.identity,f.origin,receipt,{launch:async()=>browser}),e=>e instanceof DedicatedSessionError&&e.code==='state-changed');await assert.rejects(access(receipt));
    await assert.rejects(verifyDedicatedSession(state,f.policy,f.identity,f.origin,receipt,{launch:async()=>{throw Error('private-token');}}),e=>e instanceof DedicatedSessionError&&!String(e).includes('private-token'));
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
