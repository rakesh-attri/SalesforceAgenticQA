import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DedicatedStaticReviewSchema,StaticAssetSchema,staticPlanHash } from './dedicated-static.js';
import { EnvironmentPolicySchema,environmentHash } from './environment.js';
const names=new Set(['_au','_c','_cl','_dfs','_lrmc','_density','_ff','_l','_l10n','_style','aura.app','aura.mode','_def','_uid']);
// Pure retrospective source audit: no expiration renewal, signature, network
// dispatch, URL normalization allowance or permission is produced here.
export function auditStaticDependencies(draftRaw:unknown,priorRaw:unknown,observedRaw:unknown,parent:unknown){
  const draft=DedicatedStaticReviewSchema.parse(draftRaw),prior=DedicatedStaticReviewSchema.parse(priorRaw),observed=z.object({assets:z.array(StaticAssetSchema).max(80)}).passthrough().parse(observedRaw),policy=EnvironmentPolicySchema.parse(parent),hash=environmentHash(policy);
  if(policy.mode!=='DEDICATED_QA_ORG'||policy.approval.definitionHash!==hash||draft.plan.policyHash!==hash||prior.plan.policyHash!==hash||draft.approval.hash!==staticPlanHash(draft.plan)||prior.approval.hash!==staticPlanHash(prior.plan)||['orgId','userId','specVersion'].some(key=>draft.plan[key as 'orgId']!==prior.plan[key as 'orgId']))throw Error('Static review source binding or content hash differs');
  const added=draft.plan.assets.filter(asset=>!prior.plan.assets.some(old=>old.type===asset.type&&old.url===asset.url)),removed=prior.plan.assets.filter(asset=>!draft.plan.assets.some(next=>next.type===asset.type&&next.url===asset.url));
  if(added.some(asset=>!observed.assets.some(source=>source.type===asset.type&&source.url===asset.url)))throw Error('An added static resource has no exact observation source');
  const changes=added.map(asset=>{const target=new URL(asset.url),candidates=prior.plan.assets.filter(old=>{const known=new URL(old.url);return known.origin===target.origin&&known.pathname===target.pathname;}),differences=candidates.map(old=>{const known=new URL(old.url);return [...new Set([...target.searchParams.keys(),...known.searchParams.keys()])].filter(name=>JSON.stringify(target.searchParams.getAll(name))!==JSON.stringify(known.searchParams.getAll(name))).map(name=>names.has(name)?name:'unrecognized-key');}).sort((a,b)=>a.length-b.length);
    return {urlHash:createHash('sha256').update(asset.url).digest('hex'),type:asset.type,samePriorPath:!!candidates.length,changedParameterNames:differences[0]??[],duplicateQueryKeys:new Set([...target.searchParams.keys()]).size!==[...target.searchParams.keys()].length};});
  const oldOrigins=new Set(prior.plan.assets.map(asset=>new URL(asset.url).origin)),newOrigins=new Set(draft.plan.assets.map(asset=>new URL(asset.url).origin));
  return {status:'review-required' as const,draftHash:staticPlanHash(draft.plan),priorHash:staticPlanHash(prior.plan),observedSourceHash:createHash('sha256').update(JSON.stringify(observedRaw)).digest('hex'),priorResources:prior.plan.assets.length,proposedResources:draft.plan.assets.length,addedResources:added.length,removedResources:removed.length,additionalOrigins:[...newOrigins].filter(origin=>!oldOrigins.has(origin)).length,changes,approvalActivated:false,readOperationsAuthorized:0,recordWritesAuthorized:0,denialsProvenCausal:false};
}
