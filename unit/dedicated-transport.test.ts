import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { SalesforceClient } from '../src/salesforce/client.js';
import type { Mutation } from '../src/salesforce/approval.js';
test('native dedicated transport writes only through owned service while generic/Sandbox APIs and unowned business reads remain denied',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h,'native-dedicated'),original=globalThis.fetch,client:SalesforceClient=Reflect.construct(SalesforceClient,[f.origin,'mock-token','v62.0']);Reflect.set(client,'environment',{policy:f.policy,identity:f.identity});client.identity=async()=>f.identity;
  globalThis.fetch=async(url,init)=>{const u=new URL(String(url));assert.equal(u.origin,f.origin);if((init?.method??'GET')==='GET')return new Response(JSON.stringify(await f.api.get(u.pathname+u.search)));
    const parts=u.pathname.split('/'),object=parts[5],m:Mutation={runId:f.input.data.plan.runId,object,operation:init?.method==='POST'?'create':'delete',id:init?.method==='DELETE'?parts[6]:undefined,values:init?.method==='POST'?JSON.parse(String(init.body)):{}};
    assert.ok(['Account','Contact'].includes(object));assert.ok(['POST','DELETE'].includes(init!.method!));const result=await f.api.dispatch(m);return result?new Response(JSON.stringify(result),{status:201}):new Response(null,{status:204});};
  try {await assert.rejects(client.request('POST','/services/data/v62.0/sobjects/Account',{Name:'unapproved'}));await assert.rejects(client.get('/services/data/v62.0/query?q=SELECT%20Id%20FROM%20Account%20LIMIT%201'),/run-owned/);const data=client.dedicatedData(h);await data.open(f.input.data,f.org);await data.setup(f.input.data);assert.equal(f.writes.length,2);await data.cleanup(f.input.data);data.finish(f.input.data);assert.equal(f.records.size,0);assert.equal(f.writes.length,4);
    const m:Mutation={runId:'sandbox-bypass',object:'Account',operation:'create',values:{Name:'unapproved'}};await assert.rejects(client.mutate(m,data.approval(f.input.data,m)));assert.equal(f.writes.length,4);
  }finally{globalThis.fetch=original;h.close();}
});
test('dedicated UI bridge keeps grant/scopes unchanged and withholds token/one-time URL diagnostics',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),original=globalThis.fetch,client:SalesforceClient=Reflect.construct(SalesforceClient,[f.origin,'mock-secret-token','v62.0']);Reflect.set(client,'environment',{policy:f.policy,identity:f.identity});client.identity=async()=>f.identity;
  try {globalThis.fetch=async(url,init)=>{assert.ok(String(url).includes('/services/oauth2/singleaccess'));assert.equal(init?.method,'GET');assert.ok(!String(url).includes('mock-secret-token'));return new Response('Invalid_Scope mock-secret-token',{status:400});};await assert.rejects(client.dedicatedBrowserBridge(),error=>error instanceof Error&&error.message.includes('web scope')&&!error.message.includes('mock-secret-token'));
    globalThis.fetch=async()=>new Response(JSON.stringify({frontdoor_uri:'https://evil.example/secur/frontdoor.jsp?otp=private-one-time'}));await assert.rejects(client.dedicatedBrowserBridge(),error=>error instanceof Error&&!error.message.includes('private-one-time'));
  }finally{globalThis.fetch=original;h.close();}
});
