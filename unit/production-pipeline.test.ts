import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir,mkdtemp,rm,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { createSpecPipeline,PipelineInputSchema,executionHash } from '../src/agents/pipeline.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { ObservationPlanSchema,observationHash } from '../src/execution/observation.js';
const orgId='00D000000000001',userId='005000000000001';
function input() {
  const org=OrgSnapshotSchema.parse({orgIdentityHash:createHash('sha256').update(orgId).digest('hex'),orgAlias:'production-fixture',source:'salesforce-api',observedAt:new Date().toISOString(),objects:[]});
  const plan=ObservationPlanSchema.parse({identity:{orgId,userId,persona:'QA'},sessionReceipt:'.auth/missing.json',documents:[{url:'https://org.example/observations',nonMutatingReviewed:true,source:'reviewed:fixture'}],identityMarkers:{org:'org',user:'user',persona:'persona'},reads:[{page:0,criterionId:'AC1',testId:'status',expectedText:'Ready'}]});
  return PipelineInputSchema.parse({runId:'prod-graph',spec:{id:'S',title:'Read observation',description:'Observe approved existing state',source:'fixture:story',version:'1',objects:[],acceptanceCriteria:[{id:'AC1',text:'Ready',expectedText:'Ready'}]},org,orgVersion:snapshotVersion(org),permission:'QA',allowedOrigins:['https://org.example'],mappings:[],productionReadOnly:{plan,approval:{operator:'fixture-reviewer',planHash:observationHash(plan),expiresAt:new Date(Date.now()+60000).toISOString()}}});
}
test('spec graph dispatches production read-only observations without generic workflow execution or data setup',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/production-graph-')),h=new History(':memory:');let calls=0;
  const graph=createSpecPipeline({history:h,knowledge:new KnowledgeIndex(h),root,observe:async()=>{calls++;return {mode:'PRODUCTION_READ_ONLY_QA',status:'passed',checks:[{page:0,criterionId:'AC1',testId:'status',passed:true,durationMs:1}],blockedRequests:0,javaScriptEnabled:false,mutationsEnabled:false};}});
  try {const request=input();request.executionApproval={reviewer:'fixture-reviewer',hash:executionHash(request)};const result=await graph.invoke({input:request});
    assert.equal(calls,1);assert.equal(result.files.length,0);assert.equal(result.execution,undefined);assert.equal(result.lifecycle.created,0);assert.equal(result.lifecycle.status,'passed');assert.equal(h.results()[0].status,'passed');assert.equal(result.analysis.data.steps.length,0);
    assert.equal(JSON.parse(await readFile(result.reportPath,'utf8')).mode,'PRODUCTION_READ_ONLY_QA');await assert.rejects(graph.invoke({input:request}));assert.equal(calls,1);
  }finally{h.close();await rm(root,{recursive:true,force:true});}
});
test('production graph denies data recipes, invented assertions and unbound org metadata before runtime dispatch',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/production-gates-')),h=new History(':memory:');let calls=0;
  const graph=createSpecPipeline({history:h,knowledge:new KnowledgeIndex(h),root,observe:async()=>{calls++;throw Error('must not dispatch');}});
  try {const a=input();a.productionReadOnly!.plan.reads[0].expectedText='Invented';await assert.rejects(graph.invoke({input:a}),/exactly match/);
    const b=input();b.dataSetup={recipes:[{id:'R',object:'Account',version:'1',orgAlias:b.org.orgAlias,sourceVersion:b.orgVersion,reviewedBy:'fixture-reviewer',evidence:['fixture:recipe'],mode:'api',fields:{}}],cleanup:'always'};await assert.rejects(graph.invoke({input:b}),/data setup/);
    const c=input();delete c.org.orgIdentityHash;c.orgVersion=snapshotVersion(c.org);await assert.rejects(graph.invoke({input:c}),/org-bound/);assert.equal(calls,0);
  }finally{h.close();await rm(root,{recursive:true,force:true});}
});
