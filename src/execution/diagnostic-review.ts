import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { History } from '../core/history.js';
import { DedicatedExecutionSchema } from './dedicated-pipeline.js';
import { DedicatedStaticReviewSchema,staticPlanHash } from './dedicated-static.js';
import { dedicatedPlanHash } from '../salesforce/dedicated-qa.js';
import { dedicatedUiHash } from './dedicated-browser.js';
import { EnvironmentPolicySchema,environmentHash,authorizeEnvironment,type EnvironmentIdentity } from './environment.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/),Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
export const DiagnosticReferenceSchema=z.object({object:z.enum(['Account','Contact']),id:Id}).strict();
export const DiagnosticPlanSchema=z.object({purpose:z.literal('deleted-owned-ui-dependencies'),orgId:Id,userId:Id,runId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),parentPolicyHash:Hash,dataPlanHash:Hash,uiPlanHash:Hash,specVersion:Hash,staticPlanHash:Hash,references:z.array(DiagnosticReferenceSchema).min(1).max(2),recordWrites:z.literal(false),businessRpc:z.literal(false),assertions:z.literal(false),learning:z.literal(false),maxMs:z.literal(10000)}).strict();
export const DiagnosticReviewSchema=z.object({plan:DiagnosticPlanSchema,approval:z.object({operator:z.string().trim().min(1),hash:Hash,expiresAt:z.string().datetime()}).strict()}).strict();
export type DiagnosticReview=z.infer<typeof DiagnosticReviewSchema>;
export function diagnosticPlanHash(plan:z.infer<typeof DiagnosticPlanSchema>){return createHash('sha256').update(JSON.stringify(DiagnosticPlanSchema.parse(plan))).digest('hex');}
export function diagnosticExecutionSource(raw:unknown,review:DiagnosticReview){
  const input=DedicatedExecutionSchema.parse(raw);
  if(review.plan.runId!==input.data.plan.runId||review.plan.orgId!==input.data.plan.orgId||review.plan.userId!==input.data.plan.userId||review.plan.parentPolicyHash!==input.data.plan.policyHash||review.plan.parentPolicyHash!==input.ui.plan.policyHash||review.plan.dataPlanHash!==input.data.approval.planHash||review.plan.dataPlanHash!==dedicatedPlanHash(input.data.plan)||review.plan.uiPlanHash!==input.ui.approval.hash||review.plan.uiPlanHash!==dedicatedUiHash(input.ui.plan)||review.plan.specVersion!==input.spec.version)throw Error('Diagnostic execution source differs');
  return input;
}

export function deletedJournalReferences(history:History,raw:unknown){
  const plan=DiagnosticPlanSchema.parse(raw),key=[plan.orgId,plan.userId,plan.runId],run=history.db.prepare('SELECT hash,status FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(...key);
  if(run?.hash!==plan.dataPlanHash||run.status!=='complete'||history.db.prepare("SELECT hash FROM dedicated_mutations WHERE org=? AND user=? AND run=? AND status='pending'").get(...key))throw Error('Diagnostics require a completed exact owned run without uncertain effects');
  const rows=history.db.prepare('SELECT object,id,status FROM dedicated_records WHERE org=? AND user=? AND run=? ORDER BY object').all(...key),references=rows.map(row=>{const value=DiagnosticReferenceSchema.extend({status:z.literal('deleted')}).parse(row);return {object:value.object,id:value.id};});
  if(!references.length||references.length>2||JSON.stringify(references)!==JSON.stringify([...plan.references].sort((a,b)=>a.object.localeCompare(b.object))))throw Error('Deleted reference journal differs from the exact diagnostic review');
  return references;
}

export function prepareDedicatedDiagnostics(execution:unknown,parent:unknown,staticDraft:unknown,history:History){
  const input=DedicatedExecutionSchema.parse(execution),policy=EnvironmentPolicySchema.parse(parent),assets=DedicatedStaticReviewSchema.parse(staticDraft),hash=environmentHash(policy);
  if(policy.mode!=='DEDICATED_QA_ORG'||policy.approval.definitionHash!==hash||input.data.plan.policyHash!==hash||input.ui.plan.policyHash!==hash||assets.plan.policyHash!==hash||assets.approval.hash!==staticPlanHash(assets.plan)||input.data.approval.operator!==policy.approval.operator||input.ui.approval.operator!==policy.approval.operator||input.data.approval.planHash!==dedicatedPlanHash(input.data.plan)||input.ui.approval.hash!==dedicatedUiHash(input.ui.plan)||input.ui.plan.dataPlanHash!==input.data.approval.planHash||input.ui.plan.sourceVersion!==input.spec.version||input.ui.plan.runId!==input.data.plan.runId||input.ui.plan.orgId!==input.data.plan.orgId||input.ui.plan.userId!==input.data.plan.userId||assets.plan.specVersion!==input.spec.version||assets.plan.orgId!==input.data.plan.orgId||assets.plan.userId!==input.data.plan.userId)throw Error('Diagnostic source review bindings differ');
  const rows=history.db.prepare('SELECT object,id FROM dedicated_records WHERE org=? AND user=? AND run=? ORDER BY object').all(input.data.plan.orgId,input.data.plan.userId,input.data.plan.runId),references=z.array(DiagnosticReferenceSchema).min(1).max(2).parse(rows);
  const plan=DiagnosticPlanSchema.parse({purpose:'deleted-owned-ui-dependencies',orgId:input.data.plan.orgId,userId:input.data.plan.userId,runId:input.data.plan.runId,parentPolicyHash:hash,dataPlanHash:input.data.approval.planHash,uiPlanHash:input.ui.approval.hash,specVersion:input.spec.version,staticPlanHash:staticPlanHash(assets.plan),references,recordWrites:false,businessRpc:false,assertions:false,learning:false,maxMs:10000});
  deletedJournalReferences(history,plan);
  return {plan,approval:{operator:'REVIEW_REQUIRED',hash:diagnosticPlanHash(plan),expiresAt:new Date(Date.now()+3600000).toISOString()}};
}

// An independent read-only diagnostic grant does not renew the persisted parent
// policy or any expired factory/UI execution approval. Only a read-only facade
// consumes the temporary effective policy below.
export function authorizeDedicatedDiagnostics(raw:unknown,parent:unknown,identity:EnvironmentIdentity,origin:string,now=Date.now()){
  const review=DiagnosticReviewSchema.parse(raw),policy=EnvironmentPolicySchema.parse(parent);
  if(policy.mode!=='DEDICATED_QA_ORG'||policy.approval.definitionHash!==environmentHash(policy)||review.plan.parentPolicyHash!==environmentHash(policy)||review.plan.orgId!==identity.Id||review.plan.userId!==identity.userId||review.approval.operator==='REVIEW_REQUIRED'||review.approval.operator!==policy.approval.operator||review.approval.hash!==diagnosticPlanHash(review.plan)||Date.parse(review.approval.expiresAt)<=now||Date.parse(review.approval.expiresAt)>now+3600000)throw Error('Exact named read-only diagnostic authorization is missing, expired or mismatched');
  const effective={...policy,approval:{...policy.approval,expiresAt:review.approval.expiresAt}};
  authorizeEnvironment(effective,identity,'dedicated-ui',origin,policy.dedicatedQa?.persona,now);
  authorizeEnvironment(effective,identity,'soql',origin,policy.dedicatedQa?.persona,now);
  return {review,policy:effective};
}
