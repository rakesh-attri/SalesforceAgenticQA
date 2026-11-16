import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile,rm,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {browserFixture} from './support/browser-policy.js';
import {BrowserBudget} from '../src/execution/browser-resources.js';
import {BrowserVisualDebug,previewBrowserDebug,attachBrowserDebug} from '../src/execution/browser-debug.js';
import {BrowserDebugPolicySchema} from '../src/execution/browser-debug-policy.js';
import {generateTest} from '../src/agents/workflows.js';
import {executeGenerated} from '../src/execution/runner.js';
import {pathToFileURL} from 'node:url';

const config=()=>BrowserDebugPolicySchema.parse({permission:'approved-masked-local-only',maxCaptures:12,maxTotalBytes:2097152,maxCaptureMs:1200,milestonesMs:[0,250],maskLocators:[{by:'testId',value:'reviewed-sensitive'}],residualSensitiveContentAcknowledged:true});
const rootFor=(run:string)=>resolve('artifacts/browser-debug',run);
async function removeRoot(root:string){const rel=relative(resolve('artifacts/browser-debug'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
const html=(display:string)=>`<!doctype html><style>body{font:16px monospace}h1{width:400px;height:40px}input,[data-testid],#secret,#cookie,#consumer{display:block;width:500px;height:30px}</style><h1>${display}</h1><input value="INPUT_SECRET_AAAAA"><div data-testid="reviewed-sensitive">CUSTOM_PRIVATE_AAAAA</div><span id="secret">token=PRIVATE_CREDENTIAL_AAAAA</span><span id="cookie">COOKIE_CANARY_AAAAA</span><span id="consumer">CONSUMER_CANARY_AAAAA</span><p>qa.person@example.invalid</p><div data-testid="details">Independent Account detail structure</div>`;

test('masked screenshots preserve local diagnostics, hide known values, refuse auth/unverified pages and enforce path/integrity boundaries',{timeout:30000},async()=>{
  const b=browserFixture(),browser=await chromium.launch({headless:true});b.plan.runId=`debug-${randomUUID()}`;b.plan.visualDebug=config();b.plan.budgets.maxMs=20000;const review=b.approve(),budget=new BrowserBudget(review),visual=new BrowserVisualDebug(review,budget,randomUUID(),'offline-mocked-salesforce',()=>({requests:2,denied:1,reasons:{'request-contract':1}})),page=await browser.newPage(),display='PRIVATE_ACCOUNT_CANARY',url=`${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`,proof={nativeDocumentVerified:true,records:b.plan.records,privateValues:[display]};
  const previousConsumer=process.env.SF_CLIENT_ID;process.env.SF_CLIENT_ID='CONSUMER_CANARY_AAAAA';await page.context().addCookies([{name:'sid',value:'COOKIE_CANARY_AAAAA',url:b.f.browserOrigin,secure:true}]);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html(display)}));
  try{
    await page.goto(url);const first=await visual.capture(page,proof,'operator');assert.equal(first.status,'captured');assert.ok('file'in first&&first.file);assert.equal('diagnostics'in first&&first.diagnostics?.classification,'visible-record-name-unverified-content');
    await page.locator('input').evaluate(e=>(e as HTMLInputElement).value='INPUT_SECRET_BBBBB');await page.getByTestId('reviewed-sensitive').evaluate(e=>e.textContent='CUSTOM_PRIVATE_BBBBB');await page.locator('#secret').evaluate(e=>e.textContent='token=PRIVATE_CREDENTIAL_BBBBB');
    process.env.SF_CLIENT_ID='CONSUMER_CANARY_BBBBB';await page.context().addCookies([{name:'sid',value:'COOKIE_CANARY_BBBBB',url:b.f.browserOrigin,secure:true}]);await page.locator('#cookie').evaluate(e=>e.textContent='COOKIE_CANARY_BBBBB');await page.locator('#consumer').evaluate(e=>e.textContent='CONSUMER_CANARY_BBBBB');
    const second=await visual.capture(page,proof,'test-failure');assert.equal(second.status,'captured');assert.ok('file'in second&&second.file);assert.deepEqual(await readFile(join(rootFor(b.plan.runId),first.file!)),await readFile(join(rootFor(b.plan.runId),second.file!)),'Changing known masked values must not change screenshot pixels');
    const attachments:unknown[]=[];await attachBrowserDebug({attach:async(name,options)=>{attachments.push({name,...options});}},second,b.plan.runId);assert.equal(attachments.length,1);
    assert.equal((await visual.capture(page,{...proof,nativeDocumentVerified:false},'selector-missing')).status,'refused');
    await page.evaluate(()=>{const p=document.createElement('input');p.type='password';document.body.append(p);});assert.equal((await visual.capture(page,proof,'operator')).status,'refused');
    await page.goto(`${b.f.browserOrigin}/secur/login?sid=SECRET_AUTH_CANARY`);assert.equal((await visual.capture(page,proof,'operator')).status,'refused');
    const report=await visual.report();assert.equal(report.status,'local-debug-evidence');assert.ok('manifest'in report);const manifest=await readFile(resolve(report.manifest!),'utf8');for(const secret of [display,'PRIVATE_CREDENTIAL','PRIVATE_ACCOUNT','SECRET_AUTH_CANARY',b.f.identity.Id,b.recordId])assert.ok(!manifest.includes(secret));
    const preview=await previewBrowserDebug(b.plan.runId);assert.equal(preview.screenshots,2);const pageHtml=await readFile(preview.preview,'utf8');assert.ok(!pageHtml.includes('SECRET_AUTH_CANARY'));assert.ok(pageHtml.includes('complete masking cannot be guaranteed'));assert.ok(pageHtml.includes("default-src 'none'"));
    await page.unroute('**/*');await page.goto(pathToFileURL(preview.preview).href);await page.waitForFunction(()=>document.querySelector('img')?.complete);assert.ok(await page.locator('img').first().evaluate(e=>(e as HTMLImageElement).naturalWidth)>0);
    await writeFile(join(rootFor(b.plan.runId),first.file!),Buffer.from('tampered'));await assert.rejects(previewBrowserDebug(b.plan.runId),/integrity/);await assert.rejects(previewBrowserDebug('../.auth'));
  }finally{if(previousConsumer===undefined)delete process.env.SF_CLIENT_ID;else process.env.SF_CLIENT_ID=previousConsumer;await browser.close();b.history.close();await removeRoot(rootFor(b.plan.runId));}
});

test('loading/error/blank screenshots and bounded milestones distinguish evidence from rendered-page success',{timeout:30000},async()=>{
  const b=browserFixture(),browser=await chromium.launch({headless:true});b.plan.runId=`debug-${randomUUID()}`;b.plan.visualDebug=config();b.plan.budgets.maxMs=15000;const review=b.approve(),budget=new BrowserBudget(review),visual=new BrowserVisualDebug(review,budget,randomUUID(),'offline-mocked-salesforce',()=>({requests:1,denied:0,reasons:{}})),page=await browser.newPage(),proof={nativeDocumentVerified:true,records:b.plan.records,privateValues:['Private Account']};await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<div role="progressbar">Loading…</div>'}));
  try{
    await page.goto(`${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`);visual.watch(page,async()=>proof);await page.waitForTimeout(500);const timeout=await visual.capture(page,proof,'loading-timeout');assert.equal(timeout.status,'captured');assert.equal('diagnostics'in timeout&&timeout.diagnostics?.classification,'loading');
    await page.setContent('<div role="alert">Insufficient permission: PRIVATE_ERROR_VALUE</div>');const error=await visual.capture(page,proof,'rendering-failure');assert.equal('diagnostics'in error&&error.diagnostics?.classification,'application-error');assert.deepEqual('diagnostics'in error&&error.diagnostics?.errorCategories,['access']);assert.ok(!JSON.stringify(error).includes('PRIVATE_ERROR'));
    await page.setContent('<!doctype html><body></body>');const blank=await visual.capture(page,proof,'selector-missing');assert.equal('diagnostics'in blank&&blank.diagnostics?.classification,'blank');assert.ok(visual.entries.some(e=>e.reason==='loading-milestone'));
    const report=await visual.report();assert.equal(report.status,'local-debug-evidence');
  }finally{await browser.close();b.history.close();await removeRoot(rootFor(b.plan.runId));}
});

test('Salesforce-style connection retry without alert role is classified from bounded visible text without retaining it',{timeout:15000},async()=>{
  const b=browserFixture(),browser=await chromium.launch({headless:true});b.plan.runId=`debug-${randomUUID()}`;b.plan.visualDebug=config();const review=b.approve(),visual=new BrowserVisualDebug(review,new BrowserBudget(review),randomUUID(),'offline-mocked-salesforce',()=>({requests:1,denied:1,reasons:{'request-contract':1}})),page=await browser.newPage();
  try{await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main><nav>Accounts</nav><section>Check your Internet connection and try again. <button>Try Again</button></section></main>'}));await page.goto(`${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`);const capture=await visual.capture(page,{nativeDocumentVerified:true,records:b.plan.records,privateValues:[]},'rendering-failure');assert.equal(capture.status,'captured');assert.equal('diagnostics'in capture&&capture.diagnostics?.classification,'application-error');assert.deepEqual('diagnostics'in capture&&capture.diagnostics?.errorCategories,['connectivity']);assert.ok(!JSON.stringify(capture).includes('Check your Internet'));}
  finally{await browser.close();b.history.close();await removeRoot(rootFor(b.plan.runId));}
});

test('screenshot permission, time, count and byte quotas cannot be widened by calls or an old signed plan',{timeout:20000},async()=>{
  const b=browserFixture(),browser=await chromium.launch({headless:true});b.plan.runId=`debug-${randomUUID()}`;const page=await browser.newPage(),proof={nativeDocumentVerified:true,records:b.plan.records,privateValues:[]},summary=()=>({requests:0,denied:0,reasons:{}});await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<h1>Fixture content</h1>'}));await page.goto(`${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`);
  try{
    const old=b.approve(),disabled=new BrowserVisualDebug(old,new BrowserBudget(old),randomUUID(),'offline-mocked-salesforce',summary);assert.equal((await disabled.capture(page,proof,'operator')).status,'disabled');
    b.plan.visualDebug={...config(),maxCaptures:1,maxTotalBytes:1024};assert.notEqual(b.approve().approval.hash,old.approval.hash);const approved=b.approve(),visual=new BrowserVisualDebug(approved,new BrowserBudget(approved),randomUUID(),'offline-mocked-salesforce',summary);const first=await visual.capture(page,proof,'operator');assert.equal(first.status,'budget-exhausted');assert.equal('category'in first&&first.category,'bytes');assert.equal((await visual.capture(page,proof,'operator')).status,'budget-exhausted');
    let now=Date.now();const budget=new BrowserBudget(approved,()=>now),expired=new BrowserVisualDebug(approved,budget,randomUUID(),'offline-mocked-salesforce',summary);now+=approved.plan.budgets.maxMs;const result=await expired.capture(page,proof,'test-failure');assert.equal(result.status,'budget-exhausted');
    assert.throws(()=>BrowserDebugPolicySchema.parse({...config(),milestonesMs:[0,-1]}));
  }finally{await browser.close();b.history.close();await removeRoot(rootFor(b.plan.runId));}
});

test('generated visual failure hooks retain assertions and real reportingLabs embeds supported local PNG attachments',{timeout:45000},async()=>{
  const b=browserFixture(),run=`debug-${randomUUID()}`;await mkdir('.state',{recursive:true});const executionRoot=await mkdtemp(resolve('.state/visual-reporting-'));
  const workflow={id:'visual-generated',criterion:'AC1',source:'fixture',reviewer:'fixture',origin:b.f.browserOrigin,path:`/lightning/r/Account/${b.recordId}/view`,steps:[],assertion:{locator:{by:'text' as const,value:'Unchanged expected outcome'},text:'Unchanged expected outcome'}};
  const generated=generateTest(workflow,[b.f.browserOrigin],{module:'./guard.ts',config:'./guard.json',ownsNetworkBoundary:true,visualDebug:true});assert.ok(generated.includes('captureReviewedBrowserDebug'));assert.ok(generated.includes('toHaveText("Unchanged expected outcome")'));
  b.plan.runId=run;b.plan.visualDebug=config();b.plan.budgets.maxMs=12000;const review=b.approve(),guardConfig=join(executionRoot,'fixture-guard.json');await writeFile(guardConfig,JSON.stringify({review,parent:b.f.policy,native:b.native,statePath:join(executionRoot,'synthetic-state.json')}));
  const code=generateTest(workflow,[b.f.browserOrigin],{module:resolve('unit/support/visual-guard-fixture.ts').replaceAll('\\','/'),config:guardConfig,ownsNetworkBoundary:true,visualDebug:true});
  try{const report=await executeGenerated(executionRoot,run,[{id:'visual-failure',code}],30000,{trace:'off',validation:'offline-mocked-salesforce'});assert.equal(report.exitCode,1);assert.equal(report.results[0].status,'failed');assert.ok(report.results[0].evidence.some(e=>e.endsWith('.png')));const data=await readFile(join(executionRoot,'reporting-labs/report.json'),'utf8');assert.ok(data.includes('sfqa-masked-browser-debug'));const html=await readFile(join(executionRoot,'reporting-labs/index.html'),'utf8');assert.ok(/data:image\/png|\.png/.test(html));}
  finally{b.history.close();const rel=relative(resolve('.state'),executionRoot);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(executionRoot,{recursive:true,force:true,maxRetries:8,retryDelay:100});await removeRoot(rootFor(run));}
});
