import { createHash } from 'node:crypto';
import { z } from 'zod';
import { History } from '../core/history.js';
import { WorkflowSchema,generateTest } from './workflows.js';
import { executeGenerated } from '../execution/runner.js';
import { readFile } from 'node:fs/promises';
export function workflowHash(value:unknown) {return createHash('sha256').update(JSON.stringify(WorkflowSchema.parse(value))).digest('hex');}
export const HealingSchema=z.object({original:WorkflowSchema,originalHash:z.string(),target:z.union([z.literal('assertion'),z.number().int().nonnegative()]),locator:WorkflowSchema.shape.assertion.shape.locator,reviewer:z.string().trim().min(1),failureRun:z.string().min(1),runId:z.string().regex(/^[A-Za-z0-9_-]+$/),evidence:z.array(z.string().min(1)).min(1)});
export function locatorOnlyCandidate(original:unknown,hash:string,target:'assertion'|number,locator:unknown){
 const source=WorkflowSchema.parse(original);if(workflowHash(source)!==hash)throw Error('Repair review targets stale workflow');const replacement=WorkflowSchema.shape.assertion.shape.locator.parse(locator),candidate=structuredClone(source);
 if(target==='assertion')candidate.assertion.locator=replacement;else{if(!candidate.steps[target])throw Error('Repair step not found');candidate.steps[target].locator=replacement;}
 if(workflowHash(candidate)===hash)throw Error('No locator change proposed');if(candidate.assertion.text!==source.assertion.text)throw Error('Assertion intent changed');return candidate;
}
export async function healReviewedWorkflow(input:z.input<typeof HealingSchema>,services:{history:History;root:string;allowedOrigins:string[];guard?:Parameters<typeof generateTest>[2];validation?:'offline-mocked-salesforce';prepareCandidate?:(candidate:z.infer<typeof WorkflowSchema>)=>Promise<void>}) {
  const review=HealingSchema.parse(input);
  if(review.originalHash!==workflowHash(review.original))throw Error('Repair review targets stale workflow');
  const failure=services.history.results().find(r=>r.runId===review.failureRun&&r.testId===review.original.id&&r.status==='failed');
  if(!failure||!failure.evidence.some(e=>review.evidence.includes(e)))throw Error('Repair requires captured failing execution evidence');
  const source=failure.components.find(p=>p.endsWith('.spec.ts'));
  if(!source||await readFile(source,'utf8')!==generateTest(review.original,services.allowedOrigins,services.guard))throw Error('Repair original does not match executed failing source');
  if(!services.allowedOrigins.length||services.allowedOrigins.some(o=>!['127.0.0.1','localhost','[::1]'].includes(new URL(o).hostname)))throw Error('Automated repair reruns currently fixture-only');
  const candidate=locatorOnlyCandidate(review.original,review.originalHash,review.target,review.locator);
  // A typed locator-only transformation preserves actions, values, criteria and expected outcomes.
  if(candidate.assertion.text!==review.original.assertion.text)throw Error('Assertion intent changed');
  await services.prepareCandidate?.(candidate);
  const execution=await executeGenerated(services.root,review.runId,[{id:candidate.id,code:generateTest(candidate,services.allowedOrigins,services.guard)}],120000,services.validation?{validation:services.validation}:undefined);
  for(const result of execution.results)services.history.record(result);
  if(execution.exitCode!==0||execution.results.some(r=>r.status!=='passed'))throw Error('Candidate did not pass unchanged assertions; repair not accepted');
  return {status:'validated-candidate' as const,candidate,originalHash:review.originalHash,candidateHash:workflowHash(candidate),reviewer:review.reviewer,evidence:[...review.evidence,...execution.results.flatMap(r=>r.evidence)],execution};
}
