import {z} from 'zod';
import {resolve} from 'node:path';
import {SpecSchema,ScenarioKindSchema} from '../specs/ingest.js';
import {OrgSnapshotSchema} from '../core/types.js';
import {knowledgeFingerprint} from '../knowledge/snapshots.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import type {History} from '../core/history.js';
import {ComponentGraphSchema,analyzeChangeImpact} from './component-graph.js';
import {analyzeRequirementConditions,intelligentSpecPlan} from './spec-intelligence.js';
import {validateJourney} from './workflow-models.js';
import {journeyEvidenceHash,acquireRenderedWorkflowEvidence} from './workflow-evidence.js';
import {planWorkflowJourney} from './workflow-planning.js';
import {generateTest} from './workflows.js';
import {fingerprint} from '../execution/browser-policy.js';
import {authorizePayload} from '../knowledge/reviewed.js';
import {environmentSecrets,redactModelValue} from '../ai/privacy.js';
import type {StructuredChat} from '../ai/types.js';
import {ReasoningAgents} from './reasoning.js';

export const BusinessRuleSchema=z.object({criterionId:z.string(),object:z.string(),persona:z.string().min(1),when:z.string().min(1),observable:z.string().min(1),expected:z.string().min(1),prerequisites:z.array(z.string().min(1)).min(1),dataRequirements:z.array(z.object({object:z.string(),field:z.string(),constraint:z.string().min(1)}).strict()),components:z.array(z.string()).default([])}).strict();
const normalized=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();

// Verification logic only: no credentials, HTTP transport or execution grant.
export function apiVerificationProposal(object:string,fields:string[],expected:Record<string,unknown>){
 const names=[object,...fields];if(!fields.length||names.some(n=>!/^[A-Za-z][A-Za-z0-9_]*$/.test(n))||Object.keys(expected).some(key=>!fields.includes(key)))throw Error('Invalid source API name or expected field');
 return `import { strict as assert } from 'node:assert';\n// Proposal only: obtain a separately approved exact-record read adapter and fresh schema.\nexport const expected = ${JSON.stringify(expected)};\nexport function queryForApprovedRecord(id:string){if(!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id))throw Error('Exact approved record ID required');return ${JSON.stringify(`SELECT ${[...new Set(['Id',...fields])].join(',')} FROM ${object} WHERE Id='`)}+id+"' LIMIT 1";}\nexport function verifyApprovedResponse(response:{records:Record<string,unknown>[]},id:string){queryForApprovedRecord(id);assert.equal(response.records.length,1);assert.equal(response.records[0].Id,id);for(const [field,value] of Object.entries(expected))assert.deepEqual(response.records[0][field],value);return {verified:true,executionAuthority:false};}\n`;
}

export async function designSalesforceTests(input:{spec:unknown;org:unknown;graph:unknown;permission:string;model?:unknown;changes?:string[];observations?:Array<{review:unknown;report:unknown;view:unknown}>},services:{history:History;index:KnowledgeIndex;browserHistory?:History}){
 const spec=SpecSchema.parse(input.spec),org=OrgSnapshotSchema.parse(input.org),graph=ComponentGraphSchema.parse(input.graph),scope={org:org.orgIdentityHash??org.orgAlias,permission:z.string().min(1).parse(input.permission)},metadataVersion=knowledgeFingerprint(org);
 if(graph.org!==scope.org||graph.knowledgeVersion!==metadataVersion)throw Error('Design graph org/source version differs');
 const graphContent={org:graph.org,knowledgeVersion:graph.knowledgeVersion,nodes:graph.nodes,edges:graph.edges,unknowns:graph.unknowns};if(graph.version!==fingerprint(graphContent))throw Error('Design dependency graph content changed without a new version');
 if(spec.acceptanceCriteria.length>500||spec.description.length>1000000)throw Error('Requirement analysis budget exceeded');
 if((input.observations?.length??0)>10)throw Error('Page evidence budget exceeded');
 const pages=(input.observations??[]).map(o=>acquireRenderedWorkflowEvidence(services.browserHistory??services.history,o.review,o.report,o.view));if(pages.some(p=>p.org!==scope.org||p.permission!==scope.permission))throw Error('Historical page evidence org/permission differs');
 const analysis=analyzeRequirementConditions(spec),impact=analyzeChangeImpact(graph,input.changes??[]),model=input.model?validateJourney(input.model):undefined;
 if(model&&(model.scope.permission!==scope.permission||model.scope.org!==scope.org))throw Error('Workflow design scope differs');
 const workflowPlan=model?await planWorkflowJourney(model,spec,org,graph,services.index,services.history,input.changes?.filter(c=>graph.nodes.some(n=>n.id===c))):undefined;
 const base=workflowPlan?.base??await intelligentSpecPlan(spec,org,services.index,services.history,scope.permission);
 const context=await services.index.retrieve(`${spec.title} ${spec.description} ${spec.acceptanceCriteria.map(c=>c.text).join(' ')}`,scope,50);
 const history=context.filter(d=>['defect','lesson'].includes(d.kind)&&d.schemaVersion===metadataVersion&&!!d.reviewer&&d.reviewer!=='REVIEW_REQUIRED');
 const rules:Array<{rule:z.infer<typeof BusinessRuleSchema>;citation:string;reviewed:boolean}>=[],questions:Array<{criterionId?:string;reason:string;source?:string}>=[],contradictions:Array<{key:string;criteria:string[];sources:string[];outcomes:string[]}>=[];
 for(const source of model?.sources??[])for(const [n,claim] of source.claims.entries())if(claim.kind==='business-rule'){
  let value:unknown;try{value=JSON.parse(claim.text);}catch{questions.push({reason:'Malformed business-rule evidence',source:`${source.id}@${source.version}#${n}`});continue;}
  const parsed=BusinessRuleSchema.safeParse(value),citation=`${source.id}@${source.version}#${n}`;
  if(!parsed.success){questions.push({reason:'Business-rule evidence is incomplete',source:citation});continue;}
  const rule=parsed.data,criterion=spec.acceptanceCriteria.find(c=>c.id===rule.criterionId),object=org.objects.find(o=>o.name===rule.object);
  if(!criterion||criterion.expectedText!==rule.expected||!object||rule.components.some(id=>!graph.nodes.some(n=>n.id===id))||rule.dataRequirements.some(d=>!org.objects.some(o=>o.name===d.object&&o.fields.some(f=>f.name===d.field)))){questions.push({criterionId:rule.criterionId,reason:'Rule differs from stated outcome, current object/field or component evidence',source:citation});continue;}
  rules.push({rule,citation,reviewed:['requirement','reviewed-knowledge'].includes(source.kind)&&source.verification==='source-stated'&&!!source.review&&source.review.reviewer!=='REVIEW_REQUIRED'&&source.review.hash===journeyEvidenceHash(source)});
 }
 const buckets=new Map<string,typeof rules>();for(const row of rules){const key=JSON.stringify([row.rule.object,row.rule.persona,row.rule.when,row.rule.observable].map(normalized));buckets.set(key,[...(buckets.get(key)??[]),row]);}
 for(const [key,rows] of buckets)if(new Set(rows.map(r=>r.rule.expected)).size>1)contradictions.push({key,criteria:rows.map(r=>r.rule.criterionId),sources:rows.map(r=>r.citation),outcomes:[...new Set(rows.map(r=>r.rule.expected))]});
 const conflicting=new Set(contradictions.flatMap(c=>c.criteria)),apiFiles:Array<{id:string;code:string;kind:string}>=[],files:Array<{id:string;code:string;kind:string}>=[];
 const scenarios=spec.acceptanceCriteria.map(ac=>{
  const bindings=model?.steps.flatMap(step=>step.outcomes.filter(o=>o.criterionId===ac.id).map(outcome=>({step,outcome})))??[],binding=bindings[0],ruleRows=rules.filter(r=>r.rule.criterionId===ac.id),reviewedRules=ruleRows.filter(r=>r.reviewed),reasons:string[]=[],id=binding?.outcome.workflow?.id??`${spec.id}-${ac.id}`;
  const current=workflowPlan?.scenarios.find(s=>s.criterionId===ac.id),components=[...new Set([...(binding?.step.components??[]),...ruleRows.flatMap(r=>r.rule.components)])],affected=components.filter(c=>impact.components.includes(c)),defects=history.filter(d=>d.testIds.includes(id));
  if(!reviewedRules.length)reasons.push('Review source-backed business conditions, persona, prerequisites and test-data requirements');
  if(questions.some(q=>q.criterionId===ac.id&&q.reason.startsWith('Rule differs')))reasons.push('Invalid business-rule evidence requires reconciliation');
  if(!current||current.status==='blocked')reasons.push(...(current?.reasons??[pages.length?'Historical stable pages are known; reviewed workflow transitions and business outcomes remain incomplete':'Reviewed workflow/page evidence is missing']));
  if(bindings.length>1)reasons.push('Multiple workflow mappings need an explicit scenario choice');
  if(binding&&reviewedRules.some(r=>r.rule.object!==binding.step.object))reasons.push('Business-rule object differs from the observed workflow page');
  if(reviewedRules.some(r=>r.rule.persona!==scope.permission))reasons.push('Different persona requires separately scoped evidence and session review');
  if(conflicting.has(ac.id))reasons.push('Contradictory outcomes for the same persona/condition/observable');
  if(ruleRows.length!==reviewedRules.length)reasons.push('Business-rule evidence awaits named review');
  if(!ac.expectedText)reasons.push('Exact expected result is missing');
  if(binding&&binding.outcome.kind!==ac.kind)reasons.push('Requirement and workflow scenario kinds differ');
  const prerequisites=[...new Set(reviewedRules.flatMap(r=>r.rule.prerequisites))],dataRequirements=reviewedRules.flatMap(r=>r.rule.dataRequirements);
  // Visual coverage remains a review scenario until an independently approved
  // baseline/oracle is supplied. A rendered text match is not a pixel comparison.
  if(ac.kind==='visual')reasons.push('Visual baseline, masking scope and comparison oracle require review');
  const source=[`${spec.source}@${spec.version}#${ac.id}`,...ruleRows.map(r=>r.citation),...(current?.evidence.map(e=>`${e.source}@${e.version}#${e.claim}`)??[])];
  const score=(model?.businessImpact??1)*10+affected.length*20+defects.length*50+(impact.unknown.length||impact.truncated?15:0),status=reasons.length?'review-required':'reviewable-proposal';
  if(!reasons.length&&binding?.outcome.workflow)files.push({id,kind:'playwright-typescript',code:generateTest(binding.outcome.workflow,[binding.outcome.workflow.origin],{module:resolve('src/execution/browser-guard.ts').replaceAll('\\','/'),config:resolve('.state/REVIEW_REQUIRED-test-design-guard.json'),ownsNetworkBoundary:true})});
  if(!reasons.length&&binding?.outcome.apiVerification){const api=binding.outcome.apiVerification;apiFiles.push({id:`${id}-api`,kind:'independent-api-verification',code:apiVerificationProposal(api.object,api.fields,api.expected)});}
  questions.push(...reasons.map(reason=>({criterionId:ac.id,reason})));
  return{id,criterionId:ac.id,kind:ac.kind,title:ac.text,expected:ac.expectedText,personas:[...new Set(reviewedRules.map(r=>r.rule.persona))],conditions:reviewedRules.map(r=>r.rule.when),prerequisites,dataRequirements,components,impact:affected,history:defects.map(d=>d.citation),mandatory:defects.length>0,score,status,reasons,evidence:source,executionAuthorized:false};
 }).sort((a,b)=>Number(b.mandatory)-Number(a.mandatory)||b.score-a.score||a.id.localeCompare(b.id));
 const kinds=ScenarioKindSchema.options,coverage=kinds.map(kind=>({kind,requirements:scenarios.filter(s=>s.kind===kind).length,reviewable:scenarios.filter(s=>s.kind===kind&&s.status==='reviewable-proposal').length}));
 for(const row of coverage)if(!row.requirements)questions.push({reason:`Provide source-supported ${row.kind} requirements and expected results`});
 questions.push(...impact.questions.map(reason=>({reason})),...analysis.questions.map(q=>typeof q==='string'?{reason:q}:{criterionId:q.criterionId,reason:q.question}));
 return{version:1,status:'proposed',scope:{...scope,metadataVersion,graphVersion:graph.version},specVersion:spec.version,analysis,application:{pageObservations:pages.map(p=>({source:p.id,version:p.version,claims:p.claims,historicalOnly:true,runtimeApprovalGranted:false})),components:graph.nodes.map(n=>({id:n.id,kind:n.kind,name:n.name,sources:n.sources})),objects:org.objects.map(o=>({object:o.name,describeCreateable:o.createable,effectivePersonaPermission:'unknown',recordTypes:o.recordTypeInfos??[],fields:o.fields.map(f=>({name:f.name,type:f.type,nillable:f.nillable,inputRequired:f.createable&&!f.nillable&&!f.defaultedOnCreate,defaultedOnCreate:f.defaultedOnCreate,createable:f.createable,updateable:f.updateable??'unknown',length:f.length,picklists:f.picklistValues,references:f.referenceTo}))})),declarations:graph.nodes.filter(n=>n.kind==='FlowCondition').map(n=>({component:n.id,declared:n.details,sources:n.sources,semantics:'metadata-declared-not-runtime'})),relationships:graph.edges,unknowns:graph.unknowns,runtimeBehaviorProven:false},impact,scenarios,coverage,contradictions,questions,files:[...files,...apiFiles],retrieval:{citations:context.map(d=>d.citation),confirmedHistory:history.map(d=>({citation:d.citation,testIds:d.testIds})),unmappedHistoricalTests:history.flatMap(d=>d.testIds.filter(id=>!scenarios.some(s=>s.id===id)).map(testId=>({testId,citation:d.citation,reviewRequired:true})))},traceability:scenarios.map(s=>({criterionId:s.criterionId,testId:s.id,evidence:s.evidence,expected:s.expected,prerequisites:s.prerequisites,dataRequirements:s.dataRequirements,status:s.status})),dataRequirements:base.data,executionAuthorized:false,permissionsGranted:0};
}
export type TestDesign=Awaited<ReturnType<typeof designSalesforceTests>>;

export function testDesignAIPayload(design:TestDesign){return redactModelValue({version:1,criteria:design.scenarios.map(s=>({id:s.id,kind:s.kind,title:s.title,expected:s.expected,conditions:s.conditions,score:s.score,citations:[...s.evidence,...s.history],history:s.history})),gaps:design.coverage.filter(c=>!c.requirements).map(c=>c.kind)},environmentSecrets());}
export async function reasonAboutTestDesign(design:TestDesign,chat:StructuredChat,approval:unknown){
 const payload=testDesignAIPayload(design),authorize=()=>{const review=authorizePayload(payload,approval,['gemini-chat']);if(review.operator==='REVIEW_REQUIRED')throw Error('Named external-AI review required');return review;};authorize();
 const advice=await new ReasoningAgents(chat).rankDesign(payload as {criteria:Array<{id:string;citations:string[]}>},authorize);
 const boosts=new Set(advice.priorities.filter(p=>p.priority==='high').map(p=>p.scenarioId));
 return{...design,ai:{status:'proposed',payloadHash:fingerprint(payload),advice,expectedOutcomesChanged:false},scenarios:design.scenarios.map(s=>({...s,score:s.score+(boosts.has(s.id)?10:0),aiReviewRequired:boosts.has(s.id)})).sort((a,b)=>Number(b.mandatory)-Number(a.mandatory)||b.score-a.score||a.id.localeCompare(b.id)),executionAuthorized:false};
}
