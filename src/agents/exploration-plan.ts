import {z} from 'zod';
import {SpecSchema} from '../specs/ingest.js';
import {ApplicationStudySchema,ApplicationReviewStore,applicationStudyHash} from './application-intelligence.js';
import {FixtureExplorationSchema} from './fixture-explorer.js';
import {fingerprint} from '../execution/browser-policy.js';
import type {History} from '../core/history.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import {ReasoningAgents} from './reasoning.js';
import type {StructuredChat} from '../ai/types.js';
import {authorizePayload} from '../knowledge/reviewed.js';
import {WorkflowModelStore} from './workflow-models.js';
import {acquireRequirementWorkflowEvidence} from './workflow-evidence.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ExplorationObjectiveSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),summary:z.string().min(1).max(1000),studyVersion:Hash,specVersion:z.string(),criteria:z.array(z.string()).min(1).max(100),reviewer:z.string().trim().min(1).refine(s=>s!=='REVIEW_REQUIRED')}).strict();
export const DiscoveryActionSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),ref:z.number().int().nonnegative(),status:z.enum(['reviewed','suggested','rejected']),sources:z.array(z.object({source:Hash,version:Hash}).strict()).min(1),criteria:z.array(z.string()).max(100),evidenceGain:z.number().min(0).max(10),risk:z.number().min(0).max(10),cost:z.number().min(1).max(100),uncertainty:z.number().min(0).max(1),requires:z.array(z.string()).max(30).default([]),idempotent:z.boolean(),expectedState:Hash.optional()}).strict();
export const ExplorationDefinitionSchema=z.object({mode:z.literal('FIXTURE'),runId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),scope:z.object({org:z.string().min(1),permission:z.string().min(1),user:z.string().min(1)}).strict(),objective:ExplorationObjectiveSchema,study:ApplicationStudySchema,spec:SpecSchema,workflow:z.object({id:z.string(),version:Hash}).strict().optional(),fixture:FixtureExplorationSchema,actions:z.array(DiscoveryActionSchema).max(30),checks:z.array(z.object({id:z.string().min(1),criterionId:z.string(),path:z.string(),locator:FixtureExplorationSchema.shape.actions.element.shape.locator,expectedText:z.string().min(1),source:Hash}).strict()).min(1).max(30),engineHash:Hash,mcpVersion:z.string().min(1),budgets:z.object({sessions:z.number().int().min(1).max(5),actions:z.number().int().min(0).max(30),requests:z.number().int().min(1).max(200),navigations:z.number().int().min(1).max(20),totalMs:z.number().int().min(1000).max(180000),sessionMs:z.number().int().min(1000).max(60000)}).strict()}).strict();
export type ExplorationDefinition=z.infer<typeof ExplorationDefinitionSchema>;
export const ExplorationApprovalSchema=z.object({operator:z.string().trim().min(1).refine(s=>s!=='REVIEW_REQUIRED'),definitionHash:Hash,expiresAt:z.string().datetime(),nonce:z.string().uuid()}).strict();
export function explorationHash(raw:unknown){return fingerprint(ExplorationDefinitionSchema.parse(raw));}
export function validateExplorationDefinition(raw:unknown,h:History){
 const d=ExplorationDefinitionSchema.parse(raw);validateExplorationSources(d,h);const s=d.study;
 if(new Set(d.actions.map(a=>a.id)).size!==d.actions.length||new Set(d.actions.map(a=>a.ref)).size!==d.actions.length||new Set(d.checks.map(c=>c.id)).size!==d.checks.length)throw Error('Ambiguous action/check catalog');
 const origin=new URL(d.fixture.origin);if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||d.fixture.paths.some(p=>new URL(p,origin).pathname!==p))throw Error('Only canonical synthetic loopback exploration is executable');
 for(const criterion of d.objective.criteria)if(!d.spec.acceptanceCriteria.some(ac=>ac.id===criterion))throw Error('Unknown exploration requirement');
 for(const a of d.actions){if(!d.fixture.actions[a.ref]||a.criteria.some(c=>!d.objective.criteria.includes(c))||a.sources.some(ref=>!s.sources.some(src=>src.id===ref.source&&src.version===ref.version))||a.requires.some(id=>id===a.id||!d.actions.some(other=>other.id===id)))throw Error('Action differs from current reviewed catalog/source');}
 for(const c of d.checks){const ac=d.spec.acceptanceCriteria.find(ac=>ac.id===c.criterionId),page=s.pages.find(p=>new URL(p.page).pathname===c.path),source=s.sources.find(src=>src.id===c.source);if(!d.objective.criteria.includes(c.criterionId)||!ac?.expectedText||c.expectedText!==ac.expectedText||!d.fixture.paths.includes(c.path)||!page||!source||!source.claims.some(claim=>claim.kind==='outcome'&&claim.text===c.expectedText))throw Error('Observation check changes source requirement/page');}
 return d;
}
export type ExplorationProgress={path:string;stateHash:string;covered:string[];attempted:string[];completed:string[];visited:string[];actionsRemaining:number;remainingMs:number;completeEvidence:boolean;physicalAttempted?:string[];visitedPaths?:string[]};
export async function planExploration(raw:unknown,progress:ExplorationProgress,h:History,index:KnowledgeIndex,candidateRefs?:number[],recommendedIds:string[]=[]){
 const d=validateExplorationDefinition(raw,h);return rankExploration(d,progress,h,index,ref=>d.fixture.actions[ref],candidateRefs,recommendedIds);
}
export async function rankExploration(d:ExplorationContract,progress:ExplorationProgress,h:History,index:KnowledgeIndex,physical:(ref:number)=>{path:string;navigation?:{targetPath:string}},candidateRefs?:number[],recommendedIds:string[]=[]){
 index.assertLocalOnly();const model=d.workflow?new WorkflowModelStore(h).get(d.study.scope,d.workflow.id,d.workflow.version):undefined,knowledge=await index.retrieve(`${d.objective.summary} ${d.objective.criteria.join(' ')}`,d.scope,10),history=knowledge.filter(doc=>doc.kind==='defect'||doc.kind==='lesson'),missing=d.objective.criteria.filter(id=>!progress.covered.includes(id));
 if(!missing.length)return{status:'achieved' as const,selected:undefined,decisions:[],questions:[],knowledge:knowledge.map(k=>k.citation)};
 const decisions=d.actions.map(a=>{const action=physical(a.ref),reasons:string[]=[];if(a.status!=='reviewed')reasons.push('Action has no execution review');if(action.path!==progress.path)reasons.push('Action is not on the current page');if(candidateRefs&&!candidateRefs.includes(a.ref))reasons.push('Browser does not offer this unused reviewed reference');if(progress.attempted.includes(a.id))reasons.push('Action already attempted; no replay');if(progress.physicalAttempted?.includes(fingerprint(action)))reasons.push('Equivalent physical action already attempted');if(action.navigation&&progress.visitedPaths?.includes(action.navigation.targetPath))reasons.push('Navigation target already observed');if(a.requires.some(id=>!progress.completed.includes(id)))reasons.push('Prerequisite action is incomplete');if(a.expectedState&&a.expectedState!==progress.stateHash)reasons.push('Current state differs');if(!progress.completeEvidence)reasons.push('Current evidence is incomplete');if(progress.actionsRemaining<1||progress.remainingMs<a.cost*10)reasons.push('Remaining budget insufficient');
  const downstream=d.actions.filter(other=>other.requires.includes(a.id)),coverage=a.criteria.filter(c=>missing.includes(c)).length,unblocks=downstream.reduce((n,other)=>n+other.criteria.filter(c=>missing.includes(c)).length,0),historyHits=history.filter(doc=>doc.testIds.some(id=>a.criteria.includes(id)||a.id===id||a.criteria.some(c=>d.objective.id+'__'+c===id))),novel=progress.visited.includes(progress.stateHash)?0:1,score=coverage*100+unblocks*50+a.evidenceGain*10+a.risk*5+historyHits.length*30+novel*3-a.cost-a.uncertainty*20+(recommendedIds.includes(a.id)?5:0);
  if(!coverage&&!unblocks&&!a.evidenceGain)reasons.push('No uncovered requirement or evidence gain');return{id:a.id,ref:a.ref,allowed:!reasons.length,score,reasons,explanation:{coverageGain:coverage,unblocks,evidenceGain:a.evidenceGain,risk:a.risk,cost:a.cost,uncertainty:a.uncertainty,historicalCitations:historyHits.map(k=>k.citation),workflowVersion:model?.version,components:model?.steps.filter(step=>step.outcomes.some(o=>a.criteria.includes(o.criterionId))).flatMap(step=>step.components)??[],sources:a.sources}};
 }).sort((a,b)=>Number(b.allowed)-Number(a.allowed)||b.score-a.score||a.id.localeCompare(b.id));
 const selected=decisions.find(d=>d.allowed);return{status:selected?'selected' as const:'blocked' as const,selected,decisions,questions:selected?[]:['Provide reviewed reachable actions/current evidence for the remaining objective.'],knowledge:knowledge.map(k=>k.citation)};
}
export async function recommendExploration(plan:Awaited<ReturnType<typeof planExploration>>,chat:StructuredChat,approval:unknown){
 const payload={criteria:plan.decisions.map(a=>({id:a.id,score:a.score,allowed:a.allowed,citations:a.explanation.sources.map(s=>s.source+'@'+s.version)}))},authorize=()=>{const review=authorizePayload(payload,approval,['gemini-chat']);if(review.operator==='REVIEW_REQUIRED')throw Error('Named exploration payload review required');return review;};authorize();const advice=await new ReasoningAgents(chat).rankDesign(payload,authorize);return{recommendedIds:advice.priorities.filter(p=>p.priority==='high').map(p=>p.scenarioId),questions:advice.questions,permissionsGranted:0};
}

export type ExplorationContract=Omit<ExplorationDefinition,'mode'|'fixture'>&{mode:string};
export function validateExplorationSources(d:ExplorationContract,h:History){
 const s=d.study,store=new ApplicationReviewStore(h),recorded=store.get(s.scope,s.version);
 if(s.version!==applicationStudyHash(s)||fingerprint(recorded)!==fingerprint(s)||store.stale(s).length||d.scope.org!==s.scope.org||d.scope.permission!==s.scope.permission||d.objective.studyVersion!==s.version||d.objective.specVersion!==d.spec.version||s.specVersion!==d.spec.version)throw Error('Exploration objective/current source scope differs');
 const requirements=acquireRequirementWorkflowEvidence(d.spec,s.scope);if(!s.sources.some(source=>source.id===requirements.id&&source.version===requirements.version))throw Error('Specification content differs from source version');
 if(d.workflow){const model=new WorkflowModelStore(h).get(s.scope,d.workflow.id,d.workflow.version);if(!model.review||model.specVersion!==d.spec.version)throw Error('Current exactly reviewed workflow required');}
}
