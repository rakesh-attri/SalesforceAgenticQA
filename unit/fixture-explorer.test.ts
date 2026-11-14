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
