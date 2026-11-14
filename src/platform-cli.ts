import 'dotenv/config';
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
import { configuredChat,configuredEmbeddings } from './ai/providers.js';
import { ReasoningAgents,ReasoningRoleSchema } from './agents/reasoning.js';
import { discoverOrgIntelligence,intelligenceVersion,IntelligenceSchema } from './agents/org-intelligence.js';
import { planFromOrgIntelligence } from './agents/intelligence-plan.js';
import { indexOrgIntelligence } from './knowledge/org-intelligence.js';
import { SnapshotStore } from './knowledge/snapshots.js';
import { prepareBrowserDiscovery } from './agents/browser-readiness.js';
import { EnvironmentDefinitionSchema,environmentHash } from './execution/environment.js';
import { observeProduction,ObservationRequestSchema,verifyObservationSession } from './execution/observation.js';
import { prepareReviewBundle,ReviewBundleSchema,bundleHash,ingestReviewedBundle,authorizeAI,authorizePayload,payloadHash } from './knowledge/reviewed.js';
import { redactModelValue,environmentSecrets } from './ai/privacy.js';
import { groundedPlanning } from './agents/grounded.js';
import { createHash } from 'node:crypto';
const [mode,file,arg]=process.argv.slice(2);
async function planningKnowledge(history:History) {
  // Legacy entry points stay local until their exact external payload has been reviewed.
  return new KnowledgeIndex(history);
}
async function reviewedKnowledge(history:History,remoteApproved=false) {
  if(process.env.SFQA_EMBEDDING_PROVIDER!=='gemini')throw Error('This reviewed destination requires the Gemini embedding provider');
  const embed=configuredEmbeddings();if(!embed)throw Error('Reviewed semantic flow requires configured embeddings');
  const embeddingSpace=createHash('sha256').update(JSON.stringify([process.env.SFQA_EMBEDDING_PROVIDER,process.env.SFQA_EMBEDDING_MODEL||process.env.GEMINI_EMBEDDING_MODEL,process.env.SFQA_EMBEDDING_DIMENSIONS,process.env.SFQA_EMBEDDING_URL])).digest('hex');
  if(process.env.CHROMA_HOST&&!remoteApproved)throw Error('Chroma transmission requires a separate reviewed destination');
  const remote=process.env.CHROMA_HOST?await SemanticKnowledge.connect(process.env.CHROMA_HOST,embed,process.env.CHROMA_TOKEN?{Authorization:`Bearer ${process.env.CHROMA_TOKEN}`} : {},embeddingSpace):undefined;
  return new KnowledgeIndex(history,embed,remote,embeddingSpace);
}
async function main() {
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
  if(mode==='knowledge-publish'||mode==='grounded-plan') {
    const bundle=ReviewBundleSchema.parse(await loadJson(file||'.state/ai-review-bundle.json')),review=await loadJson(arg||'.state/ai-review-approval.json');
    authorizeAI(bundle,review,'gemini-embeddings');if(process.env.CHROMA_HOST)authorizeAI(bundle,review,'chroma');
    const h=new History('.state/reviewed-rag.sqlite');try {
      const index=await reviewedKnowledge(h,!!process.env.CHROMA_HOST);
      if(mode==='knowledge-publish'){console.log(JSON.stringify(await ingestReviewedBundle(bundle,review,index)));return;}
      const chat=configuredChat();if(!chat)throw Error('Chat provider not configured');
      const report=await groundedPlanning(bundle,review,index,chat);await saveJson(`artifacts/${bundle.story.id}/grounded-plan.json`,report);
      console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.length,roles:Object.keys(report.advice),evaluation:report.evaluation,executable:false}));
    }finally{h.close();}return;
  }
  if(mode==='org-plan') {const story=StorySchema.parse(await loadJson(file)),intel=IntelligenceSchema.parse(await loadJson(arg||'.state/org-intelligence-latest.json'));await saveJson(`artifacts/${story.id}/org-intelligence-plan.json`,planFromOrgIntelligence(story,intel));console.log(`Draft test/data plan saved for ${story.id}; no network calls or execution.`);return;}
  if(mode==='org-intelligence') {
    const story=StorySchema.parse(await loadJson(file));const client=await SalesforceClient.connect();
    const result=await discoverOrgIntelligence(client,story,undefined,{allowNonSandboxRead:process.argv.includes('--allow-non-sandbox-read')}),version=intelligenceVersion(result),root=`.state/org-intelligence/${version}`;
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
