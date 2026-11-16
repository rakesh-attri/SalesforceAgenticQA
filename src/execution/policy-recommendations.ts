import {fingerprint} from './browser-policy.js';
import type {CompatibilityAnalysis} from './compatibility-analyzer.js';

export function recommendBrowserPolicy(analysis:CompatibilityAnalysis){
  const groups=new Map<string,CompatibilityAnalysis['findings']>();
  for(const finding of analysis.findings.filter(f=>f.candidate)){
    const group=finding.resourceClass??fingerprint([finding.classification,finding.key]),items=groups.get(group)??[];items.push(finding);groups.set(group,items);
  }
  const changes=[...groups].map(([group,items])=>{
    const rejected=items.some(f=>['high-risk','possible-mutation'].includes(f.classification));
    return{id:fingerprint([analysis.hash,group]),group,operation:items[0].classification,status:rejected?'rejected-dangerous-or-unsupported':items.some(f=>f.classification==='unknown')?'evidence-required-no-permission-proposal':'review-required',requestKeys:items.map(f=>f.key),mismatch:'normal-observed-guarded-denied',minimality:'one-review-task-per-observed-equivalence-class',proposedRule:items[0].classification==='static-resource'&&items[0].resourceClass?'build-bound-resource-class-review':'exact-operation-shape-source-review',unknownSemantics:items.some(f=>['unknown','reviewed-initialization'].includes(f.classification)),dependencies:[...new Set(items.flatMap(f=>f.declaredDependencies))],evidence:items.flatMap(f=>f.evidence),requiredEvidence:['source-and-effects','exact-shape-values-and-scope','response-contract','dependency-review','regression-reference','named-operator-approval'],executablePatchGenerated:false};
  });
  return{version:1,analysisHash:analysis.hash,scope:analysis.scope,changes,unknownDependencies:true,operator:'REVIEW_REQUIRED',activation:'disabled' as const,permissionsGranted:0,normalSuccessProvesSafety:false};
}
