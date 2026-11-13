import { Annotation,StateGraph,START,END,type BaseCheckpointSaver } from '@langchain/langgraph';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { SpecSchema } from '../specs/ingest.js';
import { OrgSnapshotSchema } from '../core/types.js';
import { History } from '../core/history.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { WorkflowSchema,generateTest } from './workflows.js';
import { proposeDataPlan } from './data-agent.js';
import { snapshotVersion,schemaFingerprint } from '../knowledge/snapshots.js';
import { prioritize } from './quality.js';
import { executeGenerated } from '../execution/runner.js';
import { investigateFailure } from './intelligence.js';
import { saveJson } from '../core/io.js';
import { writeFile } from 'node:fs/promises';
import { evaluateReadiness,crossRunTrends,htmlReport } from './evaluation.js';
export const PipelineInputSchema=z.object({
  runId:z.string().regex(/^[A-Za-z0-9_-]+$/),spec:SpecSchema,org:OrgSnapshotSchema,permission:z.string().min(1),
  orgVersion:z.string(),allowedOrigins:z.array(z.string().url()).min(1),
  mappings:z.array(z.object({criterionId:z.string(),workflow:WorkflowSchema,preconditions:z.array(z.string().min(1)).default([])})),
  executionApproval:z.object({reviewer:z.string().trim().min(1),hash:z.string()}).optional(),
});
export type PipelineInput=z.infer<typeof PipelineInputSchema>;
export function executionHash(input:PipelineInput) {const {executionApproval,...payload}=PipelineInputSchema.parse(input);return createHash('sha256').update(JSON.stringify(payload)).digest('hex');}
type Context=Awaited<ReturnType<KnowledgeIndex['retrieve']>>;
export function analyze(input:PipelineInput,context:Context,history:History) {
  const data=proposeDataPlan(input.spec,input.org),known=new Set(input.org.objects.map(o=>o.name));
  const scenarios=input.spec.acceptanceCriteria.map(ac=>{
    const mapping=input.mappings.find(m=>m.criterionId===ac.id),reasons:string[]=[];
    if(!mapping)reasons.push('No reviewed workflow for criterion');
    if(!ac.expectedText)reasons.push('No explicit expectedText for executable assertion');
    if(mapping&&mapping.workflow.assertion.text!==ac.expectedText)reasons.push('Assertion differs from source expectedText');
    if(mapping&&mapping.workflow.criterion!==ac.id)reasons.push('Workflow criterion link mismatch');
    if(input.spec.objects.some(o=>!known.has(o)))reasons.push('Missing org metadata');
    if(input.spec.objects.length&&!mapping?.preconditions.length)reasons.push('Reviewed data prerequisites missing');
    return {id:mapping?.workflow.id??`${input.spec.id}-${ac.id}`,criterionId:ac.id,kind:ac.kind,expected:ac.expectedText??ac.text,evidence:[`${input.spec.source}@${input.spec.version}#${ac.id}`,...(mapping?[mapping.workflow.source]:[])],status:reasons.length?'blocked' as const:'reviewed' as const,reasons};
  });
  if(new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw Error('Duplicate scenario test IDs');
  const learned=context.filter(d=>d.kind==='defect'||d.kind==='lesson');
  const selection=prioritize(scenarios.map(s=>({id:s.id,criteria:[s.criterionId],components:input.spec.objects,criticality:learned.some(d=>d.testIds.includes(s.id))?5:1,mandatory:learned.some(d=>d.testIds.includes(s.id))})),[],history.results()).map(s=>({...s,lessons:learned.filter(d=>d.testIds.includes(s.id)).map(d=>d.citation)}));
  const missingKinds=['positive','negative','boundary'].filter(kind=>!scenarios.some(s=>s.kind===kind));
  return {scenarios,data,selection,gaps:scenarios.filter(s=>s.status==='blocked').map(s=>({criterionId:s.criterionId,reasons:s.reasons})),questions:missingKinds.map(kind=>`No explicit ${kind} behavior specified; expected outcomes require clarification.`)};
}
type Analysis=ReturnType<typeof analyze>;
type Execution=Awaited<ReturnType<typeof executeGenerated>>;
const State=Annotation.Root({input:Annotation<PipelineInput>(),context:Annotation<Context>(),analysis:Annotation<Analysis>(),files:Annotation<Array<{id:string;code:string}>>(),execution:Annotation<Execution|undefined>(),investigations:Annotation<Array<Awaited<ReturnType<typeof investigateFailure>>>>(),reportPath:Annotation<string>()});
export function createSpecPipeline(services:{history:History;knowledge:KnowledgeIndex;root:string;checkpointer?:BaseCheckpointSaver}) {
  const graph=new StateGraph(State)
    .addNode('spec_analyst',state=>{
      const input=PipelineInputSchema.parse(state.input);
      if(input.orgVersion!==snapshotVersion(input.org))throw Error('Stale org knowledge binding');
      services.knowledge.bindSchema({org:input.org.orgAlias,permission:input.permission},schemaFingerprint(input.org));
      if(new Set(input.mappings.map(m=>m.criterionId)).size!==input.mappings.length)throw Error('Ambiguous workflow mapping');
      return {input};
    })
    .addNode('knowledge_agent',async state=>({context:await services.knowledge.retrieve(`${state.input.spec.title} ${state.input.spec.description} ${state.input.spec.acceptanceCriteria.map(a=>a.text).join(' ')}`,{org:state.input.org.orgAlias,permission:state.input.permission})}))
    .addNode('planner_reviewer_risk',state=>({analysis:analyze(state.input,state.context,services.history)}))
    .addNode('generator',state=>({files:state.analysis.selection.flatMap(selected=>{const scenario=state.analysis.scenarios.find(s=>s.id===selected.id)!;if(scenario.status!=='reviewed')return [];const mapping=state.input.mappings.find(m=>m.criterionId===scenario.criterionId)!;return [{id:scenario.id,code:generateTest(mapping.workflow,state.input.allowedOrigins)}];})}))
    .addNode('execution_coordinator',async state=>{
      if(!state.input.executionApproval)return {execution:undefined};
      if(state.input.executionApproval.hash!==executionHash(state.input))throw Error('Execution approval does not match reviewed inputs');
      if(services.history.results().some(r=>r.runId===state.input.runId))throw Error('Run already executed; use a new run ID');
      // This automated pipeline is fixture-only until live org/session/precondition gates are connected.
      if(state.input.org.source!=='fixture'||state.input.allowedOrigins.some(o=>!['127.0.0.1','localhost','[::1]'].includes(new URL(o).hostname)))throw Error('Pipeline execution currently requires loopback fixture origins');
      if(!state.files.length)return {execution:undefined};
      const execution=await executeGenerated(join(services.root,state.input.runId,'execution'),state.input.runId,state.files);
      for(const result of execution.results)services.history.record(result);
      return {execution};
    })
    .addNode('failure_investigator',async state=>{
      const investigations=[];
      for(const failure of state.execution?.failures??[]){const scenario=state.analysis.scenarios.find(s=>s.id===failure.testId)!;investigations.push(await investigateFailure(services.knowledge,{org:state.input.org.orgAlias,permission:state.input.permission},{...failure,expected:scenario.expected}));}
      return {investigations};
    })
    .addNode('reporter',async state=>{
      const reportPath=join(services.root,state.input.runId,'report.json');
      const report={mode:'offline-fixture',runId:state.input.runId,source:{id:state.input.spec.source,version:state.input.spec.version},analysis:state.analysis,knowledge:state.context.map(d=>d.citation),execution:state.execution??{status:'not-executed'},investigations:state.investigations,metrics:services.history.metrics(),evaluation:evaluateReadiness(state.analysis.scenarios,state.execution?.results??[]),trends:crossRunTrends(services.history.results())};
      await saveJson(reportPath,report);await writeFile(join(services.root,state.input.runId,'report.html'),htmlReport(report));return {reportPath};
    })
    .addEdge(START,'spec_analyst').addEdge('spec_analyst','knowledge_agent').addEdge('knowledge_agent','planner_reviewer_risk').addEdge('planner_reviewer_risk','generator').addEdge('generator','execution_coordinator').addEdge('execution_coordinator','failure_investigator').addEdge('failure_investigator','reporter').addEdge('reporter',END);
  return graph.compile({checkpointer:services.checkpointer});
}
