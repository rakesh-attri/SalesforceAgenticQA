import {z} from 'zod';
import {readFile,realpath,stat} from 'node:fs/promises';
import {relative,isAbsolute} from 'node:path';
import {BrowserReviewSchema,browserPlanHash,authorizeBrowserSession,fingerprint,type BrowserReview} from './browser-policy.js';
import type {EnvironmentIdentity} from './environment.js';
import {verifyLightningEngine} from './lightning-engine.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const DedicatedChromeProfileSchema=z.object({
  plan:z.object({version:z.literal(1),mode:z.literal('DEDICATED_QA_NORMAL_CHROME'),orgId:z.string(),userId:z.string(),persona:z.string(),parentPolicyHash:Hash,engineHash:Hash,buildHash:Hash,appHash:Hash,selectedAppIdHash:Hash,sourceVersion:Hash,origins:z.array(z.string().url()).min(1).max(2),
    risk:z.literal('native-platform-requests-may-have-unreviewed-and-irreversible-server-effects'),
    actions:z.literal('separate-reviewed-owned-action-broker-only'),mutations:z.literal('separate-owned-factory-workflow-approvals-only'),leastPrivilege:z.literal('salesforce-user-access-is-the-native-request-enforcement-boundary'),
  }).strict(),approval:z.object({operator:z.string().trim().min(1),hash:Hash,expiresAt:z.string().datetime(),nativeEffectsAccepted:z.literal(true),leastPrivilegeReviewed:z.literal(true)}).strict(),
}).strict();
export type DedicatedChromeProfile=z.infer<typeof DedicatedChromeProfileSchema>;
export function dedicatedChromeProfileHash(raw:unknown){return fingerprint(DedicatedChromeProfileSchema.parse(raw).plan);}
export function prepareDedicatedChromeProfile(raw:unknown){
  const review=BrowserReviewSchema.parse(raw),p=review.plan;if(!p.engineProfileHash)throw Error('Reviewed local engine required');
  const plan={version:1,mode:'DEDICATED_QA_NORMAL_CHROME',orgId:p.orgId,userId:p.userId,persona:p.persona,parentPolicyHash:p.parentPolicyHash,engineHash:p.engineProfileHash,buildHash:p.buildHash,appHash:p.appHash,selectedAppIdHash:p.selectedAppIdHash,sourceVersion:p.sourceVersion,origins:p.origins,risk:'native-platform-requests-may-have-unreviewed-and-irreversible-server-effects',actions:'separate-reviewed-owned-action-broker-only',mutations:'separate-owned-factory-workflow-approvals-only',leastPrivilege:'salesforce-user-access-is-the-native-request-enforcement-boundary'};
  return DedicatedChromeProfileSchema.parse({plan,approval:{operator:'REVIEW_REQUIRED',hash:fingerprint(plan),expiresAt:review.approval.expiresAt,nativeEffectsAccepted:true,leastPrivilegeReviewed:true}});
}
export function authorizeDedicatedChromeProfile(raw:unknown,review:BrowserReview,parent:unknown,identity:EnvironmentIdentity){
  authorizeBrowserSession(review,parent,identity,review.plan);const profile=DedicatedChromeProfileSchema.parse(raw),p=profile.plan,r=review.plan,now=Date.now();
  if(r.executionProfile!=='DEDICATED_QA_NORMAL_CHROME'||!r.profileHash||r.profileHash!==fingerprint(p)||profile.approval.hash!==fingerprint(p)||profile.approval.operator==='REVIEW_REQUIRED'||profile.approval.operator!==review.approval.operator||Date.parse(profile.approval.expiresAt)<Date.parse(review.approval.expiresAt)||Date.parse(profile.approval.expiresAt)<=now||Date.parse(profile.approval.expiresAt)>now+86400000)throw Error('Explicit named native Chrome profile/risk/least-privilege review required');
  if(p.orgId!==r.orgId||p.userId!==r.userId||p.persona!==r.persona||p.parentPolicyHash!==r.parentPolicyHash||p.engineHash!==r.engineProfileHash||p.buildHash!==r.buildHash||p.appHash!==r.appHash||p.selectedAppIdHash!==r.selectedAppIdHash||p.sourceVersion!==r.sourceVersion||fingerprint(p.origins)!==fingerprint(r.origins))throw Error('Native Chrome profile differs from exact session scope');
  verifyLightningEngine(p.engineHash);return profile;
}
async function stateJson(path:string){const root=await realpath('.state'),target=await realpath(path),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(target)).size>131072)throw Error('Private bounded profile file required');return JSON.parse(await readFile(target,'utf8'));}
// A preference selects only an explicitly mode/hash-bound fresh grant. It cannot
// convert an old guarded or comparison policy into native execution authority.
export async function loadPreferredChromeProfile(review:BrowserReview){
  if(review.plan.executionProfile!=='DEDICATED_QA_NORMAL_CHROME')return undefined;
  const config=z.object({profile:z.string().min(1)}).strict().parse(await stateJson('.state/dedicated-browser-preference.json'));
  return DedicatedChromeProfileSchema.parse(await stateJson(config.profile));
}
export async function preferChromeForNewReview(review:BrowserReview){
  let config:unknown;try{config=await stateJson('.state/dedicated-browser-preference.json');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return review;throw error;}
  const path=z.object({profile:z.string()}).strict().parse(config).profile;return selectChromeForDraft(review,await stateJson(path));
}
export function selectChromeForDraft(review:BrowserReview,raw:unknown){
  if(review.approval.operator!=='REVIEW_REQUIRED')throw Error('Preferred transport applies only to an inactive new review');
  const profile=DedicatedChromeProfileSchema.parse(raw),expected=prepareDedicatedChromeProfile(review).plan;
  if(profile.approval.operator==='REVIEW_REQUIRED'||profile.approval.hash!==fingerprint(profile.plan)||Date.parse(profile.approval.expiresAt)<=Date.now()||fingerprint(profile.plan)!==fingerprint(expected))throw Error('Preferred profile inactive, expired or differs from new review scope');
  const plan={...review.plan,executionProfile:'DEDICATED_QA_NORMAL_CHROME' as const,profileHash:fingerprint(profile.plan),contracts:[]};
  return BrowserReviewSchema.parse({plan,approval:{...review.approval,operator:'REVIEW_REQUIRED',hash:browserPlanHash(plan),expiresAt:new Date(Math.min(Date.parse(profile.approval.expiresAt),Date.parse(review.approval.expiresAt))).toISOString()},initializationApprovals:[]});
}
