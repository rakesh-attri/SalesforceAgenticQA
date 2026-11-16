import 'dotenv/config';
import {runCompatibilityReview} from './execution/compatibility-cli.js';
import type { z } from 'zod';
import { Command } from '@langchain/langgraph';
import { loadJson,saveJson } from './core/io.js';
import { History } from './core/history.js';
import { DurableSaver } from './core/checkpoints.js';
import { createPlanningGraph } from './agents/graph.js';
import { StorySchema,OrgSnapshotSchema } from './core/types.js';
import { SalesforceClient } from './salesforce/client.js';
import { discoverTooling } from './salesforce/operations.js';
import { prioritize,CaseSchema,investigate,defect,gaps } from './agents/quality.js';
import { generateTest,WorkflowSchema } from './agents/workflows.js';
import { writeFile,mkdir } from 'node:fs/promises';
import { SemanticKnowledge,SourceSchema } from './knowledge/rag.js';
import { ingestSpec } from './specs/ingest.js';
import { PipelineInputSchema,createSpecPipeline } from './agents/pipeline.js';
import { KnowledgeIndex,KnowledgeSchema } from './knowledge/index.js';
import { demonstrateLearning } from './demos/learning.js';
import { healReviewedWorkflow,HealingSchema } from './agents/healing.js';
import { configuredSandboxRuntime,configuredProbe,RuntimePolicySchema } from './integrations/live-runtime.js';
import { issueSessionReceipt,BrowserIdentitySchema } from './integrations/session-gate.js';
import { configuredChat,configuredEmbeddings,configuredEmbeddingSpace } from './ai/providers.js';
import { ReasoningAgents,ReasoningRoleSchema } from './agents/reasoning.js';
import { discoverOrgIntelligence,intelligenceVersion,IntelligenceSchema } from './agents/org-intelligence.js';
import { planFromOrgIntelligence } from './agents/intelligence-plan.js';
import { indexOrgIntelligence } from './knowledge/org-intelligence.js';
import { SnapshotStore,schemaFingerprint,knowledgeFingerprint } from './knowledge/snapshots.js';
import { prepareBrowserDiscovery } from './agents/browser-readiness.js';
import { EnvironmentDefinitionSchema,environmentHash } from './execution/environment.js';
import { observeProduction,ObservationRequestSchema,verifyObservationSession } from './execution/observation.js';
import { prepareReviewBundle,ReviewBundleSchema,bundleHash,ingestReviewedBundle,authorizeAI,authorizePayload,payloadHash,reuseReviewedKnowledge } from './knowledge/reviewed.js';
import { redactModelValue,environmentSecrets } from './ai/privacy.js';
import { groundedPlanning } from './agents/grounded.js';
import { createHash } from 'node:crypto';
import { IngestionQueue,IngestionPolicySchema } from './knowledge/ingestion-queue.js';
import { discoverDeepIntelligence } from './agents/deep-discovery.js';
import { intelligentSpecPlan } from './agents/spec-intelligence.js';
import { benchmarkRetrieval } from './knowledge/benchmarks.js';
import { exploreFixture } from './agents/fixture-explorer.js';
import { htmlReport } from './agents/evaluation.js';
import { buildComponentGraph } from './agents/component-graph.js';
import { access } from 'node:fs/promises';
import { EnvironmentPolicySchema } from './execution/environment.js';
import { DedicatedExecutionSchema,runDedicatedWorkflow } from './execution/dedicated-pipeline.js';
import { dedicatedReviewPackage } from './execution/dedicated-review.js';
import { createDedicatedSession,verifyDedicatedSession,geminiExplorationChooser,minimizeDedicatedImport,reviewDedicatedUi,dedicatedUiHash,DedicatedSessionError } from './execution/dedicated-browser.js';
import { discoverOrg } from './agents/org-discovery.js';
import { prepareAuthReview } from './execution/dedicated-auth-review.js';
import { diagnoseDedicatedSelectors } from './execution/dedicated-selectors.js';
import { prepareDedicatedDiagnostics,DiagnosticReviewSchema,deletedJournalReferences,diagnosticExecutionSource,selectDiagnosticReferences } from './execution/diagnostic-review.js';
import { auditStaticDependencies } from './execution/dependency-review.js';
import { checkDedicatedReadiness } from './execution/dedicated-readiness.js';
import { claimBridgeUse } from './salesforce/ui-bridge.js';
import { prepareStaticReview,authorizeStaticReview,staticPlanHash } from './execution/dedicated-static.js';
import { dedicatedPlanHash } from './salesforce/dedicated-qa.js';
import { diagnoseUiDependencies } from './execution/dependency-diagnostics.js';
import type { ReadContractCandidate } from './execution/read-contract-evidence.js';
import { prepareReadContractReview } from './execution/read-contract-review.js';
import { BrowserReviewSchema,browserPlanHash,resolveBrowserRecords } from './execution/browser-policy.js';
import { prepareBrowserReview,prepareNativeInitializationReview,browserReviewSummary,BrowserReviewInputSchema } from './execution/browser-review.js';
import {reviewCachedBrowserSources} from './execution/browser-source-review.js';
import {openLiveLightningSession} from './execution/lightning-session.js';
import {createLightningMcp} from './integrations/lightning-mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {LightningReviewInputSchema,prepareLightningArchitecture} from './execution/lightning-review.js';
import {prepareNormalBaseline,importNormalBaseline,compareNormalBaseline} from './execution/lightning-baseline.js';
import { readPrivateSessionState } from './integrations/session-gate.js';
import { probeReviewedBrowser } from './execution/browser-runtime.js';
import { sanitizeBrowserHar,BrowserTraceSchema,compareBrowserTraces } from './execution/browser-trace.js';
import { stat,readFile,realpath } from 'node:fs/promises';
import { relative,resolve,isAbsolute } from 'node:path';
import {previewBrowserDebug} from './execution/browser-debug.js';
import {demonstrateVisualDebug} from './demos/visual-debug.js';
const [mode,file,arg]=process.argv.slice(2);
async function planningKnowledge(history:History) {
  // Legacy entry points stay local until their exact external payload has been reviewed.
  return new KnowledgeIndex(history);
}
async function reviewedKnowledge(history:History,remoteApproved=false) {
  if(process.env.SFQA_EMBEDDING_PROVIDER!=='gemini')throw Error('This reviewed destination requires the Gemini embedding provider');
  const embed=configuredEmbeddings();if(!embed)throw Error('Reviewed semantic flow requires configured embeddings');
  const embeddingSpace=configuredEmbeddingSpace();
  if(process.env.CHROMA_HOST&&!remoteApproved)throw Error('Chroma transmission requires a separate reviewed destination');
  const remote=process.env.CHROMA_HOST?await SemanticKnowledge.connect(process.env.CHROMA_HOST,embed,process.env.CHROMA_TOKEN?{Authorization:`Bearer ${process.env.CHROMA_TOKEN}`} : {},embeddingSpace):undefined;
  return new KnowledgeIndex(history,embed,remote,embeddingSpace);
}
async function main() {
  if(mode==='compatibility-review'){try{console.log(JSON.stringify(await runCompatibilityReview(file)));}catch{console.log(JSON.stringify({status:'compatibility-evidence-or-scope-gate',privateDetailsWithheld:true,permissionsGranted:0}));process.exitCode=1;}return;}
  if(mode==='demo-browser-debug'){console.log(JSON.stringify(await demonstrateVisualDebug(file)));return;}
  if(mode==='browser-debug-preview'){
    try{console.log(JSON.stringify(await previewBrowserDebug(file)));}catch{console.log(JSON.stringify({status:'local-debug-preview-gate',privateDetailsWithheld:true}));process.exitCode=1;}return;
  }
  if(mode==='lightning-review'){
    try{const input=LightningReviewInputSchema.parse(await loadJson(file)),source=await readPrivateSessionState(input.statePath),prepared=prepareLightningArchitecture(await loadJson(input.sourceReview),{runId:input.runId,stateHash:source.hash,view:input.viewPath?await loadJson(input.viewPath):undefined,visualDebug:input.visualDebug});await saveJson('.state/lightning-architecture.review.json',prepared.review);await saveJson('.state/lightning-architecture-summary.json',prepared.summary);console.log(JSON.stringify(prepared.summary));}catch{console.log(JSON.stringify({status:'architecture-source-gate',privateDetailsWithheld:true,approvalActivated:false,recordWrites:0}));process.exitCode=1;}return;
  }
  if(mode==='lightning-baseline-review'||mode==='lightning-baseline-import'||mode==='lightning-baseline-compare'){
    try{
      const path=await realpath(file),inside=await Promise.all(['.auth','.state'].map(async root=>{const rel=relative(await realpath(root),path);return!!rel&&!rel.startsWith('..')&&!isAbsolute(rel);}));
      if(!inside.some(Boolean)||(await stat(path)).size>67108864)throw Error('Private bounded normal capture required');
      const bytes=await readFile(path),review=await loadJson(arg),flag=mode==='lightning-baseline-review'?'--capture':'--receipt',position=process.argv.indexOf(flag);if(position<0)throw Error('Local capture declaration/review required');
      if(mode==='lightning-baseline-review'){const receipt=prepareNormalBaseline(bytes,review,await loadJson(process.argv[position+1]));await saveJson('.state/lightning-normal-baseline.review.json',receipt);console.log(JSON.stringify({status:'normal-baseline-review-prepared',hash:receipt.approval.hash,approvalActivated:false,permissionsGranted:0}));}
      else{const baseline=importNormalBaseline(bytes,review,await loadJson(process.argv[position+1]));await saveJson('.state/lightning-normal-baseline.json',baseline);if(mode==='lightning-baseline-compare'){const tracePosition=process.argv.indexOf('--trace');if(tracePosition<0)throw Error('Controlled trace required');const comparison=compareNormalBaseline(baseline,await loadJson(process.argv[tracePosition+1]));await saveJson('.state/lightning-normal-comparison.json',comparison);console.log(JSON.stringify(comparison));}else console.log(JSON.stringify({status:'normal-baseline-imported',entries:baseline.trace.entries.length,nativeIdentityEvidence:baseline.nativeIdentityEvidence,normalTransport:baseline.normalTransport,renderingEstablished:false,permissionsGranted:0}));}
    }catch{console.log(JSON.stringify({status:'normal-capture-provenance-or-scope-gate',privateDetailsWithheld:true,permissionsGranted:0}));process.exitCode=1;}return;
  }
  if(mode==='lightning-observe'||mode==='lightning-mcp'){
    const history=new History('.state/dedicated-qa.sqlite');let session:Awaited<ReturnType<typeof openLiveLightningSession>>|undefined;
    try{
      const viaPosition=process.argv.indexOf('--via'),via=viaPosition>=0?process.argv[viaPosition+1]:'playwright';if(!['playwright','mcp','compare'].includes(via))throw Error('Unknown observation transport');
      const viewPosition=process.argv.indexOf('--view'),view=viewPosition>=0?await loadJson(process.argv[viewPosition+1]):undefined;
      const normalPosition=process.argv.indexOf('--normal-receipt');if(normalPosition>=0&&mode!=='lightning-observe')throw Error('Normal comparison has no MCP server or action access');
      session=await openLiveLightningSession({review:await loadJson(file),parent:await loadJson('.state/dedicated-qa-policy.json'),history,statePath:arg,view,normalNetworkingReceipt:normalPosition>=0?await loadJson(process.argv[normalPosition+1]):undefined});
      if(mode==='lightning-mcp'){
        const server=createLightningMcp(session);await server.connect(new StdioServerTransport());const active=session;process.once('SIGINT',()=>{void active.close().finally(()=>history.close());});return;
      }
      const settlePosition=process.argv.indexOf('--settle-ms'),settleMs=settlePosition>=0?Number(process.argv[settlePosition+1]):0;
      const transport=via==='mcp'?'mcp':'playwright',navigation=await session.navigate('Account',transport);await session.observeLoading(settleMs);
      const discovery=navigation.nativeDocumentVerified&&navigation.approvedDocument?await session.discover(transport):{status:'native-document-not-proven'},comparison=via==='compare'&&navigation.nativeDocumentVerified?{sameContext:true,mcp:await session.discover('mcp'),normalReference:'not-provided',rootCause:'unresolved'}:undefined,readiness=await session.observe(transport),report=await session.close();await saveJson('.state/lightning-session-latest.json',{navigation,discovery,comparison,readiness,report});
      console.log(JSON.stringify({navigation,discovery,readiness,report:'.state/lightning-session-latest.json',recordWrites:0,learningPublished:false}));
    }catch(error){if(mode==='lightning-mcp')console.error('Managed Lightning session gate failed; private details withheld.');else console.log(JSON.stringify({status:'lightning-session-gate',category:error instanceof DedicatedSessionError?error.code:'identity-build-approval-budget-or-rendering',privateDetailsWithheld:true,recordWrites:0}));process.exitCode=1;}
    finally{if(mode!=='lightning-mcp'||!session){try{if(session)await saveJson('.state/lightning-session-final.json',await session.close());}finally{history.close();}}}return;
  }
  if(mode==='browser-source-review'){
    const history=new History('.state/dedicated-qa.sqlite');
    try{const review=BrowserReviewSchema.parse(await loadJson(file)),report=reviewCachedBrowserSources(history,review,await loadJson(arg));await saveJson('.state/browser-source-review.json',report);console.log(JSON.stringify({status:'local-source-reviewed',inspectedSources:report.inspectedSources,inspectedBytes:report.inspectedBytes,partialSources:report.partialSources,skippedSources:report.skippedSources,blockedDescriptorCount:report.blockedDescriptorCount,matchedCandidates:report.candidates.length,unresolved:report.unresolvedActionHashes.length,newNetworkRequests:0,permissionsGranted:0,causalProof:false}));}catch{console.log(JSON.stringify({status:'source-scope-or-integrity-gate',privateDetailsWithheld:true,newNetworkRequests:0,permissionsGranted:0}));process.exitCode=1;}finally{history.close();}return;
  }
  if(mode==='browser-review'){
    try {
      const input=BrowserReviewInputSchema.parse(await loadJson(file)),source=await readPrivateSessionState(input.statePath),parent=EnvironmentPolicySchema.parse(await loadJson('.state/dedicated-qa-policy.json')),initialization=await loadJson(input.initializationSource);
      const review=prepareBrowserReview({parent,staticSource:await loadJson(input.staticSource),initialization,stateHash:source.hash,runId:input.runId,references:input.references});
      await saveJson('.state/dedicated-browser-base.review.json',review);
      const candidate=prepareNativeInitializationReview(review.plan,initialization,parent.approval.operator);
      await saveJson('.state/dedicated-browser-execution.review.json',candidate);
      console.log(JSON.stringify({approved:false,basePolicyHash:review.approval.hash,policyHash:candidate.approval.hash,nativeExceptionHash:candidate.initializationApprovals[0].approval.hash,serverEffects:'not-established',...browserReviewSummary(candidate.plan)}));
    }catch{console.log(JSON.stringify({approved:false,status:'review-source-unavailable',recordWrites:0,privateDetailsWithheld:true}));process.exitCode=1;}return;
  }
  if(mode==='browser-reference-import'){
    try{const path=await realpath(file),inside=await Promise.all(['.state','.auth'].map(async root=>{const rel=relative(await realpath(root),path);return !!rel&&!rel.startsWith('..')&&!isAbsolute(rel);}));if(!inside.some(Boolean)||(await stat(path)).size>67108864)throw Error('Private bounded reference required');const review=BrowserReviewSchema.parse(await loadJson(arg)),history=new History('.state/dedicated-qa.sqlite');try{const trace=sanitizeBrowserHar(JSON.parse(await readFile(path,'utf8')),review.plan,resolveBrowserRecords(review.plan,history));await saveJson('.state/browser-reference.sanitized.json',trace);console.log(JSON.stringify({status:'sanitized-reference-imported',entries:trace.entries.length,identityVerified:false,permissionsGranted:0,rawValuesRetained:false}));}finally{history.close();}}catch{console.log(JSON.stringify({status:'reference-import-blocked',privateDetailsWithheld:true,permissionsGranted:0}));process.exitCode=1;}return;
  }
  if(mode==='browser-compare'){
    try{const report=compareBrowserTraces(await loadJson(file),await loadJson(arg));await saveJson('.state/browser-comparison.json',report);console.log(JSON.stringify(report));}catch{console.log(JSON.stringify({status:'comparison-source-or-scope-mismatch',rootCause:'unresolved',permissionsGranted:0}));process.exitCode=1;}return;
  }
  if(mode==='browser-probe'){
    const history=new History('.state/dedicated-qa.sqlite');
    try {
      const review=BrowserReviewSchema.parse(await loadJson(file)),parent=await loadJson('.state/dedicated-qa-policy.json'),client=await SalesforceClient.connectReviewedBrowser(parent,review,history);
      const option=(name:string)=>{const position=process.argv.indexOf(name);return position>=0?process.argv[position+1]:undefined;};
      const referencePath=option('--reference'),reference=referencePath?BrowserTraceSchema.parse(await loadJson(referencePath)):undefined,object=option('--object'),transport=option('--transport')??'validated-cache';
      if(object!==undefined&&!['Account','Contact'].includes(object)||!['native-reference','validated-cache'].includes(transport))throw Error('Browser option denied');
      const report=await probeReviewedBrowser({review,parent,history,statePath:arg,apiOrigin:client.apiOrigin,identity:()=>client.identity(),verifyReferences:()=>client.verifyReferences(),reference,object:object as 'Account'|'Contact'|undefined,transport:transport as 'native-reference'|'validated-cache'}),path=`.state/browser-probes/${review.plan.runId}/${report.sessionId}.json`;
      await saveJson(path,report);await saveJson(path.replace('.json','.trace.json'),report.metrics?.trace);
      await saveJson('.state/browser-probe-latest.json',{capturedAt:new Date().toISOString(),status:'observed',policyHash:browserPlanHash(review.plan),path,recordsCreated:0,verifiedLearning:false});
      console.log(JSON.stringify({status:'observed',validation:report.validation,mode:report.mode,pages:report.pages,referenceUnchanged:report.referenceUnchanged,cacheHits:report.metrics?.cacheHits,cacheMisses:report.metrics?.cacheMisses,blocked:report.metrics?.blocked,referenceComparison:report.referenceComparison,recordsCreated:0,recordsDeleted:0,verifiedLearning:false,report:path}));
    }catch(error){const reason=error instanceof DedicatedSessionError?error.code:'browser-policy-or-proof-gate';await saveJson('.state/browser-probe-latest.json',{capturedAt:new Date().toISOString(),status:'blocked',reason,recordsCreated:0,verifiedLearning:false});console.log(JSON.stringify({status:'blocked',reason,privateDetailsWithheld:true,recordsCreated:0}));process.exitCode=1;}finally{history.close();}return;
  }
  if(mode==='dedicated-read-review'){
    const position=process.argv.indexOf('--diagnostic-approval');if(position<0)throw Error('Provide the source --diagnostic-approval file');const approval=DiagnosticReviewSchema.parse(await loadJson(process.argv[position+1])),input=diagnosticExecutionSource(await loadJson(file),approval),root=`artifacts/dedicated-runs/${input.data.plan.runId}`,review=prepareReadContractReview(await loadJson(`${root}/read-contract-observations.json`),await loadJson(`${root}/dependencies.json`),approval);await saveJson('.state/dedicated-read-contract-review.json',review);console.log(JSON.stringify({planHash:review.review.hash,candidates:review.plan.candidates.length,executionEnabled:false,businessRpcAuthorized:false,recordWritesAuthorized:false,status:review.review.status}));return;
  }
  if(mode==='dedicated-resource-audit'){
    const index=process.argv.indexOf('--observed');if(index<0||!process.argv[index+1])throw Error('Provide the exact --observed static source file');const report=auditStaticDependencies(await loadJson(file),await loadJson(arg),await loadJson(process.argv[index+1]),await loadJson('.state/dedicated-qa-policy.json'));await saveJson('.state/dedicated-resource-audit.json',report);console.log(JSON.stringify(report));return;
  }
  if(mode==='dedicated-diagnostic-review'){
    const history=new History('.state/dedicated-qa.sqlite');try{const initialization=process.argv.includes('--initialization'),review=prepareDedicatedDiagnostics(await loadJson(file),await loadJson('.state/dedicated-qa-policy.json'),await loadJson(arg||'.state/dedicated-static-review-20.json'),history,initialization);await saveJson(initialization?'.state/dedicated-initialization-diagnostic.review.json':'.state/dedicated-diagnostic-session.review.json',review);console.log(JSON.stringify({approved:false,purpose:review.plan.purpose,planHash:review.approval.hash,runId:review.plan.runId,recordWrites:false,businessRpc:false,...(initialization?{initialization:review.plan.initialization}:{})}));}finally{history.close();}return;
  }
  if(mode==='dedicated-diagnostic-import'){
    const position=process.argv.indexOf('--diagnostic-approval');if(position<0||!arg)throw Error('Provide the independently approved .auth state and --diagnostic-approval file');const review=DiagnosticReviewSchema.parse(await loadJson(process.argv[position+1])),input=diagnosticExecutionSource(await loadJson(file),review),parent=await loadJson('.state/dedicated-qa-policy.json'),history=new History('.state/dedicated-qa.sqlite');
    try{deletedJournalReferences(history,review.plan);const client=await SalesforceClient.connectDedicatedDiagnostics(parent,review),identity=await client.identity();await client.verifyAbsence();const output=`.auth/diagnostic-${input.data.plan.runId}-${Date.now().toString(36)}-state.json`,minimized=await minimizeDedicatedImport(arg,output,client.policy);await verifyDedicatedSession(minimized.statePath,client.policy,identity,client.apiOrigin);const report={capturedAt:new Date().toISOString(),status:'verified',diagnosticGrant:review.approval.hash,statePath:minimized.statePath,originalUnchanged:true,removed:minimized.removed,recordWrites:0};await saveJson('.state/dedicated-diagnostic-import.json',report);console.log(JSON.stringify(report));}catch(error){await saveJson('.state/dedicated-diagnostic-import.json',{capturedAt:new Date().toISOString(),status:'blocked',diagnosticGrant:review.approval.hash,reason:error instanceof DedicatedSessionError?error.code:'prerequisite-failed',recordWrites:0});throw error;}finally{history.close();}return;
  }
  if(mode==='dedicated-dependencies'&&process.argv.includes('--diagnostic-approval')){
    const position=process.argv.indexOf('--diagnostic-approval'),review=DiagnosticReviewSchema.parse(await loadJson(process.argv[position+1])),parent=await loadJson('.state/dedicated-qa-policy.json'),input=diagnosticExecutionSource(await loadJson(file),review),history=new History('.state/dedicated-qa.sqlite');
    try{const references=deletedJournalReferences(history,review.plan),client=await SalesforceClient.connectDedicatedDiagnostics(parent,review),identity=await client.identity(),absence=await client.verifyAbsence(),session=await verifyDedicatedSession(arg,client.policy,identity,client.apiOrigin),assets=authorizeStaticReview(await loadJson('.state/dedicated-static-approval.json'),client.policy,identity,review.plan.specVersion);
      if(staticPlanHash(assets.plan)!==review.plan.staticPlanHash||Date.parse(assets.approval.expiresAt)>Date.parse(review.approval.expiresAt))throw Error('Static bundle differs from the diagnostic grant');
      const selection=process.argv.indexOf('--object');if(selection>=0&&!process.argv[selection+1])throw Error('Provide Account or Contact after --object');const selected=selectDiagnosticReferences(references,selection>=0?process.argv[selection+1]:undefined);
      const origins=[...new Set(input.ui.plan.workflows.map(w=>w.origin))],documents=selected.map(r=>`${origins[0]}/lightning/r/${r.object}/${r.id}/view`),candidates=new Map<string,{url:string;type:'script'|'stylesheet'}>(),readCandidates:ReadContractCandidate[]=[],appMetadata=review.plan.initialization?await client.selectedAppMetadata():undefined;
      const selectors=review.plan.initialization?input.ui.plan.workflows.filter(workflow=>selected.some(row=>workflow.path.includes(`/lightning/r/${row.object}/`))).map(workflow=>{const reference=selected.find(row=>workflow.path.includes(`/lightning/r/${row.object}/`));if(!reference)throw Error('Reviewed selector object differs from owned diagnostic references');return {object:reference.object,locator:workflow.assertion.locator};}):[];
      const report=await diagnoseUiDependencies({guard:{policy:client.policy,identity,origins,documents,owned:references,expiresAt:review.approval.expiresAt,staticReview:assets},statePath:session.statePath,maxMs:review.plan.maxMs,onStaticCandidate:asset=>candidates.set(`${asset.type}:${asset.url}`,asset),onReadContractCandidate:candidate=>readCandidates.push(candidate),...(review.plan.initialization?{initialization:{scope:review.plan.initialization,selectors}}:{})}),binding={runId:input.data.plan.runId,planHash:review.plan.dataPlanHash,policyHash:review.plan.parentPolicyHash,sourceVersion:review.plan.specVersion},runtimeEvidenceHash=createHash('sha256').update(JSON.stringify(report.runtime)).digest('hex');
      await saveJson(`artifacts/dedicated-runs/${input.data.plan.runId}/dependencies.json`,{...report,binding,absence,diagnosticGrant:review.approval.hash});await saveJson(`artifacts/dedicated-runs/${input.data.plan.runId}/static-observations.json`,{capturedAt:new Date().toISOString(),binding,assets:[...candidates.values()],runtimeEvidenceHash});await saveJson(`artifacts/dedicated-runs/${input.data.plan.runId}/read-contract-observations.json`,{capturedAt:new Date().toISOString(),binding,diagnosticGrant:review.approval.hash,runtimeEvidenceHash,candidates:readCandidates,approvalActivated:false,requestsExecuted:0});
      if(report.initialization)await saveJson(`artifacts/dedicated-runs/${input.data.plan.runId}/initialization.json`,{capturedAt:new Date().toISOString(),binding,diagnosticGrant:review.approval.hash,runtimeEvidenceHash,appMetadata,...report.initialization,appContextMatches:report.initialization.requestShapes.map(shape=>({emptyContext:shape.parameters.contextKind==='empty',exactSelectedAppId:shape.parameters.valueHash===appMetadata?.appIdHash,exactSelectedDeveloperName:shape.parameters.valueHash===appMetadata?.developerNameHash}))});
      await saveJson('.state/dedicated-dependency-check.json',{capturedAt:new Date().toISOString(),status:'observed',runId:input.data.plan.runId,report});console.log(JSON.stringify(report));
    }catch(error){await saveJson('.state/dedicated-dependency-check.json',{capturedAt:new Date().toISOString(),status:'blocked',runId:input.data.plan.runId,reason:error instanceof DedicatedSessionError?error.code:'prerequisite-failed',recordsCreated:0,assertionsExecuted:0,learningPublished:false});throw error;}finally{history.close();}return;
  }
  if(mode==='dedicated-ui-review'){
    const input=DedicatedExecutionSchema.parse(await loadJson(file)),root=`artifacts/dedicated-runs/${input.data.plan.runId}`,evidence=await loadJson(`${root}/selector-evidence.json`),dependency=await access(`${root}/dependencies.json`).then(()=>loadJson(`${root}/dependencies.json`),()=>undefined) as {binding?:unknown}|undefined,diagnosis=diagnoseDedicatedSelectors(evidence,{runId:input.data.plan.runId,planHash:input.data.approval.planHash,policyHash:input.data.plan.policyHash,sourceVersion:input.spec.version},dependency?.binding?dependency:undefined);
    await saveJson(`${root}/ui-gap-review.json`,{capturedAt:new Date().toISOString(),diagnosis,changesExecutionOutcome:false,recordsCreated:0,learningPublished:false});console.log(JSON.stringify(diagnosis));return;
  }
  if(mode==='dedicated-static-review'){
    const policy=EnvironmentPolicySchema.parse(await loadJson('.state/dedicated-qa-policy.json')),input=DedicatedExecutionSchema.parse(await loadJson(arg||'.state/dedicated-qa-execution.json')),client=await SalesforceClient.connect('.state/dedicated-qa-policy.json'),identity=await client.identity(),review=prepareStaticReview(await loadJson(file||'.state/dedicated-static-observed.json'),policy,identity,input.spec.version);
    await saveJson('.state/dedicated-static-review.json',review);console.log(JSON.stringify({approved:false,assets:review.plan.assets.length,additionalOrigins:[...new Set(review.plan.assets.map(a=>new URL(a.url).origin))].filter(o=>!policy.allowedOrigins.includes(o)),businessOriginsChanged:false}));return;
  }
  if(mode==='dedicated-auth-review'){const policy=EnvironmentPolicySchema.parse(await loadJson('.state/dedicated-qa-policy.json')),review=prepareAuthReview(await loadJson(file||'.state/dedicated-auth-origin-review.json'),policy);await saveJson('.state/dedicated-auth-handoff.review.json',review);console.log('Authentication-only exact GET document handoff draft saved locally; no origin enabled.');return;}
  if(mode==='dedicated-review'){
    if(!file)throw Error('Provide a new dedicated run ID');
    const client=await SalesforceClient.connect(),identity=await client.identity(),org=OrgSnapshotSchema.parse(await loadJson('.state/org-snapshot.json'));
    if(org.orgIdentityHash!==createHash('sha256').update(identity.Id).digest('hex'))throw Error('Saved discovery belongs to another org');
    const fresh=await discoverOrg(client,['Account','Contact']);if(schemaFingerprint({...fresh,orgAlias:org.orgAlias,orgIdentityHash:org.orgIdentityHash})!==schemaFingerprint(org))throw Error('Rediscover org before reviewing dedicated authorization');
    const browserOrigin=process.env.SFQA_BROWSER_ORIGIN||client.apiOrigin.replace('.my.salesforce.com','.lightning.force.com'),review=dedicatedReviewPackage({identity,origin:client.apiOrigin,browserOrigin,org,operator:'Rakesh Attri',runId:file});
    await saveJson('.state/dedicated-qa-policy.review.json',review.policyReview);await saveJson('.state/dedicated-qa-execution.review.json',review.executionReview);
    console.log('Exact-org dedicated policy/data/UI review package saved locally; no authorization activated and no records created.');return;
  }
  if(mode==='dedicated-session'||mode==='dedicated-run'||mode==='dedicated-cleanup'||mode==='dedicated-check'||mode==='dedicated-import'||mode==='dedicated-dependencies'){
    const input=DedicatedExecutionSchema.parse(await loadJson(file)),path='.state/dedicated-qa-policy.json',client=await SalesforceClient.connect(path),policy=EnvironmentPolicySchema.parse(await loadJson(path)),history=new History('.state/dedicated-qa.sqlite'),data=client.dedicatedData(history);
    try {
      if(mode==='dedicated-dependencies'){
        try {
        const identity=await client.identity();reviewDedicatedUi(input.ui,policy,identity);if(input.ui.plan.sourceVersion!==input.spec.version||input.ui.plan.dataPlanHash!==input.data.approval.planHash)throw Error('Metadata review differs from the approved run');
        const references=await data.cleanedMetadataReferences(input.data),session=await verifyDedicatedSession(arg||`.auth/${input.data.plan.runId}-state.json`,policy,identity,client.apiOrigin),origins=[...new Set(input.ui.plan.workflows.map(w=>w.origin))],documents=references.map(r=>`${origins[0]}/lightning/r/${r.object}/${r.id}/view`),rawAssets=await access('.state/dedicated-static-approval.json').then(()=>loadJson('.state/dedicated-static-approval.json'),()=>undefined),staticReview=rawAssets?authorizeStaticReview(rawAssets,policy,identity,input.spec.version):undefined;
        const candidates=new Map<string,{url:string;type:'script'|'stylesheet'}>(),report=await diagnoseUiDependencies({guard:{policy,identity,origins,documents,owned:references,expiresAt:policy.approval.expiresAt,staticReview},statePath:session.statePath,maxMs:10000,onStaticCandidate:asset=>candidates.set(`${asset.type}:${asset.url}`,asset)}),binding={runId:input.data.plan.runId,planHash:input.data.approval.planHash,policyHash:input.data.plan.policyHash,sourceVersion:input.spec.version};await saveJson(`artifacts/dedicated-runs/${input.data.plan.runId}/dependencies.json`,{...report,binding});await saveJson(`artifacts/dedicated-runs/${input.data.plan.runId}/static-observations.json`,{capturedAt:new Date().toISOString(),binding,assets:[...candidates.values()],runtimeEvidenceHash:createHash('sha256').update(JSON.stringify(report.runtime)).digest('hex')});await saveJson('.state/dedicated-dependency-check.json',{capturedAt:new Date().toISOString(),status:'observed',runId:input.data.plan.runId,report});console.log(JSON.stringify(report));return;
        }catch(error){await saveJson('.state/dedicated-dependency-check.json',{capturedAt:new Date().toISOString(),status:'blocked',runId:input.data.plan.runId,reason:error instanceof DedicatedSessionError?error.code:'prerequisite-failed',recordsCreated:0,assertionsExecuted:0,learningPublished:false});throw error;}
      }
      if(mode==='dedicated-import'){if(!arg)throw Error('Provide the independently approved state path under .auth');await data.check(input.data,'dedicated-ui');const minimized=await minimizeDedicatedImport(arg,`.auth/${input.data.plan.runId}-minimized-state.json`,policy);await verifyDedicatedSession(minimized.statePath,policy,await client.identity(),client.apiOrigin,input.ui.plan.sessionReceipt);console.log(JSON.stringify({sessionVerified:true,removed:minimized.removed,originalUnchanged:true}));return;}
      if(mode==='dedicated-check'){const report=await checkDedicatedReadiness(input,{data,identity:()=>client.identity(),policy:()=>loadJson(path),discover:()=>discoverOrg(client,['Account','Contact']),apiOrigin:client.apiOrigin});await saveJson('.state/dedicated-readiness.json',report);console.log(JSON.stringify(report));if(report.status==='blocked')process.exitCode=1;return;}
      if(mode==='dedicated-session'){
        await data.check(input.data,'dedicated-ui');const identity=await client.identity();
        if(arg)await verifyDedicatedSession(arg,policy,identity,client.apiOrigin,input.ui.plan.sessionReceipt);
        else {
          const authReview=await access('.state/dedicated-auth-handoff.json').then(()=>loadJson('.state/dedicated-auth-handoff.json'),()=>undefined);
          await createDedicatedSession({policy,identity,apiOrigin:client.apiOrigin,statePath:`.auth/${input.data.plan.runId}-state.json`,receiptPath:input.ui.plan.sessionReceipt,bridge:async()=>{const url=await client.dedicatedBrowserBridge();claimBridgeUse(history,url);return url;},authReview,diagnostic:value=>saveJson('.state/dedicated-session-diagnostic.json',value),originReview:value=>saveJson('.state/dedicated-auth-origin-review.json',value)});
        }
        console.log('Dedicated browser state and identity receipt verified privately.');return;
      }
      if(mode==='dedicated-cleanup'){
        const deleted=await data.recoverCleanup(input.data);data.finish(input.data);const absence=await data.verifyCleanup(input.data),root=`artifacts/dedicated-runs/${input.data.plan.runId}`,recovery={status:'cleanup-verified',runId:input.data.plan.runId,deletedThisAttempt:deleted.length,absence,currentOwnership:data.summary(input.data),changesExecutionOutcome:false,learningPublished:false};
        await saveJson(`${root}/recovery.json`,recovery);
        if(await access(`${root}/report.json`).then(()=>true,()=>false)){const original=await loadJson(`${root}/report.json`) as {runId?:string};if(original.runId===input.data.plan.runId){const updated={...original,recovery};await saveJson(`${root}/report.json`,updated);await writeFile(`${root}/report.html`,htmlReport(updated));}}
        console.log(JSON.stringify(recovery));return;
      }
      let choose;if(input.ui.plan.exploration?.useExternalModel){const chat=configuredChat();if(!chat)throw Error('Approved exploration model is not configured');choose=geminiExplorationChooser(chat);}else if(input.ui.plan.exploration)choose=async(state:{availableActionIds:string[]})=>state.availableActionIds[0];
      const browserPosition=process.argv.indexOf('--browser-policy'),browserReview=browserPosition>=0?BrowserReviewSchema.parse(await loadJson(process.argv[browserPosition+1])):undefined;
      const staticReview=browserReview?undefined:await access('.state/dedicated-static-approval.json').then(()=>loadJson('.state/dedicated-static-approval.json'),()=>undefined);
      const report=await runDedicatedWorkflow(input,{history,knowledge:new KnowledgeIndex(history),data,root:'artifacts/dedicated-runs',apiOrigin:client.apiOrigin,identity:()=>client.identity(),policy:()=>loadJson(path),discover:()=>discoverOrg(client,['Account','Contact']),choose,staticReview,browserReview,ownershipJournal:'.state/dedicated-qa.sqlite',validation:'live-salesforce'});console.log(JSON.stringify({mode:report.mode,status:report.status,created:report.created,cleaned:report.cleaned,learning:report.learning,reportPath:report.reportPath}));if(report.status!=='passed')process.exitCode=1;
    }finally{history.close();}return;
  }
  if(mode==='component-graph'){const graph=buildComponentGraph(IntelligenceSchema.parse(await loadJson(file||'.state/org-intelligence-latest.json')));await saveJson('.state/component-graph.json',graph);console.log(JSON.stringify({nodes:graph.nodes.length,edges:graph.edges.length,unknowns:graph.unknowns.length,networkCalls:0}));return;}
  if(mode==='explore-fixture'){const report=await exploreFixture(await loadJson(file));await saveJson('artifacts/fixture-exploration.json',report);console.log(JSON.stringify({mode:report.mode,actions:report.actions,observations:report.observations.length,transitions:report.transitions.length,blockedRequests:report.blockedRequests,productionSupported:false}));return;}
  if(mode==='intelligent-plan'){
    const spec=await ingestSpec(file),org=OrgSnapshotSchema.parse(await loadJson(arg||'.state/org-snapshot.json')),h=new History();
    const flag=async(name:string)=>{const i=process.argv.indexOf(name);return i>=0?await loadJson(process.argv[i+1]):undefined;};
    try {const index=new KnowledgeIndex(h),permission=process.env.SFQA_KNOWLEDGE_PERMISSION||'authorized-api-reader',scope={org:org.orgIdentityHash??org.orgAlias,permission};index.bindSchema(scope,knowledgeFingerprint(org));
      const exists=await access('.state/reviewed-rag.sqlite').then(()=>true,()=>false);if(exists){const reviewedHistory=new History('.state/reviewed-rag.sqlite');try{await reuseReviewedKnowledge(new KnowledgeIndex(reviewedHistory),index,scope,schemaFingerprint(org),knowledgeFingerprint(org));}finally{reviewedHistory.close();}}
      const review=await flag('--review') as {reviewer:string;sourceVersion:string}|undefined,changes=await flag('--component-changes'),impact=changes?{graph:await flag('--graph')??await loadJson('.state/component-graph.json'),changed:changes}:undefined,report=await intelligentSpecPlan(spec,org,index,h,permission,await flag('--bindings')??[],review,impact),root=`artifacts/spec-intelligence/${spec.id}`;
      await saveJson(`${root}/plan.json`,report);await mkdir(root,{recursive:true});await writeFile(`${root}/report.html`,htmlReport(report));for(const file of report.files)await writeFile(`${root}/${file.id}.spec.ts`,file.code);
      console.log(JSON.stringify({path:`${root}/plan.json`,coverage:report.coverage,generatedFiles:report.files.length,mandatoryRegression:report.mandatoryRegression,execution:'not-executed'}));
    }finally{h.close();}return;
  }
  if(mode==='ai-payload-review') {const payload=redactModelValue(await loadJson(file),environmentSecrets());await saveJson('.state/ai-payload-review.json',{payload,bundleHash:payloadHash(payload),approved:false});console.log('Redacted payload saved locally for named content/destination review; no external requests.');return;}
  if(mode==='environment-review') {
    const observed=await SalesforceClient.reviewIdentity();
    const definition=EnvironmentDefinitionSchema.parse({mode:observed.identity.IsSandbox?'SANDBOX_QA':'PRODUCTION_READ_ONLY_QA',allowedOrgIds:[observed.identity.Id],personas:[{name:'authorized-api-reader',userId:observed.identity.userId}],allowedOrigins:[observed.origin],capabilities:['metadata','soql']});
    await saveJson('.state/environment-review.json',{definition,definitionHash:environmentHash(definition),identity:observed.identity,approved:false});
    console.log('Fresh identity and proposed exact org/persona/origin policy saved locally. Named operator review is required; this command grants no approval.');return;
  }
  if(mode==='production-observe') {
    const request=ObservationRequestSchema.parse(await loadJson(file)),client=await SalesforceClient.connect();
    const result=await observeProduction(request,await loadJson(process.env.SFQA_ENVIRONMENT_POLICY||'.state/environment-policy.json'),await client.identity());
    await saveJson('artifacts/production-observation.json',result);console.log(JSON.stringify(result));if(result.status!=='passed')process.exitCode=1;return;
  }
  if(mode==='production-session-verify') {
    if(!arg)throw Error('Supply an existing reviewed .auth state path; production login is not automated');
    const client=await SalesforceClient.connect();
    await verifyObservationSession(await loadJson(file),await loadJson(process.env.SFQA_ENVIRONMENT_POLICY||'.state/environment-policy.json'),await client.identity(),arg);
    console.log('Read-only session receipt issued after restricted browser identity verification.');return;
  }
  if(mode==='knowledge-review') {
    const intel=IntelligenceSchema.parse(await loadJson('.state/org-intelligence-latest.json')),story=StorySchema.parse(await loadJson(file));
    const objects=(arg||'').split(',').filter(Boolean);
    if(!objects.length)throw Error('Supply exact observed object names to export for review');
    const fieldIndex=process.argv.indexOf('--fields'),fields=fieldIndex>=0?process.argv[fieldIndex+1]?.split(',').filter(Boolean):undefined;
    if(fieldIndex>=0&&!fields?.length)throw Error('Explicit reviewed field names required');
    const bundle=prepareReviewBundle(intel,story,process.env.SFQA_KNOWLEDGE_PERMISSION||'authorized-api-reader',[],objects,fields);
    await saveJson('.state/ai-review-bundle.json',bundle);await saveJson('.state/ai-review-request.json',{bundleHash:bundleHash(bundle),approved:false,requiredDestinations:['gemini-chat','gemini-embeddings']});
    console.log(`Structural metadata review bundle saved locally: ${bundle.facts.length} field facts. No AI or embedding requests performed.`);return;
  }
  if(mode==='knowledge-publish'||mode==='grounded-plan'||mode==='knowledge-benchmark') {
    const bundle=ReviewBundleSchema.parse(await loadJson(file||'.state/ai-review-bundle.json')),review=await loadJson(arg||'.state/ai-review-approval.json');
    authorizeAI(bundle,review,'gemini-embeddings');if(process.env.CHROMA_HOST)authorizeAI(bundle,review,'chroma');
    const h=new History('.state/reviewed-rag.sqlite');try {
      const index=await reviewedKnowledge(h,!!process.env.CHROMA_HOST);
      if(mode==='knowledge-benchmark'){const cases=bundle.facts.slice(0,2).map(f=>({id:f.id,query:`${f.object} ${f.field}`,scope:{org:bundle.org,permission:bundle.permission},relevant:[`${f.id}@${bundle.sourceVersion}`]})),report=await benchmarkRetrieval(index,cases,3);await saveJson(`artifacts/${bundle.story.id}/retrieval-benchmark.json`,report);console.log(JSON.stringify({cases:report.cases.length,mean:report.mean,limitations:report.limitations}));return;}
      if(mode==='knowledge-publish'){
        const setting=(name:string,fallback:number)=>process.env[name]?Number(process.env[name]):fallback;
        const policy=IngestionPolicySchema.parse({batchSize:setting('SFQA_EMBEDDING_BATCH_SIZE',5),maxRequestsPerRun:setting('SFQA_INGEST_REQUESTS_PER_RUN',5),maxRequestsPerDay:setting('SFQA_INGEST_REQUESTS_PER_DAY',30),maxTextsPerDay:setting('SFQA_INGEST_TEXTS_PER_DAY',100),minIntervalMs:setting('SFQA_INGEST_MIN_INTERVAL_MS',1000)});
        const embed=configuredEmbeddings({...process.env,SFQA_GEMINI_RETRIES:'0',SFQA_EMBEDDING_BATCH_SIZE:String(policy.batchSize)})!;
        const queue=new IngestionQueue(h,index,embed,configuredEmbeddingSpace());queue.enqueue(bundle,review);
        if(process.argv.includes('--retry-blocked'))queue.retryBlocked(bundle,review);
        const result=await queue.drain(bundle,review,policy);console.log(JSON.stringify({sourceVersion:bundle.sourceVersion,...result}));if(result.status.some(s=>s.status==='pending'||s.status==='blocked'))process.exitCode=2;return;
      }
      const chat=configuredChat();if(!chat)throw Error('Chat provider not configured');
      const report=await groundedPlanning(bundle,review,index,chat);await saveJson(`artifacts/${bundle.story.id}/grounded-plan.json`,report);
      console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.length,roles:Object.keys(report.advice),evaluation:report.evaluation,executable:false}));
    }finally{h.close();}return;
  }
  if(mode==='org-plan') {const story=StorySchema.parse(await loadJson(file)),intel=IntelligenceSchema.parse(await loadJson(arg||'.state/org-intelligence-latest.json'));await saveJson(`artifacts/${story.id}/org-intelligence-plan.json`,planFromOrgIntelligence(story,intel));console.log(`Draft test/data plan saved for ${story.id}; no network calls or execution.`);return;}
  if(mode==='org-intelligence') {
    const story=StorySchema.parse(await loadJson(file));const client=await SalesforceClient.connect();
    let result=await discoverOrgIntelligence(client,story,undefined,{allowNonSandboxRead:process.argv.includes('--allow-non-sandbox-read')});
    if(process.argv.includes('--deep')){const deep=await discoverDeepIntelligence(client,result);result=deep.intelligence;await saveJson('.state/component-graph.json',deep.graph);console.log(JSON.stringify({dependencyGraph:{nodes:deep.graph.nodes.length,edges:deep.graph.edges.length,unknowns:deep.graph.unknowns.length}}));}
    const version=intelligenceVersion(result),root=`.state/org-intelligence/${version}`;
    await saveJson(`${root}/intelligence.json`,result);await saveJson('.state/org-intelligence-latest.json',result);
    await new SnapshotStore().save(result.snapshot);await saveJson('.state/org-snapshot.json',result.snapshot);
    await saveJson(`artifacts/${story.id}/org-intelligence-plan.json`,planFromOrgIntelligence(story,result));
    await saveJson(`artifacts/${story.id}/browser-readiness.json`,await prepareBrowserDiscovery(result,{origin:process.env.SFQA_BROWSER_ORIGIN,persona:process.env.SFQA_BROWSER_PERSONA,receiptPath:process.env.SFQA_SESSION_RECEIPT}));
    const h=new History();try {if(process.argv.includes('--with-embeddings'))throw Error('Use knowledge-review then knowledge-publish with exact content/destination approval');const reviewerIndex=process.argv.indexOf('--reviewer'),reviewer=reviewerIndex>=0?process.argv[reviewerIndex+1]:undefined;if(reviewerIndex>=0&&(!reviewer||reviewer.startsWith('--')))throw Error('Named metadata reviewer required');const indexed=await indexOrgIntelligence(result,new KnowledgeIndex(h),process.env.SFQA_KNOWLEDGE_PERMISSION||'authorized-api-reader',reviewer);console.log(JSON.stringify({sandboxVerified:result.identity.IsSandbox,catalogObjects:result.catalogCount,describedObjects:result.snapshot.objects.length,fields:result.snapshot.objects.reduce((s,o)=>s+o.fields.length,0),recordTypes:result.snapshot.objects.reduce((s,o)=>s+(o.recordTypeInfos?.length??0),0),sections:result.sections.map(s=>({area:s.area,status:s.status,count:s.records.length})),unknowns:result.unknowns.length,knowledge:indexed,version,planPath:`artifacts/${story.id}/org-intelligence-plan.json`},null,2));}finally{h.close();}return;
  }
  if(mode==='ai-reason'){const source=redactModelValue(await loadJson(arg),environmentSecrets());authorizePayload({role:file,source},await loadJson(process.env.SFQA_AI_PAYLOAD_REVIEW||'.state/ai-payload-approval.json'),['gemini-chat']);const chat=configuredChat();if(!chat)throw Error('Chat provider is not configured');const role=ReasoningRoleSchema.safeParse(file);if(!role.success)throw Error('Unknown reasoning role');const advice=await new ReasoningAgents(chat).advise(role.data,{source});await saveJson(`artifacts/model-advice/${role.data}.json`,advice);console.log('Validated proposed model advice saved locally; human review required.');return;}
  if(mode==='session-verify') {
    const client=await SalesforceClient.connect();if(!(await client.identity()).IsSandbox)throw Error('General session probes are sandbox-only. Production requires the restricted observation path.');
    const policy=RuntimePolicySchema.parse(await loadJson('.state/sandbox-policy.json'));
    for(const origin of policy.allowedOrigins)await client.authorizeCapability('sandbox-ui',origin);
    const raw=await loadJson(file) as {statePath:string;identity:unknown;reviewer:string;receiptPath:string};
    console.log(await issueSessionReceipt({statePath:raw.statePath,identity:BrowserIdentitySchema.parse(raw.identity),reviewer:raw.reviewer,receiptPath:raw.receiptPath,ttlMs:15*60*1000,origins:policy.allowedOrigins,probe:configuredProbe(policy),verifySandbox:()=>client.identity()}));return;
  }
  if(mode==='heal-workflow') {const h=new History();try{const input=HealingSchema.parse(await loadJson(file));await saveJson(`artifacts/healing/${input.runId}/review.json`,await healReviewedWorkflow(input,{history:h,root:`artifacts/healing/${input.runId}/execution`,allowedOrigins:[input.original.origin]}));}finally{h.close();}return;}
  if(mode==='demo-learning'){console.log(JSON.stringify(await demonstrateLearning(),null,2));return;}
  if(mode==='spec-ingest'){await saveJson('artifacts/spec-ingested.json',await ingestSpec(file));console.log('Parsed explicit criteria; executable workflows and expectedText still require review.');return;}
  if(mode==='knowledge-index') {const h=new History();try {await (await planningKnowledge(h)).ingest(KnowledgeSchema.parse(await loadJson(file)));}finally{h.close();}return;}
  if(mode==='spec-run') {
    const raw=await loadJson(file) as Record<string,unknown>;
    const input=PipelineInputSchema.parse({...raw,spec:typeof raw.specPath==='string'?await ingestSpec(raw.specPath):raw.spec}),h=new History(),saver=new DurableSaver('.state/spec-checkpoints.sqlite');
    try {
      const runtime=input.sandbox?configuredSandboxRuntime(h,await SalesforceClient.connect(),await loadJson('.state/sandbox-policy.json')):undefined;
      const observe=input.productionReadOnly?async(request:z.infer<typeof ObservationRequestSchema>)=>{const client=await SalesforceClient.connect();return observeProduction(request,await loadJson(process.env.SFQA_ENVIRONMENT_POLICY||'.state/environment-policy.json'),await client.identity());}:undefined;
      const chat=input.org.source==='fixture'?configuredChat():undefined;
      const result=await createSpecPipeline({history:h,knowledge:await planningKnowledge(h),root:'artifacts/spec-runs',checkpointer:saver,runtime,observe,reasoning:chat?new ReasoningAgents(chat):undefined}).invoke({input},{configurable:{thread_id:input.runId}});
      console.log(result.reportPath);if(result.lifecycle?.status==='failed')process.exitCode=1;else if(result.execution?.exitCode)process.exitCode=result.execution.exitCode;
    }finally{saver.close();h.close();}return;
  }
  if(mode==='rag-index'||mode==='rag-query') {
    const payload=redactModelValue(await loadJson(file),environmentSecrets());authorizePayload({mode,payload},await loadJson(process.env.SFQA_AI_PAYLOAD_REVIEW||'.state/ai-payload-approval.json'),['gemini-embeddings','chroma']);
    const required=(name:string)=>{const v=process.env[name];if(!v) throw Error(`Missing ${name}`);return v;};
    const embed=configuredEmbeddings();if(!embed)throw Error('Embedding provider is not configured');const rag=await SemanticKnowledge.connect(required('CHROMA_HOST'),embed,process.env.CHROMA_TOKEN?{Authorization:`Bearer ${process.env.CHROMA_TOKEN}`} : {});
    if(mode==='rag-index') console.log(JSON.stringify(await rag.ingest(SourceSchema.parse(payload))));
    else {const input=payload as {text:string;scope:{org:string;permission:string;version:string}};await saveJson('artifacts/retrieval.json',await rag.retrieve(input.text,input.scope));}return;
  }
  if(mode==='metadata-read') {if(!file||!arg) throw Error('Expected TYPE and comma-separated component names');await saveJson('.state/metadata-read.json',await (await SalesforceClient.connect()).readMetadata(file,arg.split(',')));return;}
  if(mode==='metadata') {const result=await discoverTooling(await SalesforceClient.connect(),['ApexClass','FlowDefinition','ValidationRule']);await saveJson('.state/tooling.json',result);console.log('Tooling discovery saved locally; partial/denied coverage preserved.');return;}
  if(mode==='graph-start'||mode==='graph-resume') {
    if(!file?.match(/^[a-zA-Z0-9_-]+$/)) throw Error('Thread ID required');
    const saver=new DurableSaver();try {
      const graph=createPlanningGraph(saver,true),config={configurable:{thread_id:file}};
      const result=mode==='graph-start'?await graph.invoke({story:StorySchema.parse(await loadJson('stories/invoice-payment.json')),org:OrgSnapshotSchema.parse(await loadJson('fixtures/org-sample.json'))},config):await graph.invoke(new Command({resume:{approved:true,reviewer:arg??''}}),config);
      await saveJson(`artifacts/graph-${file}.json`,result);console.log('Graph state saved. Plan review does not approve writes.');
    } finally {saver.close();}return;
  }
  if(mode==='generate-fixture') {
    const workflow=WorkflowSchema.parse({id:'generated-payment',criterion:'Fixture changes to Paid',source:'tests/fixture.spec.ts:synthetic-local-application',reviewer:'fixture-maintainer',origin:'http://127.0.0.1:8765',path:'/',steps:[{locator:{by:'role',value:'button',name:'Pay Now'},action:'click'}],assertion:{locator:{by:'testId',value:'status'},text:'Paid'}});
    await mkdir('tests/generated',{recursive:true});await writeFile('tests/generated/workflow.spec.ts',generateTest(workflow,[workflow.origin]));console.log('Generated local fixture test; run npm.cmd test for an actual result.');return;
  }
  if(mode==='investigate') {const input=await loadJson(file) as {testId:string;message:string;evidence:string[];expected:string};await saveJson('artifacts/investigation.json',{investigation:investigate(input),defect:defect(input.testId,input.message,input.evidence,input.expected)});return;}
  if(mode==='risk') {const input=await loadJson(file) as {cases:unknown[];changed:string[];criteria:string[]};const h=new History();try {const cases=input.cases.map(c=>CaseSchema.parse(c));await saveJson('artifacts/selection.json',{selection:prioritize(cases,input.changed,h.results()),gaps:gaps(input.criteria,cases)});}finally{h.close();}return;}
  if(mode==='metrics') {const h=new History();try{console.log(JSON.stringify(h.metrics(),null,2));}finally{h.close();}return;}
  throw Error('Modes: metadata | graph-start THREAD | graph-resume THREAD REVIEWER | generate-fixture | risk FILE | investigate FILE | metrics');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
