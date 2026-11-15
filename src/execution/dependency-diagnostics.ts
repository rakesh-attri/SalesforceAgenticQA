import { chromium,type BrowserContext } from '@playwright/test';
import { DedicatedGuardSchema,installDedicatedBoundary,type DedicatedGuard } from './dedicated-browser.js';
import { summarizeDeniedRequest,type BoundaryDenialReason } from './browser-diagnostics.js';
import { collectLightningEvidence,lightningFindings } from './lightning-evidence.js';
import { readContractCandidates,type ReadContractCandidate } from './read-contract-evidence.js';
import { collectInitializationSources,inspectCurrentAppRequest,classifyInitializationError } from './lightning-initialization.js';
import { InitializationScopeSchema } from './diagnostic-review.js';
import type { z } from 'zod';
import { WorkflowSchema } from '../agents/workflows.js';
import {resolveLocator} from '../core/locators.js';
import { createHash } from 'node:crypto';
import { fetchReviewedStatic } from './static-transport.js';
// Metadata-only negative-page diagnosis. Callers obtain references only through
// DedicatedData.cleanedMetadataReferences, which proves journal ownership and absence.
// No assertions/learning and no record fetch/Aura/custom server action is executed.
export async function diagnoseUiDependencies(input:{guard:DedicatedGuard;statePath:string;maxMs:number;prepareContext?:(context:BrowserContext)=>Promise<void>;onStaticCandidate?:(asset:{url:string;type:'script'|'stylesheet'})=>void;onReadContractCandidate?:(candidate:ReadContractCandidate)=>void;initialization?:{scope:z.infer<typeof InitializationScopeSchema>;selectors:Array<{object:'Account'|'Contact';locator:z.infer<typeof WorkflowSchema>['assertion']['locator']}>};staticFetch?:typeof fetchReviewedStatic}) {
  const guard=DedicatedGuardSchema.parse(input.guard);if(!guard.documents.length||guard.documents.length>2||input.maxMs<1||input.maxMs>10000)throw Error('Metadata diagnosis requires bounded known-owned documents');
  for(const document of guard.documents){const target=new URL(document);if(!guard.origins.includes(target.origin)||target.search||target.hash||!guard.owned.some(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`))throw Error('Unknown metadata document');}
  const scope=input.initialization?InitializationScopeSchema.parse(input.initialization.scope):undefined,sources=scope?collectInitializationSources(scope):undefined,requestShapes:NonNullable<ReturnType<typeof inspectCurrentAppRequest>>[]=[],selectorSamples:Array<{documentHash:string;locatorHash:string;count:number|null;context:'known-deleted';assertionExecuted:false}>=[];
  const clientErrors:ReturnType<typeof classifyInitializationError>[]=[];
  if(input.initialization&&(input.initialization.selectors.length>2||input.initialization.selectors.some(selector=>!guard.owned.some(row=>row.object===selector.object)||!WorkflowSchema.shape.assertion.shape.locator.safeParse(selector.locator).success)))throw Error('Initialization selector metadata must use the reviewed owned object locators');
  const browser=await chromium.launch({headless:true}),denied:ReturnType<typeof summarizeDeniedRequest>[]=[],keys=new Set<string>();let blocked=0;
  let collect:ReturnType<typeof collectLightningEvidence>|undefined;
  const candidateKeys=new Set<string>();
  const record=(request?:import('@playwright/test').Request,reason?:BoundaryDenialReason)=>{blocked++;collect?.denied(request,reason);if(!request||denied.length>=40)return;const metadata={url:request.url(),method:request.method(),type:request.resourceType(),body:request.postData(),reason};if(scope&&reason==='metadata-only-rpc-denied'&&requestShapes.length<10){const shape=inspectCurrentAppRequest(metadata,guard.origins);if(shape)requestShapes.push(shape);}if(reason==='metadata-only-rpc-denied'&&candidateKeys.size<40)for(const candidate of readContractCandidates(metadata,guard.origins,guard.owned.map(row=>row.id))){const key=JSON.stringify(candidate);if(!candidateKeys.has(key)&&candidateKeys.size<40){candidateKeys.add(key);input.onReadContractCandidate?.(candidate);}}const summary=summarizeDeniedRequest(metadata),key=JSON.stringify(summary);if(!keys.has(key)){keys.add(key);denied.push(summary);}};
  let runtime:Awaited<ReturnType<ReturnType<typeof collectLightningEvidence>['finish']>>;
  try {const context=await browser.newContext({storageState:input.statePath,serviceWorkers:'block',acceptDownloads:false});await input.prepareContext?.(context);collect=collectLightningEvidence(context,guard,input.onStaticCandidate);await installDedicatedBoundary(context,guard,record,async(...args)=>{const response=await (input.staticFetch??fetchReviewedStatic)(...args);sources?.capture(args[4].url,args[4].type,response.body);return response;});
    await context.route('**/*',route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())||['xhr','fetch','eventsource','ping'].includes(request.resourceType())){record(request,'metadata-only-rpc-denied');return route.abort('blockedbyclient');}return route.fallback();});
    const page=await context.newPage(),deadline=Date.now()+input.maxMs;collect.attachPage(page);if(scope)page.on('pageerror',error=>{if(clientErrors.length<8)clientErrors.push(classifyInitializationError(error));});
    for(let index=0;index<guard.documents.length;index++){if(Date.now()>=deadline)break;const document=guard.documents[index],pageDeadline=Math.min(deadline,Date.now()+Math.floor((deadline-Date.now())/(guard.documents.length-index)));let navigation:'completed'|'blocked-or-timeout'='blocked-or-timeout';try{await page.goto(document,{waitUntil:'domcontentloaded',timeout:Math.max(1,pageDeadline-Date.now()-250)});navigation='completed';}catch{}await new Promise(r=>setTimeout(r,Math.min(1500,Math.max(0,pageDeadline-Date.now()-250))));await collect.capturePage(page,document,navigation,Math.max(0,pageDeadline-Date.now()));
      if(scope)for(const selector of input.initialization!.selectors.filter(row=>new URL(document).pathname.startsWith(`/lightning/r/${row.object}/`))){let count:number|null=null;if(page.url()===document&&Date.now()<pageDeadline){const locator=resolveLocator(page,selector.locator);try{count=await locator.count();}catch{}}selectorSamples.push({documentHash:createHash('sha256').update(document).digest('hex'),locatorHash:createHash('sha256').update(JSON.stringify(selector.locator)).digest('hex'),count,context:'known-deleted',assertionExecuted:false});}
    }
    runtime=await collect.finish();
  }finally{await browser.close();}
  return {purpose:'cleaned-owned-page-dependency-metadata' as const,assertionsExecuted:0,recordsCreated:0,businessRequestsExecuted:0,learningPublished:false,blockedRequests:blocked,deniedRequests:denied,runtime,findings:lightningFindings(runtime),...(scope?{initialization:{requestShapes,selectorSamples,clientErrors,clientSources:sources!.finish(),requestProgress:runtime.requestProgress,internalBootstrapAllowed:false,serverEffects:'unknown',responseRequirements:'unknown',renderingCause:'unresolved'}}:{})};
}
