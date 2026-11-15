import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {browserFixture} from './support/browser-policy.js';
import {LightningSession} from '../src/execution/lightning-session.js';
import {parseBrowserBuild} from '../src/execution/browser-build.js';
import {lightningViewHash,LightningViewSchema} from '../src/execution/lightning-view.js';
import {digest} from '../src/execution/browser-policy.js';
import {createLightningMcp} from '../src/integrations/lightning-mcp.js';
import {lightningEngineHash,verifyLightningEngine} from '../src/execution/lightning-engine.js';

test('real Playwright MCP and direct observations share one verified guarded context, readiness and quota; raw tools and actions stay denied',{timeout:60000},async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/managed-lightning-')),state=join(root,'state.json'),b=browserFixture();await writeFile(state,JSON.stringify({cookies:[],origins:[]}));
  const display='PRIVATE_MANAGED_ACCOUNT',view=LightningViewSchema.parse({version:1,object:'Account',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('reviewed-fixture-source'),recordName:{by:'role',value:'heading',name:'{{record-name}}'},content:[{by:'testId',value:'account-details'}],busy:[{by:'role',value:'progressbar'}],faults:[{by:'testId',value:'app-error'}],stableMs:100});
  b.plan.engineProfileHash=lightningEngineHash();b.plan.renderContractHash=lightningViewHash(view);b.plan.contracts=[b.contract()];b.plan.budgets.maxMs=20000;b.plan.budgets.sessions=1;let bootstrapCalls=0,mutations=0;
  const session=await LightningSession.open({review:b.approve(),parent:b.f.policy,history:b.history,statePath:state,apiOrigin:b.f.origin,identity:async()=>b.f.identity,view,
    verifyReferences:async()=>({references:b.plan.records,privateDisplays:[{object:'Account',id:b.recordId,display}],proof:{referenceVersions:[digest('unchanged')]}}),verifyContext:async()=>{},nativeBuild:async()=>parseBrowserBuild(b.native),
    prepareContext:async context=>{await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.pathname==='/aura'){bootstrapCalls++;return route.fulfill({json:{actions:[{state:'SUCCESS'}]}});}if(request.method()!=='GET'){mutations++;return route.fulfill({status:500});}return route.fulfill({contentType:'text/html',body:`<!doctype html>${b.native}<div role="progressbar"></div><script>fetch('/aura?aura.OneController.getCurrentApp=1',{method:'POST',body:${JSON.stringify(b.body())}}).then(r=>r.json()).then(r=>{if(r.actions[0].state==='SUCCESS'){document.querySelector('[role=progressbar]').remove();const h=document.createElement('h1');h.textContent=${JSON.stringify(display)};document.body.append(h);const d=document.createElement('div');d.dataset.testid='account-details';d.textContent='Reviewed Account detail content';document.body.append(d);fetch('/services/data/v62.0/sobjects/Account',{method:'POST',body:'PRIVATE_MUTATION'}).catch(()=>{});fetch('/aura?aura.ApexActionController.execute=1',{method:'POST',body:${JSON.stringify(b.body([{id:'bad',descriptor:'aura://ApexActionController/ACTION$execute',params:{recordId:b.recordId}}]))}}).catch(()=>{});}});</script>`});});}
  });
  const workflow={id:'denied-observation-click',criterion:'AC1',source:'fixture',reviewer:b.f.policy.approval.operator,origin:b.f.browserOrigin,path:`/lightning/r/Account/${b.recordId}/view`,steps:[{action:'click',locator:{by:'role',value:'button',name:'Details'}}],assertion:{locator:{by:'role',value:'heading'},text:display}},server=createLightningMcp(session,[workflow]),client=new Client({name:'managed-gateway-test',version:'1'}),[a,c]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(c);
  const previousOrigins=process.env.PLAYWRIGHT_MCP_ALLOWED_ORIGINS;process.env.PLAYWRIGHT_MCP_ALLOWED_ORIGINS=b.f.browserOrigin;
  try{
    assert.equal((await client.listTools()).tools.length,5);
    for(const name of ['browser_evaluate','browser_run_code','browser_navigate','browser_click','create_record'])assert.equal((await client.callTool({name,arguments:{url:'https://unapproved.example',code:'PRIVATE_CODE'}})).isError,true);
    const navigation=await client.callTool({name:'sfqa_browser_observe_record',arguments:{object:'Account'}});assert.ok(!navigation.isError,JSON.stringify(navigation));assert.equal(JSON.parse((navigation.content as Array<{text:string}>)[0].text).nativeDocumentVerified,true);assert.ok(!JSON.stringify(navigation).includes('PRIVATE_'));
    const readiness=await client.callTool({name:'sfqa_browser_reviewed_view',arguments:{}});assert.ok(!readiness.isError,JSON.stringify(readiness));assert.ok(JSON.stringify(readiness).includes('rendered-reviewed-view'));assert.ok(!JSON.stringify(readiness).includes('PRIVATE_'));
    assert.equal((await session.observe('playwright')).status,'rendered-reviewed-view');
    const discovery=await client.callTool({name:'sfqa_browser_discover_view',arguments:{}});assert.ok(!discovery.isError);assert.ok(!JSON.stringify(discovery).includes('PRIVATE_'));assert.equal(JSON.parse((discovery.content as Array<{text:string}>)[0].text).recordNameCandidates.length,2);
    assert.equal((await client.callTool({name:'sfqa_browser_reviewed_step',arguments:{workflowId:workflow.id,step:0}})).isError,true);
    assert.equal((await client.callTool({name:'sfqa_browser_observe_record',arguments:{object:'Contact'}})).isError,true);
    assert.equal((await client.callTool({name:'sfqa_browser_observe_record',arguments:{object:'Account',url:'https://evil.example'}})).isError,true);
    assert.equal(session.status().validation,'offline-mocked-salesforce');assert.equal(session.status().nativeMcpConnected,true);assert.equal(bootstrapCalls,1);assert.equal(mutations,0);
    assert.equal(b.history.db.prepare('SELECT COUNT(*) AS count FROM browser_execution_sessions').get()?.count,1);
    const report=await session.close() as {referenceUnchanged:boolean;metrics:{blocked:number};readinessProof:{validation:string;mutationApprovalGranted:boolean}};assert.equal(report.referenceUnchanged,true);assert.ok(report.metrics.blocked>=2);assert.equal(report.readinessProof.validation,'offline-mocked-salesforce');assert.equal(report.readinessProof.mutationApprovalGranted,false);await assert.rejects(session.navigate('Account'),/closed/);
  }finally{if(previousOrigins===undefined)delete process.env.PLAYWRIGHT_MCP_ALLOWED_ORIGINS;else process.env.PLAYWRIGHT_MCP_ALLOWED_ORIGINS=previousOrigins;await client.close();await server.close();await session.close();b.history.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});

test('managed service cannot inherit ordinary Production/sandbox authority or another org before browser startup',async()=>{
  const b=browserFixture();b.plan.engineProfileHash=lightningEngineHash();let prepared=0;
  try{for(const mode of ['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA'])await assert.rejects(LightningSession.open({review:b.approve(),parent:{...b.f.policy,mode},history:b.history,statePath:'.auth/not-a-session.json',apiOrigin:b.f.origin,identity:async()=>b.f.identity,verifyReferences:async()=>({references:b.plan.records,privateDisplays:[],proof:{}}),prepareContext:async()=>{prepared++;}}));
    await assert.rejects(LightningSession.open({review:b.approve(),parent:b.f.policy,history:b.history,statePath:'.auth/not-a-session.json',apiOrigin:b.f.origin,identity:async()=>({...b.f.identity,Id:'00D999999999999'}),verifyReferences:async()=>({references:b.plan.records,privateDisplays:[],proof:{}}),prepareContext:async()=>{prepared++;}}));assert.equal(prepared,0);
  }finally{b.history.close();}
});

test('render contract requires separate content evidence and version/operator binding, not just a record name',()=>{
  const b=browserFixture();try{
    const name={by:'role',value:'heading',name:'{{record-name}}'},view={version:1,object:'Account',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('source'),recordName:name,content:[name],busy:[],faults:[],stableMs:100};
    assert.throws(()=>lightningViewHash(view),/Record name alone/);assert.throws(()=>LightningViewSchema.parse({...view,content:[] }));assert.throws(()=>verifyLightningEngine(undefined));assert.throws(()=>verifyLightningEngine(digest('other-engine')));assert.equal(verifyLightningEngine(lightningEngineHash()).mcpVersion,'0.0.84');
  }finally{b.history.close();}
});
