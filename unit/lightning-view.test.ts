import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserFixture} from './support/browser-policy.js';
import {digest} from '../src/execution/browser-policy.js';
import {LightningViewSchema,lightningViewHash,observeLightningView} from '../src/execution/lightning-view.js';
import {BrowserBudget} from '../src/execution/browser-resources.js';
import {generateTest} from '../src/agents/workflows.js';
import {LocatorSchema,resolveLocator} from '../src/core/locators.js';

test('reviewed view fails for a loading shell, an error, a name-only alias or changed outcomes; exact distinct stable content passes',{timeout:20000},async()=>{
  const b=browserFixture(),browser=await chromium.launch({headless:true});b.plan.budgets.maxMs=1000;
  try{
    const page=await browser.newPage(),name='PRIVATE_REVIEWED_NAME',view=LightningViewSchema.parse({version:1,object:'Account',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('fixture-source'),recordName:{by:'text',value:'{{record-name}}'},content:[{by:'testId',value:'details'}],busy:[{by:'testId',value:'busy'}],faults:[{by:'testId',value:'fault'}],stableMs:100});
    const observe=async(raw= view)=>{b.plan.renderContractHash=lightningViewHash(raw);const review=b.approve();return observeLightningView(page,{review,view:raw,object:'Account',name,nativeDocumentVerified:true,budget:new BrowserBudget(review)});};
    await page.setContent(`<h1 data-testid="name">${name}</h1><section data-testid="details">Account details</section><div data-testid="busy">Loading</div>`);assert.equal((await observe()).status,'not-rendered');
    await page.setContent(`<h1 data-testid="name">${name}</h1><section data-testid="details">Account details</section><div data-testid="fault">Failure</div>`);assert.equal((await observe()).status,'not-rendered');
    await page.setContent(`<h1 data-testid="name">${name}</h1>`);assert.equal((await observe({...view,content:[{by:'testId',value:'name'}]})).status,'not-rendered');
    await page.setContent(`<h1>${name}</h1><section data-testid="details">Account details</section>`);assert.equal((await observe()).status,'rendered-reviewed-view');
    const review=b.approve();await assert.rejects(observeLightningView(page,{review,view:{...view,sourceVersion:digest('other-source')},object:'Account',name,nativeDocumentVerified:true,budget:new BrowserBudget(review)}),/differs/);
    assert.equal((await observeLightningView(page,{review,view,object:'Account',name:'Changed outcome',nativeDocumentVerified:true,budget:new BrowserBudget(review)})).status,'not-rendered');
    assert.equal(await resolveLocator(page,{by:'text',value:name}).count(),1);
  }finally{await browser.close();b.history.close();}
});

test('text selectors share the same exact typed resolver/generator and cannot become arbitrary CSS or changed assertions',()=>{
  const workflow={id:'observed-text',criterion:'AC1',source:'reviewed-fixture',reviewer:'fixture-reviewer',origin:'https://fixture.example',path:'/view',steps:[],assertion:{locator:{by:'text' as const,value:'Observed Name'},text:'Observed Name'}},code=generateTest(workflow,['https://fixture.example']);
  assert.ok(code.includes('page.getByText("Observed Name", { exact: true })'));assert.ok(code.includes('toHaveText("Observed Name")'));assert.throws(()=>LocatorSchema.parse({by:'css',value:'script'}));
});
