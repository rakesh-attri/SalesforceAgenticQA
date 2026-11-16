import {z} from 'zod';
import type {History} from '../core/history.js';
import {fingerprint,digest,BrowserReviewSchema,browserPlanHash} from '../execution/browser-policy.js';
import {ComponentGraphSchema} from './component-graph.js';
import {OrgSnapshotSchema} from '../core/types.js';
import {knowledgeFingerprint} from '../knowledge/snapshots.js';
import {SpecSchema} from '../specs/ingest.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const JourneyScopeSchema=z.object({org:z.string().min(1),permission:z.string().min(1),metadataVersion:Hash,graphVersion:Hash}).strict();
export const JourneyEvidenceSchema=z.object({id:Hash,version:Hash,org:z.string().min(1),permission:z.string().min(1),kind:z.enum(['metadata','browser','requirement','reviewed-knowledge']),claims:z.array(z.object({kind:z.enum(['component','locator','outcome','transition','prerequisite','permission']),text:z.string().min(1).max(1000),component:z.string().optional()}).strict()).max(100),sourceHashes:z.array(Hash).min(1).max(100),verification:z.enum(['metadata-observed','rendered-reviewed-view','source-stated','unknown']),validation:z.enum(['live-salesforce','offline-mocked-salesforce','source-only']),review:z.object({reviewer:z.string().trim().min(1),hash:Hash}).strict().optional()}).strict();
export type JourneyEvidence=z.infer<typeof JourneyEvidenceSchema>;
export const journeyEvidenceHash=(raw:unknown)=>{const {review,...source}=JourneyEvidenceSchema.parse(raw);return fingerprint(source);};
export function acquireRequirementWorkflowEvidence(raw:unknown,scope:z.infer<typeof JourneyScopeSchema>){const spec=SpecSchema.parse(raw);return JourneyEvidenceSchema.parse({id:digest(`spec:${spec.source}`),version:fingerprint(spec),org:scope.org,permission:scope.permission,kind:'requirement',claims:spec.acceptanceCriteria.flatMap(ac=>ac.expectedText?[{kind:'outcome',text:ac.expectedText}]:[]),sourceHashes:[digest(`${spec.source}@${spec.version}`),fingerprint(spec)],verification:'source-stated',validation:'source-only'});}
export function acquireMetadataWorkflowEvidence(rawOrg:unknown,rawGraph:unknown,permission:string){
  const org=OrgSnapshotSchema.parse(rawOrg),graph=ComponentGraphSchema.parse(rawGraph),scope={org:org.orgIdentityHash??org.orgAlias,permission,metadataVersion:knowledgeFingerprint(org),graphVersion:graph.version};
  if(graph.org!==scope.org||graph.knowledgeVersion!==scope.metadataVersion)throw Error('Workflow metadata/graph source versions differ');
  const sources=graph.nodes.map(node=>{const related=graph.edges.filter(e=>e.from===node.id||e.to===node.id),version=fingerprint([node,related]);return JourneyEvidenceSchema.parse({id:digest(`component:${node.id}`),version,org:scope.org,permission,kind:'metadata',claims:[{kind:'component',text:node.name,component:node.id}],sourceHashes:node.sources.map(digest),verification:'metadata-observed',validation:org.source==='salesforce-api'?'live-salesforce':'source-only'});});
  return{scope,sources,components:graph.nodes.map(n=>({id:n.id,kind:n.kind,name:n.name,evidence:digest(`component:${n.id}`)})),dependencies:graph.edges.map(e=>({...e,evidence:e.evidence.map(digest)})),unknowns:[...graph.unknowns,'Metadata dependencies do not prove UI transitions or expected business outcomes.']};
}
export function acquireRenderedWorkflowEvidence(history:History,rawReview:unknown,report:any){
  const review=BrowserReviewSchema.parse(rawReview),proofHash=report?.readinessProof?.hash;
  if(review.approval.hash!==browserPlanHash(review.plan)||report.policyHash!==review.approval.hash||report.referenceUnchanged!==true||!proofHash||!history.db.prepare("SELECT name FROM sqlite_master WHERE name='lightning_readiness'").get())throw Error('Journaled independently unchanged rendering proof required');
  const row=history.db.prepare('SELECT payload FROM lightning_readiness WHERE hash=?').get(proofHash);if(!row)throw Error('Rendering proof unavailable');const proof=JSON.parse(String(row.payload));
  if(fingerprint(proof)!==proofHash||proof.profileHash!==review.plan.profileHash||proof.stateHash!==review.plan.sessionStateHash||proof.renderHash!==review.plan.renderContractHash||proof.validation!==report.validation||proof.scopeHash!==fingerprint([review.plan.orgId,review.plan.userId,review.plan.persona,review.plan.parentPolicyHash,review.plan.sourceVersion,review.plan.buildHash,review.plan.appHash]))throw Error('Rendering proof belongs to different scope/source');
  const origin=review.plan.origins.find(o=>new URL(o).hostname.endsWith('.lightning.force.com'));
  return JourneyEvidenceSchema.parse({id:digest(`view:${review.plan.renderContractHash}`),version:proofHash,org:digest(review.plan.orgId),permission:review.plan.persona,kind:'browser',claims:[{kind:'locator',text:`${origin}/lightning/r/Account/{{record:Account}}/view`,component:'SObject:Account'}],sourceHashes:[proofHash,review.approval.hash],verification:'rendered-reviewed-view',validation:proof.validation});
}
export function reviewJourneyEvidence(raw:unknown,reviewer:string){const source=JourneyEvidenceSchema.parse(raw);if(!reviewer.trim()||reviewer.trim()==='REVIEW_REQUIRED')throw Error('Named source review required');return JourneyEvidenceSchema.parse({...source,review:{reviewer:reviewer.trim(),hash:journeyEvidenceHash(source)}});}
