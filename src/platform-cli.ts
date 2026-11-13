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
const [mode,file,arg]=process.argv.slice(2);
async function main() {
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
