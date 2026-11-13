import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metadataRequest,parseMetadata } from '../src/salesforce/metadata.js';
test('Metadata SOAP only permits bounded named reads and escapes credentials',()=>{
  const xml=metadataRequest('CustomObject',['Account'],'secret<&');assert.ok(xml.includes('secret&lt;&amp;'));assert.ok(xml.includes('m:readMetadata'));
  assert.throws(()=>metadataRequest('deploy',['Account'],'x'));assert.throws(()=>metadataRequest('Flow',['</m:type>'],'x'));assert.throws(()=>metadataRequest('Flow',[],'x'));
});
test('Metadata parser rejects entities, faults and malformed XML, preserves read results',()=>{
  assert.throws(()=>parseMetadata('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>'));
  assert.throws(()=>parseMetadata('<s:Envelope xmlns:s="x"><s:Body><s:Fault>denied</s:Fault></s:Body></s:Envelope>'));
  const result=parseMetadata('<s:Envelope xmlns:s="x"><s:Body><readMetadataResponse><result><records><fullName>Account</fullName></records></result></readMetadataResponse></s:Body></s:Envelope>');
  assert.deepEqual(result,{records:{fullName:'Account'}});
});
