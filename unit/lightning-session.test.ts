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
import {readFile} from 'node:fs/promises';
import {BrowserDebugPolicySchema} from '../src/execution/browser-debug-policy.js';
import {relative,isAbsolute} from 'node:path';
import {analyzeLightningCompatibility} from '../src/execution/compatibility-analyzer.js';
import {readBrowserExecutionDiagnostics} from '../src/execution/browser-diagnostics.js';
import {contractsFromBrowserPolicy} from '../src/execution/compatibility-policy-import.js';
import type {BrowserTrace} from '../src/execution/browser-trace.js';

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
    assert.equal((await client.listTools()).tools.length,6);
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
    const report=await session.close() as {referenceUnchanged:boolean;metrics:{blocked:number;trace:BrowserTrace};readinessProof:{validation:string;mutationApprovalGranted:boolean}};assert.equal(report.referenceUnchanged,true);assert.ok(report.metrics.blocked>=2);assert.equal(report.readinessProof.validation,'offline-mocked-salesforce');assert.equal(report.readinessProof.mutationApprovalGranted,false);await assert.rejects(session.navigate('Account'),/closed/);const diagnostics=readBrowserExecutionDiagnostics(b.history,b.plan.runId,b.approve().approval.hash)[0];assert.equal(diagnostics.pageObserved,true);assert.ok(diagnostics.events.some(e=>e.stage==='mcp-connect'&&e.status==='passed'));assert.ok(diagnostics.events.some(e=>e.stage==='cleanup'&&e.status==='passed'));assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE_'));
    // Fixture reference projection only, not a claimed live normal baseline.
    const reference={...report.metrics.trace,provenance:'framework-native-reference',sourceHash:digest('fixture-reference'),entries:report.metrics.trace.entries.filter(e=>e.status>0)},analysis=analyzeLightningCompatibility({scope:contractsFromBrowserPolicy(b.approve()).scope,normal:reference,guarded:report.metrics.trace});assert.equal(analysis.sequenceAvailable,true);assert.ok(analysis.findings.some(f=>f.classification==='high-risk'&&f.blocked));assert.equal(analysis.permissionsGranted,0);assert.equal(mutations,0);
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

test('actual shared MCP observation can trigger approved local masked capture and automatically capture missing selectors',{timeout:30000},async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/visual-managed-')),state=join(root,'state.json'),b=browserFixture();await writeFile(state,JSON.stringify({cookies:[],origins:[]}));b.plan.runId=`visual-managed-${Date.now()}`;b.plan.engineProfileHash=lightningEngineHash();b.plan.budgets.maxMs=12000;b.plan.visualDebug=BrowserDebugPolicySchema.parse({permission:'approved-masked-local-only',maxCaptures:6,maxTotalBytes:2097152,maxCaptureMs:1200,milestonesMs:[0,250],maskLocators:[],residualSensitiveContentAcknowledged:true});
  const session=await LightningSession.open({review:b.approve(),parent:b.f.policy,history:b.history,statePath:state,apiOrigin:b.f.origin,identity:async()=>b.f.identity,verifyReferences:async()=>({references:b.plan.records,privateDisplays:[{object:'Account',id:b.recordId,display:'PRIVATE_VISUAL_NAME'}],proof:{referenceVersions:[digest('unchanged')]}}),verifyContext:async()=>{},nativeBuild:async()=>parseBrowserBuild(b.native),prepareContext:async context=>{await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html>${b.native}<div role="progressbar">Loading Account…</div><iframe src="/unsupported-subframe"></iframe>`}));}}),server=createLightningMcp(session),client=new Client({name:'visual-local-client',version:'1'}),[a,c]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(c);
  try{
    const navigation=await client.callTool({name:'sfqa_browser_observe_record',arguments:{object:'Account'}});assert.ok(!navigation.isError);await session.observeLoading();
    const captured=await client.callTool({name:'sfqa_browser_debug_capture',arguments:{}});assert.ok(!captured.isError);assert.ok(JSON.stringify(captured).includes('captured'),JSON.stringify(captured));assert.ok(!JSON.stringify(captured).includes('PRIVATE_'));assert.ok(!JSON.stringify(captured).includes('image/png'));
    assert.equal((await client.callTool({name:'sfqa_browser_debug_capture',arguments:{path:'.auth/qa-user.json'}})).isError,true);await session.discover('playwright');await session.observe('mcp');
    const report=await session.close() as {visual:{manifest:string;captures:number};referenceUnchanged:boolean;readinessProof:{status:string}};assert.equal(report.referenceUnchanged,true);assert.ok(report.visual.captures>=3);assert.equal(report.readinessProof.status,'not-established');const manifest=JSON.parse(await readFile(resolve(report.visual.manifest),'utf8'));assert.ok(manifest.entries.some((e:{reason:string})=>e.reason==='selector-missing'));assert.ok(manifest.entries.every((e:{diagnostics?:{classification:string}})=>!e.diagnostics||e.diagnostics.classification==='loading'));
  }finally{await client.close();await server.close();await session.close();b.history.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});const output=resolve('artifacts/browser-debug',b.plan.runId),rel=relative(resolve('artifacts/browser-debug'),output);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(output,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
