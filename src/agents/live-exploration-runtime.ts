import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Command,type BaseCheckpointSaver} from '@langchain/langgraph';
import {z} from 'zod';
import type {History} from '../core/history.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import {SalesforceClient} from '../salesforce/client.js';
import {LightningSession} from '../execution/lightning-session.js';
import {lightningEngineProfile,lightningEngineHash} from '../execution/lightning-engine.js';
import {fingerprint,digest,browserPlanHash} from '../execution/browser-policy.js';
import {createLightningMcp} from '../integrations/lightning-mcp.js';
import {independentObservationReceipt,type PrivateRecordObservation} from '../salesforce/observation-read.js';
import {createExplorationSelectionGraph,ExplorationResumeSchema} from './exploration-runtime.js';
import {ExplorationApprovalSchema} from './exploration-plan.js';
import {validateLiveExploration,authorizeLiveExploration,liveExplorationHash,liveLedger,planLiveExploration,type LiveExploration} from './live-exploration.js';
import {JourneyEvidenceSchema,acquireRenderedWorkflowEvidence} from './workflow-evidence.js';
import {DedicatedSessionError} from '../execution/dedicated-browser.js';
import {browserErrorDiagnostic,BrowserExecutionDiagnosticSchema} from '../execution/browser-diagnostics.js';
export function liveObservationFailure(error:unknown){
 const known=z.enum(['private-state','state-origin','session-cookie','identity-http','identity-redirect','identity-mismatch','state-changed','verification-unavailable','receipt']);
 const code=error instanceof DedicatedSessionError?known.safeParse(error.code):undefined;
 const diagnostic=browserErrorDiagnostic(error);return{...(code?.success?{category:'browser-session-gate' as const,code:code.data}:{category:'environment-or-incomplete' as const}),...(diagnostic?{diagnostic}:{})};
}
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const LiveReceiptSchema=z.object({ref:z.number(),object:z.enum(['Account','Contact']),validation:z.enum(['live-salesforce','offline-mocked-salesforce']),policyHash:Hash,sessionId:z.string(),mcpHash:Hash,stateHash:Hash,ready:z.boolean(),nameObserved:z.boolean().optional(),unchanged:z.boolean(),independent:z.object({status:z.enum(['verified','unknown-or-drift']),relationship:z.string(),sourceVersion:Hash,readGrantHash:Hash,records:z.array(z.object({object:z.string(),recordHash:Hash,status:z.enum(['unknown','unchanged','drift']),beforeVersion:Hash.optional(),afterVersion:Hash.optional(),fields:z.array(z.string()),permissionConclusion:z.literal('not-established-by-field-presence')}).strict()),recordWrites:z.literal(0)}).strict(),requests:z.number().int().nonnegative(),budgetExhausted:z.boolean(),console:z.array(z.enum(['blocked','network','csp','other','page-error'])).max(5),network:z.array(z.object({kind:z.string(),status:z.number().optional()}).strict()).max(200),locators:z.array(z.unknown()).max(20),visual: z.object({manifest:z.string(),hash:Hash}).strict().optional(),diagnostics:BrowserExecutionDiagnosticSchema.optional(),readinessHash:Hash,referenceUnchanged:z.boolean(),nativeBackgroundEffects:z.literal('not-enumerated'),generatedTestsExecuted:z.literal(0),source:JourneyEvidenceSchema.optional()}).strict();
export type LiveReceipt=z.infer<typeof LiveReceiptSchema>;
// Only the trusted composition root supplies this host. Tests may inject a
// fixture host, whose receipts remain explicitly offline-mocked-salesforce.
export interface LiveObservationHost{
 readonly validation:'live-salesforce'|'offline-mocked-salesforce';
 refresh():Promise<{org:string;permission:string;user:string;engineHash:string;mcpVersion:string;baselineHash:string}>;
 observe(ref:number):Promise<LiveReceipt>;
}
export function salesforceObservationHost(d:LiveExploration,parent:unknown,h:History,statePath:string,fixtures?:{connect:typeof SalesforceClient.connectReviewedBrowser;open:typeof LightningSession.open}):LiveObservationHost{
 const apis=new Map<number,Awaited<ReturnType<typeof SalesforceClient.connectReviewedBrowser>>>();
 let baseline:Map<number,PrivateRecordObservation[]>|undefined;
 const validation=fixtures?'offline-mocked-salesforce' as const:'live-salesforce' as const;
 const apiFor=async(ref:number)=>{const leaf=d.leaves.find(l=>l.ref===ref)!;if(!apis.has(ref))apis.set(ref,await(fixtures?.connect??SalesforceClient.connectReviewedBrowser.bind(SalesforceClient))(parent,leaf.review,h));return apis.get(ref)!;};
 return{validation,async refresh(){
  const current=new Map<number,PrivateRecordObservation[]>();for(const leaf of d.leaves){const api=await apiFor(leaf.ref),identity=await api.preflight();if(identity.Id!==leaf.review.plan.orgId||identity.userId!==leaf.review.plan.userId)throw Error('Fresh exact API identity differs');current.set(leaf.ref,await api.readObservation(leaf.read));}
  baseline=current;return{...d.scope,engineHash:lightningEngineHash(),mcpVersion:lightningEngineProfile().mcpVersion,baselineHash:fingerprint([...current].map(([ref,rows])=>({ref,versions:rows.map(r=>r.version)})))};
 },async observe(ref){
  const leaf=d.leaves.find(l=>l.ref===ref);if(!leaf||!baseline)throw Error('Current reviewed reference/preflight required');const api=await apiFor(ref),before=await api.readObservation(leaf.read);
  if(fingerprint(before)!==fingerprint(baseline.get(ref)))throw Error('Independent record changed since current preflight');
  const recordPost=(result:unknown)=>{if(h.db.prepare("SELECT name FROM sqlite_master WHERE name='exploration_runs'").get()&&h.db.prepare('SELECT run FROM exploration_runs WHERE run=?').get(d.runId))liveLedger(h).mutate(d.runId,'independent-postcheck',{validation,browserHash:browserPlanHash(leaf.review.plan),readGrantHash:fingerprint(leaf.read.plan),result},()=>{});};
  let session:LightningSession;try{session=await(fixtures?.open??LightningSession.open.bind(LightningSession))({review:leaf.review,parent,history:h,statePath,apiOrigin:api.apiOrigin,view:leaf.view,dedicatedChromeProfile:leaf.profile,identity:()=>api.preflight(),verifyReferences:async()=>{const refs=await api.verifyReferences();if(refs.privateDisplays.some(display=>display.display!==before.find(row=>row.id===display.id)?.values.Name))throw Error('UI display binding differs from independent API value');return refs;}});}catch(error){try{recordPost(independentObservationReceipt(leaf.read,before,await api.readObservation(leaf.read)));}catch{recordPost({status:'unavailable',recordWrites:0});}throw error;}
  const gateway=createLightningMcp(session),client=new Client({name:'sfqa-observation-planner',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  let viewed:Record<string,unknown>={},discovered:Record<string,unknown>={},closed:Record<string,unknown>={},operationFailed=false;
  const call=async(name:string,args:Record<string,unknown>)=>{const result=await client.callTool({name,arguments:args});if(result.isError)throw Error('Reviewed observation gateway denied or failed');const text=(result.content as Array<{type:string;text?:string}>).find(c=>c.type==='text')?.text;if(!text)throw Error('Bounded gateway result missing');return JSON.parse(text) as Record<string,unknown>;};
  try{await gateway.connect(a);await client.connect(b);await call('sfqa_browser_observe_record',{object:leaf.object});viewed=await call('sfqa_browser_reviewed_view',{});discovered=await call('sfqa_browser_discover_view',{});}
  catch{operationFailed=true;}
  finally{await client.close().catch(()=>{});await gateway.close().catch(()=>{});closed=await session.close() as Record<string,unknown>;}
  if(closed.validation!==validation)throw Error('Host validation provenance differs');
  const after=await api.readObservation(leaf.read),independent=independentObservationReceipt(leaf.read,before,after),metrics=z.object({requests:z.number(),blocked:z.number(),trace:z.object({truncated:z.boolean(),entries:z.array(z.object({status:z.number().optional()}).passthrough())})}).parse(closed.metrics),visual=closed.visual as {manifest?:string;manifestHash?:string}|undefined,checks=z.object({name:z.boolean(),content:z.number(),busyClear:z.boolean(),faultsClear:z.boolean()}).safeParse(viewed.checks);recordPost(independent);
  const ready=!operationFailed&&viewed.status==='rendered-reviewed-view'&&checks.success&&checks.data.name&&checks.data.content===leaf.view.content.length&&checks.data.busyClear&&checks.data.faultsClear&&session.status().nativeMcpConnected;
  let source:z.infer<typeof JourneyEvidenceSchema>|undefined;try{source=acquireRenderedWorkflowEvidence(h,leaf.review,closed,leaf.view);}catch{/* Unjournaled/expired rendering never becomes published workflow evidence. */}
  return LiveReceiptSchema.parse({source,ref,object:leaf.object,validation,policyHash:browserPlanHash(leaf.review.plan),sessionId:closed.sessionId,mcpHash:fingerprint({gateway:['observe_record','reviewed_view','discover_view'],nativeConnected:session.status().nativeMcpConnected,session:closed.sessionId}),stateHash:fingerprint({view:leaf.review.plan.renderContractHash,readiness:viewed,independent}),ready,nameObserved:checks.success?checks.data.name:undefined,unchanged:closed.referenceUnchanged===true&&independent.status==='verified',independent,requests:metrics.requests,budgetExhausted:metrics.requests>leaf.review.plan.budgets.requests||metrics.trace.truncated,console:Object.keys(closed.consoleCategories??{}),network:metrics.trace.entries.slice(0,200).map(entry=>({kind:'native-initialization-or-observation',status:entry.status})),locators:Array.isArray(discovered.recordNameCandidates)?discovered.recordNameCandidates:[],visual:visual?.manifest&&visual.manifestHash?{manifest:visual.manifest,hash:visual.manifestHash}:undefined,diagnostics:closed.diagnostics,readinessHash:fingerprint(viewed),referenceUnchanged:closed.referenceUnchanged===true,nativeBackgroundEffects:'not-enumerated',generatedTestsExecuted:0});
 }};
}
export async function runLiveExploration(input:{definition:unknown;approval:unknown;parent:unknown},services:{history:History;checkpointer:BaseCheckpointSaver;host:LiveObservationHost;pauseBefore?:string[];resume?:unknown}){
 const h=services.history,d=validateLiveExploration(input.definition,h),approval=ExplorationApprovalSchema.parse(input.approval);authorizeLiveExploration(d,input.parent,approval);
 if(d.leaves.some(leaf=>leaf.lineage&&leaf.lineage.definition.validation!==services.host.validation))throw Error('Source lineage validation differs from the trusted execution host');
 const ledger=liveLedger(h),opened=ledger.open(d,approval);if(['achieved','failed','blocked'].includes(opened.state.status))return{state:opened.state,validation:services.host.validation,liveAttempted:false,liveExecuted:false};
 if(opened.state.openSession||opened.state.attempts.some(a=>a.status==='pending'||a.status==='uncertain'))throw Error('Uncertain live session/action cannot replay');
 const fresh=await services.host.refresh(),{baselineHash,...identity}=fresh;ledger.verify(d.runId,identity);
 const baseline=ledger.events(d.runId).find(e=>e.kind==='independent-preflight');if(baseline&&baseline.payload.hash!==baselineHash){ledger.mutate(d.runId,'record-drift',{},s=>{s.status='blocked';s.covered=[];s.questions.push('Independent record/source state changed; prior evidence cannot authorize continuation.');});return{state:ledger.read(d.runId).state,validation:services.host.validation,liveAttempted:false,liveExecuted:false};}
 if(!baseline){ledger.mutate(d.runId,'independent-preflight',{hash:baselineHash,validation:services.host.validation,org:d.scope.org,user:d.scope.user},()=>{});ledger.observe(d.runId,{kind:'api-preflight',path:'/start',stateHash:fingerprint({baselineHash,definition:liveExplorationHash(d)}),complete:true,errors:0,loading:0,checks:[],locators:[],mcpHash:'',network:[],console:[]});}
 const index=new KnowledgeIndex(h),graph=createExplorationSelectionGraph({ledger,index,identity:async()=>{const now=await services.host.refresh();if(now.baselineHash!==baselineHash)throw Error('Independent state drift before selection/resume');const {baselineHash:_,...identity}=now;return identity;},checkpointer:services.checkpointer,planner:(definition,p,refs)=>planLiveExploration(definition,p,h,index,refs)});
 let executed=false,liveReceiptObserved=false,resume=services.resume?ExplorationResumeSchema.parse(services.resume):undefined;const pending=ledger.read(d.runId).state.pause;
 if(!!pending!==!!resume)throw Error('Exact original live checkpoint review required');
 if(pending&&resume&&(resume.operator!==approval.operator||resume.definitionHash!==liveExplorationHash(d)||resume.actionId!==pending.actionId||resume.stateHash!==pending.stateHash))throw Error('Exact original live checkpoint review required');
 while(true){authorizeLiveExploration(d,input.parent,approval);ledger.verify(d.runId,identity);const state=ledger.read(d.runId).state,current=state.observations.at(-1)!;
  if(d.objective.criteria.every(id=>state.covered.includes(id))){ledger.mutate(d.runId,'observation-objective-achieved',{},s=>{s.status='achieved';});break;}
  const thread=state.pause?.thread??`${d.runId}:live:${state.decisions.length}`,config={configurable:{thread_id:thread}},choice=resume?await graph.invoke(new Command({resume}),config):await graph.invoke({runId:d.runId,expectedState:current.stateHash,candidateRefs:d.actions.map(a=>a.ref),pause:services.pauseBefore??[]},config);resume=undefined;
  if('__interrupt__'in choice&&Array.isArray(choice.__interrupt__)&&choice.__interrupt__.length){ledger.mutate(d.runId,'live-operator-interrupt',{thread},s=>{s.status='interrupted';s.pause={thread,actionId:choice.actionId!,stateHash:current.stateHash,path:current.path};});break;}
  if(!choice.actionId){ledger.mutate(d.runId,'live-scope-ended',{},s=>{s.status='blocked';delete s.pause;s.questions.push(...(choice.plan?.questions??['Operator stopped.']));});break;}
  const action=d.actions.find(a=>a.id===choice.actionId)!,leaf=d.leaves.find(l=>l.ref===action.ref)!,requestBudget=leaf.review.plan.budgets.requests;
  if(ledger.remaining(d.runId)<leaf.review.plan.budgets.maxMs||state.requests+requestBudget>d.budgets.requests){ledger.mutate(d.runId,'insufficient-native-reservation',{},s=>{s.status='blocked';s.questions.push('Remaining time/request reservation is insufficient; quotas are not increased.');});break;}
  ledger.mutate(d.runId,'live-review-complete',{},s=>{s.status='active';delete s.pause;});const reservation=ledger.reserveSession(d.runId,identity);let result:LiveReceipt|undefined;
  try{
   ledger.mutate(d.runId,'native-budget-reserved',{requests:requestBudget},s=>{s.requests+=requestBudget;if(++s.navigations>d.budgets.navigations)throw Error('Navigation budget exhausted');});ledger.claim(d.runId,action.id,current.stateHash);
   // Attempt is durable before opening the native context. Any failure now may
   // have background effects and becomes uncertain, never automatically retried.
   executed=true;result=LiveReceiptSchema.parse(await services.host.observe(action.ref));
   if(result.validation!==services.host.validation||result.ref!==leaf.ref||result.object!==leaf.object||result.policyHash!==browserPlanHash(leaf.review.plan)||result.independent.readGrantHash!==fingerprint(leaf.read.plan)||result.independent.sourceVersion!==leaf.review.plan.sourceVersion)throw Error('Host receipt belongs to another scope/source/validation');
   const exactIndependent=result.independent.records.length===leaf.read.plan.records.length&&leaf.read.plan.records.every(ref=>result!.independent.records.some(record=>record.object===ref.object&&record.recordHash===digest(ref.id)&&record.status==='unchanged'&&!!record.beforeVersion&&record.beforeVersion===record.afterVersion&&fingerprint(record.fields)===fingerprint(ref.fields)));
   const sourceVerified=services.host.validation!=='live-salesforce'||!!result.source&&result.source.validation==='live-salesforce'&&result.source.org===d.scope.org&&result.source.permission===d.scope.permission;
   const complete=sourceVerified&&result.ready&&result.unchanged&&result.referenceUnchanged&&result.independent.status==='verified'&&exactIndependent&&result.independent.relationship===(leaf.read.plan.relationship?'verified':'not-reviewed')&&!result.budgetExhausted&&result.requests<=leaf.review.plan.budgets.requests,check=d.checks.find(c=>action.criteria.includes(c.criterionId))!;
   ledger.mutate(d.runId,'live-observation-receipt',result,()=>{});
   liveReceiptObserved=services.host.validation==='live-salesforce';
   ledger.observe(d.runId,{kind:'ui',path:'/'+leaf.object,stateHash:result.stateHash,complete,errors:result.console.includes('page-error')?1:0,loading:result.ready?0:1,checks:[{id:check.id,criterionId:check.criterionId,status:complete?'passed':'unavailable',expectedHash:fingerprint(check.expectedText),actualHash:complete?fingerprint(check.expectedText):undefined,matches:complete?1:0,visible:result.ready}],locators:result.locators,mcpHash:result.mcpHash,network:result.network,console:result.console});
   const passed=complete&&!result.console.includes('page-error');ledger.finishAction(d.runId,action.id,result.stateHash,passed?undefined:'incomplete');if(!passed){ledger.mutate(d.runId,'live-observation-incomplete',{},s=>{s.status='blocked';s.questions.push('Readiness, independent equality, identity or budget evidence is incomplete. No business defect or safe rerun is inferred.');});break;}
  }catch(error){const s=ledger.read(d.runId).state;if(s.attempts.some(a=>a.id===action.id&&a.status==='pending'))ledger.finishAction(d.runId,action.id,undefined,'environment');ledger.mutate(d.runId,'live-observation-failed',liveObservationFailure(error),s=>{s.status='blocked';s.questions.push('Observation stopped with possible native background effects; raw diagnostics withheld and replay prohibited.');});break;}
  finally{ledger.closeSession(d.runId,reservation.id);}
 }
 return{state:ledger.read(d.runId).state,validation:services.host.validation,liveAttempted:executed&&services.host.validation==='live-salesforce',liveExecuted:liveReceiptObserved,generatedTestsExecuted:0,verifiedLearningPublished:false};
}
