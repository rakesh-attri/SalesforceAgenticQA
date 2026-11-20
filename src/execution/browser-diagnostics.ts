import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {BrowserContext} from '@playwright/test';
import type {History} from '../core/history.js';

export const BrowserStageSchema=z.enum(['engine','api-identity','actor-access','app-selection','references','authorization','storage-state','browser-launch','context-create','context-identity','context-initialization','browser-build','session-budget','network-boundary','navigation','document-proof','mcp-connect','mcp-operation','readiness','discovery','cleanup']);
export const BrowserFailureCodeSchema=z.enum(['unknown','timeout','closed','engine-mismatch','state-binding','state-origin','private-state','session-cookie','identity-http','identity-redirect','identity-mismatch','state-changed','verification-unavailable','receipt','context-state-mismatch','build-or-scope-mismatch','build-http','build-source','actor-access','actor-response','actor-read-unavailable','app-context','app-response','app-read-unavailable','api-http','budget','mcp-compatibility','mcp-unavailable','mcp-operation','readiness-incomplete']);
export const NativeSoapFaultCodeSchema=z.enum(['INVALID_SESSION_ID','API_DISABLED_FOR_ORG','API_CURRENTLY_DISABLED','INSUFFICIENT_ACCESS','INVALID_SOAP_HEADER','INVALID_VERSION','INVALID_CLIENT','INVALID_OPERATION_WITH_EXPIRED_PASSWORD']);
export const NativeSoapFaultSchema=z.object({classification:z.enum(['recognized','other-fault','not-soap','rejected-input','unavailable']),code:NativeSoapFaultCodeSchema.optional(),sessionHint:z.enum(['api-use-not-permitted','expired-or-invalid']).optional()}).strict().superRefine((value,ctx)=>{if((value.classification==='recognized')!==!!value.code||value.sessionHint&&value.code!=='INVALID_SESSION_ID')ctx.addIssue({code:'custom',message:'Closed SOAP fault classification required'});});
export type NativeSoapFault=z.infer<typeof NativeSoapFaultSchema>;
export const NativeIdentityProofSchema=z.object({operation:z.enum(['oauth-userinfo','soap-get-user-info','lightning-home-html']),sessionOrigin:z.enum(['api','lightning']),httpStatus:z.number().int().min(100).max(599).optional(),soapFault:NativeSoapFaultSchema.optional()}).strict().superRefine((value,ctx)=>{if(value.soapFault&&(value.operation!=='soap-get-user-info'||!value.httpStatus||value.httpStatus<400))ctx.addIssue({code:'custom',message:'SOAP fault evidence requires a failed SOAP response'});});
export type NativeIdentityProof=z.infer<typeof NativeIdentityProofSchema>;
export const BrowserStageEntrySchema=z.object({stage:BrowserStageSchema,status:z.enum(['started','passed','failed']),code:BrowserFailureCodeSchema.optional(),nativeProof:NativeIdentityProofSchema.optional(),elapsedMs:z.number().int().min(0),totalMs:z.number().int().min(0)}).strict();
export type BrowserStage=z.infer<typeof BrowserStageSchema>;
type StageEntry=z.infer<typeof BrowserStageEntrySchema>;
export type BrowserStageObserver=(stage:BrowserStage,status:StageEntry['status'],code?:z.infer<typeof BrowserFailureCodeSchema>,nativeProof?:NativeIdentityProof)=>StageEntry|undefined;
const failures=new WeakMap<object,StageEntry>();
export function browserErrorDiagnostic(error:unknown){return error&&typeof error==='object'?failures.get(error):undefined;}
export function preserveBrowserDiagnostic(source:unknown,target:object){const entry=browserErrorDiagnostic(source);if(entry&&!failures.has(target))failures.set(target,BrowserStageEntrySchema.parse(entry));return target;}
export function browserFailureCode(error:unknown):z.infer<typeof BrowserFailureCodeSchema>{
 const recorded=browserErrorDiagnostic(error);if(recorded?.code)return recorded.code;
 if(error instanceof Error){const dedicated=error.name==='DedicatedSessionError'?BrowserFailureCodeSchema.safeParse((error as Error&{code?:unknown}).code):undefined;if(dedicated?.success)return dedicated.data;
  if(['TimeoutError','AbortError'].includes(error.name))return 'timeout';
  if(/^Salesforce API GET failed: [1-5][0-9]{2}$/.test(error.message))return 'api-http';
  const gateReasons:Record<string,z.infer<typeof BrowserFailureCodeSchema>>={
   'Browser actor metadata unavailable; provider details withheld':'actor-read-unavailable',
   'Browser actor response is unsupported; provider details withheld':'actor-response',
   'Browser approved actor is inactive or changed':'actor-access',
   'Browser selected-app metadata unavailable; provider details withheld':'app-read-unavailable',
   'Browser selected app changed':'app-context',
   'Selected-app metadata shape is unsupported; response withheld':'app-response',
   'Native Lightning build proof unavailable':'build-http',
   'Native Lightning build is missing or ambiguous; content withheld':'build-source',
   'Unsupported or ambiguous Lightning identity source; content withheld':'build-source',
   'Unsupported Lightning identity document; content withheld':'build-source',
   'Native build actor mismatch':'build-or-scope-mismatch',
   'Dedicated browser org/user/persona/build/origin mismatch':'build-or-scope-mismatch',
   'Reviewed state changed':'state-binding',
  };if(Object.hasOwn(gateReasons,error.message))return gateReasons[error.message];
  const exact:Record<string,z.infer<typeof BrowserFailureCodeSchema>>={'Reviewed compatible Playwright/MCP engine profile required':'engine-mismatch','Approved state changed':'state-binding','Browser state differs from the approved execution source':'state-binding','Actual browser context differs from the proven approved session':'context-state-mismatch','Native browser build identity mismatch':'build-or-scope-mismatch','Browser duration or authorization expired':'budget','Reviewed browser session budget exhausted':'budget','Browser request budget exceeded':'budget','Browser resource-byte budget exceeded':'budget','Browser agent-action budget exceeded':'budget','Lightning session is closed':'closed','Private Playwright MCP failed: sdk-api-compatibility; raw output withheld':'mcp-compatibility','Private Playwright MCP failed: native-tool-unavailable; raw output withheld':'mcp-unavailable','Private Playwright MCP failed: native-timeout; raw output withheld':'timeout','Private Playwright MCP failed: native-operation; raw output withheld':'mcp-operation'};return Object.hasOwn(exact,error.message)?exact[error.message]:'unknown';
 }return 'unknown';
}
export function browserFailureSummary(error:unknown,fallback?:BrowserStage){
 const reason=browserFailureCode(error),stage=browserErrorDiagnostic(error)?.stage??fallback;
 const category=['timeout','closed','api-http'].includes(reason)?'transport':reason==='budget'?'budget':reason.startsWith('actor')||reason.startsWith('app')?'actor-or-app':reason.startsWith('build')||reason==='engine-mismatch'?'build-or-engine':reason==='unknown'?'unknown':'session-or-scope';
 return{...(stage?{stage}:{}),reason,category};
}
export class BrowserStageError extends Error{constructor(readonly diagnostic:StageEntry){super('Browser observation blocked; sanitized stage evidence retained.');this.name='BrowserStageError';BrowserStageEntrySchema.parse(diagnostic);failures.set(this,diagnostic);}}
export async function withBrowserStage<T>(observer:BrowserStageObserver|undefined,stage:BrowserStage,operation:()=>Promise<T>,nativeProof?:()=>NativeIdentityProof|undefined):Promise<T>{
 const proof=()=>{try{const parsed=NativeIdentityProofSchema.safeParse(nativeProof?.());return parsed.success?parsed.data:undefined;}catch{return undefined;}};
 const started=Date.now();observer?.(stage,'started',undefined,proof());try{const result=await operation();observer?.(stage,'passed',undefined,proof());return result;}catch(error){const elapsedMs=Math.max(0,Date.now()-started),detail=proof(),observed=observer?.(stage,'failed',browserFailureCode(error),detail),entry={...(observed??{stage,status:'failed' as const,code:browserFailureCode(error),elapsedMs,totalMs:elapsedMs}),...(detail?{nativeProof:detail}:{})};if(error&&typeof error==='object'&&!failures.has(error))failures.set(error,BrowserStageEntrySchema.parse(entry));throw error;}
}
const Counts=z.partialRecord(z.enum(['document','script','stylesheet','image','font','xhr','fetch','other']),z.number().int().min(0));
export const BrowserExecutionDiagnosticSchema=z.object({version:z.literal(1),id:z.string().uuid(),runId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),policyHash:z.string().regex(/^[a-f0-9]{64}$/),validation:z.enum(['live-attempt','offline-mocked-salesforce']),events:z.array(BrowserStageEntrySchema).max(96),truncated:z.boolean(),pageAvailable:z.boolean(),pageObserved:z.boolean(),screenshot:z.enum(['not-requested','captured','refused','unavailable','disabled','budget-exhausted']),requests:Counts,responses:z.partialRecord(z.enum(['success','redirect','client-error','server-error','other']),z.number().int().min(0)),requestFailures:z.number().int().min(0),console:z.partialRecord(z.enum(['blocked','network','csp','other','page-error']),z.number().int().min(0)),rawValuesRetained:z.literal(false)}).strict();
export class BrowserExecutionDiagnostics{
 readonly id=randomUUID();private started=Date.now();private starts=new Map<BrowserStage,number>();private events:StageEntry[]=[];private truncated=false;private context?:BrowserContext;private pageObserved=false;private screenshot:z.infer<typeof BrowserExecutionDiagnosticSchema>['screenshot']='not-requested';private requests:Record<string,number>={};private responses:Record<string,number>={};private requestFailures=0;private console:Record<string,number>={};
 constructor(private h:History,private scope:{runId:string;policyHash:string;validation:'live-attempt'|'offline-mocked-salesforce'}){h.db.exec('CREATE TABLE IF NOT EXISTS browser_execution_diagnostics(id TEXT PRIMARY KEY,run TEXT,policy TEXT,payload TEXT)');}
 private increment(target:Record<string,number>,key:string){target[key]=Math.min(1000000,(target[key]??0)+1);}
 attach(context:BrowserContext){this.context=context;context.on('request',r=>this.increment(this.requests,['document','script','stylesheet','image','font','xhr','fetch'].includes(r.resourceType())?r.resourceType():'other'));context.on('requestfailed',()=>{this.requestFailures=Math.min(1000000,this.requestFailures+1);});context.on('response',r=>this.increment(this.responses,r.status()>=200&&r.status()<300?'success':r.status()>=300&&r.status()<400?'redirect':r.status()>=400&&r.status()<500?'client-error':r.status()>=500?'server-error':'other'));const watch=(page:ReturnType<BrowserContext['pages']>[number])=>{this.pageObserved=true;page.on('console',m=>{if(m.type()==='error'){const t=m.text();this.increment(this.console,/blocked|ERR_BLOCKED/i.test(t)?'blocked':/network|fetch|connection|ERR_/i.test(t)?'network':/CSP|Content Security/i.test(t)?'csp':'other');}});page.on('pageerror',()=>this.increment(this.console,'page-error'));};context.pages().forEach(watch);context.on('page',watch);}
 observe:BrowserStageObserver=(stage,status,code,nativeProof)=>{const now=Date.now();if(status==='started')this.starts.set(stage,now);const entry=BrowserStageEntrySchema.parse({stage,status,code,...(nativeProof?{nativeProof}:{}),elapsedMs:Math.max(0,now-(this.starts.get(stage)??now)),totalMs:Math.max(0,now-this.started)});if(this.events.length>=96){this.events.splice(48,1);this.truncated=true;}this.events.push(entry);this.persist();return entry;};
 visual(status:z.infer<typeof BrowserExecutionDiagnosticSchema>['screenshot']){this.screenshot=status;this.persist();}
 snapshot(){return BrowserExecutionDiagnosticSchema.parse({version:1,id:this.id,...this.scope,events:this.events,truncated:this.truncated,pageAvailable:!!this.context?.pages().length,pageObserved:this.pageObserved,screenshot:this.screenshot,requests:this.requests,responses:this.responses,requestFailures:this.requestFailures,console:this.console,rawValuesRetained:false});}
 persist(){const value=this.snapshot();this.h.db.prepare('INSERT OR REPLACE INTO browser_execution_diagnostics VALUES(?,?,?,?)').run(this.id,this.scope.runId,this.scope.policyHash,JSON.stringify(value));return value;}
}
export function readBrowserExecutionDiagnostics(h:History,runId:string,policyHash:string){if(!h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_execution_diagnostics'").get())return[];return h.db.prepare('SELECT payload FROM browser_execution_diagnostics WHERE run=? AND policy=? ORDER BY rowid DESC LIMIT 4').all(runId,policyHash).map(r=>BrowserExecutionDiagnosticSchema.parse(JSON.parse(String(r.payload))));}
export const BoundaryDenialReasonSchema=z.enum(['unclassified','policy-denied','expired','websocket','metadata-only-rpc-denied','static-http','static-redirect','static-content','static-size','static-transport','static-review-expired']);
export type BoundaryDenialReason=z.infer<typeof BoundaryDenialReasonSchema>;
const ActionHintSchema=z.object({descriptorHash:z.string(),family:z.enum(['RecordUiController','RecordGvpController','ComponentController','unrecognized']),kind:z.enum(['read-like','report-or-log-like','write-like','unknown']),supportedDescriptor:z.boolean()}).strict();
export const DeniedRequestSchema=z.object({method:z.string(),resource:z.string(),route:z.enum(['aura','ui-api','static','lightning','other']),pathHash:z.string(),descriptors:z.array(z.string()),parameterNames:z.array(z.string()),unknownDescriptors:z.number().int(),unknownParameters:z.number().int(),actionHints:z.array(ActionHintSchema).max(10).default([]),reason:BoundaryDenialReasonSchema.default('unclassified')}).strict();
// Diagnostics have their own closed vocabulary. A familiar controller suffix
// must never cause arbitrary namespaces/action strings from a request to be logged.
const descriptorsAllowed=new Set(['aura://RecordUiController/ACTION$getRecord','aura://RecordUiController/ACTION$getRecordWithFields','aura://RecordUiController/ACTION$getObjectInfo','aura://RecordUiController/ACTION$getLayout','aura://RecordUiController/ACTION$getRecordLayout','serviceComponent://ui.force.components.controllers.recordGlobalValueProvider.RecordGvpController/ACTION$getRecord','aura://ComponentController/ACTION$reportFailedAction']);
const parameterNames=new Set(['recordId','recordIds','fields','optionalFields','layoutTypes','modes','mode','formFactor','objectApiName','objectApiNames','descriptor','attributes','context','screenSize','pageURI','recordDescriptor']);
export function summarizeDeniedRequest(input:{url:string;method:string;type:string;body?:string|null;reason?:BoundaryDenialReason}) {
  const u=new URL(input.url),descriptors:string[]=[],names=new Set<string>(),actionHints:z.infer<typeof ActionHintSchema>[]=[];let unknownDescriptors=0,unknownParameters=0;
  if(u.pathname==='/aura')try{const message=JSON.parse(new URLSearchParams(input.body??'').get('message')??'null');if(Array.isArray(message?.actions))for(const action of message.actions.slice(0,10)){
    const descriptor=typeof action.descriptor==='string'?action.descriptor:'';
    if(descriptorsAllowed.has(descriptor))descriptors.push(descriptor);else unknownDescriptors++;
    const parts=/^(?:aura|serviceComponent):\/\/(?:[A-Za-z][A-Za-z0-9_]*\.)*([A-Za-z][A-Za-z0-9_]*)\/ACTION\$([A-Za-z][A-Za-z0-9_]{0,80})$/.exec(descriptor),family=parts&&['RecordUiController','RecordGvpController','ComponentController'].includes(parts[1])?parts[1] as z.infer<typeof ActionHintSchema>['family']:'unrecognized',method=parts?.[2]??'',kind=/^(?:get|read|describe|fetch|load)/i.test(method)?'read-like':/^(?:report|log|metric|beacon)/i.test(method)?'report-or-log-like':/^(?:create|save|update|delete|remove|insert|submit|pay|refund|transfer|admin|permission)/i.test(method)?'write-like':'unknown';
    actionHints.push({descriptorHash:createHash('sha256').update(descriptor).digest('hex'),family,kind,supportedDescriptor:descriptorsAllowed.has(descriptor)&&!descriptor.endsWith('/ACTION$reportFailedAction')});
    if(action.params&&typeof action.params==='object'&&!Array.isArray(action.params))for(const name of Object.keys(action.params)){if(parameterNames.has(name))names.add(name);else unknownParameters++;}
  }}catch{/* Only structural counters, never raw body/values. */}
  return DeniedRequestSchema.parse({method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(input.method)?input.method:'other',resource:['document','script','stylesheet','image','font','xhr','fetch'].includes(input.type)?input.type:'other',route:u.pathname==='/aura'?'aura':u.pathname.includes('/ui-api/')?'ui-api':/^\/(?:auraFW|resource|assets|static|fonts|jslibrary)\//.test(u.pathname)?'static':u.pathname.startsWith('/lightning')?'lightning':'other',pathHash:createHash('sha256').update(u.pathname).digest('hex'),descriptors,parameterNames:[...names].sort(),unknownDescriptors,unknownParameters,actionHints,reason:input.reason??'unclassified'});
}
