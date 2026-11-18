import {z} from 'zod';
import {readFile,realpath,stat,lstat} from 'node:fs/promises';
import {relative,isAbsolute,extname} from 'node:path';
import {ingestSpec,SpecSchema} from '../specs/ingest.js';
import {History} from '../core/history.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import {validateJourney,WorkflowModelStore} from './workflow-models.js';
import {acquireMetadataWorkflowEvidence,acquireRequirementWorkflowEvidence,acquireRenderedWorkflowEvidence} from './workflow-evidence.js';
import {planWorkflowJourney} from './workflow-planning.js';
import {writeWorkflowReport} from './workflow-report.js';
import {prepareMultiObjectJourney} from './workflow-assembly.js';
import {saveJson} from '../core/io.js';
import {fingerprint} from '../execution/browser-policy.js';
import {designSalesforceTests} from './test-design.js';
import {writeTestDesignReport} from './test-design-report.js';
import {discoverApplication,ApplicationReviewStore,ApplicationDecisionSchema,compileReviewedApplication,approveApplicationModel,indexApplicationKnowledge} from './application-intelligence.js';
import {writeApplicationReport} from './application-report.js';
import {ExplorationDefinitionSchema,planExploration} from './exploration-plan.js';
import {ExplorationLedger} from './exploration-ledger.js';
import {runGoalExploration,fixtureExplorationIdentity} from './exploration-runtime.js';
import {investigateGoalFailure} from './exploration-investigation.js';
import {proposeExplorationRepair,executeExplorationRepair} from './exploration-recovery.js';
import {writeExplorationReport} from './exploration-report.js';
import {DurableSaver} from '../core/checkpoints.js';
const Input=z.object({model:z.string(),spec:z.string(),org:z.string(),graph:z.string(),observations:z.array(z.object({review:z.string(),report:z.string()}).strict()).max(20).default([]),changed:z.array(z.string()).max(100).default([])}).strict();
const EvidenceInput=z.object({spec:z.string(),org:z.string(),graph:z.string(),permission:z.string().min(1),observations:z.array(z.object({object:z.string(),review:z.string(),report:z.string(),view:z.string(),reviewedEvidence:z.string().optional()}).strict()).max(10).default([]),bindings:z.string().optional(),transitions:z.array(z.string()).max(20).default([])}).strict();
export async function localJson(path:string){const root=await realpath('.'),target=await realpath(path),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(target)).size>2097152)throw Error('Bounded workspace source file required');return JSON.parse((await readFile(target,'utf8')).replace(/^\uFEFF/,''));}
async function designSpec(path:string){
 const root=await realpath('.'),target=await realpath(path),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(target)).size>2097152)throw Error('Bounded workspace specification required');
 if(extname(target).toLowerCase()==='.json'){const value=await localJson(path);if(typeof value.source==='string'&&typeof value.version==='string')return SpecSchema.parse(value);}
 return ingestSpec(target);
}
export async function runExplorationCommand(mode:string,path:string){
 const raw=z.object({history:z.string(),definition:z.string().optional(),approval:z.string().optional(),runId:z.string().optional(),resume:z.string().optional(),signals:z.string().optional(),proposal:z.string().optional(),proposalId:z.string().optional(),review:z.string().optional(),progress:z.object({path:z.string(),stateHash:z.string(),covered:z.array(z.string()),attempted:z.array(z.string()),completed:z.array(z.string()),visited:z.array(z.string()),actionsRemaining:z.number(),remainingMs:z.number(),completeEvidence:z.boolean()}).strict().optional()}).strict().parse(await localJson(path));
 const db=await realpath(raw.history),workspace=await realpath('.'),stateRoot=await realpath('.state'),rel=relative(stateRoot,db),stateRel=relative(workspace,stateRoot);if(!stateRel||stateRel.startsWith('..')||isAbsolute(stateRel)||!rel||rel.startsWith('..')||isAbsolute(rel)||!db.endsWith('.sqlite')||(await stat(db)).size>209715200)throw Error('Existing contained local intelligence database required');const h=new History(db),ledger=new ExplorationLedger(h);let saver:DurableSaver|undefined;
 const checkpoint=async(run:string)=>{const path=`.state/exploration-checkpoints-${run}.sqlite`;if(await lstat(path).then(s=>s.isSymbolicLink()).catch(()=>false))throw Error('Checkpoint symlink denied');return new DurableSaver(path);};
 try{
  const runId=raw.runId??(raw.definition?ExplorationDefinitionSchema.parse(await localJson(raw.definition)).runId:undefined);
  if(mode==='exploration-plan'){if(!raw.definition||!raw.progress)throw Error('Source definition and observed progress required');return{...await planExploration(await localJson(raw.definition),raw.progress,h,new KnowledgeIndex(h)),executionAuthorized:false};}
  if(mode==='exploration-run'||mode==='exploration-resume'){if(!raw.definition||!raw.approval)throw Error('Exact fixture definition and approval required');const d=ExplorationDefinitionSchema.parse(await localJson(raw.definition));saver=await checkpoint(d.runId);const result=await runGoalExploration({definition:d,approval:await localJson(raw.approval)},{history:h,checkpointer:saver,identity:()=>fixtureExplorationIdentity(d),resume:raw.resume?await localJson(raw.resume):undefined});return{...await writeExplorationReport(ledger,d.runId),status:result.state.status,covered:result.state.covered,actions:result.state.attempts.length,sessions:result.state.sessions,validation:result.validation,salesforceRequests:0,executionAuthorized:false};}
  if(mode==='exploration-repair-propose'){if(!raw.proposal)throw Error('Source-bound repair input required');const proposed=proposeExplorationRepair(ledger,await localJson(raw.proposal)),output=`.state/exploration-repair-${proposed.id}.review.json`;await saveJson(output,proposed);return{output,proposalId:proposed.id,status:'proposed',executionAuthorized:false};}
  if(mode==='exploration-repair-run'){if(!raw.proposalId||!raw.review)throw Error('Exact repair and operator review required');const row=h.db.prepare('SELECT run FROM exploration_repair_proposals WHERE id=?').get(raw.proposalId);if(!row)throw Error('Unknown repair');const d=ledger.read(String(row.run)).definition;saver=await checkpoint(d.runId);const result=await executeExplorationRepair(ledger,raw.proposalId,await localJson(raw.review),{checkpointer:saver,identity:()=>fixtureExplorationIdentity(d)});return{...await writeExplorationReport(ledger,result.result.runId),status:result.result.state.status,unchangedExpectedResult:result.unchangedExpectedResult,parentSealed:true,executionAuthorized:false};}
  if(!runId)throw Error('Exact existing exploration run required');if(mode==='exploration-investigate'){if(!raw.signals)throw Error('Bounded diagnostic signals required');const issue=await investigateGoalFailure(ledger,runId,await localJson(raw.signals));return{...await writeExplorationReport(ledger,runId),investigationId:issue.id,status:issue.status,confirmed:false,executionAuthorized:false};}
  if(mode==='exploration-report')return await writeExplorationReport(ledger,runId);throw Error('Unknown exploration command');
 }finally{saver?.close();h.close();}
}
// Local intelligence commands never connect Salesforce, models, embeddings or
// browsers. Historical rendering evidence is checked against the host journal.
export async function runApplicationIntelligence(mode:string,path:string){
 const raw=await localJson(path),scopeSchema=z.object({org:z.string().min(1),permission:z.string().min(1)}).strict(),history=new History(),reviews=new ApplicationReviewStore(history);
 try{
  if(mode==='application-review'){const input=z.object({scope:scopeSchema,decision:ApplicationDecisionSchema}).strict().parse(raw);return reviews.review(input.scope,input.decision);}
  if(mode==='application-index'){const input=z.object({scope:scopeSchema,studyVersion:z.string()}).strict().parse(raw);return await indexApplicationKnowledge(history,reviews.get(input.scope,input.studyVersion),new KnowledgeIndex(history));}
  if(mode==='application-approve-model'){const input=z.object({scope:scopeSchema,studyVersion:z.string(),modelVersion:z.string(),operator:z.string(),id:z.string()}).strict().parse(raw),study=reviews.get(input.scope,input.studyVersion),model=approveApplicationModel(history,{...input,scope:study.scope}),output=`.state/application-model-${model.version}.reviewed.json`;await saveJson(output,model);return{output,modelVersion:model.version,executionAuthorized:false};}
  if(mode==='application-discover'){
   const input=z.object({spec:z.string(),org:z.string(),graph:z.string(),permission:z.string().min(1),observations:z.array(z.object({review:z.string(),report:z.string(),view:z.string()}).strict()).max(10).default([]),changes:z.array(z.string()).max(1000).default([])}).strict().parse(raw),[spec,org,graph]=await Promise.all([designSpec(input.spec),localJson(input.org),localJson(input.graph)]),browserHistory=input.observations.length?new History('.state/dedicated-qa.sqlite'):undefined;
   try{const observations=await Promise.all(input.observations.map(async o=>({review:await localJson(o.review),report:await localJson(o.report),view:await localJson(o.view)}))),study=discoverApplication({...input,spec,org,graph,observations},history,browserHistory);reviews.put(study);const output=`.state/application-study-${study.version}.json`;await saveJson(output,study);return{...await writeApplicationReport(history,{study,org}),output,scope:study.scope,studyVersion:study.version,objects:study.objects.length,pages:study.pages.length,questions:study.questions.length,observedTransitions:study.transitions.filter(t=>t.status==='observed').length,suggestedTransitions:study.transitions.filter(t=>t.status==='suggested').length,externalRequests:0,executionAuthorized:false};}finally{browserHistory?.close();}
  }
  if(mode==='application-compile'){
   const input=z.object({scope:scopeSchema,studyVersion:z.string(),spec:z.string(),org:z.string(),graph:z.string()}).strict().parse(raw),study=reviews.get(input.scope,input.studyVersion),[spec,org,graph]=await Promise.all([designSpec(input.spec),localJson(input.org),localJson(input.graph)]),compiled=await compileReviewedApplication({study,spec,org,graph},history);let design=compiled.design,modelOutput;
   if(compiled.model){const model=new WorkflowModelStore(history).get(study.scope,compiled.model.id,compiled.model.version);modelOutput=`.state/application-model-${model.version}.json`;await saveJson(modelOutput,model);design=await designSalesforceTests({spec,org,graph,permission:study.scope.permission,model},{history,index:new KnowledgeIndex(history)});}
   return{...await writeApplicationReport(history,{study,org,design,compileQuestions:compiled.questions}),status:compiled.status,modelOutput,proposals:design?await writeTestDesignReport(design):undefined,questions:compiled.questions,executionAuthorized:false};
  }
  throw Error('Unknown local application intelligence command');
 }finally{history.close();}
}
export async function runTestDesign(path:string){
 const input=z.object({spec:z.string(),org:z.string(),graph:z.string(),permission:z.string().min(1),model:z.string().optional(),changes:z.array(z.string()).max(1000).default([]),observations:z.array(z.object({review:z.string(),report:z.string(),view:z.string()}).strict()).max(10).default([])}).strict().parse(await localJson(path)),history=new History(),browserHistory=input.observations.length?new History('.state/dedicated-qa.sqlite'):undefined;
 try{const [spec,org,graph]=await Promise.all([designSpec(input.spec),localJson(input.org),localJson(input.graph)]);let model;
  if(input.model){const requested=validateJourney(await localJson(input.model));model=new WorkflowModelStore(history).get(requested.scope,requested.id,requested.version);if(fingerprint(model)!==fingerprint(requested))throw Error('Model differs from recorded review');}
  const observations=await Promise.all(input.observations.map(async o=>({review:await localJson(o.review),report:await localJson(o.report),view:await localJson(o.view)}))),design=await designSalesforceTests({...input,spec,org,graph,model,observations},{history,index:new KnowledgeIndex(history),browserHistory}),report=await writeTestDesignReport(design);
  return{...report,status:design.status,scenarios:design.scenarios.length,questions:design.questions.length,contradictions:design.contradictions.length,knowledgeHits:design.retrieval.citations.length,externalRequests:0,salesforceRequests:0,executionAuthorized:false};
 }finally{browserHistory?.close();history.close();}
}
// Local-only: this command never configures embeddings, external AI, a browser,
// factories or an execution grant. Browser source versions come from the host's
// existing rendering journal, not assertions made by an input model.
export async function runWorkflowReview(path:string){
  const input=Input.parse(await localJson(path)),model=validateJourney(await localJson(input.model));
  const [spec,org,graph]=await Promise.all([localJson(input.spec),localJson(input.org),localJson(input.graph)]);
  const history=new History(),browserHistory=new History('.state/dedicated-qa.sqlite');
  try{
    const store=new WorkflowModelStore(history),acquired=acquireMetadataWorkflowEvidence(org,graph,model.scope.permission),sources=[...acquired.sources,acquireRequirementWorkflowEvidence(spec,acquired.scope)];
    for(const observation of input.observations)sources.push(acquireRenderedWorkflowEvidence(browserHistory,await localJson(observation.review),await localJson(observation.report)));
    store.observe(sources);if(store.stale(model).length)throw Error('Current source/journal evidence does not establish this workflow version');store.put(model);
    const index=new KnowledgeIndex(history);index.bindSchema({org:model.scope.org,permission:model.scope.permission},acquired.scope.metadataVersion);
    const plan=await planWorkflowJourney(model,spec,org,graph,index,history,input.changed),report=await writeWorkflowReport(model,plan);
    return{...report,scenarios:plan.scenarios.length,proposals:plan.files.length,gaps:plan.gaps.length,validation:'local-source-review',externalRequests:0,executionAuthorized:false};
  }finally{browserHistory.close();history.close();}
}

export async function runWorkflowEvidenceReview(path:string){
 const input=EvidenceInput.parse(await localJson(path)),history=new History('.state/dedicated-qa.sqlite');
 try{const [spec,org,graph]=await Promise.all([localJson(input.spec),localJson(input.org),localJson(input.graph)]),pages=[];
  for(const observation of input.observations){const receipt={review:await localJson(observation.review),report:await localJson(observation.report),view:await localJson(observation.view)},observed=acquireRenderedWorkflowEvidence(history,receipt.review,receipt.report,receipt.view);pages.push({object:observation.object,evidence:observation.reviewedEvidence?await localJson(observation.reviewedEvidence):observed,receipt});}
  const transitions=await Promise.all(input.transitions.map(localJson)),bindings=input.bindings?z.array(z.unknown()).max(100).parse(await localJson(input.bindings)):[],prepared=prepareMultiObjectJourney({spec,org,graph,permission:input.permission,history,pages,transitions,bindings}),output=`.state/workflow-evidence-${fingerprint(prepared)}.review.json`;
  await saveJson(output,prepared);return{status:prepared.status,output,relationships:prepared.relationships.length,permissionFacts:prepared.permissions.length,questions:prepared.questions.length,modelAvailable:!!prepared.model,externalRequests:0,executionAuthorized:false};
 }finally{history.close();}
}
