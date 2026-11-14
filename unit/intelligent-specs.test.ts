import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnstructured,SpecSchema } from '../src/specs/ingest.js';
import { intelligentSpecPlan } from '../src/agents/spec-intelligence.js';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { confirmDefect,investigateFailure,failureSimilarity } from '../src/agents/intelligence.js';
import { schemaFingerprint } from '../src/knowledge/snapshots.js';
import { benchmarkRetrieval } from '../src/knowledge/benchmarks.js';
import { reuseReviewedKnowledge } from '../src/knowledge/reviewed.js';
const org=OrgSnapshotSchema.parse({orgAlias:'synthetic-specs',source:'fixture',observedAt:'2026-11-14',objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true}]}]});
test('unstructured BDD, acceptance bullets and intent keep exact source spans and never invent executable expectations',async()=>{
  const text='As a sales rep, I want to review an Account draft.\nGiven an Account draft\nWhen the name is supplied\nThen status text is Draft ready\n\nGiven invalid required input\nWhen the draft is reviewed\nThen it must not be saved';
  const spec=parseUnstructured(text,'fixture:story','v1');assert.equal(spec.requiresReview,true);assert.equal(spec.persona,'sales rep');assert.equal(spec.acceptanceCriteria.length,2);assert.equal(spec.acceptanceCriteria[1].kind,'negative');assert.ok(spec.acceptanceCriteria.every(ac=>ac.expectedText===undefined&&spec.description.slice(ac.sourceSpan!.start,ac.sourceSpan!.end)===ac.text));
  const bullet=parseUnstructured('As a QA user I want Account validation\nAcceptance criteria:\n- At most 80 characters are accepted\n- The API integration reports the approved result','fixture:bullet','v1');assert.deepEqual(bullet.acceptanceCriteria.map(a=>a.kind),['boundary','integration']);
  const intent=parseUnstructured('As an analyst, I want to inspect an Account','fixture:intent','v1');assert.equal(intent.acceptanceCriteria.length,1);assert.equal(intent.acceptanceCriteria[0].expectedText,undefined);
  const h=new History(':memory:');try {const plan=await intelligentSpecPlan(spec,org,new KnowledgeIndex(h),h,'QA');assert.equal(plan.files.length,0);assert.equal(plan.coverage.blocked,2);assert.ok(plan.discoverySteps.length);assert.ok(plan.gaps.some(g=>g.kind==='integration'));assert.equal(plan.actors[0].name,'sales rep');assert.ok(plan.objectResolution.selected.some(o=>o.name==='Account'));assert.equal(plan.executable,false);}finally{h.close();}
  const changed=structuredClone(spec);changed.acceptanceCriteria[0].text='Invented';assert.throws(()=>SpecSchema.parse(changed),/source span/);
});
test('only source-reviewed literal outcomes and exact approved workflows generate TypeScript; no action is invented',async()=>{
  const spec=parseUnstructured('Given an Account draft\nWhen reviewed\nThen status text is Draft ready','fixture:story','v1');spec.acceptanceCriteria[0].expectedText='Draft ready';
  const binding={criterionId:'AC1',preconditions:['Synthetic existing draft'],workflow:{id:'draft-review',criterion:'AC1',reviewer:'fixture-reviewer',source:'fixture:observed-workflow',origin:'http://127.0.0.1:8765',path:'/lightning/o/Account',steps:[{action:'fill',locator:{by:'label',value:'Account name'},value:'Synthetic QA'},{action:'click',locator:{by:'role',value:'button',name:'Review draft'}}],assertion:{locator:{by:'testId',value:'draft-status'},text:'Draft ready'}}};
  const h=new History(':memory:'),index=new KnowledgeIndex(h);try {const blocked=await intelligentSpecPlan(spec,org,index,h,'QA',[binding]);assert.equal(blocked.files.length,0);
    const plan=await intelligentSpecPlan(spec,org,index,h,'QA',[binding],{reviewer:'fixture-reviewer',sourceVersion:'v1'});assert.equal(plan.files.length,1);assert.ok(plan.files[0].code.includes('toHaveText("Draft ready")'));assert.equal(plan.traceability[0].criterionId,'AC1');assert.equal(plan.coverage.reviewed,1);
    await assert.rejects(intelligentSpecPlan(spec,org,index,h,'QA',[binding],{reviewer:'reviewer',sourceVersion:'other'}),/exact source/);
    const invented=structuredClone(spec);invented.acceptanceCriteria[0].expectedText='Invented';await assert.rejects(intelligentSpecPlan(invented,org,index,h,'QA',[binding],{reviewer:'reviewer',sourceVersion:'v1'}),/literally/);
  }finally{h.close();}
});
test('confirmed recorded fixture failure and regression influence a later plan, while stale schema lessons stop influencing it',async()=>{
  const h=new History(':memory:'),index=new KnowledgeIndex(h),scope={org:org.orgAlias,permission:'QA'};index.bindSchema(scope,schemaFingerprint(org));
  const spec=SpecSchema.parse({id:'S',title:'Account name',description:'Account Name required validation',objects:['Account'],source:'fixture:story',version:'1',acceptanceCriteria:[{id:'AC1',text:'Name required',expectedText:'Name required'}]}),at=new Date().toISOString();
  const binding={criterionId:'AC1',preconditions:['Reviewed synthetic draft'],workflow:{id:'T-required',criterion:'AC1',source:'fixture:workflow',reviewer:'fixture-reviewer',origin:'http://127.0.0.1:8765',path:'/',steps:[],assertion:{locator:{by:'testId',value:'status'},text:'Name required'}}};
  try {const before=await intelligentSpecPlan(spec,org,index,h,'QA',[binding]);assert.equal(before.selection[0].mandatory,false);
    const graph={org:scope.org,version:'1',knowledgeVersion:schemaFingerprint(org),nodes:[{id:'SObject:Account',kind:'SObject',name:'Account',sources:['fixture:describe']}],edges:[],unknowns:[]},impacted=await intelligentSpecPlan(spec,org,index,h,'QA',[binding],undefined,{graph,changed:['SObject:Account']});assert.equal(impacted.selection[0].score,before.selection[0].score+20);await assert.rejects(intelligentSpecPlan(spec,org,index,h,'QA',[binding],undefined,{graph:{...graph,org:'other'},changed:[]}),/org\/version/);
    h.record({runId:'recorded-failure',testId:'T-required',status:'failed',durationMs:1,components:['Account'],evidence:['fixture:recorded-trace'],at});h.record({runId:'recorded-regression',testId:'T-required',status:'passed',durationMs:1,components:['Account'],evidence:['fixture:recorded-regression'],at});
    const proposal=await investigateFailure(index,scope,{testId:'T-required',message:'Account Name required validation mismatch',expected:'Name required',observed:'Draft ready',evidence:['fixture:recorded-trace']});
    await confirmDefect(h,index,scope,proposal,{reviewer:'fixture-reviewer',rootCause:'Account Name required validation was skipped',fix:'Restore synthetic required-name check',regressionRun:'recorded-regression'});
    const after=await intelligentSpecPlan(spec,org,index,h,'QA',[binding]);assert.ok(after.selection[0].mandatory);assert.ok(after.selection[0].score>before.selection[0].score);assert.deepEqual(after.mandatoryRegression,['T-required']);assert.ok(after.traceability[0].history.length);
    const correlated=await investigateFailure(index,scope,{testId:'other-test',message:'Account Name required validation mismatch',expected:'Name required',evidence:['fixture:other']});assert.ok(correlated.correlations.length);assert.ok(correlated.rootCauseHypotheses.every(r=>!r.verifiedForCurrentFailure));assert.equal(correlated.rootCauseHypotheses[0].cause,'Account Name required validation was skipped');assert.deepEqual(correlated.regressionRecommendations,['T-required']);assert.equal(failureSimilarity('Request 123 failed','Request 456 failed'),1);
    const changed=structuredClone(org);changed.objects[0].fields[0].nillable=true;const stale=await intelligentSpecPlan(spec,changed,index,h,'QA',[binding]);assert.equal(stale.selection[0].mandatory,false);assert.ok(index.staleLessons(scope).some(s=>s.reason==='source-invalidated'));
  }finally{h.close();}
});
test('retrieval relevance benchmarks report ranking and exclude wrong-permission/unreviewed/stale sources',async()=>{
  const h=new History(':memory:'),index=new KnowledgeIndex(h),at=new Date().toISOString();
  try {for(const [id,text,permission,status] of [['name','Account Name required','QA','verified'],['contact','Contact LastName required','QA','verified'],['private','Account Name required','Other','verified'],['proposed','Account Name required','QA','proposed']] as const)await index.ingest({id,version:'1',org:'fixture',permission,kind:'org',status,text,evidence:['fixture:metadata'],reviewer:'fixture-reviewer',capturedAt:at,testIds:[]});
    const report=await benchmarkRetrieval(index,[{id:'name',query:'Account Name',scope:{org:'fixture',permission:'QA'},relevant:['name@1']}],1);assert.equal(report.mean.mrr,1);assert.equal(report.mean.ndcg,1);assert.equal(report.mean.precision,1);assert.deepEqual(report.cases[0].retrieved,['name@1']);
    const target=new History(':memory:');try {const operational=new KnowledgeIndex(target);assert.equal(await reuseReviewedKnowledge(index,operational,{org:'fixture',permission:'QA'},'1'),2);assert.equal(operational.all({org:'fixture',permission:'QA'}).length,2);assert.equal(await reuseReviewedKnowledge(index,operational,{org:'fixture',permission:'Other'},'stale'),0);assert.equal(operational.all({org:'fixture',permission:'Other'}).length,0);}finally{target.close();}
  }finally{h.close();}
});
