import {BrowserPlanSchema,BrowserReviewSchema,browserPlanHash} from './browser-policy.js';
import {prepareDedicatedChromeProfile,dedicatedChromeProfileHash} from './dedicated-chrome-profile.js';
import {prepareLightningArchitecture} from './lightning-review.js';

export function prepareDedicatedChromeReview(raw:unknown,input:{runId:string;stateHash:string;view:unknown}){
  const prepared=prepareLightningArchitecture(raw,input),profile=prepareDedicatedChromeProfile(prepared.review);
  const plan=BrowserPlanSchema.parse({...prepared.review.plan,executionProfile:'DEDICATED_QA_NORMAL_CHROME',profileHash:dedicatedChromeProfileHash(profile),contracts:[]});
  const review=BrowserReviewSchema.parse({plan,approval:{...prepared.review.approval,hash:browserPlanHash(plan)},initializationApprovals:[]});
  return{profile,review,activated:false,preference:{profile:'.state/dedicated-chrome-profile.approved.json'},permissionsGranted:0};
}
