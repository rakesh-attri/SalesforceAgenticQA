import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readContractCandidates } from '../src/execution/read-contract-evidence.js';
const origin='https://fixture.my.salesforce.com',owned='001000000000001',descriptor='serviceComponent://ui.fixture.ReadController/ACTION$getBootstrap';
const body=(actions:unknown[])=>new URLSearchParams({message:JSON.stringify({actions}),'aura.token':'TOKEN_CANARY','aura.context':'CONTEXT_CANARY'}).toString();
const request=(actions:unknown[])=>({url:origin+'/aura',method:'POST',type:'xhr',body:body(actions)});
test('private Aura review candidates preserve only identifiers/types and cannot establish permission or read safety',()=>{
  const values=readContractCandidates(request([{descriptor,params:{recordId:owned,foreignId:'001999999999999',config:{secret:'NESTED_CANARY'},count:2,active:true,fields:['VALUE_CANARY'],missing:null}}]),[origin],[owned]);
  assert.equal(values.length,1);assert.equal(values[0].descriptor,descriptor);assert.equal(values[0].parameters.find(p=>p.name==='recordId')?.exactOwnedReference,true);assert.equal(values[0].parameters.find(p=>p.name==='foreignId')?.exactOwnedReference,false);assert.equal(values[0].requestExecuted,false);assert.equal(values[0].reviewRequired,true);assert.equal(values[0].readSafetyEstablished,false);
  for(const secret of [owned,'001999999999999','VALUE_CANARY','NESTED_CANARY','TOKEN_CANARY','CONTEXT_CANARY'])assert.ok(!JSON.stringify(values).includes(secret));
  const queried=readContractCandidates({...request([{descriptor,params:{_configuration:'PRIVATE_QUERY_CANARY'}}]),url:origin+'/aura?r=PRIVATE_QUERY_VALUE'},[origin],[owned]);assert.equal(queried.length,1);assert.equal(queried[0].queryPresent,true);assert.equal(queried[0].queryKeyCount,1);assert.ok(!JSON.stringify(queried).includes('PRIVATE_QUERY'));assert.equal(queried[0].readSafetyEstablished,false);
});
test('candidate extraction rejects foreign routes, methods, malformed/oversized bodies, credential query strings and non-read names',()=>{
  const valid=request([{descriptor,params:{recordId:owned}}]);
  for(const override of [{url:'https://foreign.example/aura'},{url:origin+'/aura?token=CANARY'},{url:origin+'/services/data/v62.0/query'},{method:'GET'},{type:'document'},{body:'message=invalid'},{body:'x'.repeat(262145)},{body:body(Array.from({length:11},()=>({descriptor,params:{}})))},{body:valid.body+'&message=%7B%7D'}])assert.deepEqual(readContractCandidates({...valid,...override},[origin],[owned]),[]);
  for(const name of ['save','delete','pay','reportFailedAction'])assert.deepEqual(readContractCandidates(request([{descriptor:descriptor.replace('getBootstrap',name),params:{}}]),[origin],[owned]),[]);
  assert.deepEqual(readContractCandidates(request([{descriptor,params:{'bad-name':'CANARY'}}]),[origin],[owned]),[]);
});
