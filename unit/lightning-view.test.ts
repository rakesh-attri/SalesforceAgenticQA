import {localLaunchOptions} from '../src/execution/local-browser.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {browserFixture} from './support/browser-policy.js';
import {digest} from '../src/execution/browser-policy.js';
import {LightningViewSchema,lightningViewHash,observeLightningView} from '../src/execution/lightning-view.js';
import {BrowserBudget} from '../src/execution/browser-resources.js';
import {generateTest} from '../src/agents/workflows.js';
import {LocatorSchema,resolveLocator} from '../src/core/locators.js';
import {inspectLightningReadiness} from '../src/execution/lightning-readiness.js';

test('reviewed view fails for a loading shell, an error, a name-only alias or changed outcomes; exact distinct stable content passes',{timeout:20000},async()=>{
  const b=browserFixture(),browser=await chromium.launch(localLaunchOptions());b.plan.budgets.maxMs=1000;
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

test('a Lightning name remount between visibility and text inspection is incomplete until the original view stabilizes, never an implicit locator wait',{timeout:15000},async()=>{
 const b=browserFixture(),browser=await chromium.launch(localLaunchOptions());b.plan.budgets.maxMs=1500;
 try{const page=await browser.newPage();page.setDefaultTimeout(80);const name='Synthetic remount QA',view=LightningViewSchema.parse({version:1,object:'Account',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('fixture-remount-source'),recordName:{by:'role',value:'heading',name:'{{record-name}}'},content:[{by:'testId',value:'details'}],busy:[],faults:[],stableMs:100,readiness:{strategy:'reviewed-regions-v1',regions:[{id:'name',locator:{by:'role',value:'heading',name:'{{record-name}}'}},{id:'details',locator:{by:'testId',value:'details'}}],backgrounds:[]}});b.plan.renderContractHash=lightningViewHash(view);
 for(const restoreMs of [250,null]){await page.setContent(`<h1>${name}</h1><section data-testid="details">Independent content</section>`);let remounted=false;
 const wrap=(target:any):any=>new Proxy(target,{get(target,key){if(key==='isVisible')return async()=>{const visible=await target.isVisible();if(visible&&!remounted){remounted=true;await page.evaluate(({name,restoreMs})=>{document.querySelector('h1')!.remove();if(restoreMs!==null)setTimeout(()=>{const heading=document.createElement('h1');heading.textContent=name;document.body.prepend(heading);},restoreMs);},{name,restoreMs});}return visible;};if(key==='elementHandles')return async()=>(await target.elementHandles()).map(wrap);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const observedPage=new Proxy(page,{get(target,key){if(key==='getByRole')return(role:any,options:any)=>role==='heading'?wrap(target.getByRole(role,options)):target.getByRole(role,options);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const review=b.approve(),result=await observeLightningView(observedPage,{review,view,object:'Account',name,nativeDocumentVerified:true,budget:new BrowserBudget(review)});
 assert.equal(remounted,true);assert.equal(result.status,restoreMs===null?'not-rendered':'rendered-reviewed-view');assert.equal(result.assertionsChanged,false);if(result.status==='rendered-reviewed-view'){assert.equal(result.checks.name,true);assert.equal(result.checks.content,1);assert.equal(result.stableMs,100);}else if('checks'in result){assert.equal(result.checks?.name,false);}
 }
 }finally{await browser.close();b.history.close();}
});

test('region inspection rejects a detached snapshot immediately and accepts only the restored visible region',{timeout:10000},async()=>{
 const browser=await chromium.launch(localLaunchOptions());try{const page=await browser.newPage();page.setDefaultTimeout(80);await page.setContent('<h1>QA fixture</h1>');const locator=page.getByRole('heading',{name:'QA fixture',exact:true});let detached=false;
 const snapshotLocator=new Proxy(locator,{get(target,key){if(key==='elementHandles')return async()=>{const handles=await target.elementHandles();if(!detached){detached=true;await page.evaluate(()=>{document.querySelector('h1')!.remove();setTimeout(()=>{document.body.innerHTML='<h1>QA fixture</h1>';},250);});}return handles;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const config={strategy:'reviewed-regions-v1' as const,regions:[{id:'name',locator:{by:'role' as const,value:'heading',name:'QA fixture'}}],backgrounds:[]};
 const during=await inspectLightningReadiness(page,[snapshotLocator],config);assert.equal(detached,true);assert.equal(during.valid,false);assert.equal(during.regionsValid,false);assert.equal(during.positiveVisible,false);
 await locator.waitFor({state:'visible',timeout:1500});const after=await inspectLightningReadiness(page,[locator],config);assert.equal(after.valid,true);assert.equal(after.complete,true);assert.equal(after.positiveVisible,true);
 }finally{await browser.close();}
});
