import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserFixture } from './support/browser-policy.js';
import { authorizeBrowserSession, browserPlanHash, browserDocument, resourceRule, resolveBrowserRecords, reserveBrowserSession, fingerprint } from '../src/execution/browser-policy.js';
import { browserNetworkDecision } from '../src/execution/browser-network.js';
import { BrowserBudget, BrowserResourceBroker } from '../src/execution/browser-resources.js';
import { BrowserActionBroker } from '../src/execution/browser-actions.js';
import { parseBrowserBuild } from '../src/execution/browser-build.js';
import { dedicatedPlanHash } from '../src/salesforce/dedicated-qa.js';
import { generateTest } from '../src/agents/workflows.js';

test('dedicated browser policy requires exact local org/user/persona/build and cannot affect ordinary Production or sandbox modes', () => {
  const b = browserFixture(); try { const review = b.approve(); authorizeBrowserSession(review, b.f.policy, b.f.identity, b.build);
    for (const mode of ['PRODUCTION_READ_ONLY_QA', 'PRODUCTION_CONTROLLED_QA', 'SANDBOX_QA']) assert.throws(() => authorizeBrowserSession(review, { ...b.f.policy, mode }, b.f.identity, b.build));
    for (const identity of [{ ...b.f.identity, Id: '00D999999999999' }, { ...b.f.identity, userId: '005999999999999' }]) assert.throws(() => authorizeBrowserSession(review, b.f.policy, identity, b.build));
    assert.throws(() => authorizeBrowserSession(review, b.f.policy, b.f.identity, { ...b.build, buildHash: '0'.repeat(64) }));
    for (const approval of [{ ...review.approval, operator: 'REVIEW_REQUIRED' }, { ...review.approval, hash: '0'.repeat(64) }, { ...review.approval, expiresAt: new Date(Date.now() - 1).toISOString() }]) assert.throws(() => authorizeBrowserSession({ ...review, approval }, b.f.policy, b.f.identity, b.build));
    assert.throws(() => authorizeBrowserSession({ ...review, plan: { ...review.plan, budgets: { ...review.plan.budgets, actions: 1 } }, approval: { ...review.approval, hash: browserPlanHash({ ...review.plan, budgets: { ...review.plan.budgets, actions: 1 } }) } }, b.f.policy, b.f.identity, b.build));
  } finally { b.history.close(); }
});
test('versioned resource policy permits reviewed dynamic context variants without URL approvals and rejects unrelated hosts, definitions and credentials', () => {
  const b = browserFixture(); try {
    for (let i = 0; i < 20; i++) assert.ok(resourceRule(b.plan, { url: b.resource.replace('_uid=first', `_uid=build-context-${i}`).replace('_style=initial', `_style=style-${i}`), method: 'GET', type: 'script' }));
    for (const request of [{ url: b.resource.replace('one%3Aone', 'evil%3Acustom') }, { url: b.resource + '&access_token=PRIVATE' }, { url: b.resource + '&_uid=duplicate' }, { url: b.resource.replace('b.static.lightning.force.com', 'other-org.my.salesforce.com') }, { url: b.resource.replace('/fixture-build/auraCmpDef', '/services/data/v62.0/sobjects/Account') }, { url: b.resource, method: 'POST' }, { url: b.resource, type: 'document' }]) assert.equal(resourceRule(b.plan, Object.assign({ url: b.resource, method: 'GET', type: 'script' }, request)), undefined);
    assert.equal(browserDocument(b.plan, `${b.f.browserOrigin}/lightning/r/Account/${b.recordId}/view`), true); assert.equal(browserDocument(b.plan, `${b.f.browserOrigin}/lightning/r/Account/001999999999999/view`), false);
    b.plan.resources.push({origin:b.plan.resources[0].origin,path:'/l/%7B%22bundle%22%3A%22one%2Fone%22%7D/fixture.js',match:'exact',kind:'script',queryKeys:[],definitions:[]});
    const encoded=b.plan.resources[0].origin+b.plan.resources.at(-1)!.path;
    assert.ok(resourceRule(b.plan,{url:encoded,method:'GET',type:'script'}));
    assert.equal(resourceRule(b.plan,{url:encoded.replace('one%2Fone','foreign%2Fcomponent'),method:'GET',type:'script'}),undefined);
  } finally { b.history.close(); }
});
test('initialization is not inferred from get-like names and every batched action/query/parameter remains constrained', () => {
  const b = browserFixture(); try { const request = { url: b.f.browserOrigin + '/aura?aura.OneController.getCurrentApp=1', method: 'POST', type: 'xhr', body: b.body() };
    assert.equal(browserNetworkDecision(b.plan, b.plan.records, request).allow, false); b.plan.contracts.push(b.contract()); authorizeBrowserSession(b.approve(), b.f.policy, b.f.identity, b.build); assert.equal(browserNetworkDecision(b.plan, b.plan.records, request).allow, true);
    for (const changed of [{ url: request.url + '&extra=1' }, { body: b.body([{ id: '1', descriptor: b.contract().descriptor, params: { appContextIdOrName: '06m999999999999' } }]) }, { body: b.body([{ id: '1', descriptor: 'aura://OtherController/ACTION$getEverything', params: { appContextIdOrName: b.appId } }]) }, { body: b.body([{ id: '1', descriptor: b.contract().descriptor, params: { appContextIdOrName: b.appId, extra: 'bad' } } as never]) }, { body: b.body([{ id: '1', descriptor: b.contract().descriptor, params: { appContextIdOrName: b.appId } }, { id: '2', descriptor: 'aura://RecordUiController/ACTION$deleteRecord', params: { appContextIdOrName: b.appId } }]) }]) assert.equal(browserNetworkDecision(b.plan, b.plan.records, { ...request, ...changed }).allow, false);
    b.plan.contracts[0].descriptor = 'aura://ApexActionController/ACTION$getData'; assert.throws(() => authorizeBrowserSession(b.approve(), b.f.policy, b.f.identity, b.build));
  } finally { b.history.close(); }
});
test('documented UI API reads cannot escape the approved record or acquire forms, mutations, financial or administrative authority', () => {
  const b = browserFixture(); try { const request = { url: `${b.f.browserOrigin}/services/data/v62.0/ui-api/records/${b.recordId}?fields=Account.Name`, method: 'GET', type: 'fetch' }; assert.equal(browserNetworkDecision(b.plan, b.plan.records, request).allow, true);
    for (const changed of [{ url: request.url.replace(b.recordId, '001999999999999') }, { url: request.url.replace('Account.Name', 'Contact.LastName') }, { method: 'PATCH' }, { method: 'DELETE' }, { url: b.f.browserOrigin + '/services/data/v62.0/sobjects/Account', method: 'POST' }, { url: request.url + '&mode=Edit' }, { url: b.f.browserOrigin + '/apex/Payment', type: 'document' }]) assert.equal(browserNetworkDecision(b.plan, b.plan.records, { ...request, ...changed }).allow, false);
  } finally { b.history.close(); }
});
test('build proof reads exact native source without eval and rejects missing or ambiguous versions', () => {
  const b = browserFixture(); try { const proof = parseBrowserBuild(b.native + '<script>throw new Error("PRIVATE_MUST_NOT_RUN")</script>'); assert.equal(proof.buildHash, b.plan.buildHash); assert.equal(proof.appHash, b.plan.appHash); assert.throws(() => parseBrowserBuild(b.native.replace('fwuid', 'other'))); assert.throws(() => parseBrowserBuild(b.native + b.native)); } finally { b.history.close(); }
});
test('public resource cache isolates builds, validates content, avoids cookie jars, reuses bytes and stops after expiry', async () => {
  const b = browserFixture(); let now = Date.now(), calls = 0, body = 'window.fixture=true;', setCookie = false; const get: typeof fetch = async (_url, init) => { calls++; assert.equal(init?.redirect, 'manual'); assert.equal(init?.credentials, 'omit'); assert.ok(!JSON.stringify(init?.headers).toLowerCase().includes('cookie')); assert.ok(!JSON.stringify(init?.headers).toLowerCase().includes('authorization')); return new Response(body, { headers: { 'content-type': 'application/javascript', ...(setCookie ? { 'set-cookie': 'PRIVATE_COOKIE=value' } : {}) } }); };
  try { const review = b.approve(), budget = new BrowserBudget(review, () => now), broker = new BrowserResourceBroker(b.history, review, b.f.policy, b.f.identity, b.build, budget, get), request = { url: b.resource, method: 'GET', type: 'script' };
    assert.equal((await broker.serve(request)).body.toString(), body); await broker.serve(request); assert.equal(calls, 1); assert.equal(broker.hits, 1);
    b.history.db.prepare("UPDATE browser_resource_cache SET headers=?").run(JSON.stringify({ 'content-type': 'application/javascript', 'x-content-type-options': 'nosniff', 'set-cookie': 'PRIVATE' })); await assert.rejects(broker.serve(request), /integrity/);
    b.history.db.prepare('DELETE FROM browser_resource_cache').run(); setCookie = true; await assert.rejects(broker.serve(request), /credential variance/); setCookie = false;
    body = '<html>PRIVATE_PROVIDER_BODY</html>'; await assert.rejects(broker.serve(request), /HTML/); body = 'window.fixture=true;'; await broker.serve(request);
    const previousCalls=calls,originalVersion=b.plan.sourceVersion;b.plan.sourceVersion=fingerprint('changed-source-version');const revised=structuredClone(b.approve());b.plan.sourceVersion=originalVersion;
    const isolated=new BrowserResourceBroker(b.history,revised,b.f.policy,b.f.identity,b.build,new BrowserBudget(revised),get);await isolated.serve(request);assert.equal(calls,previousCalls+1);assert.equal(isolated.hits,0);
    now += 3600001; await assert.rejects(broker.serve(request), /authorization|expired/); assert.ok(!JSON.stringify(b.history.db.prepare('SELECT namespace,url,hash,mime FROM browser_resource_cache').all()).includes('PRIVATE_'));
  } finally { b.history.close(); }
});
test('session and request budgets are finite and observations never adopt existing records for cleanup or agent actions', async () => {
  const b = browserFixture(); try { const review = b.approve(), budget = new BrowserBudget(review); reserveBrowserSession(review, b.history, 'first'); assert.throws(() => reserveBrowserSession(review, b.history, 'first')); reserveBrowserSession(review, b.history, 'second'); assert.throws(() => reserveBrowserSession(review, b.history, 'third')); assert.equal(resolveBrowserRecords(b.plan).length, 1); let effects = 0; const broker = new BrowserActionBroker(b.history, review, b.f.policy, b.f.identity, b.build, budget), workflow = { id: 'view', criterion: 'AC1', source: 'fixture', reviewer: b.f.policy.approval.operator, origin: b.f.browserOrigin, path: `/lightning/r/Account/${b.recordId}/view`, steps: [{ action: 'click', locator: { by: 'role', value: 'button', name: 'Details' } }], assertion: { locator: { by: 'role', value: 'heading' }, text: 'Fixture' } }; await assert.rejects(broker.execute(workflow, 0, async () => { effects++; })); assert.equal(effects, 0); for (let i = 0; i < b.plan.budgets.requests; i++) budget.request(); assert.throws(() => budget.request());
  } finally { b.history.close(); }
});
test('owned browser leases derive exact verified IDs from the existing factory and preserve uncertainty/replay controls', async () => {
  const b = browserFixture(); try { await b.f.data.open(b.f.input.data, b.f.org); await b.f.data.setup(b.f.input.data); b.plan.records = []; b.plan.objects = ['Account', 'Contact']; b.plan.runId = b.f.input.data.plan.runId; b.plan.ownedDataPlanHash = dedicatedPlanHash(b.f.input.data.plan); const records = resolveBrowserRecords(b.plan, b.history); assert.equal(records.length, 2); b.history.db.prepare("UPDATE dedicated_records SET status='created-unverified' WHERE object='Contact'").run(); assert.throws(() => resolveBrowserRecords(b.plan, b.history)); b.history.db.prepare("UPDATE dedicated_records SET status='verified'").run(); await b.f.data.cleanup(b.f.input.data); b.f.data.finish(b.f.input.data); assert.throws(() => resolveBrowserRecords(b.plan, b.history)); assert.equal(b.f.records.size, 0); } finally { b.history.close(); }
});
test('generated dedicated code delegates the network boundary and agent steps while legacy code retains its original origin gate', () => {
  const b = browserFixture(); try { const w = { id: 'generated', criterion: 'AC1', source: 'fixture', reviewer: 'fixture', origin: b.f.browserOrigin, path: `/lightning/r/Account/${b.recordId}/view`, steps: [{ action: 'click' as const, locator: { by: 'role' as const, value: 'button', name: 'Details' } }], assertion: { locator: { by: 'role' as const, value: 'heading', name: 'Fixture' }, text: 'Fixture' } }, legacy = generateTest(w, [b.f.browserOrigin]), reviewed = generateTest(w, [b.f.browserOrigin], { module: './browser-guard.ts', config: './private.json', ownsNetworkBoundary: true }); assert.ok(legacy.includes('page.route')); assert.ok(!reviewed.includes('page.route')); assert.ok(reviewed.includes('executeReviewedWorkflowStep')); assert.ok(!reviewed.includes('.click(')); assert.ok(reviewed.includes('toHaveText("Fixture")')); } finally { b.history.close(); }
});

test('dedicated generated API assertions cannot bypass browser routing through the separate request fixture',()=>{
  const b=browserFixture();try{
    const workflow={id:'api-bypass',criterion:'AC1',source:'fixture',reviewer:b.f.policy.approval.operator,origin:b.f.browserOrigin,path:`/lightning/r/Account/${b.recordId}/view`,steps:[],assertion:{locator:{by:'role' as const,value:'heading'},text:'Unchanged'},apiAssertions:[{path:'/apex/UnknownSideEffects',source:'unreviewed',expected:{success:true}}]};
    assert.throws(()=>generateTest(workflow,[b.f.browserOrigin],{module:'./browser-guard.ts',config:'./private.json',ownsNetworkBoundary:true}),/scoped Salesforce verification adapter/);
  }finally{b.history.close();}
});
