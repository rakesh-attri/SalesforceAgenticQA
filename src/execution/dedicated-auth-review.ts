import { z } from 'zod';
import { createHash } from 'node:crypto';
import { authorizeEnvironment,environmentHash,type EnvironmentPolicy,type EnvironmentIdentity } from './environment.js';
const AuthOrigin=z.string().url().refine(value=>{const u=new URL(value);return value===u.origin&&u.protocol==='https:'&&!u.username&&!u.password&&(/\.(?:salesforce\.com|force\.com)$/.test(u.hostname));});
export const AuthRedirectSchema=z.object({origin:AuthOrigin,path:z.enum(['/','/secur/sessionserver.jsp','/secur/session.jsp','/secur/frontdoor.jsp'])}).strict();
export const DedicatedAuthPlanSchema=z.object({orgId:z.string(),userId:z.string(),policyHash:z.string(),authenticationOnly:z.literal(true),redirects:z.array(AuthRedirectSchema).min(1).max(6)}).strict();
export const DedicatedAuthReviewSchema=z.object({plan:DedicatedAuthPlanSchema,approval:z.object({operator:z.string().trim().min(1),hash:z.string(),expiresAt:z.string().datetime()}).strict()}).strict();
export function dedicatedAuthHash(plan:z.infer<typeof DedicatedAuthPlanSchema>){return createHash('sha256').update(JSON.stringify(DedicatedAuthPlanSchema.parse(plan))).digest('hex');}
export function authorizeAuthHandoffs(raw:unknown,policy:EnvironmentPolicy,identity:EnvironmentIdentity,now=Date.now()) {
  authorizeEnvironment(policy,identity,'dedicated-ui',policy.allowedOrigins[0],policy.dedicatedQa?.persona,now);
  const review=DedicatedAuthReviewSchema.parse(raw);
  if(policy.mode!=='DEDICATED_QA_ORG'||review.plan.policyHash!==environmentHash(policy)||review.plan.orgId!==identity.Id||review.plan.userId!==identity.userId||review.approval.operator!==policy.approval.operator||review.approval.hash!==dedicatedAuthHash(review.plan)||Date.parse(review.approval.expiresAt)<=now||Date.parse(review.approval.expiresAt)>Math.min(Date.parse(policy.approval.expiresAt),now+3600000))throw Error('Authentication handoffs require a current exact named org/user/policy/path review');
  return review;
}
export function allowAuthHandoff(review:z.infer<typeof DedicatedAuthReviewSchema>|undefined,request:{url:string;method:string;type:string},now=Date.now()) {
  if(!review||Date.parse(review.approval.expiresAt)<=now||request.method!=='GET'||request.type!=='document')return false;
  const u=new URL(request.url);return !u.username&&!u.password&&!u.hash&&review.plan.redirects.some(r=>u.origin===r.origin&&u.pathname===r.path);
}
export function prepareAuthReview(raw:unknown,policy:EnvironmentPolicy) {
  const source=z.object({approved:z.literal(false),definitionHash:z.string(),operator:z.string(),observations:z.array(z.object({origin:z.string(),path:z.string(),resourceType:z.string(),method:z.string()}))}).parse(raw);
  if(policy.mode!=='DEDICATED_QA_ORG'||source.definitionHash!==environmentHash(policy)||source.operator!==policy.approval.operator)throw Error('Observed auth handoffs differ from the current policy');
  const redirects=source.observations.map(o=>{if(o.resourceType!=='document'||o.method!=='GET')throw Error('Unknown authentication operations require separate investigation');return AuthRedirectSchema.parse({origin:o.origin,path:o.path});});
  const plan=DedicatedAuthPlanSchema.parse({orgId:policy.dedicatedQa!.orgId,userId:policy.dedicatedQa!.userId,policyHash:environmentHash(policy),authenticationOnly:true,redirects});
  return {plan,approval:{operator:'REVIEW_REQUIRED',hash:dedicatedAuthHash(plan),expiresAt:new Date(Math.min(Date.parse(policy.approval.expiresAt),Date.now()+1800000)).toISOString()}};
}
