import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightningFixture } from '../fixtures/lightning-server.js';
import { exploreFixture } from '../src/agents/fixture-explorer.js';
import { intelligentSpecPlan } from '../src/agents/spec-intelligence.js';
import { parseUnstructured } from '../src/specs/ingest.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { executeGenerated } from '../src/execution/runner.js';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {investigateExplorationFailure} from '../src/agents/intelligence.js';
import {demonstrateVisualDebug} from '../src/demos/visual-debug.js';
import {readFile} from 'node:fs/promises';

test('bounded chooser and actual Playwright MCP reuse the fixture context; screenshot milestones support unconfirmed investigation only',async()=>{
 const server=lightningFixture();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,path='/lightning/o/Account',input={mode:'FIXTURE',syntheticOnly:true,origin,reviewer:'fixture-reviewer',source:'fixture:bounded-choice',paths:[path],actions:[{path,action:'fill',locator:{by:'label',value:'Account name'},value:'Synthetic QA'},{path,action:'click',locator:{by:'role',value:'button',name:'Review draft'}}],maxActions:2,maxMs:30000};
 const history=new History(':memory:');try{const report=await exploreFixture(input,{mcpObservation:true,choose:async state=>{assert.ok(!('page' in state));return state.candidateRefs[0];}});assert.equal(report.actions,2);assert.equal(report.mcp.sameContext,true);assert.equal(report.mcp.observationHashes.length,3);assert.ok(report.observations.some(o=>o.elements.some(e=>e.text==='Draft ready')));assert.deepEqual(report.executedActionRefs,[0,1]);
  await assert.rejects(exploreFixture(input,{choose:async()=>999}),/unreviewed/);await assert.rejects(exploreFixture(input,{choose:async()=>0}),/replayed/);
  const visual=await demonstrateVisualDebug();assert.ok(visual.report.manifest);const manifest=JSON.parse(await readFile(visual.report.manifest,'utf8')),scope={org:'fixture-qa',permission:'QA'},args={failure:{testId:'fixture-exploration',message:'Review synthetic transition',expected:'Source-reviewed fixture outcome',evidence:['fixture:state-trace']},exploration:report,visual:{manifest,policyHash:manifest.policyHash,runId:manifest.runId}},proposal=await investigateExplorationFailure(new KnowledgeIndex(history),scope,args);
  assert.equal(proposal.visual.milestones.filter(m=>m.status==='captured').length,3);assert.equal(proposal.causality,'unconfirmed');assert.equal(proposal.repairApproved,false);assert.equal(proposal.verifiedLearningPublished,false);assert.equal(proposal.exploration.changedTransitions,1);await assert.rejects(investigateExplorationFailure(new KnowledgeIndex(history),scope,{...args,visual:{...args.visual,runId:'foreign'}}),/different reviewed/);
 }finally{history.close();await new Promise<void>(r=>server.close(()=>r()));}
});
test('bounded headless exploration observes synthetic Lightning and Experience paths with open-shadow LWC state transitions',async()=>{
  const server=lightningFixture();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`,paths=['/lightning/o/Account','/s/accounts'];
  try {const input={mode:'FIXTURE',syntheticOnly:true,origin,reviewer:'fixture-reviewer',source:'fixture:reviewed-action-plan',paths,actions:paths.flatMap(path=>[{path,action:'fill',locator:{by:'label',value:'Account name'},value:'Synthetic QA'},{path,action:'click',locator:{by:'role',value:'button',name:'Review draft'}}]),maxActions:4};
    const report=await exploreFixture(input);assert.equal(report.actions,4);assert.equal(report.observations.length,6);assert.ok(report.observations.filter(o=>o.elements.some(e=>e.text==='Draft ready')).length===2);assert.ok(report.transitions.some(t=>t.before!==t.after));assert.equal(report.productionSupported,false);
    const bounded=await exploreFixture({...input,maxActions:1});assert.equal(bounded.actions,1);assert.ok(bounded.budgetExhausted);
    await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/lwc-generated-')),history=new History(':memory:');
    try {const spec=parseUnstructured('Given a synthetic Account draft\nWhen reviewed\nThen status text is Draft ready','fixture:observed-LWC','1');spec.acceptanceCriteria[0].expectedText='Draft ready';
      const org=OrgSnapshotSchema.parse({orgAlias:'synthetic-lwc',source:'fixture',observedAt:new Date().toISOString(),objects:[{name:'Account',label:'Account',createable:true,fields:[]}]}),workflow={id:'lwc-draft',criterion:'AC1',reviewer:'fixture-reviewer',source:`fixture:observed-state:${report.observations[0].state}`,origin,path:paths[0],steps:input.actions.filter(a=>a.path===paths[0]).map(({path,...step})=>step),assertion:{locator:{by:'testId',value:'draft-status'},text:'Draft ready'}};
      const plan=await intelligentSpecPlan(spec,org,new KnowledgeIndex(history),history,'QA',[{criterionId:'AC1',workflow,preconditions:['Reviewed synthetic draft; no business records']}],{reviewer:'fixture-reviewer',sourceVersion:'1'});assert.equal(plan.files.length,1);
      const execution=await executeGenerated(root,'lwc-generated',plan.files,60000);assert.equal(execution.exitCode,0);assert.equal(execution.results[0].status,'passed');
    }finally{history.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
    await assert.rejects(exploreFixture({...input,origin:'https://org.my.salesforce.com'}),/loopback/);await assert.rejects(exploreFixture({...input,paths:['//org.my.salesforce.com/']}),/escaped/);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
