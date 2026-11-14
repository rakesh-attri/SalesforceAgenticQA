import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverOrgIntelligence,selectStoryObjects,intelligenceVersion,type IntelligenceReader } from '../src/agents/org-intelligence.js';
import { planFromOrgIntelligence } from '../src/agents/intelligence-plan.js';
import { StorySchema } from '../src/core/types.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { History } from '../src/core/history.js';
import { indexOrgIntelligence } from '../src/knowledge/org-intelligence.js';
import { proposeDataPlan } from '../src/agents/data-agent.js';
import { prepareBrowserDiscovery } from '../src/agents/browser-readiness.js';
import { createSpecPipeline,PipelineInputSchema } from '../src/agents/pipeline.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const story=StorySchema.parse({id:'S',title:'Create accounts and related contacts',description:'As a sales user I want a contact associated with an account.',objects:[],acceptanceCriteria:[{id:'AC1',text:'The contact references the intended account.'}]});
const catalog=[{name:'Account',label:'Account',labelPlural:'Accounts'},{name:'Contact',label:'Contact',labelPlural:'Contacts'},{name:'User',label:'User',labelPlural:'Users'},{name:'Other__c',label:'Unrelated'}];
function reader(sandbox=true):IntelligenceReader&{calls:string[]} {
  const calls:string[]=[];
  return {apiVersion:'v62.0',calls,async identity(){calls.push('identity');return {Id:'00D000000000001',IsSandbox:sandbox,userId:'005000000000001'};},async get<T>(path:string){
    calls.push(path);
    if(path.endsWith('/sobjects/'))return {sobjects:catalog} as T;
    if(path.endsWith('/Account/describe'))return {name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true},{name:'ParentId',type:'reference',nillable:true,createable:true,referenceTo:['Account'],relationshipName:'Parent',relationshipOrder:null}],recordTypeInfos:[{recordTypeId:'012000000000001',name:'Business',active:true,available:true}],childRelationships:[{childSObject:'Contact',field:'AccountId',relationshipName:'Contacts',cascadeDelete:false}]} as T;
    if(path.includes('/ui-api/'))return {picklistFieldValues:{Industry:{controllerValues:{},values:[{label:'Technology',value:'Technology',validFor:[]}]}}} as T;
    if(path.endsWith('/Contact/describe'))return {name:'Contact',label:'Contact',createable:true,fields:[{name:'LastName',type:'string',nillable:false,createable:true},{name:'AccountId',type:'reference',nillable:true,createable:true,referenceTo:['Account'],relationshipName:'Account'}]} as T;
    const query=decodeURIComponent(path);
    if(query.includes('FROM ValidationRule'))throw Error('private provider payload');
    if(query.includes('FROM FieldPermissions'))return {done:true,records:Array.from({length:200},()=>({Field:'Account.Name',PermissionsRead:true}))} as T;
    return {done:true,records:[]} as T;
  },async readMetadata(){calls.push('readMetadata:CustomObject');return {metadata:{records:[{fullName:'Account'}]}};}};
}
test('story resolver uses catalog evidence, separates actors from objects and bounds ambiguity',()=>{
  const result=selectStoryObjects(story,catalog);assert.deepEqual(result.selected.map(o=>o.name),['Account','Contact']);assert.equal(result.status,'proposed');
  assert.deepEqual(selectStoryObjects({...story,objects:['Imaginary__c']},catalog).unresolved,['Imaginary__c']);
  assert.equal(selectStoryObjects({...story,objects:['User']},catalog).selected[0].name,'User');
  assert.equal(selectStoryObjects(story,catalog,1).omitted.length,1);assert.throws(()=>selectStoryObjects(story,catalog,0));
});
test('reviewed org intelligence reaches the actual spec graph without authorizing execution',async()=>{
  const result=await discoverOrgIntelligence(reader(),story),planned=planFromOrgIntelligence(story,result),history=new History(':memory:'),index=new KnowledgeIndex(history);
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/org-graph-'));
  try {await indexOrgIntelligence(result,index,'QA','fixture-reviewer');
    const input=PipelineInputSchema.parse({runId:'org-graph',spec:{...planned.resolvedStory,source:'fixture:story',version:'1'},org:result.snapshot,orgVersion:snapshotVersion(result.snapshot),permission:'QA',allowedOrigins:['https://approved.example'],mappings:[]});
    const output=await createSpecPipeline({history,knowledge:index,root}).invoke({input});
    assert.ok(output.context.some(d=>d.kind==='org'&&d.id==='org-schema:Account'));assert.deepEqual(output.analysis.data.steps.find(s=>s.object==='Contact')?.dependsOn,['Account']);assert.equal(output.execution,undefined);assert.equal(output.analysis.scenarios[0].status,'blocked');assert.equal(history.results().length,0);
  }finally{history.close();await rm(root,{recursive:true,force:true});}
});
test('read-only intelligence validates identity, keeps record types/relationships and distinguishes denied/truncated sections',async()=>{
  const client=reader(),result=await discoverOrgIntelligence(client,story);
  assert.equal(result.identity.IsSandbox,true);assert.equal(result.snapshot.objects[0].recordTypeInfos?.[0].name,'Business');assert.equal(result.snapshot.objects[0].childRelationships?.[0].field,'AccountId');
  assert.equal(result.sections.find(s=>s.area==='record-type-picklists')?.status,'observed');
  assert.equal(result.sections.find(s=>s.area==='validation-rules')?.status,'unknown');assert.equal(result.sections.find(s=>s.area==='field-permissions')?.status,'partial');
  assert.ok(result.unknowns.some(s=>s.includes('validation-rules coverage is unknown')));
  assert.ok(!JSON.stringify(result).includes('private provider payload'));assert.equal(intelligenceVersion(result).length,64);
  assert.ok(client.calls.every(path=>path==='identity'||path==='readMetadata:CustomObject'||path.startsWith('/services/data/')));assert.equal(client.calls.filter(p=>p.endsWith('/User/describe')).length,0);
});
test('non-sandbox discovery is denied by default and explicit read-only policy never pretends it is a sandbox',async()=>{
  const client=reader(false);await assert.rejects(discoverOrgIntelligence(client,story),/IsSandbox=false/);assert.deepEqual(client.calls,['identity']);
  const result=await discoverOrgIntelligence(reader(false),story,undefined,{allowNonSandboxRead:true});assert.equal(result.identity.IsSandbox,false);assert.ok(result.unknowns.some(s=>s.includes('IsSandbox=false')));
  const browser=await prepareBrowserDiscovery(result);assert.equal(browser.execute,false);assert.equal(browser.status,'blocked');assert.ok(browser.reasons.some(r=>r.includes('IsSandbox=false')));
});
test('live-shaped facts feed draft planner/data relationships and only reviewed knowledge enters retrieval',async()=>{
  const result=await discoverOrgIntelligence(reader(),story),plan=planFromOrgIntelligence(story,result);
  assert.equal(plan.plan.status,'draft');assert.equal(plan.data.approved,false);assert.equal(plan.readiness.executable,false);
  assert.deepEqual(plan.data.steps.find(s=>s.object==='Contact')?.dependsOn,['Account']);assert.deepEqual(plan.data.steps.find(s=>s.object==='Account')?.dependsOn,[]);
  assert.ok(plan.plan.scenarios[0].evidence.some(s=>s.includes('/describe')));assert.equal(plan.plan.scenarios[0].expected,story.acceptanceCriteria[0].text);
  const history=new History(':memory:'),index=new KnowledgeIndex(history);
  try {const org=result.snapshot.orgIdentityHash!;await indexOrgIntelligence(result,index,'QA');assert.equal((await index.retrieve('Account',{org,permission:'QA'})).length,0);
    await indexOrgIntelligence(result,index,'QA','fixture-reviewer');assert.ok((await index.retrieve('Account',{org,permission:'QA'})).length>0);assert.equal((await index.retrieve('Account',{org,permission:'other'})).length,0);assert.equal((await index.retrieve('Account',{org:result.orgAlias,permission:'QA'})).length,0);
    const invalid=proposeDataPlan({...story,objects:['Account','Contact']},result.snapshot,[{object:'Contact',field:'Fabricated__c',parent:'Account',evidence:['story:S']}]);assert.equal(invalid.steps.find(s=>s.object==='Contact')?.status,'blocked');
  }finally{history.close();}
});
