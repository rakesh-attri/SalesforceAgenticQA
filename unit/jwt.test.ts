import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,createVerify } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSalesforceToken,oauthFailureDiagnostic } from '../src/salesforce/jwt.js';

for(const [code,description,expected] of [
  ['invalid_request','refresh_token scope is required and the connected app should be installed and preauthorized','app installation/preauthorization'],
  ['invalid_grant',"user hasn't approved this consumer",'authorize the user'],
  ['invalid_grant','audience is invalid','audience rejected'],
  ['invalid_grant','invalid audience','audience rejected'],
  ['invalid_grant','signature validation failed','certificate/signature rejected'],
  ['invalid_grant','certificate mismatch','matching public certificate'],
  ['invalid_grant','invalid assertion','assertion rejected'],
  ['invalid_grant','expired assertion','system clock'],
  ['invalid_client','invalid client credentials','Consumer Key'],
  ['invalid_grant','authentication failure','active and authorized'],
  ['unauthorized_client','denied','approved-user policies'],
])test(`OAuth diagnostic classifies ${code}: ${description}`,async()=>{
  const diagnostic=await oauthFailureDiagnostic(new Response(JSON.stringify({error:code,error_description:description}),{status:400}));
  assert.ok(diagnostic.includes('HTTP 400'));assert.ok(diagnostic.includes(code));assert.ok(diagnostic.includes(expected));
});
test('unrecognized/non-JSON OAuth responses never echo provider payloads or credentials',async()=>{
  const secret='DO-NOT-LOG-CREDENTIAL';
  for(const response of [new Response(`<html>${secret}</html>`,{status:502}),new Response(JSON.stringify({error:secret,error_description:`Bearer ${secret}`,access_token:secret}),{status:400}),new Response(JSON.stringify({error:{nested:secret},error_description:[secret]}),{status:400}),new Response('null',{status:400})]){
    const message=await oauthFailureDiagnostic(response);assert.ok(!message.includes(secret));assert.ok(message.includes('withheld'));
  }
});
test('mocked JWT exchanges retain RS256 grant/security behavior and redact echoed secrets',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sfqa-jwt-'));
  const names=['SF_LOGIN_URL','SF_CLIENT_ID','SF_USERNAME','SF_PRIVATE_KEY_PATH'] as const;
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]])),originalFetch=globalThis.fetch;
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=privateKey.export({type:'pkcs8',format:'pem'}).toString(),consumer='mock-consumer-key-DO-NOT-LOG',user='mock-user@example.test';
  const keyPath=join(root,'test.key');await writeFile(keyPath,pem);
  process.env.SF_LOGIN_URL='https://test.salesforce.com';process.env.SF_CLIENT_ID=consumer;process.env.SF_USERNAME=user;process.env.SF_PRIVATE_KEY_PATH=keyPath;
  let mode:'failure'|'success'|'malformed'|'transport'='failure';
  try {
    globalThis.fetch=async(url,init)=>{
      assert.equal(String(url),'https://test.salesforce.com/services/oauth2/token');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.ok(init?.signal);
      const form=init!.body as URLSearchParams;assert.equal(form.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const jwt=form.get('assertion')!,[header,payload,signature]=jwt.split('.');assert.equal(JSON.parse(Buffer.from(header,'base64url').toString()).alg,'RS256');
      const claims=JSON.parse(Buffer.from(payload,'base64url').toString());assert.equal(claims.aud,'https://test.salesforce.com');assert.equal(claims.iss,consumer);assert.equal(claims.sub,user);assert.equal(claims.exp-claims.iat,180);
      const verifier=createVerify('RSA-SHA256');verifier.update(`${header}.${payload}`);verifier.end();assert.ok(verifier.verify(publicKey,Buffer.from(signature,'base64url')));
      if(mode==='transport')throw Error(`echo ${consumer} ${jwt}`);
      if(mode==='malformed')return new Response(`{"access_token":"LEAKED-TOKEN",${consumer}`,{status:200});
      if(mode==='success')return new Response(JSON.stringify({access_token:'mock-access-token',instance_url:'https://example.my.salesforce.com'}));
      const response=JSON.stringify({error:'invalid_grant',error_description:`audience is invalid ${consumer} ${user} ${jwt} ${pem}`,access_token:'LEAKED-TOKEN'});
      return new Response(response,{status:400});
    };
    await assert.rejects(getSalesforceToken(),error=>{const message=String(error);assert.match(message,/invalid_grant/);assert.match(message,/audience rejected/);for(const value of [consumer,user,pem,'LEAKED-TOKEN','eyJ'])assert.ok(!message.includes(value));return true;});
    mode='success';assert.deepEqual(await getSalesforceToken(),{access_token:'mock-access-token',instance_url:'https://example.my.salesforce.com'});
    mode='malformed';await assert.rejects(getSalesforceToken(),/^Error: Invalid Salesforce OAuth response$/);
    mode='transport';await assert.rejects(getSalesforceToken(),error=>{assert.ok(!String(error).includes(consumer));assert.match(String(error),/transport details withheld/);return true;});
  }finally{globalThis.fetch=originalFetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}await rm(root,{recursive:true,force:true});}
});
