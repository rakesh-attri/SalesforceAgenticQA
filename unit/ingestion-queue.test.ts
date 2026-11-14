import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { IngestionQueue } from '../src/knowledge/ingestion-queue.js';
import { ReviewBundleSchema,bundleHash,type ReviewBundle } from '../src/knowledge/reviewed.js';
import { ModelProviderError,geminiEmbeddings } from '../src/ai/gemini.js';
const bundle=(version='a'.repeat(64),capturedAt='2026-11-14T00:00:00Z')=>ReviewBundleSchema.parse({org:'f'.repeat(64),permission:'QA',sourceVersion:version,capturedAt,story:{id:'S',title:'Account',description:'Synthetic Account',objects:['Account'],acceptanceCriteria:[{id:'AC1',text:'Review name'}]},facts:Array.from({length:5},(_,i)=>({id:`field:Account.Field${i}`,object:'Account',field:`Field${i}`,type:'string',required:i===0,references:[],source:`describe:Account@${version}`})),history:[]});
const review=(b:ReviewBundle)=>({operator:'fixture-reviewer',bundleHash:bundleHash(b),destinations:['gemini-embeddings'],expiresAt:new Date(Date.now()+86400000).toISOString()});
test('persistent ingestion resumes batches after restart, deduplicates hashes and reuses unchanged facts across source versions',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/queue-')),path=resolve(root,'queue.sqlite');let h=new History(path),calls=0;
  const embed=async(texts:string[])=>{calls++;return texts.map(()=>[1,0]);},b=bundle();
  try {let q=new IngestionQueue(h,new KnowledgeIndex(h,undefined,undefined,'A'),embed,'A');q.enqueue(b,review(b));const first=await q.drain(b,review(b),{batchSize:2,maxRequestsPerRun:1,minIntervalMs:0});assert.equal(first.requests,1);assert.deepEqual(q.status(b),[{status:'complete',count:2},{status:'pending',count:3}]);h.close();h=new History(path);
    const index=new KnowledgeIndex(h,undefined,undefined,'A');q=new IngestionQueue(h,index,embed,'A');await q.drain(b,review(b),{batchSize:2,minIntervalMs:0});assert.equal(calls,3);q.enqueue(b,review(b));assert.equal((await q.drain(b,review(b),{minIntervalMs:0})).requests,0);assert.equal(calls,3);
    const newer=bundle('b'.repeat(64),'2026-11-14T00:01:00Z');q.enqueue(newer,review(newer));await q.drain(newer,review(newer),{minIntervalMs:0});assert.equal(calls,3);assert.deepEqual(q.status(newer),[{status:'complete',count:5}]);assert.ok((await index.retrieve('Account',{org:b.org,permission:b.permission})).every(d=>d.version===newer.sourceVersion));await assert.rejects(q.drain(b,review(b)),/no longer current/);assert.throws(()=>q.enqueue(b,review(b)),/stale/);
  }finally{h.close();await rm(root,{recursive:true,force:true});}
});
test('Retry-After persists across restarts and cannot be bypassed by draining early',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/queue-rate-')),path=resolve(root,'queue.sqlite');let h=new History(path),now=Date.now(),calls=0,fail=true;
  const b=bundle(),embed=async(texts:string[])=>{calls++;if(fail)throw new ModelProviderError('rate-limit',429,undefined,60000);return texts.map(()=>[1,0]);};
  try {let q=new IngestionQueue(h,new KnowledgeIndex(h),embed,'A',()=>now);q.enqueue(b,review(b));const first=await q.drain(b,review(b),{minIntervalMs:0});assert.equal(first.deferredUntil,now+60000);assert.equal(calls,1);h.close();h=new History(path);q=new IngestionQueue(h,new KnowledgeIndex(h),embed,'A',()=>now);
    now+=59999;assert.equal((await q.drain(b,review(b),{minIntervalMs:0})).requests,0);assert.equal(calls,1);now+=2;fail=false;await q.drain(b,review(b),{minIntervalMs:0});assert.equal(calls,2);assert.deepEqual(q.status(b),[{status:'complete',count:5}]);
  }finally{h.close();await rm(root,{recursive:true,force:true});}
});
test('approval, daily quotas, model/org/permission cache isolation and malformed vectors fail closed',async()=>{
  const h=new History(':memory:');let calls=0;const embed=async(texts:string[])=>{calls++;return texts.map(()=>[1,0]);},index=new KnowledgeIndex(h),b=bundle(),q=new IngestionQueue(h,index,embed,'A');
  try {assert.throws(()=>q.enqueue(b,{...review(b),expiresAt:'2000-01-01T00:00:00Z'}));assert.equal(calls,0);q.enqueue(b,review(b));await q.drain(b,review(b),{batchSize:2,maxTextsPerDay:2,minIntervalMs:0});assert.equal(calls,1);assert.equal((await q.drain(b,review(b),{batchSize:2,maxTextsPerDay:2,minIntervalMs:0})).requests,0);
    const other={...b,org:'e'.repeat(64),permission:'Other'};q.enqueue(other,review(other));assert.equal(q.status(other).find(s=>s.status==='pending')?.count,5);assert.equal((await q.drain(other,review(other),{maxTextsPerDay:2,minIntervalMs:0})).requests,0);
    const different=new IngestionQueue(h,index,async()=>[[]],'B');different.enqueue(b,review(b));await different.drain(b,review(b),{minIntervalMs:0});assert.equal(different.status(b).find(s=>s.status==='blocked')?.count,5);assert.equal((await different.drain(b,review(b),{minIntervalMs:0})).requests,0);assert.equal(different.retryBlocked(b,review(b)),5);
    let release!:()=>void,parallelCalls=0;const gate=new Promise<void>(r=>{release=r;}),controlled=async(texts:string[])=>{parallelCalls++;await gate;return texts.map(()=>[1,0]);},one=new IngestionQueue(h,index,controlled,'C'),two=new IngestionQueue(h,index,controlled,'C');one.enqueue(b,review(b));const running=one.drain(b,review(b),{minIntervalMs:0});await Promise.resolve();try{const concurrent=await two.drain(b,review(b),{minIntervalMs:0});assert.ok('deferred' in concurrent&&concurrent.deferred);assert.equal(parallelCalls,1);}finally{release();}await running;
  }finally{h.close();}
});
test('small Gemini batches and long Retry-After diagnostics are bounded and sanitized',async()=>{
  const sizes:number[]=[],embed=geminiEmbeddings({apiKey:'mock',model:'mock-model',retries:0,batchSize:2},{fetch:async(_u,init)=>{const body=JSON.parse(String(init?.body));sizes.push(body.requests.length);return new Response(JSON.stringify({embeddings:body.requests.map(()=>({values:[1,0]}))}));}});
  assert.equal((await embed(['a','b','c','d','e'])).length,5);assert.deepEqual(sizes,[2,2,1]);
  const limited=geminiEmbeddings({apiKey:'mock',model:'mock-model',retries:0},{fetch:async()=>new Response('private provider key',{status:429,headers:{'retry-after':'90'}})});
  await assert.rejects(limited(['a']),error=>error instanceof ModelProviderError&&error.retryAfterMs===90000&&!error.message.includes('private provider key'));
});
