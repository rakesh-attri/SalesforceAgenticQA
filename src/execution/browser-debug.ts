import type {Page,TestInfo} from '@playwright/test';
import {mkdir,realpath,readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname} from 'node:path';
import {z} from 'zod';
import {BrowserReviewSchema,browserPlanHash,browserDocument,digest,type BrowserReview,type BrowserRecord} from './browser-policy.js';
import type {BrowserBudget} from './browser-resources.js';
import {resolveLocator} from '../core/locators.js';
import {setTimeout as delay} from 'node:timers/promises';
import {environmentSecrets} from '../ai/privacy.js';

export const DebugReasonSchema=z.enum(['loading-milestone','loading-timeout','rendering-failure','selector-missing','test-failure','reviewed-view','operator']);
export type DebugReason=z.infer<typeof DebugReasonSchema>;
const warning='Known sensitive elements are masked; complete masking cannot be guaranteed. Keep local and review before sharing. No automatic AI/upload use.';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
const File=z.string().regex(/^[a-f0-9-]{36}-[0-9]{2}\.png$/);
const DiagnosticsSchema=z.object({readyState:z.enum(['loading','interactive','complete','unknown']),visibleLoading:z.number().int().min(0).max(1000),visibleErrors:z.number().int().min(0).max(1000),errorCategories:z.array(z.enum(['access','record-unavailable','application','connectivity','unclassified-visible-alert'])).max(4),classification:z.enum(['loading','application-error','visible-record-name-unverified-content','incomplete-shell','blank','unresolved']),nameVisible:z.boolean(),elapsedMs:z.number().int().min(0)}).strict();
export const DebugEntrySchema=z.object({sequence:z.number().int().min(1).max(12),reason:DebugReasonSchema,status:z.enum(['captured','refused','unavailable','budget-exhausted']),category:z.enum(['none','page-scope','native-proof','authentication-ui','capture-or-mask-failed','time','count','bytes']),elapsedMs:z.number().int().min(0),file:File.optional(),sha256:Hash.optional(),bytes:z.number().int().min(0).optional(),diagnostics:DiagnosticsSchema.optional(),blocked:z.object({requests:z.number().int().min(0),denied:z.number().int().min(0),reasons:z.record(z.string().regex(/^[a-z0-9-]{1,80}$/),z.number().int().min(0))}).strict(),masking:z.literal('best-effort-known-elements'),warning:z.literal(warning)}).strict();
export const DebugManifestSchema=z.object({version:z.literal(1),runId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),sessionId:z.string().uuid(),policyHash:Hash,validation:z.enum(['live-salesforce','offline-mocked-salesforce']),entries:z.array(DebugEntrySchema).max(12),localOnly:z.literal(true),automaticallyUploaded:z.literal(false),warning:z.literal(warning)}).strict();
type DebugEntry=z.infer<typeof DebugEntrySchema>;
type Blocked=DebugEntry['blocked'];
export type DebugPageProof={nativeDocumentVerified:boolean;records:BrowserRecord[];privateValues:string[]};
const safeName=(value:string)=>/^[A-Za-z0-9_-]{1,64}$/.test(value);
function contained(root:string,target:string){const rel=relative(root,target);return!!rel&&!rel.startsWith('..')&&!isAbsolute(rel);}
async function debugRoot(runId:string){
  if(!safeName(runId))throw Error('Invalid debug run ID');
  const workspace=await realpath('.');let current=workspace;
  for(const part of ['artifacts','browser-debug',runId]){current=join(current,part);await mkdir(current,{recursive:true,mode:0o700});if((await lstat(current)).isSymbolicLink()||!contained(workspace,await realpath(current)))throw Error('Debug output escaped the workspace');}
  return current;
}
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function previewBrowserDebug(runId:string,sessionId?:string){
  if(sessionId&&!z.string().uuid().safeParse(sessionId).success)throw Error('Invalid debug session ID');
  const root=await debugRoot(runId),{readdir}=await import('node:fs/promises');
  const names=(await readdir(root)).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)&&(!sessionId||name===`${sessionId}.json`)).slice(0,20).sort();
  const manifests=[];
  for(const name of names){const path=join(root,name);if((await lstat(path)).isSymbolicLink()||(await lstat(path)).size>131072)throw Error('Debug manifest path/size denied');const manifest=DebugManifestSchema.parse(JSON.parse(await readFile(path,'utf8')));if(manifest.runId!==runId||name!==`${manifest.sessionId}.json`)throw Error('Debug manifest binding differs');for(const entry of manifest.entries)if(entry.file){const image=join(root,entry.file);if((await lstat(image)).isSymbolicLink()||!contained(root,await realpath(image))||(await lstat(image)).size>16777216||digest(await readFile(image))!==entry.sha256)throw Error('Debug screenshot integrity failed');}manifests.push(manifest);}
  if(!manifests.length)throw Error('No local debug manifests for this run');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>SFQA local visual diagnostics</title><style>body{font:16px system-ui;max-width:1200px;margin:24px auto;background:#eee;color:#111}article{background:white;padding:16px;margin:16px 0}img{max-width:100%;border:1px solid #777}pre{white-space:pre-wrap}strong{color:#852000}</style></head><body><h1>Local browser debugging: ${escapeHtml(runId)}</h1><strong>${warning}</strong><p>Diagnostic images do not prove a rendered record, test pass, unchanged data or verified learning.</p>${manifests.map(m=>`<h2>${escapeHtml(m.sessionId)} · ${m.validation}</h2>${m.entries.map(e=>`<article><h3>${e.sequence}: ${e.reason} · ${e.status}</h3><pre>${escapeHtml(JSON.stringify(e,null,2))}</pre>${e.file?`<img loading="lazy" src="${e.file}" alt="Masked ${e.reason} screenshot">`:''}</article>`).join('')}`).join('')}</body></html>`;
  const index=join(root,'index.html');if(await lstat(index).then(s=>s.isSymbolicLink()).catch(()=>false))throw Error('Debug preview symlink denied');await writeFile(index,html,{mode:0o600});return{preview:index,manifests:manifests.length,screenshots:manifests.reduce((n,m)=>n+m.entries.filter(e=>e.status==='captured').length,0),warning,automaticallyUploaded:false};
}

// Trusted host supplies private name bindings and native-document proof. Neither
// MCP nor a model can supply a Page, arbitrary URL, mask selector or output path.
export class BrowserVisualDebug{
  readonly entries:DebugEntry[]=[];private bytes=0;private attempts=0;private queue:Promise<unknown>=Promise.resolve();private root?:string;
  private watched=new WeakSet<Page>();private stopWatch=new AbortController();
  constructor(private review:BrowserReview,private budget:BrowserBudget,readonly sessionId:string,private validation:'live-salesforce'|'offline-mocked-salesforce',private summary:()=>Blocked){this.review=BrowserReviewSchema.parse(review);if(this.review.approval.operator==='REVIEW_REQUIRED'||this.review.approval.hash!==browserPlanHash(this.review.plan)||browserPlanHash(budget.review.plan)!==this.review.approval.hash||budget.review.approval.expiresAt!==this.review.approval.expiresAt)throw Error('Exact named screenshot policy required');z.string().uuid().parse(sessionId);}
  get enabled(){return!!this.review.plan.visualDebug;}
  get reserveMs(){return this.review.plan.visualDebug?Math.min(3500,this.review.plan.visualDebug.maxCaptureMs+200):0;}
  private async persist(){this.root??=await debugRoot(this.review.plan.runId);const manifest=DebugManifestSchema.parse({version:1,runId:this.review.plan.runId,sessionId:this.sessionId,policyHash:browserPlanHash(this.review.plan),validation:this.validation,entries:this.entries,localOnly:true,automaticallyUploaded:false,warning}),path=join(this.root,`${this.sessionId}.json`);if(await lstat(path).then(s=>s.isSymbolicLink()).catch(()=>false))throw Error('Debug manifest symlink denied');await writeFile(path,JSON.stringify(manifest,null,2),{mode:0o600});return manifest;}
  capture(page:Page,proof:DebugPageProof,reason:DebugReason){
    const operation=this.queue.then(()=>this.perform(page,proof,DebugReasonSchema.parse(reason)));this.queue=operation.catch(()=>{});return operation;
  }
  watch(page:Page,proof:()=>Promise<DebugPageProof>){
    if(!this.enabled||this.watched.has(page))return;this.watched.add(page);
    // Milestones share the session clock and leave two slots for a terminal
    // failure/success and an operator capture. No new request or action occurs.
    void(async()=>{try{for(const at of this.review.plan.visualDebug!.milestonesMs){
      const wait=at-(Date.now()-this.budget.started);if(wait>0)await delay(Math.min(wait,this.budget.remaining()),undefined,{signal:this.stopWatch.signal});
      if(this.stopWatch.signal.aborted||this.budget.remaining()<this.reserveMs||this.attempts>=Math.max(0,this.review.plan.visualDebug!.maxCaptures-2))break;
      await this.capture(page,await proof(),'loading-milestone');
    }}catch{/* Closing/expiry cancels pending milestones, never extends observation. */}})();
  }
  private async perform(page:Page,proof:DebugPageProof,reason:DebugReason){
    const config=this.review.plan.visualDebug;if(!config)return{status:'disabled' as const};
    if(this.attempts>=config.maxCaptures)return{status:'budget-exhausted' as const,category:'count' as const};
    const started=Date.now(),sequence=++this.attempts,base={sequence,reason,elapsedMs:Math.max(0,Date.now()-this.budget.started),blocked:this.summary(),masking:'best-effort-known-elements' as const,warning};
    const finish=async(extra:Partial<DebugEntry>)=>{const entry=DebugEntrySchema.parse({...base,status:'unavailable',category:'capture-or-mask-failed',...extra});this.entries.push(entry);await this.persist();return entry;};
    if(!browserDocument(this.review.plan,page.url(),proof.records))return finish({status:'refused',category:'page-scope'});
    if(!proof.nativeDocumentVerified)return finish({status:'refused',category:'native-proof'});
    if(this.budget.remaining()<200)return finish({status:'budget-exhausted',category:'time'});
    try{
      this.budget.check();
      // Login/MFA/consent screens can occur inside a valid document. Refuse
      // instead of relying on input masking to protect authentication material.
      if(await page.locator('input[type="password"],input[autocomplete="one-time-code"],input[name="otp"],form[action*="/login"],form[action*="/secur/"]').count())return finish({status:'refused',category:'authentication-ui'});
      const read=await page.evaluate(()=>{
        let loading=0,hasVisibleContent=false;const errors:Element[]=[];
        for(const e of Array.from(document.querySelectorAll('[role="progressbar"],[aria-busy="true"],.slds-spinner,[role="alert"],.slds-notify_alert,.forcePageError')).slice(0,1000)){const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width<=0||r.height<=0||s.display==='none'||s.visibility==='hidden')continue;if(e.matches('[role="progressbar"],[aria-busy="true"],.slds-spinner'))loading++;if(e.matches('[role="alert"],.slds-notify_alert,.forcePageError'))errors.push(e);}
        for(const e of Array.from(document.body?.children??[]).slice(0,1000)){const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(e.tagName!=='SCRIPT'&&e.tagName!=='STYLE'&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&(e.textContent??'').trim().length>0){hasVisibleContent=true;break;}}
        const text=errors.map(e=>(e.textContent??'').slice(0,500)).join(' ').slice(0,4000),categories:Array<'access'|'record-unavailable'|'application'|'connectivity'|'unclassified-visible-alert'>=[];
        const bodyText=(document.body?.innerText??'').slice(0,10000);
        if(/access|permission|privilege|insufficient/i.test(text))categories.push('access');if(/deleted|not found|unavailable|does not exist/i.test(text))categories.push('record-unavailable');if(/\b(?:errors?|failed|problem|exception)\b/i.test(text))categories.push('application');
        if(/check your (?:internet|network) connection and try again/i.test(bodyText)&&Array.from(document.querySelectorAll('button,[role="button"]')).some(e=>/try again/i.test(e.textContent??'')))categories.push('connectivity');
        if(errors.length&&!categories.length)categories.push('unclassified-visible-alert');
        return{readyState:document.readyState,visibleLoading:loading,visibleErrors:errors.length,errorCategories:categories,hasVisibleContent};
      });
      let nameVisible=false;for(const value of proof.privateValues.filter(Boolean).slice(0,10)){const matches=page.getByText(value,{exact:true});if(await matches.count()===1&&await matches.isVisible())nameVisible=true;}
      const {hasVisibleContent,...readiness}=read;
      const diagnostics=DiagnosticsSchema.parse({...readiness,nameVisible,elapsedMs:base.elapsedMs,classification:read.visibleErrors||read.errorCategories.includes('connectivity')?'application-error':read.visibleLoading?'loading':nameVisible?'visible-record-name-unverified-content':hasVisibleContent?'incomplete-shell':'blank'});
      const privateCredentials=[...environmentSecrets(),...(await page.context().cookies()).filter(c=>/sid|token|session|auth|jwt|assertion|client|consumer|key/i.test(c.name)).map(c=>c.value)].filter(v=>v.length>=6);
      if(privateCredentials.length>100)return finish({status:'refused',category:'authentication-ui'});
      const mask=[page.locator('input,textarea,[contenteditable],iframe,canvas,video,img,[role="alert"],.slds-notify_alert,.forcePageError,[data-sfqa-sensitive],[data-field],lightning-formatted-text,lightning-formatted-name,lightning-formatted-email,lightning-formatted-phone,.slds-form-element__static,.uiOutputText,.forceOutputLookup,.slds-avatar'),page.getByText(/Bearer\s+\S{8,}|-----BEGIN|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\bAIza[A-Za-z0-9_-]{20,}|\b(?:00D|005|001|003)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:session|token|assertion|password|consumer.?key)\s*[:=]\s*\S+|https?:\/\/\S*(?:\/secur\/|\/login|\/oauth|sid=|access_token=)/i),...privateCredentials.map(value=>page.getByText(value,{exact:false})),...proof.privateValues.filter(Boolean).slice(0,10).map(value=>page.getByText(value,{exact:true})),...config.maskLocators.map(l=>resolveLocator(page,l))];
      const timeout=Math.min(config.maxCaptureMs-(Date.now()-started),this.budget.remaining()-50);if(timeout<100)return finish({status:'budget-exhausted',category:'time',diagnostics});
      // No animation fast-forward: it can fire transitionend handlers. Viewport
      // only, no scroll/full-page expansion, no font-wait override or mutation.
      const buffer=await page.screenshot({type:'png',fullPage:false,timeout,mask,maskColor:'#000000',caret:'hide',animations:'allow',scale:'css'});
      this.budget.check();if(!browserDocument(this.review.plan,page.url(),proof.records))return finish({status:'refused',category:'page-scope'});
      if(this.bytes+buffer.length>config.maxTotalBytes)return finish({status:'budget-exhausted',category:'bytes',diagnostics});
      this.root??=await debugRoot(this.review.plan.runId);const file=`${this.sessionId}-${String(sequence).padStart(2,'0')}.png`;await writeFile(join(this.root,file),buffer,{flag:'wx',mode:0o600});this.bytes+=buffer.length;
      return finish({status:'captured',category:'none',file,sha256:digest(buffer),bytes:buffer.length,diagnostics});
    }catch{return finish({status:'unavailable',category:'capture-or-mask-failed'});}
  }
  async report(){this.stopWatch.abort();await this.queue;if(!this.enabled)return{status:'disabled' as const};const manifest=await this.persist();return{status:'local-debug-evidence' as const,manifest:relative(resolve('.'),join(this.root!,`${this.sessionId}.json`)).replaceAll('\\','/'),manifestHash:digest(JSON.stringify(manifest)),captures:this.entries.filter(e=>e.status==='captured').length,warning,automaticallyUploaded:false};}
}

export async function attachBrowserDebug(info:Pick<TestInfo,'attach'>,entry:Awaited<ReturnType<BrowserVisualDebug['capture']>>,runId:string){
  if(!('file'in entry)||!entry.file||entry.status!=='captured')return;
  DebugEntrySchema.parse(entry);
  const root=await debugRoot(runId),path=join(root,entry.file);if((await lstat(path)).isSymbolicLink()||digest(await readFile(path))!==entry.sha256)throw Error('Debug attachment integrity failed');
  await info.attach('sfqa-masked-browser-debug',{path,contentType:'image/png'});
}

// Synthetic loopback applications cannot mint native Salesforce proof. Reuse
// the existing masked manifest/store/preview format with fixed offline labeling.
export async function captureFixtureApplicationDebug(page:Page,input:{runId:string;sessionId:string;policyHash:string;sequence:number;remainingMs:number;remainingBytes:number;entries:unknown[]}){
 const url=new URL(page.url());if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||input.sequence>4||input.remainingMs<100||input.remainingBytes<1)throw Error('Bounded synthetic loopback capture required');
 const credentials=[...environmentSecrets(),...(await page.context().cookies()).filter(c=>/sid|token|session|auth/i.test(c.name)).map(c=>c.value)].filter(s=>s.length>=6);if(credentials.length>100)throw Error('Fixture masking budget exceeded');
 const mask=[page.locator('input,textarea,[contenteditable],iframe,canvas,video,img,[data-sfqa-sensitive],[data-private]'),page.getByText(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|Bearer\s+\S+|-----BEGIN|(?:token|password|secret)\s*[:=]\s*\S+/i),...credentials.map(value=>page.getByText(value,{exact:false}))],buffer=await page.screenshot({type:'png',fullPage:false,timeout:Math.min(1500,input.remainingMs),mask,maskColor:'#000000',caret:'hide',animations:'allow',scale:'css'});
 if(buffer.length>input.remainingBytes)throw Error('Fixture screenshot byte budget exceeded');
 const root=await debugRoot(input.runId),file=`${input.sessionId}-${String(input.sequence).padStart(2,'0')}.png`,entry=DebugEntrySchema.parse({sequence:input.sequence,reason:'operator',status:'captured',category:'none',elapsedMs:0,file,sha256:digest(buffer),bytes:buffer.length,blocked:{requests:0,denied:0,reasons:{}},masking:'best-effort-known-elements',warning});
 await writeFile(join(root,file),buffer,{flag:'wx',mode:0o600});const manifest=DebugManifestSchema.parse({version:1,runId:input.runId,sessionId:input.sessionId,policyHash:input.policyHash,validation:'offline-mocked-salesforce',entries:[...input.entries,entry],localOnly:true,automaticallyUploaded:false,warning});await writeFile(join(root,`${input.sessionId}.json`),JSON.stringify(manifest,null,2),{mode:0o600});
 return{entry,manifest:relative(resolve('.'),join(root,`${input.sessionId}.json`)).replaceAll('\\','/'),localOnly:true};
}
