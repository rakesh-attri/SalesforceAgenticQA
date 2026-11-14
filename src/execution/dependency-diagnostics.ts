import { chromium,type BrowserContext } from '@playwright/test';
import { DedicatedGuardSchema,installDedicatedBoundary,type DedicatedGuard } from './dedicated-browser.js';
import { summarizeDeniedRequest } from './browser-diagnostics.js';
// Metadata-only negative-page diagnosis. Callers obtain references only through
// DedicatedData.cleanedMetadataReferences, which proves journal ownership and absence.
// No assertions/learning and no record fetch/Aura/custom server action is executed.
export async function diagnoseUiDependencies(input:{guard:DedicatedGuard;statePath:string;maxMs:number;prepareContext?:(context:BrowserContext)=>Promise<void>}) {
  const guard=DedicatedGuardSchema.parse(input.guard);if(!guard.documents.length||guard.documents.length>2||input.maxMs<1||input.maxMs>10000)throw Error('Metadata diagnosis requires bounded known-owned documents');
  for(const document of guard.documents){const target=new URL(document);if(!guard.origins.includes(target.origin)||target.search||target.hash||!guard.owned.some(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`))throw Error('Unknown metadata document');}
  const browser=await chromium.launch({headless:true}),denied:ReturnType<typeof summarizeDeniedRequest>[]=[],keys=new Set<string>();let blocked=0;
  const record=(request?:import('@playwright/test').Request)=>{blocked++;if(!request||denied.length>=40)return;const summary=summarizeDeniedRequest({url:request.url(),method:request.method(),type:request.resourceType(),body:request.postData()}),key=JSON.stringify(summary);if(!keys.has(key)){keys.add(key);denied.push(summary);}};
  try {const context=await browser.newContext({storageState:input.statePath,serviceWorkers:'block',acceptDownloads:false});await input.prepareContext?.(context);await installDedicatedBoundary(context,guard,record);
    await context.route('**/*',route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())||['xhr','fetch','eventsource','ping'].includes(request.resourceType())){record(request);return route.abort('blockedbyclient');}return route.fallback();});
    const page=await context.newPage(),deadline=Date.now()+input.maxMs;
    for(const document of guard.documents){if(Date.now()>=deadline)break;await page.goto(document,{waitUntil:'domcontentloaded',timeout:Math.max(1,deadline-Date.now())}).catch(()=>{});await new Promise(r=>setTimeout(r,Math.min(1500,Math.max(0,deadline-Date.now()))));}
    return {purpose:'cleaned-owned-page-dependency-metadata' as const,assertionsExecuted:0,recordsCreated:0,businessRequestsExecuted:0,learningPublished:false,blockedRequests:blocked,deniedRequests:denied};
  }finally{await browser.close();}
}
