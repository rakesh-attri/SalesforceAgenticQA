import type {CompatibilityAnalysis} from '../execution/compatibility-analyzer.js';
import {recommendBrowserPolicy} from '../execution/policy-recommendations.js';
import {fingerprint} from '../execution/browser-policy.js';
import {KnowledgeIndex,type Scope} from '../knowledge/index.js';
import type {ReasoningAgents} from './reasoning.js';

export const compatibilityOwners=['orchestrator','org-discovery','application-explorer','investigator','self-healing','knowledge','learning'] as const;
export function compatibilityAgentEvidence(analysis:CompatibilityAnalysis){return{citation:`compatibility:${analysis.hash}`,scope:analysis.scope,kind:'proposed-browser-compatibility-evidence',suspectedDependencies:analysis.suspectedDependencies,provenCauses:analysis.provenCauses,incompleteEvidence:analysis.incompleteEvidence,requestCounts:{findings:analysis.findings.length,candidates:analysis.suspectedDependencies.length},recommendations:recommendBrowserPolicy(analysis).changes.map(c=>({id:c.id,operation:c.operation,status:c.status,evidence:c.evidence})),owners:[...compatibilityOwners],canApprovePermissions:false,learningEligible:false};}
export async function adviseCompatibility(agents:ReasoningAgents,analysis:CompatibilityAnalysis){return agents.advise('investigator',{[analysis.hash]:compatibilityAgentEvidence(analysis)});}
// A diagnostic observation is not a learned cause/fix. Reuse the existing
// KnowledgeIndex as observed evidence only; existing confirmed-defect/regression
// promotion gates remain the sole path to verified lessons.
export async function indexCompatibility(index:KnowledgeIndex,scope:Scope,analysis:CompatibilityAnalysis){
  if(scope.org!==analysis.scope.org||scope.permission!==analysis.scope.permission)throw Error('Knowledge org/permission differs from compatibility evidence');
  const evidence=compatibilityAgentEvidence(analysis);await index.ingest({id:`compatibility-${analysis.hash}`,version:analysis.hash,org:scope.org,permission:scope.permission,kind:'workflow',status:'observed',text:JSON.stringify(evidence),evidence:[evidence.citation,...analysis.sourceHashes.map(s=>`trace:${s}`)],testIds:[],capturedAt:new Date().toISOString(),schemaVersion:analysis.scope.build});return{status:'observed',verifiedLessonPublished:false,hash:fingerprint(evidence)};
}
