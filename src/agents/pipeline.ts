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
import { SandboxRequestSchema,DataSetupSchema,type PipelineRuntime } from '../execution/readiness.js';
import { ReasoningAgents,type AgentAdvice,type ReasoningRole } from './reasoning.js';
export const PipelineInputSchema=z.object({
  runId:z.string().regex(/^[A-Za-z0-9_-]+$/),spec:SpecSchema,org:OrgSnapshotSchema,permission:z.string().min(1),
  orgVersion:z.string(),allowedOrigins:z.array(z.string().url()).min(1),
  mappings:z.array(z.object({criterionId:z.string(),workflow:WorkflowSchema,preconditions:z.array(z.string().min(1)).default([])})),
  executionApproval:z.object({reviewer:z.string().trim().min(1),hash:z.string()}).optional(),
  sandbox:SandboxRequestSchema.optional(),dataSetup:DataSetupSchema.optional(),
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
    if(input.spec.objects.length&&!mapping?.preconditions.length&&!input.dataSetup)reasons.push('Reviewed data prerequisites missing');
    if(input.dataSetup&&input.spec.objects.some(o=>!input.dataSetup!.recipes.some(r=>r.object===o))&&!mapping?.preconditions.length)reasons.push('Required object has no reviewed factory or existing-data precondition');
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
type Lifecycle={status:'not-executed'|'passed'|'failed';stages:string[];errors:string[];created:number;cleaned:number};
const State=Annotation.Root({input:Annotation<PipelineInput>(),context:Annotation<Context>(),analysis:Annotation<Analysis>(),files:Annotation<Array<{id:string;code:string}>>(),execution:Annotation<Execution|undefined>(),lifecycle:Annotation<Lifecycle>(),investigations:Annotation<Array<Awaited<ReturnType<typeof investigateFailure>>>>(),reportPath:Annotation<string>(),advice:Annotation<Partial<Record<ReasoningRole,AgentAdvice>>>(),modelFailures:Annotation<ReasoningRole[]>()});
export function createSpecPipeline(services:{history:History;knowledge:KnowledgeIndex;root:string;checkpointer?:BaseCheckpointSaver;runtime?:PipelineRuntime;reasoning?:ReasoningAgents}) {
  services.history.db.exec('CREATE TABLE IF NOT EXISTS pipeline_runs(run TEXT PRIMARY KEY,status TEXT,payload TEXT)');
  async function modelAdvice(state:typeof State.State,role:ReasoningRole,analysis=state.analysis,investigations=state.investigations) {
    const advice={...state.advice},modelFailures=[...state.modelFailures??[]];
    if(services.reasoning)try{advice[role]=await services.reasoning.advise(role,{'reviewed-spec':state.input.spec,'reviewed-workflows':state.input.mappings,'observed-org-schema':state.input.org,'verified-knowledge':state.context??[],'deterministic-plan':analysis??null,'failure-evidence':investigations??[]});}catch{modelFailures.push(role);}
    return {advice,modelFailures};
  }
  const graph=new StateGraph(State)
    .addNode('spec_analyst',async state=>{
      const input=PipelineInputSchema.parse(state.input);
      if(input.orgVersion!==snapshotVersion(input.org))throw Error('Stale org knowledge binding');
      services.knowledge.bindSchema({org:input.org.orgAlias,permission:input.permission},schemaFingerprint(input.org));
      if(new Set(input.mappings.map(m=>m.criterionId)).size!==input.mappings.length)throw Error('Ambiguous workflow mapping');
      return {input,...await modelAdvice({...state,input},'spec-analyst')};
    })
    .addNode('knowledge_agent',async state=>({context:await services.knowledge.retrieve(`${state.input.spec.title} ${state.input.spec.description} ${state.input.spec.acceptanceCriteria.map(a=>a.text).join(' ')}`,{org:state.input.org.orgAlias,permission:state.input.permission})}))
    .addNode('planner_reviewer_risk',async state=>{const analysis=analyze(state.input,state.context,services.history);return {analysis,...await modelAdvice(state,'test-planner',analysis)};})
    .addNode('generator',async state=>({files:state.analysis.selection.flatMap(selected=>{const scenario=state.analysis.scenarios.find(s=>s.id===selected.id)!;if(scenario.status!=='reviewed')return [];const mapping=state.input.mappings.find(m=>m.criterionId===scenario.criterionId)!;return [{id:scenario.id,code:generateTest(mapping.workflow,state.input.allowedOrigins)}];}),...await modelAdvice(state,'generator')}))
    .addNode('execution_coordinator',async state=>{
      const lifecycle:Lifecycle={status:'not-executed',stages:[],errors:[],created:0,cleaned:0};
      if(!state.input.executionApproval||!state.files.length)return {execution:undefined,lifecycle};
      if(state.input.executionApproval.hash!==executionHash(state.input))throw Error('Execution approval does not match reviewed inputs');
      if(services.history.results().some(r=>r.runId===state.input.runId))throw Error('Run already executed; use a new run ID');
      const fixture=state.input.org.source==='fixture';
      if(fixture&&state.input.allowedOrigins.some(o=>!['127.0.0.1','localhost','[::1]'].includes(new URL(o).hostname)))throw Error('Fixture execution requires loopback origins');
      if(!fixture&&(!state.input.sandbox||!services.runtime))throw Error('Sandbox execution requires explicit identity/session runtime gates');
      if(state.input.dataSetup&&!services.runtime)throw Error('Reviewed data setup runtime missing');
      services.history.db.prepare('INSERT INTO pipeline_runs VALUES(?,?,NULL)').run(state.input.runId,'pending');
      let execution:Execution|undefined,setupStarted=false;
      try {
        let session=services.runtime?await services.runtime.preflight(state.input):{};lifecycle.stages.push(services.runtime?'session-and-identity-verified':'loopback-fixture-validated');
        if(state.input.dataSetup){services.runtime!.factory.plan(state.input.dataSetup.recipes,state.input.org);lifecycle.stages.push('recipes-preflighted');setupStarted=true;await services.runtime!.factory.setup(state.input.runId,state.input.dataSetup.recipes,state.input.org,services.runtime!.approvalFor);lifecycle.stages.push('setup-and-independent-verification-complete');}
        const owned=services.runtime?.factory.owned(state.input.runId)??[];lifecycle.created=owned.length;
        if(!fixture)session=await services.runtime!.preflight(state.input);
        const replace=(value:string)=>value.replace(/\{\{record:([A-Za-z][A-Za-z0-9_]*)\}\}/g,(_match,name)=>{const id=owned.find(r=>r.object===name)?.id;if(!id)throw Error(`Missing verified record reference: ${name}`);return id;});
        const files=state.files.map(file=>{const mapping=state.input.mappings.find(m=>m.workflow.id===file.id)!;const workflow=structuredClone(mapping.workflow);workflow.path=replace(workflow.path);for(const step of workflow.steps)if(step.value!==undefined)step.value=replace(step.value);for(const api of workflow.apiAssertions)api.path=replace(api.path);return {id:file.id,code:generateTest(workflow,state.input.allowedOrigins)};});
        execution=await executeGenerated(join(services.root,state.input.runId,'execution'),state.input.runId,files,120000,session);
        for(const result of execution.results)services.history.record(result);
        lifecycle.stages.push('browser-execution-complete');lifecycle.status=execution.exitCode===0&&execution.results.every(r=>r.status==='passed')?'passed':'failed';
      }catch(error){lifecycle.status='failed';lifecycle.errors.push(error instanceof Error?error.message:'Execution lifecycle failed');}
      finally {
        const owned=services.runtime?.factory.owned(state.input.runId)??[];lifecycle.created=owned.length;
        if(setupStarted&&owned.length&&state.input.dataSetup?.cleanup==='always')try{lifecycle.cleaned=(await services.runtime!.factory.cleanup(state.input.runId,owned,services.runtime!.approvalFor)).length;lifecycle.stages.push('cleanup-complete');}catch(error){lifecycle.status='failed';lifecycle.errors.push(`Cleanup failed: ${error instanceof Error?error.message:'unknown'}`);}
        services.history.db.prepare('UPDATE pipeline_runs SET status=?,payload=? WHERE run=?').run(lifecycle.status,JSON.stringify(lifecycle),state.input.runId);
        await saveJson(join(services.root,state.input.runId,'lifecycle.json'),lifecycle);
      }
      return {execution,lifecycle};
    })
    .addNode('failure_investigator',async state=>{
      const investigations=[];
      for(const failure of state.execution?.failures??[]){const scenario=state.analysis.scenarios.find(s=>s.id===failure.testId)!;investigations.push(await investigateFailure(services.knowledge,{org:state.input.org.orgAlias,permission:state.input.permission},{...failure,expected:scenario.expected}));}
      if(state.lifecycle?.errors.length)investigations.push(await investigateFailure(services.knowledge,{org:state.input.org.orgAlias,permission:state.input.permission},{testId:`${state.input.runId}-lifecycle`,message:state.lifecycle.errors.join('\n'),expected:'Approved session, data verification, execution and cleanup complete',evidence:[join(services.root,state.input.runId,'lifecycle.json')]}));
      return {investigations,...await modelAdvice(state,'investigator',state.analysis,investigations)};
    })
    .addNode('reporter',async state=>{
      const reportPath=join(services.root,state.input.runId,'report.json');
      const report={mode:state.input.org.source==='fixture'?'offline-fixture':'authorized-sandbox',runId:state.input.runId,lifecycle:state.lifecycle,source:{id:state.input.spec.source,version:state.input.spec.version},analysis:state.analysis,knowledge:state.context.map(d=>d.citation),execution:state.execution??{status:'not-executed'},investigations:state.investigations,modelAdvice:state.advice,modelFailures:state.modelFailures,metrics:services.history.metrics(),evaluation:evaluateReadiness(state.analysis.scenarios,state.execution?.results??[]),trends:crossRunTrends(services.history.results())};
      await saveJson(reportPath,report);await writeFile(join(services.root,state.input.runId,'report.html'),htmlReport(report));return {reportPath};
    })
    .addEdge(START,'spec_analyst').addEdge('spec_analyst','knowledge_agent').addEdge('knowledge_agent','planner_reviewer_risk').addEdge('planner_reviewer_risk','generator').addEdge('generator','execution_coordinator').addEdge('execution_coordinator','failure_investigator').addEdge('failure_investigator','reporter').addEdge('reporter',END);
  return graph.compile({checkpointer:services.checkpointer});
}
