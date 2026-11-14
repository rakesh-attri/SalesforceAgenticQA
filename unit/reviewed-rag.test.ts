import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { prepareReviewBundle,bundleHash,authorizeAI,ingestReviewedBundle,type ReviewBundle } from '../src/knowledge/reviewed.js';
import { groundedPlanning,validateGrounding } from '../src/agents/grounded.js';
import { IntelligenceSchema } from '../src/agents/org-intelligence.js';
import { StorySchema } from '../src/core/types.js';
import type { StructuredChat } from '../src/ai/types.js';
import type { z } from 'zod';
const now=new Date().toISOString();
const intel=IntelligenceSchema.parse({orgAlias:'fixture',observedAt:now,identity:{Id:'00D000000000001',userId:'005000000000001',IsSandbox:false},catalogCount:1,selection:{status:'proposed',selected:[],unresolved:[],omitted:[]},snapshot:{orgAlias:'fixture',source:'salesforce-api',observedAt:now,objects:[{name:'Account',label:'Private company',createable:true,fields:[{name:'Name',type:'string',createable:true,nillable:false,description:'private description',formula:'private formula'}],recordTypeInfos:[{name:'Private type',recordTypeId:'012000000000001'}]}]},sections:[{area:'permissions',status:'observed',source:'private:user',detail:'private',records:[{private:'record values'}]}],unknowns:[]});
const story=StorySchema.parse({id:'S',title:'Account name',description:'Synthetic Account name observation',objects:['Account'],acceptanceCriteria:[{id:'AC1',text:'Reviewed account name expectation'}]});
const bundle=()=>prepareReviewBundle(intel,story,'QA');
const review=(b:ReviewBundle)=>({operator:'fixture-reviewer',bundleHash:bundleHash(b),destinations:['gemini-chat','gemini-embeddings'],expiresAt:new Date(Date.now()+60000).toISOString()});
const output={scenarios:[{criterionId:'AC1',factIds:['field:Account.Name'],historyCitations:[],priority:'normal',questions:['workflow-unverified','data-writes-disabled']}]};
test('review export whitelists structural metadata and binds exact content, source, scope and destinations',()=>{
  const b=bundle(),serialized=JSON.stringify(b);assert.ok(b.facts.length===1);
  for(const text of ['00D000000000001','005000000000001','012000000000001','Private company','private description','private formula','record values','Private type'])assert.ok(!serialized.includes(text));
  assert.equal(authorizeAI(b,review(b),'gemini-chat').operator,'fixture-reviewer');
  for(const changed of [{...b,permission:'Other'},{...b,story:{...story,title:'Different'}},{...b,sourceVersion:'b'.repeat(64)}])assert.throws(()=>authorizeAI(changed,review(b),'gemini-chat'),/exact content/);
  assert.throws(()=>authorizeAI(b,review(b),'chroma'));
  assert.throws(()=>authorizeAI(b,{...review(b),expiresAt:'2000-01-01T00:00:00Z'},'gemini-chat'));
});
test('persistent semantic retrieval survives restart and isolates org, permission, version and embedding model',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/reviewed-rag-')),path=resolve(root,'history.sqlite'),b=bundle();let calls=0;
  const embed=async(texts:string[])=>{calls++;return texts.map(()=>[1,0]);};let h=new History(path);
  try {await ingestReviewedBundle(b,review(b),new KnowledgeIndex(h,embed,undefined,'model-A'));assert.equal(calls,1);h.close();h=new History(path);
    const index=new KnowledgeIndex(h,embed,undefined,'model-A'),scope={org:b.org,permission:b.permission};
    assert.equal((await index.retrieve('semantic synonym',scope))[0].id,'field:Account.Name');
    assert.equal((await index.retrieve('semantic synonym',{...scope,org:'other'})).length,0);assert.equal((await index.retrieve('semantic synonym',{...scope,permission:'other'})).length,0);
    assert.equal((await new KnowledgeIndex(h,embed,undefined,'model-B').retrieve('semantic synonym',scope)).length,0);
    const newer={...b,sourceVersion:'a'.repeat(64)};await ingestReviewedBundle(newer,review(newer),index);const hits=await index.retrieve('Account',scope);assert.ok(hits.every(d=>d.version===newer.sourceVersion));
  }finally{h.close();await rm(root,{recursive:true,force:true});}
});
test('retrieved metadata reaches five reasoning agents while model-created fields, outcomes and citations are rejected',async()=>{
  const b=bundle(),h=new History(':memory:'),prompts:string[]=[],index=new KnowledgeIndex(h,async texts=>texts.map(()=>[1,0]));
  const chat:StructuredChat={async generate<T>(input:{system:string;prompt:string;schema:z.ZodType<T>}){prompts.push(input.prompt);return input.schema.parse(output) as T;}};
  try {await ingestReviewedBundle(b,review(b),index);const result=await groundedPlanning(b,review(b),index,chat);assert.equal(prompts.length,5);assert.ok(prompts.every(p=>p.includes('field:Account.Name')));assert.equal(result.scenarios[0].expected,story.acceptanceCriteria[0].text);assert.equal(result.executable,false);assert.equal(result.evaluation.criteriaCoverage,1);
    const hits=await index.retrieve('Account',{org:b.org,permission:b.permission});
    for(const row of [{...output.scenarios[0],factIds:['field:Account.Invented__c']},{...output.scenarios[0],criterionId:'invented'},{...output.scenarios[0],historyCitations:['fake@v1']},{...output.scenarios[0],expected:'invented success'}])assert.throws(()=>validateGrounding({scenarios:[row]},b,hits));
    assert.throws(()=>validateGrounding({scenarios:[]},b,hits),/omitted/);
  }finally{h.close();}
});
test('reviewed historical defects and lessons force regressions independently of model priority',async()=>{
  let b=bundle();b={...b,history:[{id:'lesson:known',version:'1',org:b.org,permission:b.permission,kind:'lesson',status:'verified',reviewer:'human',text:'Account Name regression',evidence:['fixture:failure','fixture:passing-regression'],testIds:['T-required'],capturedAt:now}]};
  const h=new History(':memory:'),index=new KnowledgeIndex(h,async texts=>texts.map(()=>[1,0]));let calls=0;
  const chat:StructuredChat={async generate<T>(input:{system:string;prompt:string;schema:z.ZodType<T>}){calls++;assert.ok(input.prompt.includes('lesson:known@1'));return input.schema.parse({...output,scenarios:[{...output.scenarios[0],historyCitations:['lesson:known@1']}]}) as T;}};
  try {await ingestReviewedBundle(b,review(b),index);const report=await groundedPlanning(b,review(b),index,chat);assert.deepEqual(report.mandatoryRegression,['T-required']);assert.equal(calls,5);}
  finally{h.close();}
});
test('missing data review blocks embeddings and chat before either provider is called',async()=>{
  const h=new History(':memory:');let calls=0;const index=new KnowledgeIndex(h,async()=>{calls++;return [[1,0]];});
  try {await assert.rejects(ingestReviewedBundle(bundle(),{...review(bundle()),bundleHash:'0'.repeat(64)},index));assert.equal(calls,0);}
  finally{h.close();}
});
