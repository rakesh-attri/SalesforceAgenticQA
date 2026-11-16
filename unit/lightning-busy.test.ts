import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchLocalBrowser} from '../src/execution/local-browser.js';
import {browserFixture} from './support/browser-policy.js';
import {BrowserBudget} from '../src/execution/browser-resources.js';
import {observeLightningView,lightningViewHash} from '../src/execution/lightning-view.js';
import {digest} from '../src/execution/browser-policy.js';

test('native busy diagnostics distinguish persistent SLDS/aria signals from missing content without weakening stability checks',{timeout:15000},async()=>{
  const b=browserFixture(),browser=await launchLocalBrowser();
  try{
    const page=await browser.newPage();await page.setContent('<h1>Synthetic QA</h1><div data-testid="details">Independent details</div><div class="slds-spinner" style="width:20px;height:20px" aria-busy="true">Loading</div>');
    const view={version:1,object:'Account',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('offline-busy-fixture'),recordName:{by:'role',value:'heading',name:'{{record-name}}'},content:[{by:'testId',value:'details'}],busy:[],faults:[],stableMs:100};b.plan.renderContractHash=lightningViewHash(view);b.plan.budgets.maxMs=1200;
    const observe=()=>observeLightningView(page,{review:b.approve(),view,object:'Account',name:'Synthetic QA',nativeDocumentVerified:true,budget:new BrowserBudget(b.approve()),reserveMs:500});
    const blocked=await observe();assert.equal(blocked.status,'not-rendered');assert.ok('checks' in blocked&&blocked.checks);assert.ok(blocked.checks.name&&blocked.checks.content===1&&!blocked.checks.busyClear);assert.ok('busyEvidence' in blocked&&blocked.busyEvidence);assert.equal(blocked.busyEvidence.nativeSpinners,1);assert.equal(blocked.busyEvidence.nativeAriaBusy,1);assert.equal(blocked.busyEvidence.nativeProgressbars,0);
    await page.locator('.slds-spinner').evaluate(element=>element.remove());const ready=await observe();assert.equal(ready.status,'rendered-reviewed-view');assert.ok('busyEvidence' in ready&&ready.busyEvidence.nativeSpinners===0);assert.equal(ready.assertionsChanged,false);
  }finally{await browser.close();b.history.close();}
});
