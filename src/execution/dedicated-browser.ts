import {launchLocalBrowser} from './local-browser.js';
import { chromium,type BrowserContext,type Browser,type Request as BrowserRequest } from '@playwright/test';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,realpath,chmod } from 'node:fs/promises';
import { resolve,dirname,relative,isAbsolute } from 'node:path';
import { WorkflowSchema } from '../agents/workflows.js';
import {resolveLocator} from '../core/locators.js';
import { authorizeEnvironment,EnvironmentPolicySchema,environmentHash,type EnvironmentIdentity,type EnvironmentPolicy } from './environment.js';
import { readPrivateSessionState,writePrivateSessionReceipt,checkSessionReceipt } from '../integrations/session-gate.js';
import type { StructuredChat } from '../ai/types.js';
import { authorizeAuthHandoffs,allowAuthHandoff } from './dedicated-auth-review.js';
import { XMLParser } from 'fast-xml-parser';
import { parseLightningIdentity,sameSalesforceIdentity } from './lightning-identity.js';
import { DedicatedStaticReviewSchema,authorizeStaticReview,matchesStaticReview } from './dedicated-static.js';
import { fetchReviewedStatic,StaticTransportError } from './static-transport.js';
import type { BoundaryDenialReason } from './browser-diagnostics.js';
import {withBrowserStage,preserveBrowserDiagnostic,type BrowserStageObserver} from './browser-diagnostics.js';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
export class DedicatedSessionError extends Error {
  constructor(readonly code:'private-state'|'state-origin'|'session-cookie'|'identity-http'|'identity-redirect'|'identity-mismatch'|'state-changed'|'verification-unavailable'|'receipt') {super(`Dedicated browser session denied: ${code}. ${code==='identity-redirect'?'The identity proof redirected and was not followed. Refresh the independently approved state through the dedicated user normal login; no receipt can be issued from a redirect.':'Private session/provider details withheld; review the approved state, current user/org and origins.'}`);this.name='DedicatedSessionError';}
}
export function validateDedicatedState(raw:unknown,policy:EnvironmentPolicy,now=Date.now()) {
  const parsed=z.object({cookies:z.array(z.object({name:z.string(),value:z.string(),domain:z.string(),path:z.string(),expires:z.number(),secure:z.boolean(),httpOnly:z.boolean()}).passthrough()).max(1000),origins:z.array(z.object({origin:z.string().url()}).passthrough()).max(20)}).safeParse(raw);
  if(!parsed.success)throw new DedicatedSessionError('private-state');
  const hosts=policy.allowedOrigins.map(o=>new URL(o).hostname);
  if(parsed.data.origins.some(o=>!policy.allowedOrigins.includes(o.origin))||parsed.data.cookies.some(c=>!hosts.includes(c.domain.replace(/^\./,''))))throw new DedicatedSessionError('state-origin');
  // Salesforce's requireHttpOnly is an optional org setting. Preserve server flags;
  // secure transport, expiry and independent identity proof remain mandatory.
  if(parsed.data.cookies.some(c=>c.name==='sid'&&(!c.secure||!c.value||(c.expires!==-1&&c.expires*1000<=now))))throw new DedicatedSessionError('session-cookie');
  return parsed.data;
}
export function minimizeDedicatedState(raw:unknown,policy:EnvironmentPolicy) {
  const source=z.object({cookies:z.array(z.object({domain:z.string()}).passthrough()),origins:z.array(z.object({origin:z.string()}).passthrough())}).safeParse(raw);if(!source.success)throw new DedicatedSessionError('private-state');
  const hosts=policy.allowedOrigins.map(o=>new URL(o).hostname),state={cookies:source.data.cookies.filter(c=>hosts.includes(c.domain.replace(/^\./,''))),origins:source.data.origins.filter(o=>policy.allowedOrigins.includes(o.origin))};
  validateDedicatedState(state,policy);return {state,removed:{cookies:source.data.cookies.length-state.cookies.length,origins:source.data.origins.length-state.origins.length}};
}
export async function minimizeDedicatedImport(statePath:string,outputPath:string,policy:EnvironmentPolicy) {
  const source=await readPrivateSessionState(statePath),file=resolve(outputPath),root=await realpath('.auth'),rel=relative(root,file),parent=relative(root,await realpath(dirname(file)));
  if(file===source.statePath||!rel||rel.startsWith('..')||isAbsolute(rel)||parent.startsWith('..')||isAbsolute(parent))throw new DedicatedSessionError('private-state');
  let raw:unknown;try{raw=JSON.parse(await readFile(source.statePath,'utf8'));}catch{throw new DedicatedSessionError('private-state');}
  const result=minimizeDedicatedState(raw,policy);
  await writeFile(file,JSON.stringify(result.state),{flag:'wx',mode:0o600});await chmod(file,0o600);
  if((await readPrivateSessionState(statePath)).hash!==source.hash)throw new DedicatedSessionError('state-changed');
  return {statePath:file,removed:result.removed,originalUnchanged:true};
}
// Proposal only: Chrome omits expired cookies on import. Do not weaken the
// runtime comparison or remove an expired mandatory sid to make it pass.
export function pruneExpiredDedicatedState(raw:unknown,policy:EnvironmentPolicy,now=Date.now()){
  const p=EnvironmentPolicySchema.parse(policy);if(p.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated QA import proposal required');
  const state=validateDedicatedState(raw,p,now);
  for(const origin of p.allowedOrigins)if(state.cookies.filter(c=>c.name==='sid'&&c.domain.replace(/^\./,'')===new URL(origin).hostname&&c.path==='/').length!==1)throw new DedicatedSessionError('session-cookie');
  const expired=state.cookies.filter(c=>c.name!=='sid'&&c.expires!==-1&&c.expires*1000<=now),cookies=state.cookies.filter(c=>!expired.includes(c)),finite=cookies.filter(c=>c.expires!==-1).map(c=>c.expires*1000);
  return{state:{cookies,origins:state.origins},reviewRequired:true as const,removed:expired.map(c=>({nameHash:createHash('sha256').update(c.name).digest('hex'),expiry:new Date(c.expires*1000).toISOString()})),stableUntil:finite.length?new Date(Math.min(...finite)).toISOString():null};
}
export async function pruneExpiredDedicatedImport(statePath:string,outputPath:string,policy:EnvironmentPolicy){
  const source=await readPrivateSessionState(statePath),file=resolve(outputPath),root=await realpath('.auth'),rel=relative(root,file),parent=relative(root,await realpath(dirname(file)));
  if(file===source.statePath||!rel||rel.startsWith('..')||isAbsolute(rel)||parent.startsWith('..')||isAbsolute(parent))throw new DedicatedSessionError('private-state');
  let raw:unknown;try{raw=JSON.parse(await readFile(source.statePath,'utf8'));}catch{throw new DedicatedSessionError('private-state');}
  const result=pruneExpiredDedicatedState(raw,policy);
  await writeFile(file,JSON.stringify(result.state),{flag:'wx',mode:0o600});await chmod(file,0o600);
  if((await readPrivateSessionState(statePath)).hash!==source.hash)throw new DedicatedSessionError('state-changed');
  return{statePath:file,sourceHash:source.hash,reviewRequired:result.reviewRequired,removed:result.removed,stableUntil:result.stableUntil,originalUnchanged:true};
}
export const DedicatedGuardSchema=z.object({policy:EnvironmentPolicySchema,identity:z.object({Id,userId:Id,IsSandbox:z.boolean()}),origins:z.array(z.string().url()).min(1),documents:z.array(z.string().url()).max(20),owned:z.array(z.object({object:z.enum(['Account','Contact']),id:Id,display:z.string().optional()})).max(2),expiresAt:z.string().datetime(),staticReview:DedicatedStaticReviewSchema.optional()}).strict();
export type DedicatedGuard=z.infer<typeof DedicatedGuardSchema>;
const readActions=new Set(['aura://RecordUiController/ACTION$getRecord','aura://RecordUiController/ACTION$getRecordWithFields','aura://RecordUiController/ACTION$getObjectInfo','aura://RecordUiController/ACTION$getLayout','aura://RecordUiController/ACTION$getRecordLayout','serviceComponent://ui.force.components.controllers.recordGlobalValueProvider.RecordGvpController/ACTION$getRecord']);
export function hasDedicatedReadDescriptor(descriptor:string){return readActions.has(descriptor);}
function ownedReadParams(g:DedicatedGuard,descriptor:string,params:unknown) {
  if(!params||typeof params!=='object'||Array.isArray(params))return false;
  const p=params as Record<string,unknown>,recordRead=/\$(?:getRecord|getRecordWithFields|getRecordLayout)$/.test(descriptor);
  const allowedKeys=recordRead?['recordId','fields','optionalFields','layoutTypes','modes','formFactor']:['objectApiName','layoutType','mode','formFactor'];
  if(Object.keys(p).some(key=>!allowedKeys.includes(key)))return false;
  const record=g.owned.find(r=>r.id===p.recordId);
  if(recordRead?!record:!g.policy.dedicatedQa!.objects.some(o=>o===p.objectApiName))return false;
  for(const key of ['fields','optionalFields'])if(p[key]!==undefined&&(!Array.isArray(p[key])||(p[key] as unknown[]).some(f=>typeof f!=='string'||!new RegExp(`^${record!.object}\\.[A-Za-z][A-Za-z0-9_]*$`).test(f))))return false;
  if(p.modes!==undefined&&(!Array.isArray(p.modes)||(p.modes as unknown[]).some(m=>m!=='View')))return false;
  if(p.mode!==undefined&&p.mode!=='View')return false;
  return true;
}
export function allowDedicatedRequest(raw:DedicatedGuard,request:{method:string;url:string;type:string;body?:string|null}) {
  const g=DedicatedGuardSchema.parse(raw);if(Date.parse(g.expiresAt)<=Date.now())return false;
  const u=new URL(request.url);try{authorizeEnvironment(g.policy,g.identity,'dedicated-ui',u.origin,g.policy.dedicatedQa?.persona);}catch{return false;}
  if(!g.origins.includes(u.origin)||u.username||u.password||/\b(?:delete|save|edit|create|pay|purchase|checkout|transfer|refund|setup)\b/i.test(u.pathname))return false;
  const mentioned=[...decodeURIComponent(u.href).matchAll(/\b(?:001|003)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/g)].map(m=>m[0]);if(mentioned.some(id=>!g.owned.some(r=>r.id===id)))return false;
  if(request.type==='document')return request.method==='GET'&&g.documents.includes(u.href);
  if(['GET','HEAD'].includes(request.method)){
    if(['script','stylesheet','image','font'].includes(request.type))return /^\/(?:auraFW|resource|img|images|icons|assets|static|fonts|jslibrary)\//.test(u.pathname)&&!u.searchParams.has('sid');
    if(/^\/services\/data\/v\d+\.\d+\/ui-api\/records\//.test(u.pathname)){
      const id=u.pathname.match(/^\/services\/data\/v\d+\.\d+\/ui-api\/records\/([A-Za-z0-9]+)$/)?.[1],record=g.owned.find(r=>r.id===id);if(!record)return false;
      return [...u.searchParams].every(([key,value])=>['fields','optionalFields'].includes(key)&&value.split(',').every(f=>new RegExp(`^${record.object}\\.[A-Za-z][A-Za-z0-9_]*$`).test(f)));
    }
    if(/^\/services\/data\/v\d+\.\d+\/ui-api\/(?:object-info|layout)\//.test(u.pathname))return !u.search&&g.policy.dedicatedQa!.objects.some(o=>new RegExp(`^/services/data/v\\d+\\.\\d+/ui-api/(?:object-info|layout)/${o}$`).test(u.pathname));
    return false;
  }
  if(request.method!=='POST'||u.pathname!=='/aura'||u.search)return false;
  try {const params=new URLSearchParams(request.body??'');if([...params.keys()].some(k=>!['message','aura.context','aura.pageURI','aura.token'].includes(k)||params.getAll(k).length!==1))return false;const message=JSON.parse(params.get('message')??'null');if(!Array.isArray(message?.actions)||!message.actions.length||message.actions.length>10)return false;
    return message.actions.every((a:{descriptor?:string;params?:unknown})=>!!a.descriptor&&readActions.has(a.descriptor)&&ownedReadParams(g,a.descriptor,a.params));
  }catch{return false;}
}
export async function installDedicatedBoundary(context:BrowserContext,raw:unknown,onBlocked:(request?:BrowserRequest,reason?:BoundaryDenialReason)=>void=()=>{},staticFetch:typeof fetchReviewedStatic=fetchReviewedStatic) {
  const config=DedicatedGuardSchema.parse(raw);for(const origin of config.origins)authorizeEnvironment(config.policy,config.identity,'dedicated-ui',origin);
  const assets=config.staticReview?authorizeStaticReview(config.staticReview,config.policy,config.identity,config.staticReview.plan.specVersion):undefined;
  await context.routeWebSocket('**/*',socket=>{onBlocked(undefined,'websocket');socket.close();});
  await context.route('**/*',async route=>{try {
    const request=route.request();
    if(Date.parse(config.expiresAt)<=Date.now()){onBlocked(request,'expired');return route.abort('blockedbyclient');}
    if(matchesStaticReview(assets,{method:request.method(),url:request.url(),type:request.resourceType()})){
      if(!config.origins.includes(new URL(request.url()).origin))return route.fulfill(await staticFetch(assets,config.policy,config.identity,assets!.plan.specVersion,{url:request.url(),type:request.resourceType(),method:request.method()}));
      const headers={...await request.allHeaders()};delete headers.authorization;
      return route.fallback({headers});
    }
    if(allowDedicatedRequest(config,{method:request.method(),url:request.url(),type:request.resourceType(),body:request.postData()}))return route.fallback();
  }catch(error){onBlocked(route.request(),error instanceof StaticTransportError?error.code:'policy-denied');return route.abort('blockedbyclient');}onBlocked(route.request(),'policy-denied');return route.abort('blockedbyclient');});
}
export async function installDedicatedGuardFile(context:BrowserContext,path:string) {const config=DedicatedGuardSchema.parse(JSON.parse(await readFile(path,'utf8')));await installDedicatedBoundary(context,config);}
export const DedicatedUiPlanSchema=z.object({orgId:Id,userId:Id,runId:z.string(),policyHash:z.string(),dataPlanHash:z.string(),sourceVersion:z.string(),sessionReceipt:z.string().min(1),workflows:z.array(WorkflowSchema).min(1).max(2),maxActions:z.number().int().min(0).max(20),maxMs:z.number().int().min(1).max(60000),publishVerifiedExecutionLesson:z.boolean(),contactDisplay:z.literal('name-equals-synthetic-lastname').optional(),selectorSessions:z.literal('per-workflow').optional(),selectorTransport:z.literal('managed-mcp').optional(),browserSessionPolicyHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),exploration:z.object({approved:z.literal(true),maxSteps:z.number().int().min(1).max(2),useExternalModel:z.boolean()}).strict().optional()}).strict();
export const DedicatedUiReviewSchema=z.object({plan:DedicatedUiPlanSchema,approval:z.object({operator:z.string().trim().min(1),hash:z.string(),expiresAt:z.string().datetime()}).strict()}).strict();
export type DedicatedUiReview=z.infer<typeof DedicatedUiReviewSchema>;
export function dedicatedUiHash(input:z.infer<typeof DedicatedUiPlanSchema>) {return createHash('sha256').update(JSON.stringify(DedicatedUiPlanSchema.parse(input))).digest('hex');}
export function reviewDedicatedUi(raw:unknown,policy:unknown,identity:EnvironmentIdentity) {
  const input=DedicatedUiReviewSchema.parse(raw),p=EnvironmentPolicySchema.parse(policy);
  if(p.mode!=='DEDICATED_QA_ORG'||input.plan.policyHash!==environmentHash(p)||input.approval.operator!==p.approval.operator||input.approval.hash!==dedicatedUiHash(input.plan)||Date.parse(input.approval.expiresAt)<=Date.now()||input.plan.orgId!==identity.Id||input.plan.userId!==identity.userId)throw Error('Dedicated UI requires exact named workflow/org/user review');
  if(!p.dedicatedQa!.actions.includes('ui-read-owned'))throw Error('Dedicated owned UI reads are not approved');
  if(input.plan.workflows.reduce((n,w)=>n+w.steps.length,0)>input.plan.maxActions)throw Error('Dedicated UI action budget exceeded');
  for(const w of input.plan.workflows){authorizeEnvironment(p,identity,'dedicated-ui',w.origin);if(w.apiAssertions.length||w.steps.some(s=>s.action==='fill'||/delete|save|new|edit|pay|purchase|transfer|refund|permission/i.test(`${s.locator.value} ${s.locator.name??''}`)))throw Error('Dedicated browser workflow is restricted to reviewed non-mutating owned-record navigation');}
  return input;
}
export async function verifyDedicatedSession(statePath:string,policy:unknown,identity:EnvironmentIdentity,apiOrigin:string,receiptPath?:string,deps?:{launch?:()=>Promise<Browser>;onStage?:BrowserStageObserver}) {
  const p=EnvironmentPolicySchema.parse(policy);if(p.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated browser session mode required');authorizeEnvironment(p,identity,'dedicated-ui',apiOrigin);
  let browser:Browser|undefined,failed=false;
  try {return await withBrowserStage(deps?.onStage,'context-identity',async()=>{const before=await readPrivateSessionState(statePath);validateDedicatedState(JSON.parse(await readFile(before.statePath,'utf8')),p);
    browser=await (deps?.launch?.()??launchLocalBrowser());
    const context=await browser.newContext({storageState:before.statePath,javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false}),sessions:Array<{origin:string;session:string}>=[];
    for(const origin of p.allowedOrigins){const cookies=await context.cookies(origin),sid=cookies.filter(c=>c.name==='sid');if(sid.length!==1||!sid[0].secure)throw new DedicatedSessionError('session-cookie');sessions.push({origin,session:sid[0].value});}
    // Prove every approved origin's actual browser session, never the API JWT. An empty
    // verifier context avoids an unrelated cookie authenticating a rejected Bearer token.
    const verifier=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    for(const {origin,session} of sessions){await verifier.clearCookies();const response=await verifier.request.get(`${apiOrigin}/services/oauth2/userinfo`,{headers:{Authorization:`Bearer ${session}`},maxRedirects:0,timeout:15000});
      let observed:unknown;
      if(response.ok())observed=await response.json();
      else {
        // A normal UI session need not be an OAuth token accepted by userinfo.
        // The fixed read-only SOAP utility proves that same browser session;
        // it never substitutes the JWT/API token or calls login/create/update.
        if(![400,401,403,404].includes(response.status()))throw new DedicatedSessionError(response.status()>=300&&response.status()<400?'identity-redirect':'identity-http');
        if(new URL(origin).hostname.endsWith('.lightning.force.com')){
          const document=await context.request.get(`${origin}/lightning/page/home`,{maxRedirects:0,timeout:15000});
          if(!document.ok())throw new DedicatedSessionError(document.status()>=300&&document.status()<400?'identity-redirect':'identity-http');
          if(!document.headers()['content-type']?.includes('text/html'))throw new DedicatedSessionError('identity-http');
          try{observed=parseLightningIdentity(await document.text());}catch{throw new DedicatedSessionError('identity-mismatch');}
        }else {
        const version=process.env.SF_API_VERSION||'v62.0';if(!/^v\d+\.\d+$/.test(version))throw new DedicatedSessionError('verification-unavailable');
        const escaped=session.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');await verifier.clearCookies();
        const proof=await verifier.request.post(`${apiOrigin}/services/Soap/u/${version.slice(1)}`,{headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'getUserInfo'},data:`<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:p="urn:partner.soap.sforce.com"><env:Header><p:SessionHeader><p:sessionId>${escaped}</p:sessionId></p:SessionHeader></env:Header><env:Body><p:getUserInfo/></env:Body></env:Envelope>`,maxRedirects:0,timeout:15000});
        if(!proof.ok())throw new DedicatedSessionError(proof.status()>=300&&proof.status()<400?'identity-redirect':'identity-http');const xml=await proof.text();if(xml.length>1000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new DedicatedSessionError('identity-mismatch');
        const parsed=new XMLParser({removeNSPrefix:true,ignoreAttributes:true,parseTagValue:false}).parse(xml),result=z.object({organizationId:Id,userId:Id}).safeParse(parsed?.Envelope?.Body?.getUserInfoResponse?.result);if(!result.success)throw new DedicatedSessionError('identity-mismatch');observed={organization_id:result.data.organizationId,user_id:result.data.userId};
        }
      }
      const user=z.object({organization_id:z.string(),user_id:z.string()}).safeParse(observed);if(!user.success||!sameSalesforceIdentity(user.data.organization_id,identity.Id)||!sameSalesforceIdentity(user.data.user_id,identity.userId))throw new DedicatedSessionError('identity-mismatch');}
    if((await readPrivateSessionState(statePath)).hash!==before.hash)throw new DedicatedSessionError('state-changed');
    if(receiptPath){const now=Date.now();try{await writePrivateSessionReceipt(receiptPath,{orgId:identity.Id,userId:identity.userId,persona:p.dedicatedQa!.persona,statePath:before.statePath,hash:before.hash,origins:p.allowedOrigins,reviewer:p.approval.operator,verifiedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+900000,Date.parse(p.approval.expiresAt))).toISOString()});}catch{throw new DedicatedSessionError('receipt');}}
    return {statePath:before.statePath,orgId:identity.Id,userId:identity.userId,persona:p.dedicatedQa!.persona};});
  }catch(error){failed=true;if(error instanceof DedicatedSessionError)throw error;throw preserveBrowserDiagnostic(error,new DedicatedSessionError('verification-unavailable'));}finally{
    try{await withBrowserStage(deps?.onStage,'cleanup',async()=>{await browser?.close();});}catch(error){if(!failed)throw preserveBrowserDiagnostic(error,new DedicatedSessionError('verification-unavailable'));}
  }
}
export async function checkedDedicatedSession(receiptPath:string,policy:EnvironmentPolicy,identity:EnvironmentIdentity,apiOrigin:string) {const receipt=await checkSessionReceipt(receiptPath,{orgId:identity.Id,userId:identity.userId,persona:policy.dedicatedQa!.persona},policy.allowedOrigins);if(receipt.reviewer!==policy.approval.operator)throw new DedicatedSessionError('receipt');return verifyDedicatedSession(receipt.statePath,policy,identity,apiOrigin);}
export type DedicatedBootstrapDiagnostic={phase:'navigation'|'landing'|'state-write';pageClass:'not-loaded'|'unapproved-origin'|'lightning'|'login'|'other';authHints:string[];blocked:{origin:number;method:number;unknown:number;websocket:number}};
const authHandoffPaths=['/','/secur/sessionserver.jsp','/secur/session.jsp','/secur/frontdoor.jsp'] as const;
export type DedicatedOriginReview={approved:false;definitionHash:string;operator:string;observations:Array<{origin:string;path:typeof authHandoffPaths[number]|'unsupported';resourceType:string;method:string}>};
export async function createDedicatedSession(input:{policy:unknown;identity:EnvironmentIdentity;apiOrigin:string;statePath:string;receiptPath:string;bridge:()=>Promise<string>;authReview?:unknown;diagnostic?:(value:DedicatedBootstrapDiagnostic)=>Promise<void>;originReview?:(value:DedicatedOriginReview)=>Promise<void>}) {
  const policy=EnvironmentPolicySchema.parse(input.policy);authorizeEnvironment(policy,input.identity,'dedicated-ui',input.apiOrigin);
  if(policy.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated mode required');
  const handoffs=input.authReview?authorizeAuthHandoffs(input.authReview,policy,input.identity):undefined;
  await mkdir('.auth',{recursive:true});const file=resolve(input.statePath),rel=relative(await realpath('.auth'),file),parent=relative(await realpath('.auth'),await realpath(dirname(file)));
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||parent.startsWith('..')||isAbsolute(parent))throw Error('Dedicated session must stay inside ignored .auth');
  const url=await input.bridge(),target=new URL(url);if(!policy.allowedOrigins.includes(target.origin)||target.protocol!=='https:'||target.pathname!=='/secur/frontdoor.jsp')throw Error('Approved one-time browser bridge required');
  const browser=await launchLocalBrowser();
  const diagnostic:DedicatedBootstrapDiagnostic={phase:'navigation',pageClass:'not-loaded',authHints:[],blocked:{origin:0,method:0,unknown:0,websocket:0}},unapprovedOrigins=new Map<string,DedicatedOriginReview['observations'][number]>();let currentPage:import('@playwright/test').Page|undefined;
  try {const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    await context.routeWebSocket('**/*',socket=>{diagnostic.blocked.websocket++;socket.close();});
    await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(allowAuthHandoff(handoffs,{url:request.url(),method:request.method(),type:request.resourceType()}))return route.continue();if(!policy.allowedOrigins.includes(u.origin)){diagnostic.blocked.origin++;if(unapprovedOrigins.size<10&&u.protocol==='https:')unapprovedOrigins.set(`${u.origin}:${request.resourceType()}`,{origin:u.origin,path:authHandoffPaths.includes(u.pathname as typeof authHandoffPaths[number])?u.pathname as typeof authHandoffPaths[number]:'unsupported',resourceType:request.resourceType(),method:request.method()});return route.abort();}const asset=['script','stylesheet','image','font'].includes(request.resourceType())&&/^\/(?:auraFW|sfsites|resource|img|images|icons|assets|static|fonts|jslibrary)\//.test(u.pathname);if(request.method()==='GET'&&(request.url()===url||['/lightning','/lightning/','/lightning/page/home'].includes(u.pathname)||asset))return route.continue();diagnostic.blocked[request.method()==='GET'?'unknown':'method']++;return route.abort();});
    const page=await context.newPage();currentPage=page;await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});diagnostic.phase='landing';
    // frontdoor may redirect after DOMContentLoaded. Wait for the already approved
    // landing rather than mistaking the intermediate auth document for a session.
    await page.waitForURL(value=>policy.allowedOrigins.includes(value.origin)&&value.pathname.startsWith('/lightning'),{waitUntil:'domcontentloaded',timeout:15000});
    if(!policy.allowedOrigins.includes(new URL(page.url()).origin)||!new URL(page.url()).pathname.startsWith('/lightning'))throw Error('browser bridge did not reach approved UI');
    diagnostic.phase='state-write';
    const captured=await context.storageState(),hosts=policy.allowedOrigins.map(o=>new URL(o).hostname),state={cookies:captured.cookies.filter(c=>hosts.includes(c.domain.replace(/^\./,''))),origins:captured.origins.filter(o=>policy.allowedOrigins.includes(o.origin))};
    validateDedicatedState(state,policy);await writeFile(file,JSON.stringify(state),{flag:'wx',mode:0o600});await chmod(file,0o600);
  }catch{if(currentPage){try{const final=new URL(currentPage.url());diagnostic.pageClass=final.protocol==='about:'?'not-loaded':!policy.allowedOrigins.includes(final.origin)?'unapproved-origin':final.pathname.startsWith('/lightning')?'lightning':/login|secur/.test(final.pathname)?'login':'other';
      const text=await currentPage.locator('body').textContent({timeout:1000});for(const [label,pattern] of [['verification-required',/verify your identity|verification code|authenticator|multi.factor/i],['cookies-required',/enable cookies|cookies.*disabled/i],['session-rejected',/invalid session|session.*expired|url.*expired|invalid.*token|single.use/i],['access-denied',/access denied|insufficient privileges|not authorized/i],['login-form',/log in to salesforce|forgot your password/i]] as const)if(pattern.test(text??''))diagnostic.authHints.push(label);
    }catch{/* No URL or raw provider/DOM text output. */}}await input.diagnostic?.(diagnostic);if(unapprovedOrigins.size)await input.originReview?.({approved:false,definitionHash:environmentHash(policy),operator:policy.approval.operator,observations:[...unapprovedOrigins.values()]});throw Error(`Dedicated browser authentication failed at ${diagnostic.phase}; one-time URL and session details withheld`);}finally{await browser.close();}
  return verifyDedicatedSession(file,policy,input.identity,input.apiOrigin,input.receiptPath);
}
export type OpaqueExplorationState={availableActionIds:string[];visitedActionIds:string[];lastAssertionPassed:boolean|null};
export function geminiExplorationChooser(chat:StructuredChat) {return async(state:OpaqueExplorationState)=>{const response=await chat.generate({schema:z.object({actionId:z.enum(state.availableActionIds as [string,...string[]])}).strict(),system:'Choose one supplied opaque approved action ID for bounded QA exploration. No URLs, records, credentials, tools or new actions are available.',prompt:JSON.stringify(state)});return response.actionId;};}
export async function exploreDedicatedOwned(input:{guard:DedicatedGuard;workflows:z.infer<typeof WorkflowSchema>[];statePath:string;maxSteps:number;maxMs:number;maxActions:number;choose:(state:OpaqueExplorationState)=>Promise<string>;verify:(object:string,id:string)=>Promise<unknown>;prepareContext?:(context:BrowserContext)=>Promise<void>}) {
  const g=DedicatedGuardSchema.parse(input.guard);if(!g.policy.dedicatedQa?.actions.includes('explore-read-owned'))throw Error('Dedicated exploratory actions are not approved');for(const origin of g.origins)authorizeEnvironment(g.policy,g.identity,'dedicated-explore',origin);
  if(!Number.isInteger(input.maxSteps)||input.maxSteps<1||input.maxSteps>2||input.maxMs<1||input.maxMs>60000||input.workflows.some(w=>!g.documents.includes(new URL(w.path,w.origin).href)))throw Error('Dedicated exploration catalog/budgets denied');
  const browser=await launchLocalBrowser(),visited:string[]=[],observations:Array<{actionId:string;assertionPassed:boolean}>=[],deadline=Date.now()+input.maxMs;let actions=0,blockedRequests=0;
  try {const context=await browser.newContext({storageState:input.statePath,serviceWorkers:'block',acceptDownloads:false});await input.prepareContext?.(context);await installDedicatedBoundary(context,g,()=>blockedRequests++);const page=await context.newPage();
    for(let i=0;i<input.maxSteps&&Date.now()<deadline;i++){
      const available=input.workflows.map((_w,n)=>`action-${n}`).filter(id=>!visited.includes(id));if(!available.length)break;
      const id=await Promise.race([input.choose({availableActionIds:available,visitedActionIds:[...visited],lastAssertionPassed:observations.at(-1)?.assertionPassed??null}),new Promise<never>((_r,reject)=>{const timer=setTimeout(()=>reject(Error('Exploration model budget exceeded')),Math.max(1,deadline-Date.now()));timer.unref();})]);
      if(!available.includes(id))throw Error('AI exploration selected an unapproved action');const workflow=input.workflows[Number(id.slice(7))],target=new URL(workflow.path,workflow.origin),owned=g.owned.find(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`);if(!owned)throw Error('Exploration target is not run-owned');
      if(actions+1+workflow.steps.length>input.maxActions)break;await input.verify(owned.object,owned.id);await page.goto(target.href,{timeout:Math.max(1,deadline-Date.now())});actions++;
      const locator=(l:z.infer<typeof WorkflowSchema>['assertion']['locator'])=>resolveLocator(page,l);
      for(const step of workflow.steps){if(step.action!=='click')throw Error('Dedicated exploration mutation action denied');await locator(step.locator).click({timeout:Math.max(1,deadline-Date.now())});actions++;}
      const passed=(await locator(workflow.assertion.locator).textContent({timeout:Math.max(1,deadline-Date.now())}))===workflow.assertion.text;visited.push(id);observations.push({actionId:id,assertionPassed:passed});await input.verify(owned.object,owned.id);
    }
    return {status:observations.length>0&&observations.every(o=>o.assertionPassed)?'passed':'failed',actions,blockedRequests,observations};
  }finally{await browser.close();}
}
