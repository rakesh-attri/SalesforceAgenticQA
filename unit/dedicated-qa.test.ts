import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { authorizeEnvironment,environmentHash,EnvironmentDefinitionSchema } from '../src/execution/environment.js';
import { mutationHash,type Mutation } from '../src/salesforce/approval.js';
import { SalesforceClient } from '../src/salesforce/client.js';
import { allowDedicatedRequest,reviewDedicatedUi,dedicatedUiHash } from '../src/execution/dedicated-browser.js';
import { proposeDedicatedPlan,dedicatedPlanHash } from '../src/salesforce/dedicated-qa.js';
test('dedicated mode requires named exact org/user policy and never leaks into normal Production/sandbox modes',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try {
    assert.equal(authorizeEnvironment(f.policy,f.identity,'dedicated-data',f.origin).mode,'DEDICATED_QA_ORG');
    for(const identity of [{...f.identity,Id:'00D000000000002'},{...f.identity,userId:'005000000000002'}])assert.throws(()=>authorizeEnvironment(f.policy,identity,'dedicated-data',f.origin));
    for(const mode of ['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA'] as const){const p={...f.policy,mode};p.approval={...p.approval,definitionHash:environmentHash(p)};assert.throws(()=>authorizeEnvironment(p,{...f.identity,IsSandbox:mode==='SANDBOX_QA'},'dedicated-data',f.origin),/cannot inherit/);}
    const missing={...f.policy,dedicatedQa:undefined};missing.approval={...missing.approval,definitionHash:environmentHash(missing)};assert.throws(()=>authorizeEnvironment(missing,f.identity,'dedicated-data',f.origin));
    assert.throws(()=>authorizeEnvironment({...f.policy,approval:{...f.policy.approval,operator:''}},f.identity,'metadata',f.origin));
    const client:SalesforceClient=Reflect.construct(SalesforceClient,[f.origin,'mock-token','v62.0']);Reflect.set(client,'environment',{policy:{...f.policy,mode:'PRODUCTION_READ_ONLY_QA'},identity:f.identity});assert.throws(()=>client.dedicatedData(h),/explicitly connected/);await assert.rejects(client.dedicatedBrowserBridge(),/explicit dedicated/);
  }finally{h.close();}
});
test('dedicated factory creates deterministic Account/Contact, independently verifies and cleans only its two owned records',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),run=f.input.data;try {
    const outsider='003999999999999';f.records.set(outsider,{Id:outsider,object:'Contact',CreatedById:f.identity.userId,Description:'not-this-run',LastName:'Other'});
    await f.data.open(run,f.org);const created=await f.data.setup(run);assert.equal(created.length,2);const contact=f.records.get(created[1].id)!;assert.equal(contact.AccountId,created[0].id);assert.equal(contact.Description,run.plan.marker);assert.ok(f.queries.some(q=>q.includes('CreatedById')));
    const replay:Mutation={runId:run.plan.runId,object:'Account',operation:'create',values:{...run.plan.creates.Account}};assert.equal(await f.data.execute(run,replay,f.data.approval(run,replay)),created[0].id);assert.equal(f.writes.length,2);
    const wrong:Mutation={runId:run.plan.runId,object:'Contact',operation:'delete',id:outsider,values:{}};await assert.rejects(f.data.execute(run,wrong,f.data.approval(run,wrong)),/ownership/);assert.equal(f.writes.length,2);
    await f.data.cleanup(run);f.data.finish(run);const absent=await f.data.verifyCleanup(run);assert.equal(absent.knownRecords,2);assert.equal(absent.absent,2);assert.equal(f.records.size,1);assert.ok(f.records.has(outsider));assert.deepEqual(f.writes.filter(w=>w.operation==='delete').map(w=>w.object),['Contact','Account']);await assert.rejects(f.data.open(run,f.org),/already reserved/);
  }finally{h.close();}
});
test('dedicated payload/action/scope limits block financial/admin objects, parent hijacking, user changes and foreign cascades',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),run=f.input.data;try {f.active=false;await assert.rejects(f.data.open(run,f.org),/active/);f.active=true;await f.data.open(run,f.org);
    const denied:Mutation[]=[{runId:run.plan.runId,object:'Opportunity',operation:'create',values:{Name:'Bad'}},{runId:run.plan.runId,object:'Account',operation:'create',values:{Name:'Changed',Description:run.plan.marker}},{runId:'other-run',object:'Account',operation:'create',values:{...run.plan.creates.Account}}];for(const m of denied)await assert.rejects(f.data.execute(run,m,f.data.approval(run,m)));
    assert.equal(f.writes.length,0);await f.data.setup(run);const parent=f.data.owned(run).find(r=>r.object==='Account')!;
    f.records.set('003999999999999',{Id:'003999999999999',object:'Contact',CreatedById:f.identity.userId,AccountId:parent.id,Description:'outsider'});
    await assert.rejects(f.data.cleanup(run),/dependent/);assert.ok(f.records.has(parent.id));assert.ok(f.records.has('003999999999999'));assert.equal(f.writes.filter(w=>w.operation==='delete').length,1);
    f.identity={...f.identity,userId:'005000000000002'};await assert.rejects(f.data.cleanup(run));assert.equal(f.writes.filter(w=>w.operation==='delete').length,1);
  }finally{h.close();}
});
test('foreign parent IDs cannot be substituted into approved Contact templates and UTC daily quotas prevent new runs',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h,'parent-boundary'),run=f.input.data;
  try {const outsider='001999999999999';f.records.set(outsider,{Id:outsider,object:'Account',CreatedById:f.identity.userId,Description:'another-run',Name:'Unrelated'});await f.data.open(run,f.org);
    const account:Mutation={runId:run.plan.runId,object:'Account',operation:'create',values:{...run.plan.creates.Account}};await f.data.execute(run,account,f.data.approval(run,account));
    const hijacked:Mutation={runId:run.plan.runId,object:'Contact',operation:'create',values:{...run.plan.creates.Contact,AccountId:outsider}};await assert.rejects(f.data.execute(run,hijacked,f.data.approval(run,hijacked)),/deterministic/);assert.equal(f.writes.length,1);await f.data.setup(run);await f.data.cleanup(run);f.data.finish(run);assert.ok(f.records.has(outsider));
    const policy={...f.policy,dedicatedQa:{...f.policy.dedicatedQa!,maxRunsPerDay:1}};policy.approval={...policy.approval,definitionHash:environmentHash(policy)};f.policy=policy;
    const plan=proposeDedicatedPlan(f.org,f.identity,policy,'second-run'),next={plan,approval:{operator:policy.approval.operator,planHash:dedicatedPlanHash(plan),expiresAt:policy.approval.expiresAt}};await assert.rejects(f.data.open(next,f.org),/daily run quota/);assert.equal(f.writes.length,4);
  }finally{h.close();}
});
test('uncertain create effects never replay/adopt, and known pending deletes recover by absence without a second delete',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h),run=f.input.data;
  try {await f.data.open(run,f.org);f.uncertainCreate=true;const m:Mutation={runId:run.plan.runId,object:'Account',operation:'create',values:{...run.plan.creates.Account}};await assert.rejects(f.data.execute(run,m,f.data.approval(run,m)));await assert.rejects(f.data.execute(run,m,f.data.approval(run,m)),/no automatic replay/);assert.equal(f.writes.length,1);assert.equal(f.data.owned(run).length,0);assert.throws(()=>f.data.finish(run),/uncertain/);}finally{h.close();}
  const other=new History(':memory:'),g=dedicatedFixture(other,'delete-recovery');try {await g.data.open(g.input.data,g.org);await g.data.setup(g.input.data);g.uncertainDelete=true;await assert.rejects(g.data.cleanup(g.input.data));const prior=g.writes.filter(w=>w.operation==='delete').length;g.uncertainDelete=false;await g.data.recoverCleanup(g.input.data);g.data.finish(g.input.data);assert.equal(g.records.size,0);assert.equal(g.writes.filter(w=>w.operation==='delete').length,prior+1);}finally{other.close();}
});
test('dedicated UI guard blocks outside records, mutating/mixed Aura actions and normal mode permissions',()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h);try {const id='001000000000001',url=`${f.browserOrigin}/lightning/r/Account/${id}/view`,g={policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:[url],owned:[{object:'Account' as const,id}],expiresAt:new Date(Date.now()+60000).toISOString()};
    assert.equal(allowDedicatedRequest(g,{method:'GET',url,type:'document'}),true);assert.equal(allowDedicatedRequest(g,{method:'GET',url:url.replace(id,'001999999999999'),type:'document'}),false);assert.equal(allowDedicatedRequest(g,{method:'POST',url,type:'document'}),false);
    const body=(descriptor:string)=>new URLSearchParams({message:JSON.stringify({actions:[{descriptor,params:{recordId:id}}]})}).toString();assert.equal(allowDedicatedRequest(g,{method:'POST',url:f.browserOrigin+'/aura',type:'xhr',body:body('aura://RecordUiController/ACTION$getRecord')}),true);assert.equal(allowDedicatedRequest(g,{method:'POST',url:f.browserOrigin+'/aura',type:'xhr',body:body('apex://FinancialController/ACTION$pay')}),false);
    const safeBody=body('aura://RecordUiController/ACTION$getRecord'),unsafeBody=body('apex://FinancialController/ACTION$pay');
    assert.equal(allowDedicatedRequest(g,{method:'POST',url:f.browserOrigin+'/aura',type:'xhr',body:body('aura://ComponentController/ACTION$reportFailedAction')}),false);
    assert.equal(allowDedicatedRequest(g,{method:'POST',url:f.browserOrigin+'/aura?'+unsafeBody,type:'xhr',body:safeBody}),false);
    assert.equal(allowDedicatedRequest(g,{method:'POST',url:f.browserOrigin+'/aura',type:'xhr',body:safeBody+'&'+unsafeBody}),false);
    for(const params of [{recordId:'006999999999999'},{recordId:id,fields:['Opportunity.Amount']},{recordId:id,otherRecordId:'005999999999999'},{recordId:id,modes:['Edit']}])assert.equal(allowDedicatedRequest(g,{method:'POST',url:f.browserOrigin+'/aura',type:'xhr',body:new URLSearchParams({message:JSON.stringify({actions:[{descriptor:'aura://RecordUiController/ACTION$getRecord',params}]})}).toString()}),false);
    for(const path of [`/services/data/v62.0/ui-api/records/${id},006999999999999`,`/services/data/v62.0/ui-api/records/${id}?fields=Opportunity.Amount`,`/services/data/v62.0/ui-api/records/${id}/related-list-records`])assert.equal(allowDedicatedRequest(g,{method:'GET',url:f.browserOrigin+path,type:'xhr'}),false);
    assert.equal(allowDedicatedRequest(g,{method:'GET',url:f.browserOrigin+`/services/data/v62.0/ui-api/records/${id}?fields=Account.Name`,type:'xhr'}),true);
    const changed=structuredClone(f.input.ui);changed.plan.workflows[0].steps=[{action:'click',locator:{by:'role',value:'button',name:'Delete'}}];changed.approval.hash=dedicatedUiHash(changed.plan);assert.throws(()=>reviewDedicatedUi(changed,f.policy,f.identity),/non-mutating/);
  }finally{h.close();}
});

test('cleanup requires existing verified record visibility and never changes user permissions',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h,'visibility');try {f.visible=false;await assert.rejects(f.data.open(f.input.data,f.org),/cleanup-visibility-unknown/);assert.equal(f.writes.length,0);
    f.visible=true;await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);f.visible=false;await assert.rejects(f.data.cleanup(f.input.data),/cleanup-visibility-unknown/);assert.equal(f.writes.length,2);assert.equal(f.records.size,2);
    f.visible=true;await f.data.cleanup(f.input.data);f.data.finish(f.input.data);assert.equal(f.records.size,0);assert.ok(f.queries.some(q=>q.includes('Profile.PermissionsViewAllData')));
  }finally{h.close();}
});

test('explicit null child relationships are empty while missing child results remain blocked',async()=>{
  const h=new History(':memory:'),f=dedicatedFixture(h,'null-children');try{f.emptyChildNull=true;await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);await f.data.cleanup(f.input.data);f.data.finish(f.input.data);assert.equal(f.records.size,0);assert.ok(f.queries.some(q=>q.includes('(SELECT Id FROM Contacts LIMIT 2)')));}finally{h.close();}
  const other=new History(':memory:'),g=dedicatedFixture(other,'missing-children');try {await g.data.open(g.input.data,g.org);await g.data.setup(g.input.data);const original=g.api.get.bind(g.api);g.api.get=async<T>(path:string):Promise<T>=>{if(decodeURIComponent(path).includes('(SELECT Id FROM Contacts LIMIT 2)'))return {records:[{Id:g.data.owned(g.input.data).find(r=>r.object==='Account')!.id}]} as T;return original<T>(path);};
    await assert.rejects(g.data.cleanup(g.input.data),/cleanup-read-denied/);assert.equal(g.writes.filter(w=>w.operation==='delete').length,1);assert.equal(g.data.owned(g.input.data).length,1);
  }finally{other.close();}
});
