import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchLocalBrowser} from '../src/execution/local-browser.js';
import {inspectLightningReadiness,ReadinessRegionsSchema} from '../src/execution/lightning-readiness.js';
import {observeLightningView,lightningViewHash} from '../src/execution/lightning-view.js';
import {digest} from '../src/execution/browser-policy.js';
import {BrowserBudget} from '../src/execution/browser-resources.js';
import {browserFixture} from './support/browser-policy.js';

test('region readiness distinguishes hidden, inactive, required, unrelated and overlaid busy states without treating aria-hidden as visual hiding',{timeout:30000},async()=>{
 const browser=await launchLocalBrowser();try{const page=await browser.newPage();const config=ReadinessRegionsSchema.parse({strategy:'reviewed-regions-v1',regions:[{id:'record',locator:{by:'testId',value:'record'}}],backgrounds:[{id:'activity',locator:{by:'testId',value:'activity'},reason:'independent-background',sourceHash:digest('fixture-review')}]});
 const inspect=()=>inspectLightningReadiness(page,[page.getByRole('heading',{name:'QA',exact:true}),page.getByTestId('detail')],config);
 const base='<main data-testid="record"><h1>QA</h1><div data-testid="detail">Ready</div></main>';
 await page.setContent(base+'<aside data-testid="activity" aria-busy="true">Background</aside>');let result=await inspect();assert.equal(result.blockingBusy,0);assert.equal(result.signals[0].classification,'reviewed-background');assert.equal((await inspectLightningReadiness(page,[])).blockingBusy,1);
 for(const hidden of ['style="display:none"','hidden','style="opacity:0"','style="visibility:hidden"','style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0px,0px,0px,0px)"']){await page.setContent(base+`<div ${hidden}><div class="slds-spinner" style="width:20px;height:20px"></div></div>`);result=await inspect();assert.equal(result.blockingBusy,0);assert.equal(result.signals[0].classification,'hidden');}
 await page.setContent(base+'<div role="tabpanel" id="inactive" hidden><div aria-busy="true">Loading</div></div><button role="tab" aria-controls="inactive" aria-selected="false">Other</button>');result=await inspect();assert.equal(result.blockingBusy,0);assert.equal(result.signals[0].inactiveTab,true);
 for(const markup of ['<div aria-hidden="true" aria-busy="true">Visible</div>','<div style="position:absolute;left:-500px" aria-busy="true">Offscreen</div>','<div class="slds-spinner" style="width:20px;height:20px">Loading</div>']){await page.setContent(base+markup);assert.ok((await inspect()).blockingBusy>0);}
 await page.setContent('<main data-testid="record" aria-busy="true"><h1>QA</h1><div data-testid="detail">Ready</div></main>');result=await inspect();assert.equal(result.signals[0].classification,'required-region');assert.equal(result.blockingBusy,1);
 await page.setContent(base+'<aside data-testid="activity" style="position:fixed;inset:0" aria-busy="true">Overlay</aside>');assert.equal((await inspect()).blockingBusy,1);
 await page.setContent(base+'<aside data-testid="activity"><div role="alert">Error</div></aside>');assert.equal((await inspect()).blockingFaults,1);
 await page.setContent(`<div style="opacity:0">${base}</div>`);result=await inspect();assert.equal(result.positiveVisible,false);assert.equal(result.valid,false);
 await page.setContent(`<div style="position:absolute;top:-2000px">${base}</div>`);assert.equal((await inspect()).valid,false);
 await page.setContent('<main data-testid="record"><aside data-testid="activity"><h1>QA</h1><div data-testid="detail">Ready</div></aside></main>');assert.equal((await inspect()).valid,false);
 await page.setContent('<main data-testid="record"><qa-widget></qa-widget></main>');await page.locator('qa-widget').evaluate(host=>{host.attachShadow({mode:'open'}).innerHTML='<h1>QA</h1><div data-testid="detail">Ready</div><span aria-busy="true">Loading</span>';});result=await inspect();assert.equal(result.blockingBusy,1);assert.equal(result.signals[0].classification,'required-region');assert.ok(result.signals[0].path.includes('::shadow-root::'));
 assert.ok(!JSON.stringify(result).includes('>QA<'));assert.ok(result.signals[0].pathHash);
 await page.setContent(base);await page.evaluate(()=>{for(let i=0;i<105;i++){const host=document.createElement('qa-widget');host.attachShadow({mode:'open'});document.body.append(host);}});assert.equal((await inspect()).complete,false);
 }finally{await browser.close();}
});

test('reviewed generic object/LWC readiness requires stable region content and a new view hash; the old global gate remains unchanged',{timeout:30000},async()=>{
 const browser=await launchLocalBrowser(),b=browserFixture();try{const page=await browser.newPage();await page.setContent('<section data-testid="record"><h1>QA</h1><div data-testid="detail">Ready</div></section><aside data-testid="background" aria-busy="true">Updating</aside>');
 const base={version:1,object:'Custom_Object__c',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('fixture-reviewed-custom-page'),recordName:{by:'role',value:'heading',name:'{{record-name}}'},content:[{by:'testId',value:'detail'}],busy:[],faults:[],stableMs:200};const view={...base,readiness:{strategy:'reviewed-regions-v1',regions:[{id:'record',locator:{by:'testId',value:'record'}}],backgrounds:[{id:'background',locator:{by:'testId',value:'background'},reason:'independent-background',sourceHash:digest('fixture-reviewed-background')}]}};
 b.plan.budgets.maxMs=1500;b.plan.renderContractHash=lightningViewHash(base);const observe=(input:unknown)=>observeLightningView(page,{view:input,review:b.approve(),object:'Custom_Object__c',name:'QA',nativeDocumentVerified:true,budget:new BrowserBudget(b.approve()),reserveMs:500});
 assert.notEqual(lightningViewHash(view),lightningViewHash(base));await assert.rejects(observe(view),/contract differs/);assert.equal((await observe(base)).status,'not-rendered');b.plan.renderContractHash=lightningViewHash(view);assert.equal((await observe(view)).status,'rendered-reviewed-view');
 await page.evaluate(()=>{setInterval(()=>{document.querySelector('[data-testid="detail"]')!.textContent=String(Math.random());},30);});assert.equal((await observe(view)).status,'not-rendered');
 }finally{await browser.close();b.history.close();}
});

test('source-reviewed deferred related-list policy is viewport-scoped, bounded and cannot ignore required, visible or unknown busy components',{timeout:30000},async()=>{
 const browser=await launchLocalBrowser();try{const page=await browser.newPage();await page.setContent('<section data-testid="record"><h1>QA</h1><div data-testid="detail">Ready</div></section><div style="height:1200px"></div><lst-related-list-single-container><laf-progressive-container data-testid="deferred" aria-busy="true" style="display:block;height:30px">Deferred fixture only</laf-progressive-container></lst-related-list-single-container>');await page.evaluate(()=>{for(let i=0;i<154;i++){const host=document.createElement('qa-widget');host.attachShadow({mode:'open'});document.body.append(host);}});
 const base=ReadinessRegionsSchema.parse({strategy:'reviewed-regions-v1',regions:[{id:'record',locator:{by:'testId',value:'record'}}],backgrounds:[]}),config=ReadinessRegionsSchema.parse({...base,inspection:{maxRoots:512},deferredRelatedLists:{component:'laf-progressive-container',ancestor:'lst-related-list-single-container',reason:'outside-reviewed-viewport-only',sourceHashes:[digest('sanitized-observed-component-fixture')]}}),anchors=[page.getByRole('heading',{name:'QA',exact:true}),page.getByTestId('detail')];
 assert.equal((await inspectLightningReadiness(page,anchors,base)).complete,false);let result=await inspectLightningReadiness(page,anchors,config);assert.equal(result.complete,true);assert.equal(result.blockingBusy,0);assert.equal(result.legacyCounts.nativeAriaBusy,1);assert.equal(result.signals[0].classification,'reviewed-deferred-related-list');assert.equal(result.signals[0].ariaBusy,true);
 const required=ReadinessRegionsSchema.parse({...config,regions:[...config.regions,{id:'requested-list',locator:{by:'testId',value:'deferred'}}]});assert.equal((await inspectLightningReadiness(page,anchors,required)).blockingBusy,1);
 await page.getByTestId('deferred').evaluate(node=>{(node as HTMLElement).style.position='fixed';(node as HTMLElement).style.top='10px';});assert.equal((await inspectLightningReadiness(page,anchors,config)).blockingBusy,1);
 await page.getByTestId('deferred').evaluate(node=>{(node as HTMLElement).style.position='static';const unknown=document.createElement('div');unknown.setAttribute('aria-busy','true');unknown.textContent='Unknown';document.body.append(unknown);});result=await inspectLightningReadiness(page,anchors,config);assert.equal(result.blockingBusy,1);assert.ok(result.signals.some(s=>s.classification==='unresolved'&&s.blocking));
 assert.throws(()=>ReadinessRegionsSchema.parse({...config,inspection:{maxRoots:513}}));
 }finally{await browser.close();}
});
