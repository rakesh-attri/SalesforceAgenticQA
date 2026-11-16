import {chromium} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {BrowserReviewSchema,browserPlanHash,digest} from '../execution/browser-policy.js';
import {BrowserBudget} from '../execution/browser-resources.js';
import {BrowserVisualDebug,previewBrowserDebug} from '../execution/browser-debug.js';
import {parseBrowserBuild} from '../execution/browser-build.js';

// Synthetic headless documents, all network intercepted. No Salesforce identity,
// JWT, storage state, model, readiness receipt, factory or lesson is involved.
export async function demonstrateVisualDebug(runId=`VISUAL-OFFLINE-${randomUUID()}`){
  const origin='https://visual-fixture.invalid',id='001000000000001',org='00D000000000001',user='005000000000001',build='visual-fixture-build',app='one:one',display='Synthetic QA Account';
  const native=`<script type="text/plain">var auraConfig={context:{fwuid:"${build}",app:"${app}",globalValueProviders:[{type:"$SObjectType",values:{CurrentUser:{Id:"${user}"}}}]}};$A.addValueProvider("$ContentAsset",new ContentAssetGlobalValueProvider("${org}","ignored"));</script>`;
  const plan={version:1,mode:'DEDICATED_INITIALIZATION_AUDIT',orgId:org,userId:user,persona:'offline-fixture',parentPolicyHash:digest('offline-parent'),sourceVersion:digest('offline-source'),buildHash:digest(build),appHash:digest(app),selectedAppIdHash:digest('offline-app'),sessionStateHash:digest('no-session'),origins:[origin],runId,objects:['Account'],records:[{object:'Account',id,purpose:'observation-only'}],resources:[{origin,path:'/fixture.js',kind:'script',match:'exact',queryKeys:[],definitions:[]}],contracts:[],agentWorkflowHashes:[],transports:['validated-cache'],recordReadProfile:'documented-ui-api-only',budgets:{maxMs:15000,requests:10,resourceBytes:1048576,maxResourceBytes:1048576,actions:0,sessions:1},browserWrites:false,formSubmissions:false,financial:false,administrativeChanges:false,visualDebug:{permission:'approved-masked-local-only',maxCaptures:6,maxTotalBytes:4194304,maxCaptureMs:1500,milestonesMs:[],maskLocators:[{by:'testId',value:'private-contact'}],residualSensitiveContentAcknowledged:true}};
  const review=BrowserReviewSchema.parse({plan,approval:{operator:'OFFLINE_FIXTURE_ONLY',hash:browserPlanHash(plan),expiresAt:new Date(Date.now()+60000).toISOString()}}),browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),url=`${origin}/lightning/r/Account/${id}/view`,visual=new BrowserVisualDebug(review,new BrowserBudget(review),randomUUID(),'offline-mocked-salesforce',()=>({requests:1,denied:1,reasons:{'fixture-unknown-operation':1}}));
    await page.route('**/*',route=>route.request().url()===url&&route.request().method()==='GET'?route.fulfill({contentType:'text/html',body:`<!doctype html>${native}<style>body{font:18px system-ui;padding:32px;background:#f3f4f6}main{background:white;padding:24px;border:1px solid #ccc;max-width:800px}.slds-spinner{padding:30px;border:2px dashed #357}input{display:block}</style><main><h1>Salesforce-style local fixture</h1><div role="progressbar" class="slds-spinner">Loading Account workspace…</div></main>`}):route.abort());
    const response=await page.goto(url),actual=parseBrowserBuild(await response!.text()),proof={nativeDocumentVerified:actual.orgId===org&&actual.userId===user&&actual.buildHash===review.plan.buildHash&&actual.appHash===review.plan.appHash,records:review.plan.records,privateValues:[display]};
    await visual.capture(page,proof,'loading-timeout');
    await page.locator('main').evaluate(node=>node.innerHTML='<h1>Account workspace</h1><div role="alert">Insufficient permission to display this synthetic record.</div>');await visual.capture(page,proof,'rendering-failure');
    await page.locator('main').evaluate((node,name)=>node.innerHTML=`<h1>${name}</h1><h2>Account details</h2><p>Local fixture content; no real record.</p><label>Private contact</label><div data-testid="private-contact">PRIVATE_FIXTURE_VALUE</div><input value="PRIVATE_FIXTURE_INPUT"><p>qa.person@example.invalid</p>`,display);await visual.capture(page,proof,'operator');
    const report=await visual.report(),preview=await previewBrowserDebug(runId);return{validation:'offline-mocked-salesforce',runId,report,...preview,salesforceRequests:0,renderedSalesforceProof:false,verifiedLearning:false};
  }finally{await browser.close();}
}
