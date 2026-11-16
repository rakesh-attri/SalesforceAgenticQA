import { z } from 'zod';
import type { Locator, Page } from '@playwright/test';
import { fingerprint, type BrowserReview } from './browser-policy.js';
import type { BrowserBudget } from './browser-resources.js';
import {LocatorSchema,resolveLocator} from '../core/locators.js';

const Hash=z.string().regex(/^[a-f0-9]{64}$/);
const Selector=LocatorSchema.extend({value:z.string().min(1).max(200),name:z.string().max(300).optional()}).strict();
export const LightningViewSchema=z.object({
  version:z.literal(1),object:z.enum(['Account','Contact']),sourceVersion:Hash,buildHash:Hash,appHash:Hash,
  reviewer:z.string().trim().min(1),evidenceHash:Hash,recordName:Selector,content:z.array(Selector).min(1).max(10),
  busy:z.array(Selector).max(5),faults:z.array(Selector).max(5),stableMs:z.number().int().min(100).max(1000),
}).strict().refine(view=>!view.content.some(selector=>fingerprint(selector)===fingerprint(view.recordName)),'Record name alone cannot prove the reviewed content rendered');
export type LightningView=z.infer<typeof LightningViewSchema>;
export const lightningViewHash=(raw:unknown)=>fingerprint(LightningViewSchema.parse(raw));

export function reviewedLocator(page:Page,selector:z.infer<typeof Selector>,name:string):Locator{
  const value=selector.value.replaceAll('{{record-name}}',name),label=selector.name?.replaceAll('{{record-name}}',name);
  return resolveLocator(page,{...selector,value,name:label});
}

export async function observeLightningView(page:Page,input:{review:BrowserReview;view?:unknown;object:'Account'|'Contact';name:string;nativeDocumentVerified:boolean;budget:BrowserBudget;reserveMs?:number}){
  const {review,budget}=input;
  if(!input.view||!review.plan.renderContractHash)return{status:'review-required' as const,reason:'source-bound-render-contract-required',assertionsChanged:false};
  const view=LightningViewSchema.parse(input.view),hash=lightningViewHash(view);
  if(hash!==review.plan.renderContractHash||view.object!==input.object||view.reviewer!==review.approval.operator||view.sourceVersion!==review.plan.sourceVersion||view.buildHash!==review.plan.buildHash||view.appHash!==review.plan.appHash)throw Error('Rendered-view contract differs from the approved source/build/operator');
  if(!input.nativeDocumentVerified)return{status:'not-rendered' as const,reason:'native-record-document-not-proven',viewHash:hash,assertionsChanged:false};
  const unique=async(selector:z.infer<typeof Selector>,exactName=false)=>{
    const locator=reviewedLocator(page,selector,input.name),count=await locator.count();
    return count===1&&await locator.isVisible()&&(!exactName||await locator.textContent()===input.name);
  };
  const absent=async(selector:z.infer<typeof Selector>)=>{const locator=reviewedLocator(page,selector,input.name);for(let i=0;i<await locator.count();i++)if(await locator.nth(i).isVisible())return false;return true;};
  let stableSince:number|undefined,last={name:false,content:0,busyClear:false,faultsClear:false},busyEvidence={reviewedBusyClear:false,nativeProgressbars:0,nativeAriaBusy:0,nativeSpinners:0,nativeFaults:0,inspectionBound:1000};
  while(budget.remaining()>Math.max(100,input.reserveMs??0)){
    budget.check();
    const name=await unique(view.recordName,true),nameElement=name?await reviewedLocator(page,view.recordName,input.name).elementHandle({timeout:Math.min(250,budget.remaining())}):null;
    let content:boolean[]=[];
    try{content=await Promise.all(view.content.map(async selector=>await unique(selector)&&!!nameElement&&await reviewedLocator(page,selector,input.name).evaluate((node,recordName)=>node!==recordName&&!node.contains(recordName)&&!recordName.contains(node),nameElement)));}
    finally{await nameElement?.dispose();}
    last={name,content:content.filter(Boolean).length,busyClear:(await Promise.all(view.busy.map(absent))).every(Boolean),faultsClear:(await Promise.all(view.faults.map(absent))).every(Boolean)};
    // Native Lightning also uses spinners/alerts without the reviewed role DSL.
    const signals=await page.locator('[role="progressbar"],[aria-busy="true"],.slds-spinner,[role="alert"],.forcePageError').evaluateAll(elements=>elements.slice(0,1000).filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';}).map(e=>({progressbar:e.matches('[role="progressbar"]'),ariaBusy:e.matches('[aria-busy="true"]'),spinner:e.matches('.slds-spinner'),busy:e.matches('[role="progressbar"],[aria-busy="true"],.slds-spinner'),fault:e.matches('[role="alert"],.forcePageError')})));
    busyEvidence={reviewedBusyClear:last.busyClear,nativeProgressbars:signals.filter(s=>s.progressbar).length,nativeAriaBusy:signals.filter(s=>s.ariaBusy).length,nativeSpinners:signals.filter(s=>s.spinner).length,nativeFaults:signals.filter(s=>s.fault).length,inspectionBound:1000};
    last.busyClear=last.busyClear&&!signals.some(s=>s.busy);last.faultsClear=last.faultsClear&&!signals.some(s=>s.fault);
    const ready=last.name&&last.content===view.content.length&&last.busyClear&&last.faultsClear;
    if(ready){stableSince??=Date.now();if(Date.now()-stableSince>=view.stableMs)return{status:'rendered-reviewed-view' as const,viewHash:hash,checks:last,busyEvidence,stableMs:view.stableMs,assertionsChanged:false};}else stableSince=undefined;
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,budget.remaining())));
  }
  return{status:'not-rendered' as const,reason:'reviewed-content-or-stability-not-observed',viewHash:hash,checks:last,busyEvidence,assertionsChanged:false};
}
