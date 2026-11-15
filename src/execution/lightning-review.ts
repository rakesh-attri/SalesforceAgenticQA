import {z} from 'zod';
import {BrowserPlanSchema,BrowserReviewSchema,browserPlanHash,fingerprint} from './browser-policy.js';
import {lightningEngineHash,lightningEngineProfile} from './lightning-engine.js';
import {LightningViewSchema,lightningViewHash} from './lightning-view.js';

export const LightningReviewInputSchema=z.object({sourceReview:z.string().min(1),statePath:z.string().min(1),runId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),viewPath:z.string().optional()}).strict();
export function prepareLightningArchitecture(raw:unknown,input:{runId:string;stateHash:string;view?:unknown}){
  const source=BrowserReviewSchema.parse(raw);
  if(source.approval.hash!==browserPlanHash(source.plan)||source.plan.ownedDataPlanHash||source.plan.runId===input.runId)throw Error('New observation review must preserve a valid source and use a fresh run ID');
  const view=input.view?LightningViewSchema.parse(input.view):undefined;
  if(view&&(view.sourceVersion!==source.plan.sourceVersion||view.buildHash!==source.plan.buildHash||view.appHash!==source.plan.appHash))throw Error('View source version differs');
  const plan=BrowserPlanSchema.parse({...source.plan,runId:input.runId,sessionStateHash:input.stateHash,engineProfileHash:lightningEngineHash(),renderContractHash:view?lightningViewHash(view):undefined});
  const expiresAt=new Date(Date.now()+3540000).toISOString(),review={plan,approval:{operator:'REVIEW_REQUIRED',hash:browserPlanHash(plan),expiresAt},initializationApprovals:source.initializationApprovals.map(receipt=>({...receipt,approval:{...receipt.approval,operator:'REVIEW_REQUIRED',expiresAt}}))};
  return{review,summary:{version:1,engine:lightningEngineProfile(),engineProfileHash:plan.engineProfileHash,initializationProfileHash:fingerprint({build:plan.buildHash,app:plan.appHash,resources:plan.resources,contracts:plan.contracts,recordReadProfile:plan.recordReadProfile}),policyHash:review.approval.hash,renderContract:view?'source-bound-review-prepared':'missing-actual-selector-review',normalBaseline:'not-provided',planes:{platform:'existing-versioned-resource-and-contract-policy',observation:'approved-record-navigation-and-reviewed-view',interactions:'separate-owned-workflow-permits',mutations:'existing-dedicated-factories-only'},approvalActivated:false,recordWrites:0}};
}
