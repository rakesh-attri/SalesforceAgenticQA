import {launchLocalBrowser} from './local-browser.js';
import { createHash } from 'node:crypto';
import { chromium,type BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { BrowserIdentitySchema,checkSessionReceipt,readPrivateSessionState,writePrivateSessionReceipt } from '../integrations/session-gate.js';
import { authorizeEnvironment,EnvironmentPolicySchema,type EnvironmentIdentity } from './environment.js';
const Url=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&!/%|\\|(?:delete|remove|submit|save|edit|create|pay|purchase|checkout|transfer|refund|execute|logout|login)/i.test(u.pathname);},'Only reviewed non-mutating HTTPS paths without parameters are supported');
export const ObservationPlanSchema=z.object({
  identity:BrowserIdentitySchema,sessionReceipt:z.string().min(1),
  documents:z.array(z.object({url:Url,nonMutatingReviewed:z.literal(true),source:z.string().min(1)}).strict()).min(1).max(10),
  assets:z.array(Url).max(100).default([]),
  identityMarkers:z.object({org:z.string().min(1),user:z.string().min(1),persona:z.string().min(1)}).strict(),
  reads:z.array(z.object({page:z.number().int().nonnegative(),criterionId:z.string().min(1),testId:z.string().min(1),expectedText:z.string().min(1).max(512)}).strict()).max(50),
}).strict();
export type ObservationPlan=z.infer<typeof ObservationPlanSchema>;
export const ObservationRequestSchema=z.object({plan:ObservationPlanSchema,approval:z.object({operator:z.string().trim().min(1),planHash:z.string(),expiresAt:z.string().datetime()}).strict()}).strict();
export function observationHash(input:ObservationPlan) {return createHash('sha256').update(JSON.stringify(ObservationPlanSchema.parse(input))).digest('hex');}
export function allowObservationRequest(plan:ObservationPlan,request:{method:string;url:string;resourceType:string}) {
  if(!['GET','HEAD'].includes(request.method))return false;
  if(request.resourceType==='document')return plan.documents.some(d=>d.url===request.url);
  return ['stylesheet','image','font'].includes(request.resourceType)&&plan.assets.includes(request.url);
}
// No page callbacks, arbitrary evaluation, locator actions, downloads or executable test files are accepted.
export async function installObservationBoundary(context:BrowserContext,plan:ObservationPlan,onBlocked:()=>void) {
  await context.routeWebSocket('**/*',socket=>{onBlocked();socket.close();});
  await context.route('**/*',route=>{if(allowObservationRequest(plan,{method:route.request().method(),url:route.request().url(),resourceType:route.request().resourceType()}))return route.continue();onBlocked();return route.abort('blockedbyclient');});
}
function validateObservation(raw:unknown,rawPolicy:unknown,identity:EnvironmentIdentity) {
  const input=ObservationRequestSchema.parse(raw),p=EnvironmentPolicySchema.parse(rawPolicy),plan=input.plan;
  if(p.mode!=='PRODUCTION_READ_ONLY_QA')throw Error('Production observation requires explicit read-only mode');
  if(input.approval.planHash!==observationHash(plan)||input.approval.operator!==p.approval.operator||Date.parse(input.approval.expiresAt)<=Date.now())throw Error('Observation plan lacks matching named current approval');
  if(identity.Id!==plan.identity.orgId||identity.userId!==plan.identity.userId)throw Error('Observation identity differs from fresh API identity');
  for(const url of [...plan.documents.map(d=>d.url),...plan.assets])authorizeEnvironment(p,identity,'browser-observe',new URL(url).origin,plan.identity.persona);
  if(plan.reads.some(r=>r.page>=plan.documents.length))throw Error('Observation refers to an unknown page');
  return {input,p,plan};
}
export async function observeProduction(raw:unknown,rawPolicy:unknown,identity:EnvironmentIdentity) {
  const {p,plan}=validateObservation(raw,rawPolicy,identity);
  const receipt=await checkSessionReceipt(plan.sessionReceipt,plan.identity,[...new Set(plan.documents.map(d=>new URL(d.url).origin))]);
  return runObservation(plan,p,identity,receipt.statePath,async()=>{validateObservation(raw,rawPolicy,identity);await checkSessionReceipt(plan.sessionReceipt,plan.identity,[...new Set(plan.documents.map(d=>new URL(d.url).origin))]);});
}
export async function verifyObservationSession(raw:unknown,policy:unknown,identity:EnvironmentIdentity,statePath:string,ttlMs=900000) {
  const {p,plan}=validateObservation(raw,policy,identity);
  if(ttlMs<=0||ttlMs>3600000)throw Error('Read-only session lifetime must be bounded to one hour');
  const before=await readPrivateSessionState(statePath);
  const unchanged=async()=>{validateObservation(raw,policy,identity);if((await readPrivateSessionState(statePath)).hash!==before.hash)throw Error('Session state changed during read-only verification');};
  const result=await runObservation(plan,p,identity,before.statePath,unchanged);
  await unchanged();if(result.status!=='passed')throw Error('Restricted session identity/observation verification failed; no receipt issued');
  const now=Date.now();
  return writePrivateSessionReceipt(plan.sessionReceipt,{...plan.identity,statePath:before.statePath,hash:before.hash,origins:[...new Set(plan.documents.map(d=>new URL(d.url).origin))],reviewer:p.approval.operator,verifiedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+ttlMs,Date.parse(p.approval.expiresAt))).toISOString()});
}
async function runObservation(plan:ObservationPlan,p:z.infer<typeof EnvironmentPolicySchema>,identity:EnvironmentIdentity,statePath:string,checkState:()=>Promise<void>) {
  const browser=await launchLocalBrowser();let blockedRequests=0;
  try {
    const context=await browser.newContext({storageState:statePath,javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
    await installObservationBoundary(context,plan,()=>blockedRequests++);
    const checks:Array<{page:number;criterionId:string;testId:string;passed:boolean;durationMs:number}>=[];
    for(let i=0;i<plan.documents.length;i++) {
      for(const url of plan.documents.map(d=>d.url))authorizeEnvironment(p,identity,'browser-observe',new URL(url).origin,plan.identity.persona);
      await checkState();
      const page=await context.newPage();
      try {
        await page.goto(plan.documents[i].url,{waitUntil:'domcontentloaded',timeout:20000});
        if(page.url()!==plan.documents[i].url)throw Error('Observation redirected from reviewed document');
        const observed={orgId:(await page.getByTestId(plan.identityMarkers.org).textContent({timeout:5000}))?.trim(),userId:(await page.getByTestId(plan.identityMarkers.user).textContent({timeout:5000}))?.trim(),persona:(await page.getByTestId(plan.identityMarkers.persona).textContent({timeout:5000}))?.trim()};
        if(observed.orgId!==plan.identity.orgId||observed.userId!==plan.identity.userId||observed.persona!==plan.identity.persona)throw Error('Read-only browser persona identity could not be verified');
        for(const read of plan.reads.filter(r=>r.page===i)){const start=performance.now(),passed=(await page.getByTestId(read.testId).textContent({timeout:5000}))?.trim()===read.expectedText;checks.push({page:i,criterionId:read.criterionId,testId:read.testId,passed,durationMs:performance.now()-start});}
      }finally{await page.close();}
    }
    return {mode:p.mode,status:checks.every(c=>c.passed)&&blockedRequests===0?'passed':'failed',checks,blockedRequests,javaScriptEnabled:false,mutationsEnabled:false};
  }catch{throw Error('Restricted browser observation failed: approved document or static persona markers unavailable. Page/provider details withheld.');}
  finally{await browser.close();}
}
