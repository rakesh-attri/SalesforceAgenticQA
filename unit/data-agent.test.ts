import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { proposeDataPlan } from '../src/agents/data-agent.js';
import type { Story,OrgSnapshot } from '../src/core/types.js';
const story:Story={id:'T',title:'Test',description:'Test',objects:['Account','Invoice'],acceptanceCriteria:[{id:'AC1',text:'result'}]};
const org:OrgSnapshot={orgAlias:'fixture',observedAt:'2026-01-01',source:'fixture',objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true}]},{name:'Invoice',label:'Invoice',createable:false,fields:[]}]};
test('data agent never authorizes writes and blocks noncreateable objects',()=>{const plan=proposeDataPlan(story,org);assert.equal(plan.approved,false);assert.equal(plan.steps.find(s=>s.object==='Invoice')?.status,'blocked');});
test('blocked parent blocks descendants regardless of input order',()=>{
  const snapshot:OrgSnapshot={...org,objects:[{name:'Parent',label:'Parent',createable:false,fields:[]},{name:'Child',label:'Child',createable:true,fields:[{name:'ParentId',type:'reference',createable:true,nillable:false,referenceTo:['Parent']}]}]};
  const plan=proposeDataPlan({...story,objects:['Child','Parent','Child']},snapshot);
  assert.deepEqual(plan.steps.map(s=>s.object),['Parent','Child']);
  assert.ok(plan.steps.every(s=>s.status==='blocked'));
});
test('polymorphic references require reviewed target choice',()=>{
  const snapshot:OrgSnapshot={...org,objects:[{name:'Task',label:'Task',createable:true,fields:[{name:'WhoId',type:'reference',createable:true,nillable:false,referenceTo:['Contact','Lead']}]}]};
  assert.equal(proposeDataPlan({...story,objects:['Task']},snapshot).steps[0].status,'blocked');
});
test('cyclic required relationships stay blocked',()=>{
  const snapshot:OrgSnapshot={...org,objects:['A','B'].map((name,i)=>({name,label:name,createable:true,fields:[{name:'ParentId',type:'reference',createable:true,nillable:false,referenceTo:[i?'A':'B']}]}))};
  assert.ok(proposeDataPlan({...story,objects:['A','B']},snapshot).steps.every(s=>s.status==='blocked'));
});
