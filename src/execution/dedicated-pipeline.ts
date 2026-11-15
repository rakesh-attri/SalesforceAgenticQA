import { z } from 'zod';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { SpecSchema } from '../specs/ingest.js';
import { OrgSnapshotSchema } from '../core/types.js';
import { History } from '../core/history.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { knowledgeFingerprint,schemaFingerprint } from '../knowledge/snapshots.js';
import { DedicatedData,DedicatedRunSchema,dedicatedPlanHash,DedicatedCleanupError } from '../salesforce/dedicated-qa.js';
import { DedicatedUiReviewSchema,reviewDedicatedUi,checkedDedicatedSession,exploreDedicatedOwned,type OpaqueExplorationState,type DedicatedGuard } from './dedicated-browser.js';
import { EnvironmentPolicySchema,type EnvironmentIdentity } from './environment.js';
import { generateTest } from '../agents/workflows.js';
import { intelligentSpecPlan } from '../agents/spec-intelligence.js';
import { executeGenerated } from './runner.js';
import { saveJson } from '../core/io.js';
import { htmlReport } from '../agents/evaluation.js';
import { investigateFailure } from '../agents/intelligence.js';
import { observeDedicatedSelectors,reviewObservedSelectors,diagnoseDedicatedSelectors } from './dedicated-selectors.js';
import { authorizeStaticReview } from './dedicated-static.js';
export const DedicatedExecutionSchema=z.object({spec:SpecSchema,org:OrgSnapshotSchema,permission:z.string().min(1),data:DedicatedRunSchema,ui:DedicatedUiReviewSchema}).strict();
export type DedicatedExecution=z.infer<typeof DedicatedExecutionSchema>;
export interface DedicatedExecutionServices {
  history:History;knowledge:KnowledgeIndex;data:DedicatedData;root:string;apiOrigin:string;
  identity():Promise<EnvironmentIdentity>;policy():Promise<unknown>;discover():Promise<z.infer<typeof OrgSnapshotSchema>>;
  session?(receipt:string,policy:z.infer<typeof EnvironmentPolicySchema>,identity:EnvironmentIdentity,origin:string):Promise<{statePath:string}>;
  runTests?:typeof executeGenerated;guardModule?:string;validation?:'live-salesforce'|'offline-mocked-salesforce';choose?:(state:OpaqueExplorationState)=>Promise<string>;
  observe?:typeof observeDedicatedSelectors;
  staticReview?:unknown;
}
export async function runDedicatedWorkflow(raw:unknown,s:DedicatedExecutionServices) {
  const input=DedicatedExecutionSchema.parse(raw),run=input.data,root=join(s.root,run.plan.runId),scope={org:input.org.orgIdentityHash??input.org.orgAlias,permission:input.permission};
  const policy=EnvironmentPolicySchema.parse(await s.policy()),identity=await s.identity(),ui=reviewDedicatedUi(input.ui,policy,identity);
  const staticReview=s.staticReview?authorizeStaticReview(s.staticReview,policy,identity,input.spec.version):undefined;
  if(ui.plan.runId!==run.plan.runId||ui.plan.dataPlanHash!==dedicatedPlanHash(run.plan)||ui.plan.policyHash!==run.plan.policyHash||ui.plan.sourceVersion!==input.spec.version||ui.plan.orgId!==run.plan.orgId||ui.plan.userId!==run.plan.userId)throw Error('Dedicated specification/data/UI approvals do not bind the same run');
  if(input.org.orgIdentityHash!==createHash('sha256').update(identity.Id).digest('hex')||input.org.source!=='salesforce-api'||ui.plan.workflows.length!==input.spec.acceptanceCriteria.length||new Set(ui.plan.workflows.map(w=>w.criterion)).size!==input.spec.acceptanceCriteria.length||new Set(ui.plan.workflows.map(w=>w.id)).size!==ui.plan.workflows.length)throw Error('Dedicated workflow requires exact org-bound discovery and all reviewed criteria');
  for(const w of ui.plan.workflows){const ac=input.spec.acceptanceCriteria.find(a=>a.id===w.criterion);if(!ac||ac.expectedText!==w.assertion.text||w.reviewer!==ui.approval.operator)throw Error('Dedicated workflow outcome differs from reviewed source');}
  const fresh=await s.discover();if(schemaFingerprint({...fresh,orgAlias:input.org.orgAlias,orgIdentityHash:input.org.orgIdentityHash})!==schemaFingerprint(input.org))throw Error('Dedicated org schema drift requires a new data/workflow review');
  s.history.db.exec('CREATE TABLE IF NOT EXISTS pipeline_runs(run TEXT PRIMARY KEY,status TEXT,payload TEXT)');
  s.history.db.prepare('INSERT INTO pipeline_runs VALUES(?,?,NULL)').run(run.plan.runId,'pending');
  const stages:string[]=[],errors:string[]=[],investigations:unknown[]=[];let execution:Awaited<ReturnType<typeof executeGenerated>>|undefined,exploration:Awaited<ReturnType<typeof exploreDedicatedOwned>>|undefined,selectors:Awaited<ReturnType<typeof observeDedicatedSelectors>>|undefined,selectorReview:ReturnType<typeof reviewObservedSelectors>|undefined,opened=false,created=0,cleaned=0,passed=false;
  const analysis=await intelligentSpecPlan(input.spec,input.org,s.knowledge,s.history,input.permission,ui.plan.workflows.map(workflow=>({criterionId:workflow.criterion,workflow,preconditions:['Approved dedicated run-specific synthetic Account/Contact factories']})),{reviewer:ui.approval.operator,sourceVersion:input.spec.version});
  analysis.files=[]; // Actual executable files are rendered only after verified run-owned references are available.
  try {
    await s.data.check(run,'dedicated-ui');
    const session=await (s.session??checkedDedicatedSession)(ui.plan.sessionReceipt,policy,identity,s.apiOrigin);stages.push('fresh-org-user-and-browser-session-verified');
    await s.data.open(run,input.org);opened=true;stages.push('approved-deterministic-data-plan-reserved');
    await s.data.setup(run);created=s.data.owned(run).length;stages.push('account-contact-created-and-soql-verified');
    await s.data.check(run,'dedicated-ui');await (s.session??checkedDedicatedSession)(ui.plan.sessionReceipt,policy,await s.identity(),s.apiOrigin);
    const owned=s.data.owned(run);for(const record of owned)await s.data.verifyOwned(run,record.object,record.id);
    const replace=(text:string)=>text.replace(/\{\{record:(Account|Contact)\}\}/g,(_m,name)=>{const record=owned.find(r=>r.object===name);if(!record)throw Error('Missing run-owned record reference');return record.id;}).replace(/\{\{synthetic:(Account\.Name|Contact\.LastName)\}\}/g,(_m,field)=>field==='Account.Name'?run.plan.creates.Account.Name:run.plan.creates.Contact.LastName);
    const workflows=ui.plan.workflows.map(raw=>{const w=structuredClone(raw);w.path=replace(w.path);w.assertion.text=replace(w.assertion.text);if(w.assertion.locator.name)w.assertion.locator.name=replace(w.assertion.locator.name);for(const step of w.steps){if(step.locator.name)step.locator.name=replace(step.locator.name);}if(/\{\{/.test(JSON.stringify(w)))throw Error('Unknown dedicated workflow placeholder');
      const target=new URL(w.path,w.origin),record=owned.find(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`);if(!record||target.search||target.hash)throw Error('Dedicated workflow document is not an exact run-owned record page');return w;});
    const guard:DedicatedGuard={policy,identity,origins:[...new Set(workflows.map(w=>w.origin))],documents:workflows.map(w=>new URL(w.path,w.origin).href),owned:owned.map(r=>({object:r.object as 'Account'|'Contact',id:r.id,display:r.object==='Account'?run.plan.creates.Account.Name:run.plan.creates.Contact.LastName})),expiresAt:new Date(Math.min(Date.parse(policy.approval.expiresAt),Date.parse(run.approval.expiresAt),Date.parse(ui.approval.expiresAt))).toISOString(),staticReview};
    const config=resolve(root,'guard.json');await saveJson(config,guard);
    const binding={runId:run.plan.runId,planHash:dedicatedPlanHash(run.plan),policyHash:run.plan.policyHash,sourceVersion:input.spec.version};
    selectors=await(s.observe??observeDedicatedSelectors)({guard,workflows,statePath:session.statePath,maxMs:ui.plan.maxMs,binding});await saveJson(join(root,'selector-evidence.json'),selectors);
    selectorReview=reviewObservedSelectors(selectors,binding,workflows,guard.documents);stages.push('approved-selectors-observed-and-source-reviewed');
    if(ui.plan.exploration){if(!s.choose)throw Error('Approved exploration chooser unavailable');exploration=await exploreDedicatedOwned({guard,workflows,statePath:session.statePath,maxSteps:ui.plan.exploration.maxSteps,maxMs:ui.plan.maxMs,maxActions:ui.plan.maxActions,choose:s.choose,verify:(object,id)=>s.data.verifyOwned(run,object,id)});if(exploration.status!=='passed')throw Error('Dedicated exploration failed');stages.push('bounded-approved-ai-exploration-complete');}
    const renderOrigins=[...new Set([...guard.origins,...(staticReview?.plan.assets.map(a=>new URL(a.url).origin)??[])])];
    const files=workflows.map(w=>({id:w.id,code:generateTest(w,renderOrigins,{module:s.guardModule??resolve('src/execution/dedicated-browser.ts').replaceAll('\\','/'),config})}));
    execution=await (s.runTests??executeGenerated)(resolve(root,'execution'),run.plan.runId,files,ui.plan.maxMs,{storageState:session.statePath,trace:'off',validation:s.validation});
    for(const result of execution.results)s.history.record(result);stages.push('headless-reviewed-owned-record-workflows-executed');
    for(const record of owned)await s.data.verifyOwned(run,record.object,record.id);stages.push('post-browser-independent-soql-verification-complete');
    passed=execution.exitCode===0&&execution.results.length===workflows.length&&execution.results.every(r=>r.status==='passed');
  }catch(error){errors.push(error instanceof DedicatedCleanupError?error.message:'Dedicated lifecycle denied or failed; review local exact approvals, session, schema and ownership evidence');}
  finally {
    if(opened){created=s.data.owned(run).length;try{cleaned=(await s.data.cleanup(run)).length;s.data.finish(run);stages.push('reverse-owned-cleanup-and-absence-verification-complete');}catch{passed=false;errors.push('Owned cleanup incomplete or uncertain; manual reconciliation is required before another run');}}
    created=s.data.summary(run).knownCreated;cleaned=s.data.summary(run).deleted;
    if(errors.length)passed=false;
    s.history.db.prepare('UPDATE pipeline_runs SET status=?,payload=? WHERE run=?').run(passed?'passed':'failed',JSON.stringify({stages,errors,created,cleaned}),run.plan.runId);
  }
  for(const failure of execution?.failures??[])investigations.push(await investigateFailure(s.knowledge,scope,{...failure,expected:input.spec.acceptanceCriteria.find(ac=>ui.plan.workflows.find(w=>w.id===failure.testId)?.criterion===ac.id)?.text??'Reviewed owned workflow'}));
  if(errors.length){const evidence=join(root,'lifecycle.json');await saveJson(evidence,{stages,errors,created,cleaned});investigations.push(await investigateFailure(s.knowledge,scope,{testId:`${run.plan.runId}-lifecycle`,message:errors.join('; '),expected:'Approved dedicated session, verified owned setup, execution and safe cleanup',evidence:[evidence]}));}
  const selectorDiagnosis=selectors?diagnoseDedicatedSelectors(selectors,{runId:run.plan.runId,planHash:dedicatedPlanHash(run.plan),policyHash:run.plan.policyHash,sourceVersion:input.spec.version}):{status:'not-executed'};
  const report={mode:'DEDICATED_QA_ORG',validation:s.validation??'unclassified',status:passed?'passed':'failed',runId:run.plan.runId,stages,errors,created,cleaned,ownership:s.data.summary(run),analysis,selectors:selectorReview??(selectors?{status:'review-required',evidence:selectors}:{status:'not-executed'}),selectorDiagnosis,execution:execution??{status:'not-executed'},exploration,investigations,learning:{status:passed?'eligible':'blocked',kind:'verified-execution-lesson',defectRootCauseConfirmed:false}};
  const reportPath=join(root,'report.json');await saveJson(reportPath,report);await writeFile(join(root,'report.html'),htmlReport(report));
  if(passed){await s.knowledge.ingest({id:`dedicated-workflow:${input.spec.id}`,version:run.plan.runId,...scope,kind:'lesson',status:'verified',reviewer:run.approval.operator,capturedAt:new Date().toISOString(),schemaVersion:knowledgeFingerprint(input.org),text:'Reviewed dedicated QA Account/Contact workflow passed real headless assertions, independent SOQL and owned cleanup. This is execution knowledge, not a confirmed defect cause.',evidence:[reportPath,execution!.report],testIds:execution!.results.map(r=>r.testId)});report.learning.status='verified';await saveJson(reportPath,report);await writeFile(join(root,'report.html'),htmlReport(report));}
  return {...report,reportPath};
}
