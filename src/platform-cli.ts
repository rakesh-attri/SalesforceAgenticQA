import 'dotenv/config';
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
import { SemanticKnowledge,SourceSchema,httpEmbeddings } from './knowledge/rag.js';
import { ingestSpec } from './specs/ingest.js';
import { PipelineInputSchema,createSpecPipeline } from './agents/pipeline.js';
import { KnowledgeIndex,KnowledgeSchema } from './knowledge/index.js';
import { demonstrateLearning } from './demos/learning.js';
import { healReviewedWorkflow,HealingSchema } from './agents/healing.js';
const [mode,file,arg]=process.argv.slice(2);
async function planningKnowledge(history:History) {
  if(!process.env.SFQA_EMBEDDING_URL)return new KnowledgeIndex(history);
  const embed=httpEmbeddings(process.env.SFQA_EMBEDDING_URL,process.env.SFQA_EMBEDDING_KEY??'',process.env.SFQA_EMBEDDING_MODEL??'');
  const remote=process.env.CHROMA_HOST?await SemanticKnowledge.connect(process.env.CHROMA_HOST,embed,process.env.CHROMA_TOKEN?{Authorization:`Bearer ${process.env.CHROMA_TOKEN}`} : {}):undefined;
  return new KnowledgeIndex(history,embed,remote);
}
async function main() {
  if(mode==='heal-workflow') {const h=new History();try{const input=HealingSchema.parse(await loadJson(file));await saveJson(`artifacts/healing/${input.runId}/review.json`,await healReviewedWorkflow(input,{history:h,root:`artifacts/healing/${input.runId}/execution`,allowedOrigins:[input.original.origin]}));}finally{h.close();}return;}
  if(mode==='demo-learning'){console.log(JSON.stringify(await demonstrateLearning(),null,2));return;}
  if(mode==='spec-ingest'){await saveJson('artifacts/spec-ingested.json',await ingestSpec(file));console.log('Parsed explicit criteria; executable workflows and expectedText still require review.');return;}
  if(mode==='knowledge-index') {const h=new History();try {await (await planningKnowledge(h)).ingest(KnowledgeSchema.parse(await loadJson(file)));}finally{h.close();}return;}
  if(mode==='spec-run') {
    const raw=await loadJson(file) as Record<string,unknown>;
    const input=PipelineInputSchema.parse({...raw,spec:typeof raw.specPath==='string'?await ingestSpec(raw.specPath):raw.spec}),h=new History(),saver=new DurableSaver('.state/spec-checkpoints.sqlite');
    try {const result=await createSpecPipeline({history:h,knowledge:await planningKnowledge(h),root:'artifacts/spec-runs',checkpointer:saver}).invoke({input},{configurable:{thread_id:input.runId}});console.log(result.reportPath);if(result.execution?.exitCode)process.exitCode=result.execution.exitCode;}finally{saver.close();h.close();}return;
  }
  if(mode==='rag-index'||mode==='rag-query') {
    const required=(name:string)=>{const v=process.env[name];if(!v) throw Error(`Missing ${name}`);return v;};
    const rag=await SemanticKnowledge.connect(required('CHROMA_HOST'),httpEmbeddings(required('SFQA_EMBEDDING_URL'),required('SFQA_EMBEDDING_KEY'),required('SFQA_EMBEDDING_MODEL')),process.env.CHROMA_TOKEN?{Authorization:`Bearer ${process.env.CHROMA_TOKEN}`} : {});
    if(mode==='rag-index') console.log(JSON.stringify(await rag.ingest(SourceSchema.parse(await loadJson(file)))));
    else {const input=await loadJson(file) as {text:string;scope:{org:string;permission:string;version:string}};await saveJson('artifacts/retrieval.json',await rag.retrieve(input.text,input.scope));}return;
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
