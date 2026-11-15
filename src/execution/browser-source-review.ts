import type {History} from '../core/history.js';
import {BrowserReviewSchema,browserPlanHash,digest,fingerprint,type BrowserReview} from './browser-policy.js';
import {BrowserTraceSchema,browserTraceScope} from './browser-trace.js';
import {hasDedicatedReadDescriptor} from './dedicated-browser.js';

const limits={sources:6,perSourceBytes:2000000,totalBytes:8000000} as const;
type CachedSource={hash:string;body:Uint8Array;mime:string};

// Literal correlation is not an implementation, invocation or effects proof.
// Complete cached bytes are hashed, but at most a bounded prefix is inspected.
// This local report never grants execution or sends source text to a model.
export function correlateBrowserSources(rawReview:unknown,rawTrace:unknown,sources:CachedSource[]){
 const review=BrowserReviewSchema.parse(rawReview),trace=BrowserTraceSchema.parse(rawTrace);
 if(review.approval.hash!==browserPlanHash(review.plan)||review.plan.ownedDataPlanHash||fingerprint(trace.scope)!==fingerprint(browserTraceScope(review.plan,review.plan.records))||!trace.identityVerified||!['framework-controlled','framework-native-reference'].includes(trace.provenance))throw Error('Local source review requires exact verified observation scope');
 if(sources.length>256||sources.reduce((sum,source)=>sum+source.body.byteLength,0)>134217728)throw Error('Cached source inventory exceeds bounded retention');
 const wanted=new Set(trace.entries.filter(entry=>entry.decision==='blocked').flatMap(entry=>entry.descriptors)),mapped=new Map<string,{descriptor:string;sourceHashes:string[];prefixHashes:string[];existingValidatorDescriptor:boolean}>();
 let inspectedSources=0,inspectedBytes=0,partialSources=0,skippedSources=0;
 for(const source of [...sources].sort((a,b)=>b.body.byteLength-a.body.byteLength)){
  if(!/^(?:application|text)\/(?:javascript|x-javascript)(?:;|$)/i.test(source.mime))continue;
  const body=Buffer.from(source.body);if(body.length>review.plan.budgets.maxResourceBytes||digest(body)!==source.hash)throw Error('Cached source integrity/size mismatch');
  const prefix=body.subarray(0,limits.perSourceBytes);
  if(inspectedSources>=limits.sources||inspectedBytes+prefix.length>limits.totalBytes){skippedSources++;continue;}
  inspectedSources++;inspectedBytes+=prefix.length;if(prefix.length<body.length)partialSources++;
  const text=prefix.toString('utf8').replaceAll('\\/','/');
  for(const match of text.matchAll(/(?:aura|serviceComponent):\/\/[A-Za-z][A-Za-z0-9_.]{0,350}\/ACTION\$[A-Za-z][A-Za-z0-9_]{0,100}(?![A-Za-z0-9_])/g)){
   const descriptor=match[0],hash=digest(descriptor);if(!wanted.has(hash))continue;
   const prior=mapped.get(hash)??{descriptor,sourceHashes:[],prefixHashes:[],existingValidatorDescriptor:hasDedicatedReadDescriptor(descriptor)};
   prior.sourceHashes=[...new Set([...prior.sourceHashes,source.hash])];prior.prefixHashes=[...new Set([...prior.prefixHashes,digest(prefix)])];mapped.set(hash,prior);
  }
 }
 return{kind:'local-public-code-literal-correlation',policyHash:browserPlanHash(review.plan),traceHash:fingerprint(trace),limits,inspectedSources,inspectedBytes,partialSources,skippedSources,blockedDescriptorCount:wanted.size,
  candidates:[...mapped].map(([actionHash,evidence])=>({actionHash,...evidence,parameterShapeEstablished:false,serverEffects:'unknown',responseContract:'unknown',review:'required',executionGranted:false})),
  unresolvedActionHashes:[...wanted].filter(hash=>!mapped.has(hash)),newNetworkRequests:0,externalAIRequests:0,permissionsGranted:0,causalProof:false};
}

export function reviewCachedBrowserSources(history:History,review:BrowserReview,trace:unknown){
 const namespace=digest(JSON.stringify([review.plan.orgId,review.plan.userId,review.plan.buildHash,browserPlanHash(review.plan)]));
 const present=history.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_resource_cache'").get();
 if(!present)throw Error('No reviewed cached source evidence');
 const sizes=history.db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(body)),0) AS bytes FROM browser_resource_cache WHERE namespace=?').get(namespace);
 if(Number(sizes?.count)>256||Number(sizes?.bytes)>134217728)throw Error('Cached source inventory exceeds bounded retention');
 const rows=history.db.prepare('SELECT hash,body,mime FROM browser_resource_cache WHERE namespace=?').all(namespace);
 return correlateBrowserSources(review,trace,rows.map(row=>({hash:String(row.hash),body:row.body as Uint8Array,mime:String(row.mime)})));
}
