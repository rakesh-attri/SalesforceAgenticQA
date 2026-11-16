import {loadJson,saveJson} from '../core/io.js';
import {History} from '../core/history.js';
import {z} from 'zod';
import {analyzeLightningCompatibility} from './compatibility-analyzer.js';
import {contractsFromBrowserPolicy} from './compatibility-policy-import.js';
import {PlatformContractRegistry} from './platform-contracts.js';
import {writeCompatibilityReport} from './compatibility-report.js';
import {compatibilityAgentEvidence,indexCompatibility} from '../agents/compatibility.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import {BrowserTraceSchema} from './browser-trace.js';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
const Input=z.object({normalReport:z.string(),guardedReport:z.string(),normalPolicy:z.string(),guardedPolicy:z.string(),indexObserved:z.boolean().default(false)}).strict();
async function privateJson(path:string){const root=await realpath('.state'),target=await realpath(path),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(target)).size>2097152)throw Error('Private bounded .state input required');return JSON.parse(await readFile(target,'utf8'));}
async function privateVisual(path:string){const root=await realpath('artifacts/browser-debug'),target=await realpath(path),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(target)).size>131072)throw Error('Bounded local visual manifest required');return loadJson(target);}
export async function runCompatibilityReview(path:string){
  const input=Input.parse(await privateJson(path)),normal=await privateJson(input.normalReport),guarded=await privateJson(input.guardedReport),a=contractsFromBrowserPolicy(await privateJson(input.normalPolicy)),b=contractsFromBrowserPolicy(await privateJson(input.guardedPolicy));
  if(JSON.stringify(a.scope)!==JSON.stringify(b.scope)||normal.policyHash!==(await privateJson(input.normalPolicy)).approval.hash||guarded.policyHash!==(await privateJson(input.guardedPolicy)).approval.hash)throw Error('Comparison profiles differ');
  const history=new History('.state/compatibility.sqlite');
  try{const registry=new PlatformContractRegistry(history);for(const contract of b.contracts)registry.put(contract);
    const analysis=analyzeLightningCompatibility({scope:b.scope,normal:BrowserTraceSchema.parse(normal.metrics.trace),guarded:BrowserTraceSchema.parse(guarded.metrics.trace),contracts:registry.list(b.scope)});
    const visual=async(report:any)=>({manifest:await privateVisual(report.visual.manifest),expectedPolicyHash:report.policyHash,traceHash:report.metrics.trace.sourceHash,consoleCategories:report.consoleCategories??{}});
    const output=await writeCompatibilityReport(analysis,{normal:await visual(normal),guarded:await visual(guarded)});await saveJson('.state/compatibility-agent-evidence.json',compatibilityAgentEvidence(analysis));
    if(input.indexObserved)await indexCompatibility(new KnowledgeIndex(history),{org:b.scope.org,permission:b.scope.permission},analysis);
    return{...output,findings:analysis.findings.length,suspected:analysis.suspectedDependencies.length,registryCandidates:b.contracts.length,incompleteEvidence:analysis.incompleteEvidence,verifiedLessonsPublished:0,newExternalRequests:0};
  }finally{history.close();}
}
