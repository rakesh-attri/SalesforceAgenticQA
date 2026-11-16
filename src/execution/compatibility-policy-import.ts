import {BrowserReviewSchema,browserPlanHash,digest,fingerprint} from './browser-policy.js';
import {ContractSchema,CompatibilityScopeSchema,type PlatformContract} from './compatibility-types.js';

// Import existing definitions as review candidates. An old expired browser
// approval or a resource template is not a registry shape/effects review.
export function contractsFromBrowserPolicy(raw:unknown){
  const review=BrowserReviewSchema.parse(raw),plan=review.plan;
  if(review.approval.hash!==browserPlanHash(plan)||!plan.engineProfileHash)throw Error('Source policy/engine integrity required');
  const scope=CompatibilityScopeSchema.parse({org:digest(plan.orgId),user:digest(plan.userId),permission:digest(plan.persona),build:plan.buildHash,app:plan.appHash,engine:plan.engineProfileHash,records:plan.records.map(r=>digest(r.id)).sort()});
  const common={version:1,scope,parameterKeys:[],valueConstraints:['exact-origin','no-extra-parameters'],status:'proposed',sources:[{kind:'policy',hash:review.approval.hash}],dependencies:[],reReviewOn:['org-user-permission','build-app-engine','shape-response-effects','source-change-or-expiry']};
  const contracts:PlatformContract[]=[...plan.resources.map(rule=>ContractSchema.parse({...common,id:fingerprint([scope,'resource',rule]),operation:'static-resource',operationHash:fingerprint(rule),requestShapeHash:fingerprint(['unobserved-template',rule]),method:'GET',response:'static-mime',effects:'reviewed-nonmutating',risk:'low',runtimeBindingHash:fingerprint(rule)})),...plan.contracts.map(contract=>ContractSchema.parse({...common,id:fingerprint([scope,'aura',contract.descriptor]),operation:'reviewed-initialization',operationHash:digest(contract.descriptor),requestShapeHash:fingerprint(['unobserved-template',contract]),method:'POST',parameterKeys:Object.keys(contract.parameters).map(digest).sort(),valueConstraints:['exact-app','no-extra-parameters'],response:'unknown',effects:'unknown',risk:'review-required',runtimeBindingHash:fingerprint(contract)}))];
  return{scope,contracts,executionPermissionsGranted:0};
}
