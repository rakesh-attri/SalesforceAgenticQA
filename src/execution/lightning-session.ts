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
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {recordLightningReadiness} from './lightning-proof.js';

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
  private documentProof=new WeakMap<Page,boolean>();
  private pending=new Set<Promise<void>>();
  private queue:Promise<unknown>=Promise.resolve();
  private commands=0;
  private closed=false;
  private lastView?:{status:string;object:'Account'|'Contact';measuredAt:string;nativeDocumentVerified:boolean};
  private timer:ReturnType<typeof setTimeout>;
  private constructor(private browser:Browser,private input:LightningSessionInput,private references:ReferenceResult,private attached:Attachment){
    this.timer=setTimeout(()=>{void this.close().catch(()=>{});},attached.boundary.budget.remaining());this.timer.unref();
    attached.context.on('response',response=>{
      const work=(async()=>{
        const request=response.request();if(request.resourceType()!=='document'||!browserDocument(input.review.plan,response.url(),references.references))return;
        const page=request.frame().page();this.documentProof.set(page,false);
        if(response.status()!==200)return;
        const actual=parseBrowserBuild(await response.text());
        this.documentProof.set(page,sameSalesforceIdentity(actual.orgId,input.review.plan.orgId)&&sameSalesforceIdentity(actual.userId,input.review.plan.userId)&&actual.buildHash===input.review.plan.buildHash&&actual.appHash===input.review.plan.appHash);
      })().catch(()=>{});this.pending.add(work);void work.finally(()=>this.pending.delete(work));
    });
  }
  static async open(input:LightningSessionInput){
    verifyLightningEngine(input.review.plan.engineProfileHash);
    const identity=await input.identity(),references=await input.verifyReferences();authorizeBrowserSession(input.review,input.parent,identity,input.review.plan);
    const source=await readPrivateSessionState(input.statePath);if(source.hash!==input.review.plan.sessionStateHash)throw Error('Approved state changed');
    const browser=await chromium.launch({headless:true});
    try{
      const context=await browser.newContext({storageState:source.statePath,serviceWorkers:'block',acceptDownloads:false});
      const attached=await attachReviewedBrowserContext(context,{...input,identity,records:references.references});
      return new LightningSession(browser,input,references,attached);
    }catch{await browser.close();throw Error('Lightning session identity/build/approval/quota gate failed');}
  }
  private run<T>(action:()=>Promise<T>):Promise<T>{
    const result=this.queue.then(async()=>{if(this.closed)throw Error('Lightning session is closed');this.attached.boundary.budget.check();if(++this.commands>this.input.review.plan.budgets.requests)throw Error('Observation command budget exhausted');return action();});
    this.queue=result.catch(()=>{});return result;
  }
  private async mcp(name:'browser_navigate'|'browser_snapshot',url?:string){
    if(!this.nativeClient){
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
    }
    const result=await this.nativeClient.callTool({name,arguments:name==='browser_navigate'?{url}:{}},undefined,{timeout:Math.min(30000,this.attached.boundary.budget.remaining())});
    if(result.isError){const text=JSON.stringify(result.content),reason=/is not a function|Cannot read properties/i.test(text)?'sdk-api-compatibility':/unknown tool|tool.*not found/i.test(text)?'native-tool-unavailable':/timeout/i.test(text)?'native-timeout':/browser.*not.*install|executable.*exist/i.test(text)?'native-browser-unavailable':'native-operation';throw Error(`Private Playwright MCP failed: ${reason}; raw output withheld`);}
    // Do not return, log, index or forward the native snapshot/console text.
  }
  private currentRecordProven(){
    if(!this.page||!this.selected)return false;
    const reference=this.references.references.find(record=>record.object===this.selected!.object&&record.id===this.selected!.id);
    return!!reference&&browserDocument(this.input.review.plan,this.page.url(),[reference]);
  }
  navigate(object:'Account'|'Contact',via:'playwright'|'mcp'='playwright'){
    return this.run(async()=>{
      if(!['Account','Contact'].includes(object)||!['playwright','mcp'].includes(via))throw Error('Observation command denied');
      const record=this.references.privateDisplays.find(record=>record.object===object);if(!record)throw Error('Record is outside approved observation scope');
      const origin=this.input.review.plan.origins.find(origin=>new URL(origin).hostname.endsWith('.lightning.force.com'))!,url=`${origin}/lightning/r/${object}/${record.id}/view`;
      if(!browserDocument(this.input.review.plan,url,this.references.references))throw Error('Exact record document required');
      this.page??=await this.attached.context.newPage();this.documentProof.set(this.page,false);this.selected=record;this.lastView=undefined;
      if(via==='mcp')await this.mcp('browser_navigate',url);else await this.page.goto(url,{waitUntil:'domcontentloaded',timeout:Math.min(30000,this.attached.boundary.budget.remaining())});
      await Promise.allSettled([...this.pending]);
      return{...this.status(),via,object,recordHash:digest(record.id),approvedDocument:this.currentRecordProven(),nativeDocumentVerified:this.documentProof.get(this.page)===true};
    });
  }
  observe(via:'playwright'|'mcp'='playwright'){
    return this.run(async()=>{
      if(!this.page||!this.selected||!this.currentRecordProven())throw Error('Approved record navigation required');
      if(via==='mcp')await this.mcp('browser_snapshot');else if(via!=='playwright')throw Error('Observation transport denied');
      const nativeDocumentVerified=this.documentProof.get(this.page)===true,result=await observeLightningView(this.page,{review:this.input.review,view:this.input.view,object:this.selected.object,name:this.selected.display,nativeDocumentVerified,budget:this.attached.boundary.budget});
      this.lastView={status:result.status,object:this.selected.object,measuredAt:new Date().toISOString(),nativeDocumentVerified};return result;
    });
  }
  discover(via:'playwright'|'mcp'='playwright'){
    return this.run(async()=>{
      if(!this.page||!this.selected||!this.currentRecordProven()||this.documentProof.get(this.page)!==true)throw Error('Native exact record document required for workflow discovery');
      if(via==='mcp')await this.mcp('browser_snapshot');else if(via!=='playwright')throw Error('Observation transport denied');
      const text=this.page.getByText(this.selected.display,{exact:true}),heading=this.page.getByRole('heading',{name:this.selected.display,exact:true}),textCount=await text.count(),headingCount=await heading.count();
      const candidates=[];
      if(headingCount===1&&await heading.isVisible())candidates.push({by:'role',value:'heading',name:'{{record-name}}'});
      if(textCount===1&&await text.isVisible())candidates.push({by:'text',value:'{{record-name}}'});
      const roles={headings:await this.page.getByRole('heading').count(),tabs:await this.page.getByRole('tab').count(),buttons:await this.page.getByRole('button').count(),progressbars:await this.page.getByRole('progressbar').count()};
      const evidence={policyHash:browserPlanHash(this.input.review.plan),sourceVersion:this.input.review.plan.sourceVersion,recordHash:digest(this.selected.id),capturedAt:new Date().toISOString(),nameMatches:{text:textCount,heading:headingCount},roles,recordNameCandidates:candidates};
      return{...evidence,evidenceHash:fingerprint(evidence),reviewRequired:true,fullRenderingEstablished:false,workflowActionsInvented:0};
    });
  }
  execute(workflow:unknown,step:number){
    return this.run(async()=>{
      const approved=WorkflowSchema.parse(workflow);if(!this.page||!this.selected||!browserDocument(this.input.review.plan,this.page.url(),this.references.references)||new URL(approved.path,approved.origin).href!==this.page.url())throw Error('Reviewed action must target the current exact owned record');
      return this.attached.actions.execute(approved,step,async()=>{this.lastView=undefined;const item=approved.steps[step],locator=reviewedLocator(this.page!,item.locator,this.selected!.display);if(item.action==='click')await locator.click({timeout:this.attached.boundary.budget.remaining()});else await locator.fill(item.value!,{timeout:this.attached.boundary.budget.remaining()});return{status:'reviewed-step-executed',step};});
    });
  }
  status(){return{sessionId:this.attached.sessionId,policyHash:browserPlanHash(this.input.review.plan),validation:this.attached.validation,closed:this.closed,commands:this.commands,planes:{platform:'existing-reviewed-network-policy',observation:'exact-record-read-only',interactions:'separate-owned-workflow-broker',mutations:'separate-factory-service-only'},nativeMcpConnected:!!this.nativeClient};}
  private closing?:Promise<unknown>;
  close():Promise<unknown>{
    return this.closing??=(async()=>{
      this.closed=true;clearTimeout(this.timer);const metrics=await this.attached.boundary.finish();
      await this.nativeClient?.close().catch(()=>{});await this.nativeServer?.close().catch(()=>{});await this.browser.close();
      let referenceUnchanged:boolean|'unavailable'='unavailable';try{const after=await this.input.verifyReferences(),schema=z.object({referenceVersions:z.array(z.string().regex(/^[a-f0-9]{64}$/)).length(this.references.references.length).min(1)}),before=schema.safeParse(this.references.proof),next=schema.safeParse(after.proof);if(before.success&&next.success)referenceUnchanged=fingerprint(before.data.referenceVersions)===fingerprint(next.data.referenceVersions);}catch{/* Do not turn an unavailable independent check into a pass. */}
      this.input.history.db.prepare("UPDATE browser_execution_sessions SET status='observed' WHERE policy=? AND nonce=?").run(browserPlanHash(this.input.review.plan),this.attached.sessionId);
      let readinessProof:unknown={status:'not-established'};
      if(this.lastView?.status==='rendered-reviewed-view'&&referenceUnchanged===true&&!this.input.review.plan.ownedDataPlanHash)try{readinessProof=recordLightningReadiness(this.input.history,this.input.review,{...this.lastView,independentReferenceUnchanged:true,validation:this.attached.validation});}catch{/* Expired or incomplete evidence never becomes a proof. */}
      return{...this.status(),metrics,referenceUnchanged,readinessProof,recordWrites:0,generatedLiveTests:0,learningPublished:false};
    })();
  }
}

export async function openLiveLightningSession(input:{review:unknown;parent:unknown;history:History;statePath:string;view?:unknown}){
  const review=BrowserReviewSchema.parse(input.review),api=await SalesforceClient.connectReviewedBrowser(input.parent,review,input.history);
  return LightningSession.open({...input,review,apiOrigin:api.apiOrigin,identity:()=>api.identity(),verifyReferences:()=>api.verifyReferences()});
}
