import { chromium,type BrowserContext } from '@playwright/test';
import { DedicatedGuardSchema,installDedicatedBoundary,type DedicatedGuard } from './dedicated-browser.js';
import { summarizeDeniedRequest,type BoundaryDenialReason } from './browser-diagnostics.js';
import { collectLightningEvidence,lightningFindings } from './lightning-evidence.js';
import { readContractCandidates,type ReadContractCandidate } from './read-contract-evidence.js';
// Metadata-only negative-page diagnosis. Callers obtain references only through
// DedicatedData.cleanedMetadataReferences, which proves journal ownership and absence.
// No assertions/learning and no record fetch/Aura/custom server action is executed.
export async function diagnoseUiDependencies(input:{guard:DedicatedGuard;statePath:string;maxMs:number;prepareContext?:(context:BrowserContext)=>Promise<void>;onStaticCandidate?:(asset:{url:string;type:'script'|'stylesheet'})=>void;onReadContractCandidate?:(candidate:ReadContractCandidate)=>void}) {
  const guard=DedicatedGuardSchema.parse(input.guard);if(!guard.documents.length||guard.documents.length>2||input.maxMs<1||input.maxMs>10000)throw Error('Metadata diagnosis requires bounded known-owned documents');
  for(const document of guard.documents){const target=new URL(document);if(!guard.origins.includes(target.origin)||target.search||target.hash||!guard.owned.some(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`))throw Error('Unknown metadata document');}
  const browser=await chromium.launch({headless:true}),denied:ReturnType<typeof summarizeDeniedRequest>[]=[],keys=new Set<string>();let blocked=0;
  let collect:ReturnType<typeof collectLightningEvidence>|undefined;
  const candidateKeys=new Set<string>();
  const record=(request?:import('@playwright/test').Request,reason?:BoundaryDenialReason)=>{blocked++;collect?.denied(request,reason);if(!request||denied.length>=40)return;const metadata={url:request.url(),method:request.method(),type:request.resourceType(),body:request.postData(),reason};if(reason==='metadata-only-rpc-denied'&&candidateKeys.size<40)for(const candidate of readContractCandidates(metadata,guard.origins,guard.owned.map(row=>row.id))){const key=JSON.stringify(candidate);if(!candidateKeys.has(key)&&candidateKeys.size<40){candidateKeys.add(key);input.onReadContractCandidate?.(candidate);}}const summary=summarizeDeniedRequest(metadata),key=JSON.stringify(summary);if(!keys.has(key)){keys.add(key);denied.push(summary);}};
  try {const context=await browser.newContext({storageState:input.statePath,serviceWorkers:'block',acceptDownloads:false});await input.prepareContext?.(context);collect=collectLightningEvidence(context,guard,input.onStaticCandidate);await installDedicatedBoundary(context,guard,record);
    await context.route('**/*',route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())||['xhr','fetch','eventsource','ping'].includes(request.resourceType())){record(request,'metadata-only-rpc-denied');return route.abort('blockedbyclient');}return route.fallback();});
    const page=await context.newPage(),deadline=Date.now()+input.maxMs;collect.attachPage(page);
    for(let index=0;index<guard.documents.length;index++){if(Date.now()>=deadline)break;const document=guard.documents[index],pageDeadline=Math.min(deadline,Date.now()+Math.floor((deadline-Date.now())/(guard.documents.length-index)));let navigation:'completed'|'blocked-or-timeout'='blocked-or-timeout';try{await page.goto(document,{waitUntil:'domcontentloaded',timeout:Math.max(1,pageDeadline-Date.now()-250)});navigation='completed';}catch{}await new Promise(r=>setTimeout(r,Math.min(1500,Math.max(0,pageDeadline-Date.now()-250))));await collect.capturePage(page,document,navigation,Math.max(0,pageDeadline-Date.now()));}
    const runtime=await collect.finish();
    return {purpose:'cleaned-owned-page-dependency-metadata' as const,assertionsExecuted:0,recordsCreated:0,businessRequestsExecuted:0,learningPublished:false,blockedRequests:blocked,deniedRequests:denied,runtime,findings:lightningFindings(runtime)};
  }finally{await browser.close();}
}
