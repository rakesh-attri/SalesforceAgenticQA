import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from '@langchain/langgraph';
import { History } from '../src/core/history.js';
import { DurableSaver } from '../src/core/checkpoints.js';
import { createPlanningGraph } from '../src/agents/graph.js';
import { StorySchema,OrgSnapshotSchema } from '../src/core/types.js';
import { loadJson } from '../src/core/io.js';
import { authorize,mutationHash,type Mutation } from '../src/salesforce/approval.js';
import { DataExecution } from '../src/agents/data-execution.js';
import { prioritize,gaps,investigate,proposeRepair } from '../src/agents/quality.js';
import { generateTest,explore } from '../src/agents/workflows.js';
const mutation:Mutation={runId:'unit',object:'Account',operation:'create',values:{Name:'synthetic'}};
const approval={orgId:'00D000000000001',reviewer:'human',expiresAt:'2099-01-01T00:00:00Z',hash:mutationHash(mutation),nonFinancialReviewed:true as const};
test('sandbox policy binds payload, expiry, organization and object permissions',()=>{
  assert.equal(authorize(mutation,approval,{Id:approval.orgId,IsSandbox:true},['Account']).object,'Account');
  for(const [m,a,o,allowed] of [[mutation,approval,{Id:approval.orgId,IsSandbox:false},['Account']],[{...mutation,values:{Name:'changed'}},approval,{Id:approval.orgId,IsSandbox:true},['Account']],[mutation,{...approval,expiresAt:'2000-01-01T00:00:00Z'},{Id:approval.orgId,IsSandbox:true},['Account']],[mutation,approval,{Id:approval.orgId,IsSandbox:true},[]]] as const) assert.throws(()=>authorize(m,a,o,[...allowed]));
});
test('durable graph survives saver restart and requires named human resume',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sfqa-graph-'));const path=join(root,'cp.sqlite');
  let saver=new DurableSaver(path);
  try {
    const config={configurable:{thread_id:'restart'}},story=StorySchema.parse(await loadJson('stories/invoice-payment.json')),org=OrgSnapshotSchema.parse(await loadJson('fixtures/org-sample.json'));
    await createPlanningGraph(saver,true).invoke({story,org},config);
    assert.ok((await createPlanningGraph(saver,true).getState(config)).tasks.some(t=>t.interrupts?.length));
    saver.close();saver=new DurableSaver(path);
    const output=await createPlanningGraph(saver,true).invoke(new Command({resume:{approved:true,reviewer:'human'}}),config);
    assert.equal(output.status,'review-required');assert.equal(output.data.approved,false);
  } finally {saver.close();await rm(root,{recursive:true,force:true});}
});
test('history records actual outcomes, rejects duplicate runs and gates verified learning',()=>{
  const h=new History(':memory:');
  try {
    const result={runId:'r',testId:'T',status:'passed',durationMs:1,components:['A'],evidence:['trace:1'],at:new Date().toISOString()};
    h.record(result);assert.throws(()=>h.record(result));
    assert.throws(()=>h.learn({id:'L',testId:'T',reviewer:'human',rootCause:'cause',evidence:['e'],regressionRun:'missing'}));
    h.learn({id:'L',testId:'T',reviewer:'human',rootCause:'cause',evidence:['e'],regressionRun:'r'});
    assert.equal(h.lessons().length,1);assert.equal(h.metrics().passed,1);
  } finally {h.close();}
});
test('data journal suppresses repeat creates and enforces cleanup run ownership',async()=>{
  const h=new History(':memory:');let calls=0;
  const engine=new DataExecution({async mutate(m){calls++;return m.operation==='create'?{id:'001000000000001',success:true}:undefined;}},h);
  try {
    const id=await engine.execute(mutation,approval);assert.equal(await engine.execute(mutation,approval),id);assert.equal(calls,1);
    await assert.rejects(engine.execute({...mutation,operation:'delete',runId:'other',id:String(id)},approval),/not owned/);
    await engine.execute({...mutation,operation:'delete',id:String(id)},approval);assert.equal(calls,2);
  } finally {h.close();}
});
test('uncertain side effects cannot be retried automatically',async()=>{
  const h=new History(':memory:');let calls=0;const e=new DataExecution({async mutate(){calls++;throw Error('connection lost');}},h);
  try {await assert.rejects(e.execute(mutation,approval));await assert.rejects(e.execute(mutation,approval),/Uncertain/);assert.equal(calls,1);}finally{h.close();}
});
test('risk budget preserves mandatory cases and missing criteria stay gaps',()=>{
  const cases=[{id:'A',criteria:['AC1'],components:['Apex'],criticality:5,mandatory:false},{id:'B',criteria:[],components:[],criticality:0,mandatory:true}];
  assert.equal(prioritize(cases,['Apex'],[],0)[0].id,'B');assert.deepEqual(gaps(['AC1','AC2'],cases),['AC2']);
  assert.equal(investigate({message:'ECONNREFUSED',evidence:['trace']}).confidence,'hypothesis');
  assert.throws(()=>proposeRepair({testId:'T',oldLocator:'a',newLocator:'b',originalExpected:'Paid',newExpected:'Unpaid',evidence:['e'],reviewer:'human',rerun:{runId:'r',testId:'T',status:'passed',durationMs:1,components:[],evidence:[],at:new Date().toISOString()}}));
});
test('generation requires reviewed workflow and blocks navigation escape',()=>{
  const workflow={id:'T',criterion:'AC1',source:'fixture:verified',reviewer:'human',origin:'http://127.0.0.1:8765',path:'/',steps:[{locator:{by:'role' as const,value:'button',name:'Pay Now'},action:'click' as const}],assertion:{locator:{by:'testId' as const,value:'status'},text:'Paid'}};
  assert.match(generateTest(workflow,[workflow.origin]),/toHaveText\("Paid"\)/);
  assert.throws(()=>generateTest({...workflow,path:'//evil.example'},[workflow.origin]));
});
test('bounded MCP exploration only navigates and observes',async()=>{
  const calls:string[]=[];const client={async callTool(request:{name:string}){calls.push(request.name);return {content:[{type:'text' as const,text:'snapshot'}]};}};
  const result=await explore(client,{urls:['https://sandbox.example/a','https://sandbox.example/b'],allowedOrigins:['https://sandbox.example'],maxPages:1,maxMs:1000});
  assert.equal(result.evidence.length,1);assert.deepEqual(calls,['browser_navigate','browser_snapshot']);
  await assert.rejects(explore(client,{urls:['https://evil.example'],allowedOrigins:['https://sandbox.example'],maxPages:1,maxMs:1000}));
});
