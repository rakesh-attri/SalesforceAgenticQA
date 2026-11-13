import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SalesforceClient } from '../src/salesforce/client.js';
import { getSalesforceToken } from '../src/salesforce/jwt.js';
test('environment flags cannot authorize Salesforce writes',async()=>{
  const previous=process.env.SFQA_ALLOW_WRITES;
  process.env.SFQA_ALLOW_WRITES='true';
  try {
    const client:SalesforceClient=Reflect.construct(SalesforceClient,['https://example.my.salesforce.com','not-a-token','v62.0']);
    await assert.rejects(client.request('POST','/services/data/v62.0/sobjects/Account',{Name:'test'}),/Writes are disabled/);
    for(const path of ['/services/data/../oauth2/token','/services/data/\\evil','https://evil.example/']) await assert.rejects(client.get(path));
  } finally {if(previous===undefined) delete process.env.SFQA_ALLOW_WRITES;else process.env.SFQA_ALLOW_WRITES=previous;}
});
test('JWT rejects deceptive or insecure hosts before loading credentials',async()=>{
  const previous=process.env.SF_LOGIN_URL;
  try {
    for(const host of ['https://evilsalesforce.com','http://test.salesforce.com','https://user:secret@test.salesforce.com','https://test.salesforce.com/path']) {
      process.env.SF_LOGIN_URL=host;
      await assert.rejects(getSalesforceToken(),/Unexpected Salesforce login host/);
    }
  } finally {if(previous===undefined) delete process.env.SF_LOGIN_URL;else process.env.SF_LOGIN_URL=previous;}
});
