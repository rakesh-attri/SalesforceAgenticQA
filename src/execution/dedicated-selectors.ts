import { chromium,type BrowserContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WorkflowSchema,type Workflow } from '../agents/workflows.js';
import { DedicatedGuardSchema,installDedicatedBoundary,type DedicatedGuard } from './dedicated-browser.js';
import { sameSalesforceIdentity } from './lightning-identity.js';
import { DeniedRequestSchema,summarizeDeniedRequest } from './browser-diagnostics.js';
import { collectLightningEvidence,LightningRuntimeSchema,lightningFindings } from './lightning-evidence.js';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const SelectorEvidenceSchema=z.object({runId:z.string(),planHash:z.string(),policyHash:z.string(),sourceVersion:z.string(),capturedAt:z.string().datetime(),observations:z.array(z.object({workflowId:z.string(),criterion:z.string(),documentHash:z.string(),expectedHash:z.string(),locator:WorkflowSchema.shape.assertion.shape.locator,status:z.enum(['observed','review-required']),reason:z.enum(['unique-exact-match','steps-require-discovery','not-observed','ambiguous','text-mismatch','navigation-denied']),count:z.number().int().min(0),finalPage:z.object({originApproved:z.boolean(),sameRecord:z.boolean(),query:z.boolean(),fragment:z.boolean(),kind:z.enum(['owned','lightning-home','one-shell','lightning-other','other'])}).optional()}).strict()),blockedRequests:z.number().int().min(0),deniedRequests:z.array(DeniedRequestSchema).max(30).default([]),runtime:LightningRuntimeSchema.optional()}).strict();
type Binding=Pick<z.infer<typeof SelectorEvidenceSchema>,'runId'|'planHash'|'policyHash'|'sourceVersion'>;
export async function observeDedicatedSelectors(input:{guard:DedicatedGuard;workflows:Workflow[];statePath:string;maxMs:number;binding:Binding;prepareContext?:(context:BrowserContext)=>Promise<void>;installBoundary?:(context:BrowserContext,onBlocked:NonNullable<Parameters<typeof installDedicatedBoundary>[2]>)=>Promise<void>}) {
  const guard=DedicatedGuardSchema.parse(input.guard);if(input.maxMs<1||input.maxMs>60000||!input.workflows.length||input.workflows.length>2)throw Error('Selector discovery budget denied');
  for(const w of input.workflows){const target=new URL(w.path,w.origin);if(!guard.documents.includes(target.href)||!guard.owned.some(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`))throw Error('Selector discovery must remain on exact owned pages');}
  const browser=await chromium.launch({headless:true}),observations:z.infer<typeof SelectorEvidenceSchema>['observations']=[],deniedRequests:z.infer<typeof DeniedRequestSchema>[]=[],deniedKeys=new Set<string>();let deadline=Date.now()+input.maxMs,blockedRequests=0;
  let runtime:z.infer<typeof LightningRuntimeSchema>|undefined;
  try {const context=await browser.newContext({storageState:input.statePath,serviceWorkers:'block',acceptDownloads:false});await input.prepareContext?.(context);const collect=collectLightningEvidence(context,guard);const onBlocked:NonNullable<Parameters<typeof installDedicatedBoundary>[2]>=(request,reason)=>{blockedRequests++;collect.denied(request,reason);if(!request||deniedRequests.length>=30)return;const summary=summarizeDeniedRequest({url:request.url(),method:request.method(),type:request.resourceType(),body:request.postData(),reason}),key=JSON.stringify(summary);if(!deniedKeys.has(key)){deniedKeys.add(key);deniedRequests.push(summary);}};if(input.installBoundary){await input.installBoundary(context,onBlocked);deadline=Date.now()+input.maxMs;}else await installDedicatedBoundary(context,guard,onBlocked);const page=await context.newPage();collect.attachPage(page);
    for(const w of input.workflows){const document=new URL(w.path,w.origin).href,entry:z.infer<typeof SelectorEvidenceSchema>['observations'][number]={workflowId:w.id,criterion:w.criterion,documentHash:hash(document),expectedHash:hash(w.assertion.text),locator:w.assertion.locator,status:'review-required',reason:'not-observed',count:0};
      const workflowDeadline=Math.min(deadline,Date.now()+Math.floor(Math.max(0,deadline-Date.now())/(input.workflows.length-observations.length)));
      if(w.steps.length){entry.reason='steps-require-discovery';observations.push(entry);continue;}
      try {await page.goto(document,{waitUntil:'domcontentloaded',timeout:Math.max(1,workflowDeadline-Date.now())});const final=new URL(page.url()),recordId=final.pathname.match(/^\/lightning\/r\/(?:Account\/|Contact\/)?([A-Za-z0-9]+)\/view$/)?.[1],sameRecord=!!recordId&&guard.owned.some(r=>sameSalesforceIdentity(recordId,r.id)&&document.includes(r.id));entry.finalPage={originApproved:guard.origins.includes(final.origin),sameRecord,query:!!final.search,fragment:!!final.hash,kind:sameRecord?'owned':final.pathname==='/lightning/page/home'?'lightning-home':final.pathname==='/one/one.app'?'one-shell':final.pathname.startsWith('/lightning')?'lightning-other':'other'};if(page.url()!==document){entry.reason='navigation-denied';observations.push(entry);continue;}
        const l=w.assertion.locator,locator=l.by==='role'?page.getByRole(l.value as 'heading',{name:l.name??'',exact:true}):l.by==='label'?page.getByLabel(l.value,{exact:true}):page.getByTestId(l.value);
        await locator.first().waitFor({state:'visible',timeout:Math.max(1,workflowDeadline-Date.now()-250)});entry.count=await locator.count();
        if(entry.count!==1)entry.reason='ambiguous';else if(await locator.textContent({timeout:Math.max(1,workflowDeadline-Date.now())})!==w.assertion.text)entry.reason='text-mismatch';else {entry.status='observed';entry.reason='unique-exact-match';}
      }catch{/* Unknown page behavior is evidence of a blocker, never a replacement selector. */}finally{await collect.capturePage(page,document,entry.finalPage?'completed':'blocked-or-timeout',Math.max(0,workflowDeadline-Date.now()));}
      observations.push(entry);
    }
    runtime=await collect.finish();
  }finally{await browser.close();}
  return SelectorEvidenceSchema.parse({...input.binding,capturedAt:new Date().toISOString(),observations,blockedRequests,deniedRequests,runtime});
}
export function reviewObservedSelectors(raw:unknown,binding:Binding,workflows:Workflow[],documents:string[]) {
  const evidence=SelectorEvidenceSchema.parse(raw);
  if(Date.parse(evidence.capturedAt)>Date.now()||Date.now()-Date.parse(evidence.capturedAt)>300000)throw Error('Selector evidence is stale or future-dated; review required');
  if(Object.entries(binding).some(([k,v])=>evidence[k as keyof Binding]!==v)||evidence.observations.length!==workflows.length||new Set(evidence.observations.map(o=>o.workflowId)).size!==workflows.length)throw Error('Selector evidence binding/coverage differs from the reviewed run');
  for(const w of workflows){const o=evidence.observations.find(v=>v.workflowId===w.id),document=new URL(w.path,w.origin).href;
    if(!documents.includes(document)||!o||o.criterion!==w.criterion||o.documentHash!==hash(document)||o.expectedHash!==hash(w.assertion.text)||JSON.stringify(o.locator)!==JSON.stringify(w.assertion.locator)||o.status!=='observed'||o.count!==1||o.reason!=='unique-exact-match')throw Error('Approved selector was not uniquely observed with the unchanged expected outcome; review required');}
  return {status:'reviewed' as const,evidenceHash:hash(evidence),evidence};
}

// Retrospective gap diagnosis is proposed evidence, never a passing execution,
// confirmed defect, locator repair or permission to enable a denied operation.
export function diagnoseDedicatedSelectors(raw:unknown,binding:Binding,dependencyRaw?:unknown) {
  const evidence=SelectorEvidenceSchema.parse(raw);
  if(Object.entries(binding).some(([key,value])=>evidence[key as keyof Binding]!==value))throw Error('Selector diagnosis binding differs from the reviewed run');
  let dependencyFindings:unknown={status:'not-captured'};
  if(dependencyRaw!==undefined){const dependency=z.object({binding:z.object({runId:z.string(),planHash:z.string(),policyHash:z.string(),sourceVersion:z.string()}).strict(),runtime:LightningRuntimeSchema}).passthrough().parse(dependencyRaw);if(Object.entries(binding).some(([key,value])=>dependency.binding[key as keyof Binding]!==value))throw Error('Dependency evidence binding differs from the reviewed run');dependencyFindings={context:'known-deleted-negative-page-metadata-only',...lightningFindings(dependency.runtime)};}
  const unresolved=evidence.observations.filter(o=>o.status!=='observed'),denied=evidence.deniedRequests,
    deniedStatic=denied.filter(r=>['script','stylesheet'].includes(r.resource)),deniedReads=denied.filter(r=>['xhr','fetch'].includes(r.resource)),unknownActions=denied.reduce((sum,r)=>sum+r.unknownDescriptors,0);
  return {status:unresolved.length?'review-required' as const:'selectors-observed' as const,kind:'proposed-browser-gap-review' as const,runId:evidence.runId,evidenceHash:hash(evidence),
    sourceVersion:evidence.sourceVersion,observedSelectors:evidence.observations.length-unresolved.length,unresolvedSelectors:unresolved.map(o=>({workflowId:o.workflowId,reason:o.reason})),
    blockedRequests:evidence.blockedRequests,deniedStaticSamples:deniedStatic.length,deniedRpcSamples:deniedReads.length,unknownActionSamples:unknownActions,denialReasons:Object.fromEntries([...new Set(denied.map(r=>r.reason))].map(reason=>[reason,denied.filter(r=>r.reason===reason).length])),
    classification:unresolved.length?(denied.length?'framework-policy-or-workflow-gap':'selector-or-application-behavior-unknown'):'selector-observation-only',
    rootCause:'unconfirmed' as const,deniedRequestsProvenCausal:false,generatedExecutionProven:false,learningEligible:false,
    runtimeFindings:evidence.runtime?lightningFindings(evidence.runtime,evidence.observations.map(o=>o.reason)):{status:'not-captured'},dependencyFindings,recommendations:[...(deniedStatic.length?['review-exact-static-dependencies']:[]),...(deniedReads.length?['review-read-operation-contracts']:[]),...(unresolved.length?['observe-and-review-locators-with-unchanged-outcomes']:[])]};
}
