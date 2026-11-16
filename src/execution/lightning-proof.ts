import {z} from 'zod';
import type {History} from '../core/history.js';
import {BrowserReviewSchema,browserPlanHash,fingerprint,type BrowserReview} from './browser-policy.js';
import {verifyLightningEngine} from './lightning-engine.js';

const Hash=z.string().regex(/^[a-f0-9]{64}$/);
const ProofSchema=z.object({version:z.literal(1),scopeHash:Hash,stateHash:Hash,engineHash:Hash,renderHash:Hash,initializationHash:Hash,visualPolicyHash:Hash.optional(),visualEvidenceHash:Hash.optional(),profileHash:Hash.optional(),operator:z.string().min(1),validation:z.enum(['live-salesforce','offline-mocked-salesforce']),measuredAt:z.string().datetime(),expiresAt:z.string().datetime(),independentReferenceUnchanged:z.literal(true),nativeDocumentVerified:z.literal(true),status:z.literal('rendered-reviewed-view')}).strict();
const scope=(review:BrowserReview)=>fingerprint([review.plan.orgId,review.plan.userId,review.plan.persona,review.plan.parentPolicyHash,review.plan.sourceVersion,review.plan.buildHash,review.plan.appHash]);
const initialization=(review:BrowserReview)=>fingerprint([review.plan.resources,review.plan.contracts,review.plan.recordReadProfile]);

// Local host evidence only. No MCP tool can write this journal or mint a proof.
export function recordLightningReadiness(history:History,raw:unknown,result:{status:string;object:'Account'|'Contact';nativeDocumentVerified:boolean;independentReferenceUnchanged:boolean;validation:'live-salesforce'|'offline-mocked-salesforce';measuredAt:string;visualEvidenceHash?:string;profileVerified?:boolean}){
  const review=BrowserReviewSchema.parse(raw),now=Date.now(),measured=Date.parse(result.measuredAt);if(review.plan.executionProfile&&(!review.plan.profileHash||!result.profileVerified))throw Error('Native profile risk proof required');
  if(review.approval.hash!==browserPlanHash(review.plan)||review.approval.operator==='REVIEW_REQUIRED'||!review.plan.records.some(record=>record.object==='Account'&&record.purpose==='observation-only')||review.plan.ownedDataPlanHash||result.object!=='Account'||result.status!=='rendered-reviewed-view'||!result.nativeDocumentVerified||!result.independentReferenceUnchanged||!review.plan.engineProfileHash||!review.plan.renderContractHash||!Number.isFinite(measured)||measured>now||now-measured>900000||Date.parse(review.approval.expiresAt)<=now)throw Error('Fresh independently verified observation-only Account rendering required');
  verifyLightningEngine(review.plan.engineProfileHash);
  if(review.plan.visualDebug&&!result.visualEvidenceHash)throw Error('Reviewed screenshot evidence required for visual readiness');
  const proof=ProofSchema.parse({version:1,scopeHash:scope(review),stateHash:review.plan.sessionStateHash,engineHash:review.plan.engineProfileHash,renderHash:review.plan.renderContractHash,initializationHash:initialization(review),visualPolicyHash:review.plan.visualDebug?fingerprint(review.plan.visualDebug):undefined,visualEvidenceHash:result.visualEvidenceHash,profileHash:review.plan.profileHash,operator:review.approval.operator,validation:result.validation,measuredAt:result.measuredAt,expiresAt:new Date(Math.min(measured+900000,Date.parse(review.approval.expiresAt))).toISOString(),independentReferenceUnchanged:true,nativeDocumentVerified:true,status:'rendered-reviewed-view'}),hash=fingerprint(proof);
  history.db.exec('CREATE TABLE IF NOT EXISTS lightning_readiness(hash TEXT PRIMARY KEY,payload TEXT NOT NULL)');history.db.prepare('INSERT OR REPLACE INTO lightning_readiness VALUES(?,?)').run(hash,JSON.stringify(proof));
  return{hash,validation:proof.validation,expiresAt:proof.expiresAt,readyForLifecycleReview:true,mutationApprovalGranted:false};
}

export function requireLightningReadiness(history:History,raw:unknown,validation:'live-salesforce'|'offline-mocked-salesforce'|'unclassified'){
  const review=BrowserReviewSchema.parse(raw),key=review.plan.liveReadinessProofHash;
  verifyLightningEngine(review.plan.engineProfileHash);
  if(!review.plan.ownedDataPlanHash||!review.plan.engineProfileHash||!key)throw Error('Managed data lifecycle requires a prior rendered Account proof');
  if(!history.db.prepare("SELECT name FROM sqlite_master WHERE name='lightning_readiness' AND type='table'").get())throw Error('Rendered Account proof is not in this journal');
  const row=history.db.prepare('SELECT payload FROM lightning_readiness WHERE hash=?').get(key);if(!row)throw Error('Rendered Account proof unavailable');
  const proof=ProofSchema.parse(JSON.parse(String(row.payload)));
  if(review.plan.visualDebug&&(proof.visualPolicyHash!==fingerprint(review.plan.visualDebug)||!proof.visualEvidenceHash))throw Error('Reviewed visual evidence/policy differs');
  if(proof.profileHash!==review.plan.profileHash)throw Error('Rendering proof browser profile differs');if(fingerprint(proof)!==key||proof.scopeHash!==scope(review)||proof.stateHash!==review.plan.sessionStateHash||proof.engineHash!==review.plan.engineProfileHash||proof.renderHash!==review.plan.renderContractHash||proof.initializationHash!==initialization(review)||proof.operator!==review.approval.operator||proof.validation!==validation||Date.parse(proof.expiresAt)<=Date.now()||Date.parse(proof.measuredAt)>Date.now())throw Error('Rendered Account proof differs, expired or is not live-verified');
  return{proofHash:key,validation:proof.validation,mutationApprovalGranted:false};
}
