import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ReadContractCandidateSchema } from './read-contract-evidence.js';
import { DiagnosticReviewSchema,diagnosticPlanHash } from './diagnostic-review.js';
import { LightningRuntimeSchema } from './lightning-evidence.js';
import { DeniedRequestSchema } from './browser-diagnostics.js';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const Binding=z.object({runId:z.string(),planHash:z.string(),policyHash:z.string(),sourceVersion:z.string()}).strict();
// Preparation is local review only, including after a diagnostic grant expires.
// No approval field can make an unsupported request executable.
export function prepareReadContractReview(observation:unknown,dependency:unknown,diagnostic:unknown){
  const review=DiagnosticReviewSchema.parse(diagnostic),source=z.object({binding:Binding,diagnosticGrant:z.string(),runtimeEvidenceHash:z.string(),candidates:z.array(ReadContractCandidateSchema).max(40),approvalActivated:z.literal(false),requestsExecuted:z.literal(0)}).parse(observation),evidence=z.object({binding:Binding,diagnosticGrant:z.string(),runtime:LightningRuntimeSchema,deniedRequests:z.array(DeniedRequestSchema).max(40),recordsCreated:z.literal(0),businessRequestsExecuted:z.literal(0),assertionsExecuted:z.literal(0),learningPublished:z.literal(false)}).parse(dependency);
  const expected={runId:review.plan.runId,planHash:review.plan.dataPlanHash,policyHash:review.plan.parentPolicyHash,sourceVersion:review.plan.specVersion};
  // Hash raw runtime so legacy omitted optional evidence does not change provenance.
  const rawRuntime=(dependency as {runtime:unknown}).runtime;
  if(review.approval.hash!==diagnosticPlanHash(review.plan)||source.diagnosticGrant!==review.approval.hash||evidence.diagnosticGrant!==review.approval.hash||hash(source.binding)!==hash(expected)||hash(evidence.binding)!==hash(expected)||source.runtimeEvidenceHash!==hash(rawRuntime))throw Error('Read-contract review source binding differs');
  const candidates=source.candidates.map(candidate=>{
    const descriptorHash=createHash('sha256').update(candidate.descriptor).digest('hex');
    if(candidate.descriptorHash!==descriptorHash||!evidence.deniedRequests.some(request=>request.route==='aura'&&request.reason==='metadata-only-rpc-denied'&&request.actionHints.some(hint=>hint.descriptorHash===descriptorHash&&hint.kind==='read-like'&&!hint.supportedDescriptor)))throw Error('Read-contract candidate lacks matching blocked request evidence');
    return candidate;
  });
  if(!candidates.length)throw Error('No observed unsupported read-like contract to review');
  const plan={purpose:'unsupported-read-contract-review' as const,orgId:review.plan.orgId,userId:review.plan.userId,...expected,diagnosticGrant:review.approval.hash,runtimeEvidenceHash:source.runtimeEvidenceHash,candidates,requiredReviews:['server-effects-and-response-scope','exact-query-and-parameter-constraints','permitted-app-context-and-persona','independent-contract-source-and-regression-tests'],executionEnabled:false as const,businessRpcAuthorized:false as const,recordWritesAuthorized:false as const};
  return {plan,review:{operator:'REVIEW_REQUIRED',hash:hash(plan),status:'blocked-until-implemented-and-separately-approved' as const},approvalActivated:false as const};
}
