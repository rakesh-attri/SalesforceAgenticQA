import {launchLocalBrowser} from './local-browser.js';
import {chromium,type Browser,type Page} from '@playwright/test';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createConnection} from '@playwright/mcp';
import type {History} from '../core/history.js';
import {SalesforceClient} from '../salesforce/client.js';
import {readPrivateSessionState} from '../integrations/session-gate.js';
import {BrowserReviewSchema,authorizeBrowserSession,browserDocument,browserPlanHash,digest,fingerprint,type BrowserRecord,type BrowserReview} from './browser-policy.js';
import {attachReviewedBrowserContext,type ContextAttachmentInput} from './browser-runtime.js';
import {parseBrowserBuild} from './browser-build.js';
import {sameSalesforceIdentity} from './lightning-identity.js';
import {observeLightningView,reviewedLocator} from './lightning-view.js';
import {WorkflowSchema} from '../agents/workflows.js';
import {verifyLightningEngine} from './lightning-engine.js';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {recordLightningReadiness} from './lightning-proof.js';
import type {DebugReason} from './browser-debug.js';
import {setTimeout as delay} from 'node:timers/promises';
import {DedicatedSessionError,validateDedicatedState} from './dedicated-browser.js';
import {BrowserExecutionDiagnostics,BrowserStageError,browserErrorDiagnostic,withBrowserStage} from './browser-diagnostics.js';
import {loadPreferredChromeProfile} from './dedicated-chrome-profile.js';

type Attachment=Awaited<ReturnType<typeof attachReviewedBrowserContext>>;
type ReferenceResult={references:BrowserRecord[];privateDisplays:Array<{object:'Account'|'Contact';id:string;display:string}>;proof:unknown};
export type LightningSessionInput=Omit<ContextAttachmentInput,'identity'|'records'>&{
  identity():Promise<ContextAttachmentInput['identity']>;verifyReferences():Promise<ReferenceResult>;view?:unknown;
};

// The trusted host owns context/Page/MCP handles. Agents receive capability
// methods and redacted evidence only, never arbitrary browser code or transport.
export class LightningSession{
  private nativeClient?:Client;
  private nativeServer?:Awaited<ReturnType<typeof createConnection>>;
  private page?:Page;
  private selected?:ReferenceResult['privateDisplays'][number];
  private queue:Promise<unknown>=Promise.resolve();
  private commands=0;
  private consoleCategories:Record<string,number>={};
  private closed=false;
  private lastView?:{status:string;object:'Account'|'Contact';measuredAt:string;nativeDocumentVerified:boolean};
  private timer:ReturnType<typeof setTimeout>;
  private constructor(private browser:Browser,private input:LightningSessionInput,private references:ReferenceResult,private attached:Attachment,private diagnostics:BrowserExecutionDiagnostics){
    this.timer=setTimeout(()=>{void this.close().catch(()=>{});},attached.boundary.budget.remaining());this.timer.unref();
    attached.context.on('page',page=>{page.on('console',message=>{if(message.type()!=='error')return;const text=message.text(),category=/blocked|ERR_BLOCKED/i.test(text)?'blocked':/network|fetch|connection|ERR_/i.test(text)?'network':/CSP|Content Security/i.test(text)?'csp':'other';this.consoleCategories[category]=Math.min(1000,(this.consoleCategories[category]??0)+1);});page.on('pageerror',()=>{this.consoleCategories['page-error']=Math.min(1000,(this.consoleCategories['page-error']??0)+1);});});
  }
  static async open(input:LightningSessionInput){
    const diagnostics=new BrowserExecutionDiagnostics(input.history,{runId:input.review.plan.runId,policyHash:browserPlanHash(input.review.plan),validation:input.verifyContext||input.nativeBuild||input.resourceFetch||input.prepareContext?'offline-mocked-salesforce':'live-attempt'});let browser:Browser|undefined;
    try{
      await withBrowserStage(diagnostics.observe,'engine',async()=>verifyLightningEngine(input.review.plan.engineProfileHash));
      const identity=await withBrowserStage(diagnostics.observe,'api-identity',input.identity),references=await withBrowserStage(diagnostics.observe,'references',input.verifyReferences),authority=await withBrowserStage(diagnostics.observe,'authorization',async()=>authorizeBrowserSession(input.review,input.parent,identity,input.review.plan));
      const source=await withBrowserStage(diagnostics.observe,'storage-state',async()=>{const source=await readPrivateSessionState(input.statePath);if(source.hash!==input.review.plan.sessionStateHash)throw Error('Approved state changed');validateDedicatedState(JSON.parse(await readFile(source.statePath,'utf8')),authority.policy);return source;});
      browser=await withBrowserStage(diagnostics.observe,'browser-launch',launchLocalBrowser);
      const context=await withBrowserStage(diagnostics.observe,'context-create',()=>browser!.newContext({storageState:source.statePath,serviceWorkers:'block',acceptDownloads:false}));diagnostics.attach(context);
      const attached=await withBrowserStage(diagnostics.observe,'context-initialization',()=>attachReviewedBrowserContext(context,{...input,onStage:diagnostics.observe,identity,records:references.references}));
      return new LightningSession(browser,input,references,attached,diagnostics);
    }catch(error){diagnostics.visual(input.review.plan.visualDebug?(diagnostics.snapshot().pageObserved?'refused':'unavailable'):'disabled');await browser?.close().catch(()=>{});diagnostics.persist();if(error instanceof DedicatedSessionError)throw error;const entry=browserErrorDiagnostic(error);if(entry)throw new BrowserStageError(entry);throw Error('Lightning session identity/build/approval/quota gate failed');}
  }
  private run<T>(action:()=>Promise<T>):Promise<T>{
    const result=this.queue.then(async()=>{if(this.closed)throw Error('Lightning session is closed');this.attached.boundary.budget.check();if(++this.commands>this.input.review.plan.budgets.requests)throw Error('Observation command budget exhausted');return action();});
    this.queue=result.catch(()=>{});return result;
  }
  private async mcp(name:'browser_navigate'|'browser_snapshot',url?:string){
    if(!this.nativeClient){
      await withBrowserStage(this.diagnostics.observe,'mcp-connect',async()=>{
      const outputDir=resolve('.state','lightning-native',this.attached.sessionId);await mkdir(outputDir,{recursive:true,mode:0o700});
      // SDK versions may differ; this single structural bridge is covered by
      // the actual installed Playwright-MCP integration test, not a mock tool.
      type McpContext=Awaited<ReturnType<NonNullable<Parameters<typeof createConnection>[1]>>>;
      // With a contextGetter, isolated:false means reuse its sole context.
      // That context was already created non-persistent/headless by this owner;
      // isolated:true would ask MCP to create a second, unguarded context.
      this.nativeServer=await createConnection({browser:{isolated:false,launchOptions:{headless:true}},capabilities:['core','core-navigation'],saveSession:false,webmcp:false,codegen:'none',ignoreRoots:true,allowUnrestrictedFileAccess:false,network:{allowedOrigins:[],blockedOrigins:[]},outputDir,outputMaxSize:1048576,snapshot:{mode:'none'},imageResponses:'omit',console:{level:'error'},timeouts:{navigation:Math.min(30000,this.attached.boundary.budget.remaining()),action:5000}},async()=>this.attached.context as unknown as McpContext);
      this.nativeClient=new Client({name:'sfqa-private-playwright-transport',version:'1.0.0'});
      const[a,b]=InMemoryTransport.createLinkedPair();await this.nativeServer.connect(a);await this.nativeClient.connect(b);
      });
    }
    await withBrowserStage(this.diagnostics.observe,'mcp-operation',async()=>{const result=await this.nativeClient!.callTool({name,arguments:name==='browser_navigate'?{url}:{}},undefined,{timeout:Math.min(30000,this.attached.boundary.budget.remaining())});
    if(result.isError){const text=JSON.stringify(result.content),reason=/is not a function|Cannot read properties/i.test(text)?'sdk-api-compatibility':/unknown tool|tool.*not found/i.test(text)?'native-tool-unavailable':/timeout/i.test(text)?'native-timeout':/browser.*not.*install|executable.*exist/i.test(text)?'native-browser-unavailable':'native-operation';throw Error(`Private Playwright MCP failed: ${reason}; raw output withheld`);}
    });
    // Do not return, log, index or forward the native snapshot/console text.
  }
  private currentRecordProven(){
    if(!this.page||!this.selected)return false;
    const reference=this.references.references.find(record=>record.object===this.selected!.object&&record.id===this.selected!.id);
    return!!reference&&browserDocument(this.input.review.plan,this.page.url(),[reference]);
  }
  private async debugProof(){await this.attached.finishDocumentProofs();return{nativeDocumentVerified:!!this.page&&this.attached.recordDocumentVerified(this.page),records:this.references.references,privateValues:this.references.privateDisplays.map(record=>record.display)};}
  private async capture(reason:DebugReason){if(!this.page){this.diagnostics.visual('unavailable');return{status:'no-page' as const};}const result=await this.attached.visual.capture(this.page,await this.debugProof(),reason);if(['captured','refused','unavailable','disabled','budget-exhausted'].includes(result.status))this.diagnostics.visual(result.status as 'captured'|'refused'|'unavailable'|'disabled'|'budget-exhausted');return result;}
  captureDebug(){return this.run(()=>this.capture('operator'));}
  // Bounded loading observation, useful when no real selector contract exists.
  // Classification is diagnostic only; it cannot create a rendering receipt.
  observeLoading(settleMs=0){return this.run(async()=>{
    if(!Number.isInteger(settleMs)||settleMs<0||settleMs>20000)throw Error('Bounded settling interval required');
    if(!this.page||!this.currentRecordProven())throw Error('Approved record navigation required');
    const times=this.input.review.plan.visualDebug?.milestonesMs??[],until=Math.min(Math.max(this.attached.boundary.budget.started+(times.at(-1)??0)+300,Date.now()+settleMs),Date.now()+Math.max(0,this.attached.boundary.budget.remaining()-this.attached.visual.reserveMs));
    if(until>Date.now())await delay(until-Date.now());return{visualEntries:this.attached.visual.entries.length,renderingEstablished:false};
  });}
  navigate(object:'Account'|'Contact',via:'playwright'|'mcp'='playwright'){
    return this.run(()=>withBrowserStage(this.diagnostics.observe,'navigation',async()=>{
      if(!['Account','Contact'].includes(object)||!['playwright','mcp'].includes(via))throw Error('Observation command denied');
      const record=this.references.privateDisplays.find(record=>record.object===object);if(!record)throw Error('Record is outside approved observation scope');
      const origin=this.input.review.plan.origins.find(origin=>new URL(origin).hostname.endsWith('.lightning.force.com'))!,url=`${origin}/lightning/r/${object}/${record.id}/view`;
      if(!browserDocument(this.input.review.plan,url,this.references.references))throw Error('Exact record document required');
      this.page??=await this.attached.context.newPage();this.selected=record;this.lastView=undefined;
      try{if(via==='mcp')await this.mcp('browser_navigate',url);else await this.page.goto(url,{waitUntil:'domcontentloaded',timeout:Math.max(1,Math.min(30000,this.attached.boundary.budget.remaining()-this.attached.visual.reserveMs))});}
      catch(error){await this.capture('loading-timeout');throw error;}
      await withBrowserStage(this.diagnostics.observe,'document-proof',()=>this.attached.finishDocumentProofs());
      this.attached.visual.watch(this.page,()=>this.debugProof());
      return{...this.status(),via,object,recordHash:digest(record.id),approvedDocument:this.currentRecordProven(),nativeDocumentVerified:this.attached.recordDocumentVerified(this.page)};
    }));
  }
  observe(via:'playwright'|'mcp'='playwright'){
    return this.run(()=>withBrowserStage(this.diagnostics.observe,'readiness',async()=>{
      if(!this.page||!this.selected||!this.currentRecordProven())throw Error('Approved record navigation required');
      const nativeDocumentVerified=this.attached.recordDocumentVerified(this.page);
      try{if(via==='mcp')await this.mcp('browser_snapshot');else if(via!=='playwright')throw Error('Observation transport denied');const result=await observeLightningView(this.page,{review:this.input.review,view:this.input.view,object:this.selected.object,name:this.selected.display,nativeDocumentVerified,budget:this.attached.boundary.budget,reserveMs:this.attached.visual.reserveMs});
        await this.capture(result.status==='rendered-reviewed-view'?'reviewed-view':result.status==='not-rendered'?'rendering-failure':'selector-missing');this.lastView={status:result.status,object:this.selected.object,measuredAt:new Date().toISOString(),nativeDocumentVerified};return result;
      }catch(error){await this.capture('rendering-failure');throw error;}
    }).then(result=>{if(result.status!=='rendered-reviewed-view')this.diagnostics.observe('readiness','failed','readiness-incomplete');return result;}));
  }
  discover(via:'playwright'|'mcp'='playwright'){
    return this.run(()=>withBrowserStage(this.diagnostics.observe,'discovery',async()=>{
      if(!this.page||!this.selected||!this.currentRecordProven()||!this.attached.recordDocumentVerified(this.page))throw Error('Native exact record document required for workflow discovery');
      if(via==='mcp')await this.mcp('browser_snapshot');else if(via!=='playwright')throw Error('Observation transport denied');
      const text=this.page.getByText(this.selected.display,{exact:true}),heading=this.page.getByRole('heading',{name:this.selected.display,exact:true}),textCount=await text.count(),headingCount=await heading.count();
      const candidates=[];
      if(headingCount===1&&await heading.isVisible())candidates.push({by:'role',value:'heading',name:'{{record-name}}'});
      if(textCount===1&&await text.isVisible())candidates.push({by:'text',value:'{{record-name}}'});
      const roles={headings:await this.page.getByRole('heading').count(),tabs:await this.page.getByRole('tab').count(),buttons:await this.page.getByRole('button').count(),progressbars:await this.page.getByRole('progressbar').count()};
      if(!candidates.length)await this.capture('selector-missing');
      const evidence={policyHash:browserPlanHash(this.input.review.plan),sourceVersion:this.input.review.plan.sourceVersion,recordHash:digest(this.selected.id),capturedAt:new Date().toISOString(),nameMatches:{text:textCount,heading:headingCount},roles,recordNameCandidates:candidates};
      return{...evidence,evidenceHash:fingerprint(evidence),reviewRequired:true,fullRenderingEstablished:false,workflowActionsInvented:0};
    }));
  }
  execute(workflow:unknown,step:number){
    return this.run(async()=>{
      const approved=WorkflowSchema.parse(workflow);if(!this.page||!this.selected||!browserDocument(this.input.review.plan,this.page.url(),this.references.references)||new URL(approved.path,approved.origin).href!==this.page.url())throw Error('Reviewed action must target the current exact owned record');
      try{return await this.attached.actions.execute(approved,step,async()=>{this.lastView=undefined;const item=approved.steps[step],locator=reviewedLocator(this.page!,item.locator,this.selected!.display);if(item.action==='click')await locator.click({timeout:Math.max(1,this.attached.boundary.budget.remaining()-this.attached.visual.reserveMs)});else await locator.fill(item.value!,{timeout:Math.max(1,this.attached.boundary.budget.remaining()-this.attached.visual.reserveMs)});return{status:'reviewed-step-executed',step};});}catch(error){await this.capture('test-failure');throw error;}
    });
  }
  status(){return{sessionId:this.attached.sessionId,policyHash:browserPlanHash(this.input.review.plan),validation:this.attached.validation,closed:this.closed,commands:this.commands,planes:{platform:this.input.dedicatedChromeProfile?'explicitly-approved-native-platform-risk':this.input.normalNetworkingReceipt?'explicit-normal-comparison':'existing-reviewed-network-policy',observation:'exact-record-read-only',interactions:'separate-owned-workflow-broker',mutations:'separate-factory-service-only'},nativeMcpConnected:!!this.nativeClient};}
  private closing?:Promise<unknown>;
  close():Promise<unknown>{
    return this.closing??=withBrowserStage(this.diagnostics.observe,'cleanup',async()=>{
      this.closed=true;clearTimeout(this.timer);const visual=await this.attached.visual.report(),metrics=await this.attached.boundary.finish();
      await this.nativeClient?.close().catch(()=>{});await this.nativeServer?.close().catch(()=>{});await this.browser.close();
      let referenceUnchanged:boolean|'unavailable'='unavailable';try{const after=await this.input.verifyReferences(),schema=z.object({referenceVersions:z.array(z.string().regex(/^[a-f0-9]{64}$/)).length(this.references.references.length).min(1)}),before=schema.safeParse(this.references.proof),next=schema.safeParse(after.proof);if(before.success&&next.success)referenceUnchanged=fingerprint(before.data.referenceVersions)===fingerprint(next.data.referenceVersions);}catch{/* Do not turn an unavailable independent check into a pass. */}
      this.input.history.db.prepare("UPDATE browser_execution_sessions SET status='observed' WHERE policy=? AND nonce=?").run(browserPlanHash(this.input.review.plan),this.attached.sessionId);
      let readinessProof:unknown={status:'not-established'};
      if(!this.input.normalNetworkingReceipt&&this.lastView?.status==='rendered-reviewed-view'&&referenceUnchanged===true&&!this.input.review.plan.ownedDataPlanHash)try{readinessProof=recordLightningReadiness(this.input.history,this.input.review,{...this.lastView,independentReferenceUnchanged:true,profileVerified:!!this.input.dedicatedChromeProfile,validation:this.attached.validation,visualEvidenceHash:visual.status==='local-debug-evidence'&&this.attached.visual.entries.some(e=>e.status==='captured'&&e.reason==='reviewed-view')?visual.manifestHash:undefined});}catch{/* Expired or incomplete evidence never becomes a proof. */}
      return{...this.status(),diagnostics:this.diagnostics.persist(),browserVersion:this.browser.version(),consoleCategories:this.consoleCategories,networkMode:this.input.dedicatedChromeProfile?'DEDICATED_QA_NORMAL_CHROME':this.input.normalNetworkingReceipt?'explicit-normal-comparison':'guarded',metrics,visual,referenceUnchanged,readinessProof,recordWrites:0,explicitFrameworkRecordWrites:0,nativeBackgroundEffects:this.input.dedicatedChromeProfile||this.input.normalNetworkingReceipt?'not-enumerated':'contract-restricted',generatedLiveTests:0,learningPublished:false};
    }).then(result=>({...result,diagnostics:this.diagnostics.persist()}));
  }
}

export async function openLiveLightningSession(input:{review:unknown;parent:unknown;history:History;statePath:string;view?:unknown;normalNetworkingReceipt?:unknown;dedicatedChromeProfile?:unknown}){
  const review=BrowserReviewSchema.parse(input.review),api=await SalesforceClient.connectReviewedBrowser(input.parent,review,input.history);
  const profile=input.dedicatedChromeProfile??await loadPreferredChromeProfile(review);
  return LightningSession.open({...input,dedicatedChromeProfile:profile,review,apiOrigin:api.apiOrigin,identity:()=>api.identity(),verifyReferences:()=>api.verifyReferences()});
}
