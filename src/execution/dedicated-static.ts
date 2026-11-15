import { z } from 'zod';
import { createHash } from 'node:crypto';
import { authorizeEnvironment,environmentHash,type EnvironmentPolicy,type EnvironmentIdentity } from './environment.js';
function staticCdn(host:string){return /^(?:[a-z0-9-]+\.)?static\.lightning\.force\.com$/i.test(host)||/\.(?:salesforce-static\.com|sfdcstatic\.com)$/i.test(host);}
const AssetSchema=z.object({url:z.string().url(),type:z.enum(['script','stylesheet'])}).strict().refine(asset=>{
  const definitionKeys=new Set(['_au','_c','_cl','_dfs','_lrmc','_density','_ff','_l','_l10n','_style','aura.app','aura.mode','_def','_uid']);
  const target=new URL(asset.url),definition=asset.type==='script'&&staticCdn(target.hostname)&&/^\/[A-Za-z0-9._-]{1,80}\/auraCmpDef$/.test(target.pathname)&&target.searchParams.has('_def')&&target.searchParams.has('_uid')&&[...target.searchParams.keys()].every(k=>definitionKeys.has(k));
  const u=target;return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port&&/\.(?:salesforce\.com|force\.com|salesforce-static\.com|sfdcstatic\.com)$/.test(u.hostname)&&!/^\/services\/|^\/aura(?:\/|$)|^\/secur\/|^\/lightning\/|^\/apex\/|^\/setup\//.test(u.pathname)&&![...u.searchParams.keys()].some(k=>/token|secret|assertion|password|session|^sid$|^otp$/i.test(k))&&(definition||(staticCdn(u.hostname)&&/\.(?:js|mjs|css)$/.test(u.pathname))||/^\/(?:l|aurafile|auraFW|resource)\//.test(u.pathname));
},'Only credential-free Salesforce static script/style URLs are supported');
export const StaticAssetSchema=AssetSchema;
export const DedicatedStaticPlanSchema=z.object({orgId:z.string(),userId:z.string(),policyHash:z.string(),specVersion:z.string(),staticOnly:z.literal(true),assets:z.array(AssetSchema).min(1).max(80)}).strict();
export const DedicatedStaticReviewSchema=z.object({plan:DedicatedStaticPlanSchema,approval:z.object({operator:z.string().trim().min(1),hash:z.string(),expiresAt:z.string().datetime()}).strict()}).strict();
export function staticPlanHash(plan:z.infer<typeof DedicatedStaticPlanSchema>){return createHash('sha256').update(JSON.stringify(DedicatedStaticPlanSchema.parse(plan))).digest('hex');}
export function authorizeStaticReview(raw:unknown,policy:EnvironmentPolicy,identity:EnvironmentIdentity,specVersion:string,now=Date.now()) {
  authorizeEnvironment(policy,identity,'dedicated-ui',policy.allowedOrigins[0],policy.dedicatedQa?.persona,now);const review=DedicatedStaticReviewSchema.parse(raw);
  if(policy.mode!=='DEDICATED_QA_ORG'||review.plan.orgId!==identity.Id||review.plan.userId!==identity.userId||review.plan.policyHash!==environmentHash(policy)||review.plan.specVersion!==specVersion||review.approval.operator!==policy.approval.operator||review.approval.hash!==staticPlanHash(review.plan)||Date.parse(review.approval.expiresAt)<=now||Date.parse(review.approval.expiresAt)>Math.min(Date.parse(policy.approval.expiresAt),now+3600000))throw Error('Static resources require a current exact named org/user/policy/spec/URL review');
  if(review.plan.assets.some(a=>!policy.allowedOrigins.includes(new URL(a.url).origin)&&!staticCdn(new URL(a.url).hostname)))throw Error('Only existing business origins or explicitly reviewed Salesforce static CDN resources are supported');
  return review;
}
export function matchesStaticReview(review:z.infer<typeof DedicatedStaticReviewSchema>|undefined,request:{url:string;type:string;method:string},now=Date.now()) {return !!review&&Date.parse(review.approval.expiresAt)>now&&request.method==='GET'&&review.plan.assets.some(a=>a.url===request.url&&a.type===request.type);}
export function prepareStaticReview(raw:unknown,policy:EnvironmentPolicy,identity:EnvironmentIdentity,specVersion:string) {
  const observations=z.object({assets:z.array(AssetSchema).max(80)}).parse(raw),assets=[...new Map(observations.assets.map(a=>[`${a.type}:${a.url}`,a])).values()];
  if(assets.some(a=>!policy.allowedOrigins.includes(new URL(a.url).origin)&&!staticCdn(new URL(a.url).hostname)))throw Error('Unrelated tenant origins are not static CDN resources');
  const plan=DedicatedStaticPlanSchema.parse({orgId:identity.Id,userId:identity.userId,policyHash:environmentHash(policy),specVersion,staticOnly:true,assets});
  return {plan,approval:{operator:'REVIEW_REQUIRED',hash:staticPlanHash(plan),expiresAt:new Date(Math.min(Date.parse(policy.approval.expiresAt),Date.now()+1800000)).toISOString()}};
}
