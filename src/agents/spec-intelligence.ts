import { z } from 'zod';
import { SpecSchema,type Spec } from '../specs/ingest.js';
import type { OrgSnapshot } from '../core/types.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { History } from '../core/history.js';
import { WorkflowSchema,generateTest } from './workflows.js';
import { selectStoryObjects } from './org-intelligence.js';
import { proposeDataPlan } from './data-agent.js';
import { proposeStoryRelationships } from './intelligence-plan.js';
import { prioritize } from './quality.js';
import { knowledgeFingerprint } from '../knowledge/snapshots.js';
import { ComponentGraphSchema,impactedComponents } from './component-graph.js';
export const SpecBindingsSchema=z.array(z.object({criterionId:z.string(),workflow:WorkflowSchema,preconditions:z.array(z.string().min(1)).default([])}));
export function analyzeRequirementConditions(raw:unknown){
  const spec=SpecSchema.parse(raw),actors=[...new Set([...(spec.persona?[spec.persona]:[]),...[...spec.description.matchAll(/\bAs an? ([^,\n]+?),?\s+I want\b/gi)].map(m=>m[1])])];
  const criteria=spec.acceptanceCriteria.map(ac=>{const clauses=[...ac.text.matchAll(/\b(Given|When|Then|Unless|If|Except|Only if)\s+([^]*?)(?=\b(?:Given|When|Then|Unless|If|Except|Only if)\s+|$)/gi)].map(m=>({role:m[1].toLowerCase(),text:m[2].trim(),offset:m.index!,citation:`${spec.source}@${spec.version}#${ac.id}`}));return{criterionId:ac.id,kind:ac.kind,literal:ac.text,expected:ac.expectedText,clauses,boundaries:[...ac.text.matchAll(/\b(?:at most|at least|maximum|minimum|exactly|up to)\s+\d+(?:\.\d+)?(?:\s+[a-z]+)?/gi)].map(m=>({text:m[0],offset:m.index!,citation:`${spec.source}@${spec.version}#${ac.id}`})),questions:[...(!ac.expectedText?['What exact expected result is approved?']:[]),...(!clauses.some(c=>['given','if','unless','only if'].includes(c.role))?['Which business preconditions apply?']:[])]};});
  return{actors:actors.map(name=>({name,status:'source-stated-persona-unverified'})),criteria,missingKinds:['positive','negative','boundary','integration','permission','regression','visual'].filter(kind=>!criteria.some(c=>c.kind===kind)),questions:[...(!actors.length?['Which persona and effective permissions apply?']:[]),...criteria.flatMap(c=>c.questions.map(question=>({criterionId:c.criterionId,question})))],authority:'analysis-only'};
}
export async function intelligentSpecPlan(input:Spec,org:OrgSnapshot,index:KnowledgeIndex,history:History,permission:string,rawBindings:unknown=[],review?:{reviewer:string;sourceVersion:string},impact?:{graph:unknown;changed:unknown}) {
  const spec=SpecSchema.parse(input),bindings=SpecBindingsSchema.parse(rawBindings),scope={org:org.orgIdentityHash??org.orgAlias,permission};index.bindSchema(scope,knowledgeFingerprint(org));
  if(new Set(bindings.map(b=>b.criterionId)).size!==bindings.length||bindings.some(b=>!spec.acceptanceCriteria.some(ac=>ac.id===b.criterionId)))throw Error('Ambiguous or unknown reviewed workflow binding');
  if(review&&(!review.reviewer.trim()||review.sourceVersion!==spec.version))throw Error('Requirement review must bind the exact source version');
  const context=await index.retrieve(`${spec.title} ${spec.description}`,scope,50),lessons=context.filter(d=>['defect','lesson'].includes(d.kind));
  const resolution=selectStoryObjects(spec,org.objects.map(o=>({name:o.name,label:o.label}))),objects=resolution.selected.map(o=>o.name),resolved={...spec,objects};
  const files:Array<{id:string;code:string}>=[];
  const scenarios=spec.acceptanceCriteria.map(ac=>{const binding=bindings.find(b=>b.criterionId===ac.id),reasons:string[]=[];
    if(spec.requiresReview&&!review)reasons.push('Extracted requirements await named source review');
    if(!binding)reasons.push('Workflow unknown; observe entry point, states and locators in a separate authorized sandbox');
    if(!ac.expectedText)reasons.push('Exact expected UI text is not specified; source behavior is retained without an executable assertion');
    if(binding&&(binding.workflow.criterion!==ac.id||binding.workflow.assertion.text!==ac.expectedText))reasons.push('Reviewed workflow assertion differs from exact source expectation');
    if(objects.length&&!binding?.preconditions.length)reasons.push('Reviewed existing-data or factory prerequisites missing');
    if(resolution.unresolved.length)reasons.push('Explicit story objects were not described');
    const id=binding?.workflow.id??`${spec.id}-${ac.id}`;
    if(!reasons.length&&binding)files.push({id,code:generateTest(binding.workflow,[binding.workflow.origin])});
    return {id,criterionId:ac.id,kind:ac.kind,expected:ac.expectedText??ac.text,expectedStatus:!reasons.length?'reviewed-source':'source-stated-needs-review',status:reasons.length?'blocked':'reviewed',reasons,evidence:[`${spec.source}@${spec.version}#${ac.id}`,...(binding?[binding.workflow.source]:[])],history:lessons.filter(d=>d.testIds.includes(id)).map(d=>d.citation)};
  });
  if(new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw Error('Duplicate planned test IDs');
  const missingKinds=['positive','negative','boundary','integration'].filter(kind=>!scenarios.some(s=>s.kind===kind));
  const gaps=missingKinds.map(kind=>({kind,status:'missing-requirement',expected:undefined,question:`What source-approved ${kind} behavior and expected outcome must be tested?`}));
  const data=proposeDataPlan(resolved,org,proposeStoryRelationships(resolved,org)),mandatoryRegression=[...new Set(lessons.flatMap(d=>d.testIds))];
  let componentImpact:ReturnType<typeof impactedComponents>|undefined;let changedObjects:string[]=[];
  if(impact){const graph=ComponentGraphSchema.parse(impact.graph);if(graph.org!==scope.org||graph.knowledgeVersion!==knowledgeFingerprint(org))throw Error('Impact graph org/version differs from current knowledge');componentImpact=impactedComponents(graph,z.array(z.string()).max(1000).parse(impact.changed));changedObjects=graph.nodes.filter(n=>n.kind==='SObject'&&componentImpact!.components.includes(n.id)).map(n=>n.name);}
  const selection=prioritize(scenarios.map(s=>({id:s.id,criteria:[s.criterionId],components:objects,criticality:s.history.length?5:1,mandatory:mandatoryRegression.includes(s.id)})),changedObjects,history.results());
  return {status:'proposed',executable:false,spec:resolved,actors:spec.persona?[{name:spec.persona,status:'source-stated-persona-unverified'}]:[],objectResolution:resolution,data,scenarios,selection,componentImpact,mandatoryRegression,files,gaps,knowledge:context.map(d=>d.citation),discoverySteps:scenarios.filter(s=>s.status==='blocked').map(s=>({criterionId:s.criterionId,environment:'SANDBOX_QA',tasks:['Review actor permissions and data prerequisites','Observe and review actual navigation, component states and locators','Bind exact source outcome before code generation']})),coverage:{criteria:scenarios.length,reviewed:scenarios.filter(s=>s.status==='reviewed').length,blocked:scenarios.filter(s=>s.status==='blocked').length,authoredKinds:[...new Set(scenarios.map(s=>s.kind))],missingKinds},traceability:scenarios.map(s=>({criterionId:s.criterionId,testId:s.id,source:s.evidence,history:s.history,status:s.status}))};
}
