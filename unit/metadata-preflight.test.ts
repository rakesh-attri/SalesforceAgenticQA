import {test} from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../src/core/history.js';
import {SalesforceClient} from '../src/salesforce/client.js';
import {environmentHash,type EnvironmentPolicy} from '../src/execution/environment.js';
import {digest,fingerprint} from '../src/execution/browser-policy.js';
import {MetadataFailureSchema,MetadataPreflightError,verifyMetadataSources} from '../src/execution/metadata-preflight.js';
import {dedicatedFixture} from './support/dedicated.js';

const path='/services/data/v62.0/tooling/sobjects/Flow/301000000000001';
const body={Metadata:{processType:'AutoLaunchedFlow',label:'Synthetic fixture only'}};
const item={area:'flow-details',path,expectedResponseHash:fingerprint(body),previousCoverage:'partial-reviewed-source'};

test('reviewed Flow metadata uses the read-only client while dedicated ownership and production-write guards stay enforced',async()=>{
 const h=new History(':memory:'),f=dedicatedFixture(h),original=globalThis.fetch;let calls=0;
 const definition={mode:'PRODUCTION_READ_ONLY_QA' as const,allowedOrgIds:[f.identity.Id],personas:[{name:'QA',userId:f.identity.userId}],allowedOrigins:[f.origin],capabilities:['metadata','soql'] as const};
 const policy={...definition,capabilities:[...definition.capabilities],approval:{operator:'fixture-reviewer',definitionHash:environmentHash({...definition,capabilities:[...definition.capabilities]}),expiresAt:new Date(Date.now()+1800000).toISOString()}} satisfies EnvironmentPolicy;
 const client=(p:EnvironmentPolicy)=>{const c=Reflect.construct(SalesforceClient,[f.origin,'FAKE_FIXTURE_TOKEN','v62.0']);Object.assign(c,{environment:{policy:p,identity:f.identity}});return c as SalesforceClient;};
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(body),{status:200});};
 try{
  const readOnly=client(policy);let evidence:any;
  const result=await verifyMetadataSources(readOnly,[item],()=>{},async v=>{evidence=v;});assert.equal(result.compared,1);assert(evidence.complete);assert.equal(calls,1);
  await assert.rejects(readOnly.request('POST','/services/data/v62.0/sobjects/Account',{}));await assert.rejects(readOnly.mutate({} as never,{} as never));assert.throws(()=>readOnly.dedicatedData(h));assert.equal(calls,1);
  await assert.rejects(verifyMetadataSources(client(f.policy),[item],()=>{},async()=>{}),e=>e instanceof MetadataPreflightError&&e.diagnostic.reason==='dedicated-reader-denied'&&e.diagnostic.sourceHash===digest(path));assert.equal(calls,1);assert.equal(f.writes.length,0);
 }finally{globalThis.fetch=original;h.close();}
});

test('metadata comparisons deduplicate reads and stop on changed source with hash-only evidence before later queries',async()=>{
 let calls=0,saved:any;const reader={async get<T>(){calls++;return structuredClone(body) as T;}};
 const success=await verifyMetadataSources(reader,[item,item],()=>{},async v=>{saved=v;});assert.equal(success.compared,2);assert.equal(success.uniqueReads,1);assert.equal(calls,1);
 await assert.rejects(verifyMetadataSources(reader,[{...item,expectedResponseHash:digest('different-source')},{...item,path:path+'2'}],()=>{},async v=>{saved=v;}),e=>e instanceof MetadataPreflightError&&e.diagnostic.reason==='source-drift'&&e.diagnostic.evidenceSaved&&e.diagnostic.actualHash===fingerprint(body));
 assert.equal(calls,2);assert.equal(saved.comparisons.length,1);assert(!JSON.stringify(saved).includes('Synthetic fixture only'));assert(!JSON.stringify(saved).includes(path));
});

test('metadata failure boundaries retain closed HTTP/JSON/policy reasons without provider messages or retry',async()=>{
 for(const [error,reason,status] of[[new Error('Salesforce API GET failed: 429'),'api-http',429],[new SyntaxError('PRIVATE_PROVIDER_CANARY'),'invalid-json',undefined],[new TypeError('PRIVATE_PROVIDER_CANARY'),'invalid-response',undefined],[new Error('Unapproved lifecycle operation/path/query'),'transport-policy-denied',undefined],[new Error('PRIVATE_PROVIDER_CANARY'),'unknown',undefined]] as const){
  let reads=0,saved:any;
  await assert.rejects(verifyMetadataSources({async get(){reads++;throw error;}},[item,item],()=>{},async v=>{saved=v;}),e=>e instanceof MetadataPreflightError&&e.diagnostic.reason===reason&&e.diagnostic.httpStatus===status&&e.diagnostic.evidenceSaved&&!JSON.stringify(e).includes('PRIVATE_PROVIDER_CANARY'));
  assert.equal(reads,1);assert(!JSON.stringify(saved).includes('PRIVATE_PROVIDER_CANARY'));
 }
 let reads=0;await assert.rejects(verifyMetadataSources({async get<T>(){reads++;return body as T;}},[item],()=>{throw Error('Original execution time budget exhausted');},async()=>{}),e=>e instanceof MetadataPreflightError&&e.diagnostic.reason==='budget');assert.equal(reads,0);
});

test('metadata diagnostics preserve the primary failure if evidence I/O fails and reject protected-field injection',async()=>{
 const reader={async get<T>(){return body as T;}};
 await assert.rejects(verifyMetadataSources(reader,[{...item,expectedResponseHash:digest('drift')}],()=>{},async()=>{throw Error('PRIVATE_STORAGE_CANARY');}),e=>e instanceof MetadataPreflightError&&e.diagnostic.reason==='source-drift'&&!e.diagnostic.evidenceSaved&&!JSON.stringify(e).includes('PRIVATE_STORAGE_CANARY'));
 await assert.rejects(verifyMetadataSources(reader,[item],()=>{},async()=>{throw Error('PRIVATE_STORAGE_CANARY');}),e=>e instanceof MetadataPreflightError&&e.diagnostic.reason==='evidence-write-failed'&&!e.diagnostic.evidenceSaved);
 assert(!MetadataFailureSchema.safeParse({stage:'metadata-source',reason:'unknown',area:'flow-details',sourceHash:digest(path),evidenceSaved:false,rawBody:'PRIVATE_PROVIDER_CANARY'}).success);
});
