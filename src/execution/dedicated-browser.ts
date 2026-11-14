import { chromium,type BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,realpath,chmod } from 'node:fs/promises';
import { resolve,dirname,relative,isAbsolute } from 'node:path';
import { WorkflowSchema } from '../agents/workflows.js';
import { authorizeEnvironment,EnvironmentPolicySchema,environmentHash,type EnvironmentIdentity,type EnvironmentPolicy } from './environment.js';
import { readPrivateSessionState,writePrivateSessionReceipt,checkSessionReceipt } from '../integrations/session-gate.js';
import type { StructuredChat } from '../ai/types.js';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
export const DedicatedGuardSchema=z.object({policy:EnvironmentPolicySchema,identity:z.object({Id,userId:Id,IsSandbox:z.boolean()}),origins:z.array(z.string().url()).min(1),documents:z.array(z.string().url()).max(20),owned:z.array(z.object({object:z.enum(['Account','Contact']),id:Id,display:z.string().optional()})).max(2),expiresAt:z.string().datetime()}).strict();
export type DedicatedGuard=z.infer<typeof DedicatedGuardSchema>;
const readActions=new Set(['aura://RecordUiController/ACTION$getRecord','aura://RecordUiController/ACTION$getRecordWithFields','aura://RecordUiController/ACTION$getObjectInfo','aura://RecordUiController/ACTION$getLayout','aura://RecordUiController/ACTION$getRecordLayout','serviceComponent://ui.force.components.controllers.recordGlobalValueProvider.RecordGvpController/ACTION$getRecord']);
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
export async function installDedicatedBoundary(context:BrowserContext,raw:unknown,onBlocked:()=>void=()=>{}) {
  const config=DedicatedGuardSchema.parse(raw);for(const origin of config.origins)authorizeEnvironment(config.policy,config.identity,'dedicated-ui',origin);
  await context.routeWebSocket('**/*',socket=>{onBlocked();socket.close();});
  await context.route('**/*',route=>{try {if(allowDedicatedRequest(config,{method:route.request().method(),url:route.request().url(),type:route.request().resourceType(),body:route.request().postData()}))return route.fallback();}catch{/* Fail closed, without request/body diagnostics. */}onBlocked();return route.abort('blockedbyclient');});
}
export async function installDedicatedGuardFile(context:BrowserContext,path:string) {const config=DedicatedGuardSchema.parse(JSON.parse(await readFile(path,'utf8')));await installDedicatedBoundary(context,config);}
export const DedicatedUiPlanSchema=z.object({orgId:Id,userId:Id,runId:z.string(),policyHash:z.string(),dataPlanHash:z.string(),sourceVersion:z.string(),sessionReceipt:z.string().min(1),workflows:z.array(WorkflowSchema).min(1).max(2),maxActions:z.number().int().min(0).max(20),maxMs:z.number().int().min(1).max(60000),publishVerifiedExecutionLesson:z.literal(true),exploration:z.object({approved:z.literal(true),maxSteps:z.number().int().min(1).max(2),useExternalModel:z.boolean()}).strict().optional()}).strict();
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
export async function verifyDedicatedSession(statePath:string,policy:unknown,identity:EnvironmentIdentity,apiOrigin:string,receiptPath?:string) {
  const p=EnvironmentPolicySchema.parse(policy);if(p.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated browser session mode required');authorizeEnvironment(p,identity,'dedicated-ui',apiOrigin);
  const before=await readPrivateSessionState(statePath),browser=await chromium.launch({headless:true});
  try {const context=await browser.newContext({storageState:before.statePath,serviceWorkers:'block',acceptDownloads:false}),host=new URL(apiOrigin).hostname,cookies=await context.cookies(apiOrigin),sid=cookies.find(c=>c.name==='sid'&&(host===c.domain.replace(/^\./,'')||host.endsWith(c.domain)));
    if(!sid)throw Error('missing session');
    // Use the browser's actual session cookie, never the API client's JWT token, to prove the browser user/org.
    const response=await context.request.get(`${apiOrigin}/services/oauth2/userinfo`,{headers:{Authorization:`Bearer ${sid.value}`},maxRedirects:0,timeout:15000});
    if(!response.ok())throw Error('identity unavailable');const user=z.object({organization_id:z.string(),user_id:z.string()}).parse(await response.json());if(user.organization_id!==identity.Id||user.user_id!==identity.userId)throw Error('identity mismatch');
    if((await readPrivateSessionState(statePath)).hash!==before.hash)throw Error('state changed');
    if(receiptPath){const now=Date.now();await writePrivateSessionReceipt(receiptPath,{orgId:identity.Id,userId:identity.userId,persona:p.dedicatedQa!.persona,statePath:before.statePath,hash:before.hash,origins:p.allowedOrigins,reviewer:p.approval.operator,verifiedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+900000,Date.parse(p.approval.expiresAt))).toISOString()});}
    return {statePath:before.statePath,orgId:identity.Id,userId:identity.userId,persona:p.dedicatedQa!.persona};
  }catch{throw Error('Dedicated browser session could not be independently verified; session/provider details withheld');}finally{await browser.close();}
}
export async function checkedDedicatedSession(receiptPath:string,policy:EnvironmentPolicy,identity:EnvironmentIdentity,apiOrigin:string) {const receipt=await checkSessionReceipt(receiptPath,{orgId:identity.Id,userId:identity.userId,persona:policy.dedicatedQa!.persona},policy.allowedOrigins);return verifyDedicatedSession(receipt.statePath,policy,identity,apiOrigin);}
export async function createDedicatedSession(input:{policy:unknown;identity:EnvironmentIdentity;apiOrigin:string;statePath:string;receiptPath:string;bridge:()=>Promise<string>}) {
  const policy=EnvironmentPolicySchema.parse(input.policy);authorizeEnvironment(policy,input.identity,'dedicated-ui',input.apiOrigin);
  if(policy.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated mode required');
  await mkdir('.auth',{recursive:true});const file=resolve(input.statePath),rel=relative(await realpath('.auth'),file),parent=relative(await realpath('.auth'),await realpath(dirname(file)));
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||parent.startsWith('..')||isAbsolute(parent))throw Error('Dedicated session must stay inside ignored .auth');
  const url=await input.bridge(),target=new URL(url);if(!policy.allowedOrigins.includes(target.origin)||target.protocol!=='https:'||target.pathname!=='/secur/frontdoor.jsp')throw Error('Approved one-time browser bridge required');
  const browser=await chromium.launch({headless:true});
  try {const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(!policy.allowedOrigins.includes(u.origin))return route.abort();const asset=['script','stylesheet','image','font'].includes(request.resourceType())&&/^\/(?:auraFW|sfsites|resource|img|images|icons|assets|static|fonts|jslibrary)\//.test(u.pathname);if(request.method()==='GET'&&(request.url()===url||['/lightning','/lightning/','/lightning/page/home'].includes(u.pathname)||asset))return route.continue();return route.abort();});
    const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});if(!policy.allowedOrigins.includes(new URL(page.url()).origin)||!new URL(page.url()).pathname.startsWith('/lightning'))throw Error('browser bridge did not reach approved UI');
    await writeFile(file,JSON.stringify(await context.storageState()),{flag:'wx',mode:0o600});await chmod(file,0o600);
  }catch{throw Error('Dedicated browser authentication failed; one-time URL and session details withheld');}finally{await browser.close();}
  return verifyDedicatedSession(file,policy,input.identity,input.apiOrigin,input.receiptPath);
}
export type OpaqueExplorationState={availableActionIds:string[];visitedActionIds:string[];lastAssertionPassed:boolean|null};
export function geminiExplorationChooser(chat:StructuredChat) {return async(state:OpaqueExplorationState)=>{const response=await chat.generate({schema:z.object({actionId:z.enum(state.availableActionIds as [string,...string[]])}).strict(),system:'Choose one supplied opaque approved action ID for bounded QA exploration. No URLs, records, credentials, tools or new actions are available.',prompt:JSON.stringify(state)});return response.actionId;};}
export async function exploreDedicatedOwned(input:{guard:DedicatedGuard;workflows:z.infer<typeof WorkflowSchema>[];statePath:string;maxSteps:number;maxMs:number;maxActions:number;choose:(state:OpaqueExplorationState)=>Promise<string>;verify:(object:string,id:string)=>Promise<unknown>;prepareContext?:(context:BrowserContext)=>Promise<void>}) {
  const g=DedicatedGuardSchema.parse(input.guard);if(!g.policy.dedicatedQa?.actions.includes('explore-read-owned'))throw Error('Dedicated exploratory actions are not approved');for(const origin of g.origins)authorizeEnvironment(g.policy,g.identity,'dedicated-explore',origin);
  if(!Number.isInteger(input.maxSteps)||input.maxSteps<1||input.maxSteps>2||input.maxMs<1||input.maxMs>60000||input.workflows.some(w=>!g.documents.includes(new URL(w.path,w.origin).href)))throw Error('Dedicated exploration catalog/budgets denied');
  const browser=await chromium.launch({headless:true}),visited:string[]=[],observations:Array<{actionId:string;assertionPassed:boolean}>=[],deadline=Date.now()+input.maxMs;let actions=0,blockedRequests=0;
  try {const context=await browser.newContext({storageState:input.statePath,serviceWorkers:'block',acceptDownloads:false});await input.prepareContext?.(context);await installDedicatedBoundary(context,g,()=>blockedRequests++);const page=await context.newPage();
    for(let i=0;i<input.maxSteps&&Date.now()<deadline;i++){
      const available=input.workflows.map((_w,n)=>`action-${n}`).filter(id=>!visited.includes(id));if(!available.length)break;
      const id=await Promise.race([input.choose({availableActionIds:available,visitedActionIds:[...visited],lastAssertionPassed:observations.at(-1)?.assertionPassed??null}),new Promise<never>((_r,reject)=>{const timer=setTimeout(()=>reject(Error('Exploration model budget exceeded')),Math.max(1,deadline-Date.now()));timer.unref();})]);
      if(!available.includes(id))throw Error('AI exploration selected an unapproved action');const workflow=input.workflows[Number(id.slice(7))],target=new URL(workflow.path,workflow.origin),owned=g.owned.find(r=>target.pathname===`/lightning/r/${r.object}/${r.id}/view`);if(!owned)throw Error('Exploration target is not run-owned');
      if(actions+1+workflow.steps.length>input.maxActions)break;await input.verify(owned.object,owned.id);await page.goto(target.href,{timeout:Math.max(1,deadline-Date.now())});actions++;
      const locator=(l:z.infer<typeof WorkflowSchema>['assertion']['locator'])=>l.by==='role'?page.getByRole(l.value as 'button',{name:l.name??'',exact:true}):l.by==='label'?page.getByLabel(l.value,{exact:true}):page.getByTestId(l.value);
      for(const step of workflow.steps){if(step.action!=='click')throw Error('Dedicated exploration mutation action denied');await locator(step.locator).click({timeout:Math.max(1,deadline-Date.now())});actions++;}
      const passed=(await locator(workflow.assertion.locator).textContent({timeout:Math.max(1,deadline-Date.now())}))===workflow.assertion.text;visited.push(id);observations.push({actionId:id,assertionPassed:passed});await input.verify(owned.object,owned.id);
    }
    return {status:observations.length>0&&observations.every(o=>o.assertionPassed)?'passed':'failed',actions,blockedRequests,observations};
  }finally{await browser.close();}
}
