import {z} from 'zod';
import type {BrowserContext} from '@playwright/test';
import {BrowserReviewSchema,authorizeBrowserSession,browserPlanHash,browserDocument,fingerprint,type BrowserReview} from './browser-policy.js';
import type {EnvironmentIdentity} from './environment.js';
import {BrowserBudget} from './browser-resources.js';
import {RequestTraceClock,BrowserTraceSchema,browserTraceScope,summarizeBrowserExchange} from './browser-trace.js';

const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const NormalNetworkingReceiptSchema=z.object({plan:z.object({purpose:z.literal('one-off-local-normal-network-observation'),browserPolicyHash:Hash,engineHash:Hash,risk:z.literal('native-initialization-requests-have-unreviewed-server-effects'),noAgentActions:z.literal(true),sessions:z.literal(1)}).strict(),approval:z.object({operator:z.string().min(1),hash:Hash,expiresAt:z.string().datetime(),nativeEffectsAccepted:z.literal(true)}).strict()}).strict();
export function authorizeNormalComparison(raw:unknown,review:BrowserReview,parent:unknown,identity:EnvironmentIdentity){
  authorizeBrowserSession(review,parent,identity,review.plan);const receipt=NormalNetworkingReceiptSchema.parse(raw);
  if(review.plan.ownedDataPlanHash||review.plan.budgets.actions||review.plan.agentWorkflowHashes.length||review.plan.records.length!==1||review.plan.records[0].object!=='Account'||review.plan.budgets.sessions!==1||!review.plan.visualDebug||receipt.plan.browserPolicyHash!==browserPlanHash(review.plan)||receipt.plan.engineHash!==review.plan.engineProfileHash||receipt.approval.operator==='REVIEW_REQUIRED'||receipt.approval.operator!==review.approval.operator||receipt.approval.hash!==fingerprint(receipt.plan)||receipt.approval.expiresAt!==review.approval.expiresAt)throw Error('Separate exact normal-network observation authorization required');return receipt;
}

// No route(), fetch(), fulfill(), abort() or injected request modifications.
// Native requests may have unknown effects; this explicit one-off receipt is
// never available to ordinary execution modes or AI tools. Budget breach closes
// the owned context; event observation cannot prevent an already dispatched call.
export function observeNormalNetworking(context:BrowserContext,review:BrowserReview,transport='normal-network-observation'){
  const clock=new RequestTraceClock(),budget=new BrowserBudget(review),entries:Array<ReturnType<typeof summarizeBrowserExchange>>=[];let closedForBudget=false,bytes=0;const pending=new Set<Promise<void>>();
  const close=()=>{closedForBudget=true;void context.close().catch(()=>{});};
  context.on('request',request=>{clock.start(request);try{budget.request();if(request.isNavigationRequest()&&request.frame()===request.frame().page().mainFrame()&&!browserDocument(review.plan,request.url()))close();}catch{close();}});
  context.on('response',response=>{const work=(async()=>{const request=response.request(),length=Number(response.headers()['content-length']??0);bytes+=Number.isFinite(length)?length:0;if(bytes>review.plan.budgets.resourceBytes)close();if(entries.length<250)entries.push({...summarizeBrowserExchange({url:request.url(),method:request.method(),type:request.resourceType(),body:request.postData()},response.status()),...clock.stamp(request)});})().catch(()=>{});pending.add(work);void work.finally(()=>pending.delete(work));});
  return{budget,summary(){return{requests:budget.requests,denied:0,reasons:{}};},async finish(){await Promise.allSettled([...pending]);return{transport,cacheHits:0,cacheMisses:0,requests:budget.requests,blocked:0,closedForBudget,advertisedResponseBytes:bytes,byteLimitIsPostResponse:true,trace:BrowserTraceSchema.parse({version:1,scope:browserTraceScope(review.plan,review.plan.records),provenance:'operator-live-normal-observation',sourceHash:fingerprint(entries),identityVerified:true,entries,truncated:entries.length>=250,rawValuesRetained:false})};}};
}
