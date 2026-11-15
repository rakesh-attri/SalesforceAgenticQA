import {z} from 'zod';
import {BrowserReviewSchema,browserDocument,browserPlanHash,digest,fingerprint} from './browser-policy.js';
import {parseBrowserBuild} from './browser-build.js';
import {sameSalesforceIdentity} from './lightning-identity.js';
import {sanitizeBrowserHar,compareBrowserTraces} from './browser-trace.js';
import {lightningEngineProfile} from './lightning-engine.js';

const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const NormalCaptureDeclarationSchema=z.object({
  transport:z.literal('normal-playwright-without-framework-routing'),headless:z.literal(true),driverVersion:z.string().min(1),capturedAt:z.string().datetime(),captureEvidenceHash:Hash,
}).strict();
export const NormalBaselineReviewSchema=z.object({plan:z.object({version:z.literal(1),harHash:Hash,scopeHash:Hash,nativeDocumentHashes:z.array(Hash).min(1).max(2),capture:NormalCaptureDeclarationSchema}).strict(),approval:z.object({operator:z.string().min(1),hash:Hash,expiresAt:z.string().datetime()}).strict()}).strict();

// No normal-session launcher exists here. An imported HAR cannot authorize
// unknown live calls, and a routed reference cannot masquerade as normal.
export function prepareNormalBaseline(bytes:Uint8Array,rawReview:unknown,declaration:unknown){
  if(bytes.byteLength>67108864)throw Error('Normal capture exceeds the local import bound');
  const review=BrowserReviewSchema.parse(rawReview),capture=NormalCaptureDeclarationSchema.parse(declaration);
  if(review.plan.ownedDataPlanHash||review.approval.hash!==browserPlanHash(review.plan)||capture.driverVersion!==lightningEngineProfile().driverVersion||Date.parse(capture.capturedAt)>Date.now())throw Error('Normal capture source/version mismatch');
  let raw:unknown;try{raw=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw Error('Normal capture JSON invalid; details withheld');}
  const har=z.object({log:z.object({entries:z.array(z.object({request:z.object({url:z.string(),method:z.string()}),response:z.object({status:z.number(),content:z.object({mimeType:z.string().optional(),text:z.string().optional(),encoding:z.string().optional()}).optional()})})).max(10000)})}).parse(raw);
  const proofs:string[]=[];
  for(const entry of har.log.entries){
    if(entry.response.status!==200||!entry.response.content?.mimeType?.includes('text/html'))continue;
    if(entry.request.method!=='GET'||!browserDocument(review.plan,entry.request.url))throw Error('Normal capture contains a document outside the approved observation scope');
    const content=entry.response.content;if(!content.text||content.text.length>2800000||content.encoding&&content.encoding!=='base64')throw Error('Normal native identity document unavailable');
    const body=content.encoding==='base64'?Buffer.from(content.text,'base64').toString('utf8'):content.text,proof=parseBrowserBuild(body);
    if(!sameSalesforceIdentity(proof.orgId,review.plan.orgId)||!sameSalesforceIdentity(proof.userId,review.plan.userId)||proof.buildHash!==review.plan.buildHash||proof.appHash!==review.plan.appHash)throw Error('Normal native document identity/build mismatch');
    if(!proofs.includes(proof.documentHash))proofs.push(proof.documentHash);
  }
  if(!proofs.length||proofs.length>2)throw Error('Exact normal native document evidence required');
  const plan={version:1 as const,harHash:digest(bytes),scopeHash:fingerprint([review.plan.orgId,review.plan.userId,review.plan.persona,review.plan.parentPolicyHash,review.plan.sourceVersion,review.plan.buildHash,review.plan.appHash,review.plan.records]),nativeDocumentHashes:proofs,capture};
  return{plan,approval:{operator:'REVIEW_REQUIRED',hash:fingerprint(plan),expiresAt:new Date(Date.now()+3540000).toISOString()}};
}

export function importNormalBaseline(bytes:Uint8Array,rawReview:unknown,rawReceipt:unknown){
  const review=BrowserReviewSchema.parse(rawReview),receipt=NormalBaselineReviewSchema.parse(rawReceipt),expected=prepareNormalBaseline(bytes,review,receipt.plan.capture);
  if(receipt.approval.operator==='REVIEW_REQUIRED'||receipt.approval.operator!==review.approval.operator||receipt.approval.hash!==fingerprint(receipt.plan)||fingerprint(expected.plan)!==fingerprint(receipt.plan)||Date.parse(receipt.approval.expiresAt)<=Date.now()||Date.parse(receipt.approval.expiresAt)>Date.now()+3600000)throw Error('Exact named normal-capture review required');
  const trace=sanitizeBrowserHar(JSON.parse(Buffer.from(bytes).toString('utf8')),review.plan,review.plan.records);
  return{kind:'operator-reviewed-normal-playwright-import',receiptHash:receipt.approval.hash,scopeHash:receipt.plan.scopeHash,normalTransport:'operator-attested-not-inferred-from-har',nativeIdentityEvidence:'source-backed-import-not-fresh-network-proof',trace,renderingEstablished:false,serverPurityEstablished:false,permissionsGranted:0};
}
export function compareNormalBaseline(baseline:ReturnType<typeof importNormalBaseline>,controlled:unknown){
  if(baseline.kind!=='operator-reviewed-normal-playwright-import')throw Error('Reviewed normal baseline required');
  return{...compareBrowserTraces(baseline.trace,controlled),baselineKind:baseline.kind,captureConfiguration:'operator-attested',fullRenderingEstablished:false,rootCause:'unresolved',permissionsGranted:0};
}
