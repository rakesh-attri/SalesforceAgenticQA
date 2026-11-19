import { z } from 'zod';
import type { Locator, Page } from '@playwright/test';
import { fingerprint, type BrowserReview } from './browser-policy.js';
import type { BrowserBudget } from './browser-resources.js';
import {LocatorSchema,resolveLocator} from '../core/locators.js';
import {ReadinessRegionsSchema,inspectLightningReadiness} from './lightning-readiness.js';

const Hash=z.string().regex(/^[a-f0-9]{64}$/);
const Selector=LocatorSchema.extend({value:z.string().min(1).max(200),name:z.string().max(300).optional()}).strict();
export const LightningViewSchema=z.object({
  version:z.literal(1),object:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),sourceVersion:Hash,buildHash:Hash,appHash:Hash,
  reviewer:z.string().trim().min(1),evidenceHash:Hash,recordName:Selector,content:z.array(Selector).min(1).max(10),
  busy:z.array(Selector).max(5),faults:z.array(Selector).max(5),stableMs:z.number().int().min(100).max(1000),
  readiness:ReadinessRegionsSchema.optional(),
}).strict().refine(view=>!view.content.some(selector=>fingerprint(selector)===fingerprint(view.recordName)),'Record name alone cannot prove the reviewed content rendered');
export type LightningView=z.infer<typeof LightningViewSchema>;
export const lightningViewHash=(raw:unknown)=>fingerprint(LightningViewSchema.parse(raw));

export function reviewedLocator(page:Page,selector:z.infer<typeof Selector>,name:string):Locator{
  const value=selector.value.replaceAll('{{record-name}}',name),label=selector.name?.replaceAll('{{record-name}}',name);
  return resolveLocator(page,{...selector,value,name:label});
}

export async function observeLightningView(page:Page,input:{review:BrowserReview;view?:unknown;object:string;name:string;nativeDocumentVerified:boolean;budget:BrowserBudget;reserveMs?:number}){
  const {review,budget}=input;
  if(!input.view||!review.plan.renderContractHash)return{status:'review-required' as const,reason:'source-bound-render-contract-required',assertionsChanged:false};
  const view=LightningViewSchema.parse(input.view),hash=lightningViewHash(view);
  if(hash!==review.plan.renderContractHash||view.object!==input.object||view.reviewer!==review.approval.operator||view.sourceVersion!==review.plan.sourceVersion||view.buildHash!==review.plan.buildHash||view.appHash!==review.plan.appHash)throw Error('Rendered-view contract differs from the approved source/build/operator');
  if(!input.nativeDocumentVerified)return{status:'not-rendered' as const,reason:'native-record-document-not-proven',viewHash:hash,assertionsChanged:false};
  // Snapshot matching elements once. Re-resolving a locator after count or
  // visibility can auto-wait until the MCP action timeout if Lightning remounts
  // that component. A detached snapshot is incomplete evidence, never a pass.
  const snapshot=async(selector:z.infer<typeof Selector>)=>{
    const handles=await reviewedLocator(page,selector,input.name).elementHandles();
    if(handles.length===1)return handles[0];
    await Promise.all(handles.map(handle=>handle.dispose()));return null;
  };
  const absent=async(selector:z.infer<typeof Selector>)=>{const locator=reviewedLocator(page,selector,input.name);for(let i=0;i<await locator.count();i++)if(await locator.nth(i).isVisible())return false;return true;};
  let stableSince:number|undefined,lastSignature:string|undefined,last={name:false,content:0,busyClear:false,faultsClear:false},busyEvidence={reviewedBusyClear:false,nativeProgressbars:0,nativeAriaBusy:0,nativeSpinners:0,nativeFaults:0,inspectionBound:1000},readinessEvidence:Awaited<ReturnType<typeof inspectLightningReadiness>>|undefined;
  while(budget.remaining()>Math.max(100,input.reserveMs??0)){
    budget.check();
    const nameElement=await snapshot(view.recordName);
    let name=false,content:boolean[]=[];
    try{name=!!nameElement&&await nameElement.isVisible()&&await nameElement.textContent()===input.name&&await nameElement.evaluate(node=>node.isConnected);content=await Promise.all(view.content.map(async selector=>{const element=await snapshot(selector);try{return!!element&&!!nameElement&&await element.isVisible()&&await element.evaluate((node,recordName)=>node.isConnected&&recordName.isConnected&&node!==recordName&&!node.contains(recordName)&&!recordName.contains(node),nameElement);}finally{await element?.dispose();}}));}
    finally{await nameElement?.dispose();}
    last={name,content:content.filter(Boolean).length,busyClear:(await Promise.all(view.busy.map(absent))).every(Boolean),faultsClear:(await Promise.all(view.faults.map(absent))).every(Boolean)};
    // Native Lightning also uses spinners/alerts without the reviewed role DSL.
    readinessEvidence=await inspectLightningReadiness(page,[reviewedLocator(page,view.recordName,input.name),...view.content.map(selector=>reviewedLocator(page,selector,input.name))],view.readiness,input.name);
    busyEvidence={reviewedBusyClear:last.busyClear,...readinessEvidence.legacyCounts,inspectionBound:1000};
    last.busyClear=last.busyClear&&readinessEvidence.blockingBusy===0&&readinessEvidence.complete&&readinessEvidence.valid;last.faultsClear=last.faultsClear&&readinessEvidence.blockingFaults===0;
    const ready=last.name&&last.content===view.content.length&&last.busyClear&&last.faultsClear;
    if(ready){if(view.readiness&&lastSignature!==readinessEvidence.signature)stableSince=undefined;lastSignature=readinessEvidence.signature;stableSince??=Date.now();if(Date.now()-stableSince>=view.stableMs)return{status:'rendered-reviewed-view' as const,viewHash:hash,checks:last,busyEvidence,readinessEvidence,stableMs:view.stableMs,assertionsChanged:false};}else{stableSince=undefined;lastSignature=undefined;}
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,budget.remaining())));
  }
  return{status:'not-rendered' as const,reason:'reviewed-content-or-stability-not-observed',viewHash:hash,checks:last,busyEvidence,readinessEvidence,assertionsChanged:false};
}
