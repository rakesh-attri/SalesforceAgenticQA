import {z} from 'zod';
import {readFile,realpath,stat} from 'node:fs/promises';
import {relative,isAbsolute} from 'node:path';
import {History} from '../core/history.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import {validateJourney,WorkflowModelStore} from './workflow-models.js';
import {acquireMetadataWorkflowEvidence,acquireRequirementWorkflowEvidence,acquireRenderedWorkflowEvidence} from './workflow-evidence.js';
import {planWorkflowJourney} from './workflow-planning.js';
import {writeWorkflowReport} from './workflow-report.js';
import {prepareMultiObjectJourney} from './workflow-assembly.js';
import {saveJson} from '../core/io.js';
import {fingerprint} from '../execution/browser-policy.js';
const Input=z.object({model:z.string(),spec:z.string(),org:z.string(),graph:z.string(),observations:z.array(z.object({review:z.string(),report:z.string()}).strict()).max(20).default([]),changed:z.array(z.string()).max(100).default([])}).strict();
const EvidenceInput=z.object({spec:z.string(),org:z.string(),graph:z.string(),permission:z.string().min(1),observations:z.array(z.object({object:z.string(),review:z.string(),report:z.string(),view:z.string(),reviewedEvidence:z.string().optional()}).strict()).max(10).default([]),bindings:z.string().optional(),transitions:z.array(z.string()).max(20).default([])}).strict();
async function localJson(path:string){const root=await realpath('.'),target=await realpath(path),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(target)).size>2097152)throw Error('Bounded workspace source file required');return JSON.parse(await readFile(target,'utf8'));}
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
