import {z} from 'zod';
import {BrowserTraceSchema,type BrowserTrace} from './browser-trace.js';
import {fingerprint} from './browser-policy.js';
import {CompatibilityScopeSchema,ContractSchema,type PlatformContract} from './compatibility-types.js';

export const CompatibilityInputSchema=z.object({scope:CompatibilityScopeSchema,normal:BrowserTraceSchema,guarded:BrowserTraceSchema,contracts:z.array(ContractSchema).max(500).default([])}).strict();
type Entry=BrowserTrace['entries'][number];
function classify(entry:Entry,contracts:PlatformContract[]){
  if(entry.operationRisk==='high-risk')return'high-risk';if(entry.operationRisk==='possible-mutation'||['PATCH','PUT','DELETE'].includes(entry.method))return'possible-mutation';
  if(entry.route==='static')return'static-resource';if(entry.route==='document')return'navigation';
  if(entry.route==='ui-api'&&entry.method==='GET'&&entry.reason==='exact-approved-record-read')return'documented-api-read';
  if(entry.reason==='explicit-reviewed-behavior'||entry.reason==='existing-scoped-record-read')return'reviewed-initialization';return'unknown';
}
export function analyzeLightningCompatibility(raw:unknown){
  const input=CompatibilityInputSchema.parse(raw),{normal,guarded,scope}=input;
  const actual=(trace:BrowserTrace)=>({org:trace.scope.org,user:trace.scope.user,build:trace.scope.build,app:trace.scope.app,records:trace.scope.records});
  if(fingerprint(actual(normal))!==fingerprint(actual(guarded))||normal.scope.org!==scope.org||normal.scope.user!==scope.user||normal.scope.build!==scope.build||normal.scope.app!==scope.app||fingerprint(normal.scope.records)!==fingerprint(scope.records)||!normal.identityVerified||!guarded.identityVerified||!['operator-live-normal-observation','framework-native-reference'].includes(normal.provenance)||guarded.provenance!=='framework-controlled')throw Error('Authenticated matching org/user/build/app/record traces required');
  if([normal,guarded].some(t=>t.scope.engine&&t.scope.engine!==scope.engine||t.scope.permission&&t.scope.permission!==scope.permission))throw Error('Trace engine/permission differs');
  if(input.contracts.some(c=>fingerprint(c.scope)!==fingerprint(scope)))throw Error('Cross-scope registry input denied');
  const keys=[...new Set([...normal.entries,...guarded.entries].map(e=>e.key))].sort();
  const findings=keys.map(key=>{
    const n=normal.entries.filter(e=>e.key===key),g=guarded.entries.filter(e=>e.key===key),entry=g.find(e=>e.decision==='blocked')??g[0]??n[0],classification=classify(entry,input.contracts),matches=input.contracts.filter(c=>c.operationHash===key||c.operationHash===entry.resourceClassHash||entry.descriptors.includes(c.operationHash));
    const evidence=[...n.map((e,i)=>({trace:normal.sourceHash,index:normal.entries.indexOf(e),key})),...g.map(e=>({trace:guarded.sourceHash,index:guarded.entries.indexOf(e),key}))];
    const errors=[...n,...g].filter(e=>e.status>=400||e.responseStates.includes('ERROR')).length,unknownResponses=[...n,...g].filter(e=>e.route==='aura'&&e.status===200&&!e.responseStates.length).length;
    const blocked=g.some(e=>e.decision==='blocked'),candidate=blocked&&n.length>0;
    const ns=n[0]?.requestSequence,gs=g[0]?.requestSequence;
    return{key,classification,denialReasons:[...new Set(g.filter(e=>e.decision==='blocked').map(e=>e.reason))],normalCount:n.length,guardedCount:g.length,blocked,candidate,necessity:'unproven' as const,duplicates:Math.max(0,n.length-1)+Math.max(0,g.length-1),normalHttpSuccesses:n.filter(e=>e.status>=200&&e.status<300).length,actualErrors:errors,unknownResponses,optional:'unknown' as const,buildDependency:matches.length?'contract-build-bound':'not-established',declaredDependencies:[...new Set(matches.flatMap(c=>c.dependencies))],reviewedVersions:matches.map(c=>({id:c.id,version:c.version,status:c.status})),shapeHashes:[...new Set([...n,...g].flatMap(e=>e.requestShapeHash?[e.requestShapeHash]:[]))],resourceClass:entry.resourceClassHash,requestPosition:ns!==undefined&&gs!==undefined?{normal:ns,guarded:gs,basis:'request-start-sequence' as const}:{basis:'unavailable' as const},evidence,explanation:classification==='high-risk'||classification==='possible-mutation'?'reject-permission-recommendation':candidate?(classification==='static-resource'?'review-missing-build-bound-resource-definition':'review-exact-operation-query-parameters-response-and-effects'):!g.length?'normal-only-necessity-unproven':errors?'observed-error-response':'observed-comparison-only'};
  });
  const sequenceAvailable=[normal,guarded].every(t=>t.entries.length>0&&t.entries.every(e=>e.requestSequence!==undefined)),common=keys.filter(k=>normal.entries.some(e=>e.key===k)&&guarded.entries.some(e=>e.key===k));
  const sequence=(trace:BrowserTrace)=>[...trace.entries].filter(e=>common.includes(e.key)).sort((a,b)=>(a.requestSequence??0)-(b.requestSequence??0)).map(e=>e.key).filter((k,i,a)=>a.indexOf(k)===i);
  const nOrder=sequence(normal),gOrder=sequence(guarded),orderDifferences=sequenceAvailable?common.filter(k=>nOrder.indexOf(k)!==gOrder.indexOf(k)):[];
  const timeline=(trace:BrowserTrace)=>trace.entries.map(e=>({key:e.key,requestSequence:e.requestSequence,elapsedMs:e.elapsedMs,responseElapsedMs:e.responseElapsedMs,decision:e.decision,status:e.status}));
  const summary={version:1,referenceKind:normal.provenance,scope,timeline:{normal:timeline(normal),guarded:timeline(guarded)},sourceHashes:[normal.sourceHash,guarded.sourceHash],findings,sequenceAvailable,orderDifferences,orderIsCausal:false,truncated:normal.truncated||guarded.truncated,incompleteEvidence:[...(!normal.scope.engine||!guarded.scope.engine?['engine-profile-bound-by-sidecar-not-trace']:[]),...(normal.truncated||guarded.truncated?['truncated-trace']:[]),...(!sequenceAvailable?['request-start-order-unavailable']:[]),...(findings.some(f=>f.unknownResponses)?['aura-response-classification-unavailable']:[])],suspectedDependencies:findings.filter(f=>f.candidate).map(f=>f.key),provenCauses:[],permissionsGranted:0,rawTrafficTransmitted:false};return{...summary,hash:fingerprint(summary)};
}
export type CompatibilityAnalysis=ReturnType<typeof analyzeLightningCompatibility>;
