import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { qaIntelligenceFixture, seedQAContracts } from '../src/demos/qa-intelligence-fixture.js';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { fingerprint, digest } from '../src/execution/browser-policy.js';
import { QAContractStore, validateOracle, validatePermissionExpectation, evaluateOracle, predicateResult, oracleVersion, permissionVersion, assessPermission, metadataOracleCandidates, type PermissionEvidence } from '../src/agents/qa-oracles.js';
import { observeOracleAPI, combineOracleObservations, observePermissionAccess } from '../src/execution/qa-verification.js';
import { WorkflowModelStore } from '../src/agents/workflow-models.js';
import { reviewJourneyEvidence } from '../src/agents/workflow-evidence.js';
import { designQAIntelligence, publishReviewedQAContract, writeQAIntelligenceReport } from '../src/agents/qa-intelligence.js';
import { compareScreenshotPixels, decodeScreenshotPNG } from '../src/execution/visual-pixels.js';
import { permissionEvidenceFromMetadata } from '../src/agents/permission-intelligence.js';
import { intelligenceFingerprint } from '../src/knowledge/intelligence-fingerprint.js';
import { IntelligenceSchema } from '../src/agents/org-intelligence.js';
import { buildComponentGraph } from '../src/agents/component-graph.js';
async function setup() { const f = await qaIntelligenceFixture(), h = new History(':memory:'), store = seedQAContracts(h, f), index = new KnowledgeIndex(h); index.bindSchema(f.scope, f.scope.metadataVersion); return { f, h, store, index }; }
test('reviewed oracles preserve literal criterion, current schema, persona and typed conditions', async () => { const { f, h } = await setup(); try {
    assert.equal(validateOracle(f.contracts[0], f.context, h).rule.expectedText, 'Draft ready');
    for (const patch of [{ scope: { ...f.scope, permission: 'Administrator' } }, { specVersion: 'changed' }, { rule: { ...f.contracts[0].rule, expectedText: 'Invented' } }, { rule: { ...f.contracts[0].rule, conditions: [{ field: 'Invented__c', op: 'present' }] } }]) {
        const c = { ...f.contracts[0], ...patch };
        c.version = oracleVersion(c);
        assert.throws(() => validateOracle(c, f.context, h));
    }
}
finally {
    h.close();
} });
test('unreviewed rule claims, missing literal requirements and changed versions block verification', async () => { const { f, h } = await setup(); try {
    const ctx = structuredClone(f.context), source = ctx.sources.find(s => s.id === f.rules.id)!;
    source.review = undefined;
    assert.throws(() => validateOracle(f.contracts[0], ctx, h), /reviewed/);
    const old = f.contracts[0];
    new WorkflowModelStore(h).observe([reviewJourneyEvidence({ ...f.rules, version: digest('new-rules') }, 'Synthetic Fixture Reviewer')]);
    assert.throws(() => new QAContractStore(h).get('oracle', old.version), /stale/);
}
finally {
    h.close();
} });
test('contract review is exact, immutable, content-hashed and requires a named operator', async () => { const { f, h } = await setup(); try {
    const c = { ...f.contracts[0], rule: { ...f.contracts[0].rule, expectedText: 'changed' } };
    assert.throws(() => new QAContractStore(h).put('oracle', c.version, c), /content/);
    assert.throws(() => new QAContractStore(h).review('oracle', c.version, { operator: 'REVIEW_REQUIRED', hash: c.version, reviewedAt: new Date().toISOString() }));
    assert.throws(() => new QAContractStore(h).review('oracle', c.version, { operator: 'Different', hash: digest('other'), reviewedAt: new Date().toISOString() }));
    h.db.prepare("UPDATE qa_contracts SET payload=? WHERE kind='oracle' AND version=?").run(JSON.stringify(c), c.version);
    assert.throws(() => new QAContractStore(h).get('oracle', c.version), /content/);
}
finally {
    h.close();
} });
test('oracle evaluation distinguishes missing evidence, typed boundaries, nonapplicable conditions and mismatches', async () => { const { f, h } = await setup(); try {
    const c = f.contracts[0], ui = c.rule.signals.find(s => s.channel === 'ui')!, good = [{ channel: 'ui' as const, key: fingerprint(ui.channel === 'ui' ? ui.locator : {}), value: 'Draft ready', available: true }, { channel: 'api' as const, key: 'Name', value: 'Synthetic QA Account', available: true }];
    assert.equal(evaluateOracle(c, { Name: 'Synthetic QA Account' }, good).status, 'verified');
    assert.equal(evaluateOracle(c, {}, good).status, 'unknown');
    assert.equal(evaluateOracle(c, { Name: '' }, good).status, 'not-applicable');
    assert.equal(evaluateOracle(c, { Name: 'Synthetic' }, good.slice(0, 1)).status, 'unknown');
    assert.equal(evaluateOracle(c, { Name: 'Synthetic' }, [...good, { ...good[0] }]).status, 'unknown');
    assert.equal(evaluateOracle(c, { Name: 'Synthetic' }, [good[0], { ...good[1], value: 'Changed' }]).status, 'mismatch');
    for (const [op, v, want] of [['gte', 200, true], ['gte', 199, false], ['lt', 199, true]] as const)
        assert.equal(predicateResult({ field: 'Employees__c', op, value: 200 }, { Employees__c: v }), want);
    assert.equal(predicateResult({ field: 'Employees__c', op: 'gte', value: 200 }, { Employees__c: '200' }), 'unknown');
}
finally {
    h.close();
} });
test('independent API oracle is exact-record bounded; failures, wrong rows and malformed values stay unknown', async () => { const { f, h } = await setup(); try {
    const c = f.contracts[0], input = { runId: 'oracle-1', recordId: '001000000000001', inputs: { Name: 'Synthetic QA Account' }, validation: 'offline-mocked-salesforce' as const };
    let query = '';
    const result = await observeOracleAPI(h, c.version, f.context, input, async (q) => { query = q; return { records: [{ Id: input.recordId, Name: 'Synthetic QA Account' }] }; });
    assert.equal(query, "SELECT Id,Name FROM Account WHERE Id='001000000000001' LIMIT 1");
    assert.equal(result.payload.result.checks.find(c => c.channel === 'api')?.status, 'passed');
    assert.equal(result.payload.result.status, 'unknown');
    for (const reader of [async () => { throw Error('private unavailable'); }, async () => ({ records: [{ Id: 'foreign', Name: 'Synthetic QA Account' }] }), async () => ({ records: [{ Id: input.recordId, Name: { invalid: true } }] })]) {
        const result = await observeOracleAPI(h, c.version, f.context, input, reader);
        assert.equal(result.payload.result.checks.find(c => c.channel === 'api')?.status, 'unknown');
        assert.ok(!JSON.stringify(result).includes('private unavailable'));
    }
    await assert.rejects(observeOracleAPI(h, c.version, f.context, { ...input, recordId: "bad' OR Name!='" }, async () => ({})));
}
finally {
    h.close();
} });
test('independent receipt joins reject cross-run, cross-record, cross-input and missing channels', async () => { const { f, h, store } = await setup(); try {
    const c = f.contracts[0], body = { kind: 'oracle-observation', contractVersion: c.version, scope: c.scope, runId: 'same', recordHash: digest('record'), inputHash: digest('input'), validation: 'offline-mocked-salesforce', result: { checks: [{ channel: 'ui', status: 'passed' }, { channel: 'api', status: 'passed' }] } };
    const ui = store.observe({ ...body, channel: 'ui' }), api = store.observe({ ...body, channel: 'api' });
    assert.equal(combineOracleObservations(h, c.version, ui.hash, api.hash).payload.status, 'verified');
    for (const patch of [{ runId: 'other' }, { recordHash: digest('other') }, { inputHash: digest('other') }, { validation: 'live-salesforce' }])
        assert.throws(() => combineOracleObservations(h, c.version, ui.hash, store.observe({ ...body, channel: 'api', ...patch }).hash), /different/);
}
finally {
    h.close();
} });
const unknown: PermissionEvidence = { profile: [], permissionSets: [], groups: [], complete: false, sharing: 'missing', sources: [] };
test('reviewed business contract cannot substitute for acceptance-criterion review', async () => { const { f, h } = await setup(); try {
    const context = structuredClone(f.context);
    context.sources.find(s => s.kind === 'requirement')!.review = undefined;
    assert.throws(() => validateOracle(f.contracts[0], context, h), /reviewed/);
    assert.throws(() => validatePermissionExpectation(f.permission, context, h), /review/);
}
finally {
    h.close();
} });
test('a read-denial receipt cannot claim to prove edit access, another field, persona or object', async () => { const { f, h } = await setup(); try {
    const input = { runId: 'scoped-permission', recordHash: digest('r'), validation: 'offline-mocked-salesforce' as const, channel: 'api' as const, access: 'denied' as const, evidenceHash: digest('read denial'), observedOperation: 'read' as const, observedObject: 'Contact', observedField: 'LastName', observedScopeHash: fingerprint(f.scope) };
    for (const patch of [{ observedOperation: 'edit' as const }, { observedObject: 'Account' }, { observedField: 'Name' }, { observedScopeHash: digest('other persona') }])
        assert.throws(() => observePermissionAccess(h, f.permission.version, f.context, { ...input, ...patch }, unknown), /scope\/operation/);
}
finally {
    h.close();
} });
test('permission declarations never prove runtime access and unknown evidence is not denial', async () => { const { f, h } = await setup(); try {
    assert.equal(validatePermissionExpectation(f.permission, f.context, h).rule.expectedAccess, 'denied');
    const a = assessPermission(f.permission, unknown);
    assert.equal(a.declaredCandidate, 'unknown');
    assert.equal(a.effectiveAccess, 'unknown');
    assert.equal(a.status, 'review-required');
    assert.ok(a.questions.length >= 2);
    assert.equal(a.permissionGranted, false);
    const grant = assessPermission(f.permission, { ...unknown, profile: [true], objectGrant: true, complete: true });
    assert.equal(grant.declaredCandidate, true);
    assert.equal(grant.effectiveAccess, 'unknown');
    assert.equal(assessPermission(f.permission, { ...unknown, profile: [true], complete: true }).declaredCandidate, 'unknown');
}
finally {
    h.close();
} });
test('group muting cannot remove independent direct grants; object and field candidates are conjunctive', async () => { const { f, h } = await setup(); try {
    const base = { ...unknown, complete: true, objectGrant: true, groups: [{ grants: [true], muted: true, complete: true }] };
    assert.equal(assessPermission(f.permission, base).declaredCandidate, false);
    assert.equal(assessPermission(f.permission, { ...base, permissionSets: [true] }).declaredCandidate, true);
    assert.equal(assessPermission(f.permission, { ...base, permissionSets: [true], objectGrant: false }).declaredCandidate, false);
    assert.equal(assessPermission(f.permission, { ...base, groups: [{ grants: [true], muted: false, complete: false }], complete: false }).declaredCandidate, 'unknown');
}
finally {
    h.close();
} });
test('permission receipts require exact source/persona and retain independent runtime mismatch without granting access', async () => { const { f, h } = await setup(); try {
    const input = { runId: 'permission-1', recordHash: digest('r'), validation: 'offline-mocked-salesforce' as const, channel: 'api' as const, access: 'denied' as const, evidenceHash: digest('denied response'), observedOperation: 'read' as const, observedObject: 'Contact', observedField: 'LastName', observedScopeHash: fingerprint(f.scope) };
    const r = observePermissionAccess(h, f.permission.version, f.context, input, unknown);
    assert.equal(r.payload.result.status, 'verified');
    assert.equal(r.payload.authorityGranted, false);
    assert.equal(observePermissionAccess(h, f.permission.version, f.context, { ...input, access: 'allowed' }, unknown).payload.result.status, 'mismatch');
    assert.equal(assessPermission(f.permission, { ...unknown, runtime: { scopeHash: digest('foreign'), object: 'Contact', field: 'LastName', operation: 'edit', recordHash: digest('r'), access: 'denied', evidenceHash: digest('e') } }).effectiveAccess, 'unknown');
}
finally {
    h.close();
} });
test('permission metadata adapter reads assigned profile/direct sets and rejects user/version mismatch', async () => { const { f, h } = await setup(); try {
    const section = (area: string, records: Record<string, unknown>[]) => ({ area, records, status: 'observed' as const, source: 'fixture:' + area, detail: 'synthetic' }), intel = IntelligenceSchema.parse({ orgAlias: 'fixture', observedAt: new Date().toISOString(), identity: { Id: '00D000000000001', userId: '005000000000001', IsSandbox: false }, catalogCount: 1, selection: { selected: [], unresolved: [], omitted: [], status: 'proposed' }, snapshot: f.org, sections: [section('persona-profile', [{ ProfileId: 'profile' }]), section('persona-assignments', [{ PermissionSetId: 'direct' }]), section('permission-sets', [{ Id: 'profile-set', ProfileId: 'profile', IsOwnedByProfile: true }]), section('object-permissions', [{ ParentId: 'profile-set', SobjectType: 'Contact', PermissionsEdit: false }, { ParentId: 'direct', SobjectType: 'Contact', PermissionsEdit: true }]), section('field-permissions', [{ ParentId: 'profile-set', SobjectType: 'Contact', Field: 'Contact.LastName', PermissionsEdit: false }, { ParentId: 'direct', SobjectType: 'Contact', Field: 'Contact.LastName', PermissionsEdit: true }])], unknowns: [] });
    intel.snapshot.intelligenceFingerprint = intelligenceFingerprint(intel);
    const c = { ...f.permission, rule: { ...f.permission.rule, operation: 'edit' as const }, scope: { ...f.scope, org: digest(intel.identity.Id), metadataVersion: intelligenceFingerprint(intel) } };
    c.version = permissionVersion(c);
    const evidence = permissionEvidenceFromMetadata(intel, c, digest(intel.identity.userId));
    assert.equal(evidence.objectGrant, true);
    assert.equal(assessPermission(c, evidence).declaredCandidate, true);
    assert.equal(assessPermission(c, evidence).effectiveAccess, 'unknown');
    assert.throws(() => permissionEvidenceFromMetadata(intel, c, digest('foreign')), /differs/);
    intel.sections.push(section('permission-set-groups', [{ Id: 'group', DeveloperName: 'SalesTeam', Status: 'Updated' }]), section('permission-group-components', [{ PermissionSetGroupId: 'group', PermissionSetId: 'member' }]), section('permission-group-metadata', [{ metadata: { records: { fullName: 'SalesTeam', mutingPermissionSets: ['MuteSales'] } } }]), section('muting-permission-sets', [{ metadata: { records: { fullName: 'MuteSales', objectPermissions: { object: 'Contact', allowEdit: true }, fieldPermissions: { field: 'Contact.LastName', editable: true } } } }]));
    intel.sections.find(s => s.area === 'persona-assignments')!.records.push({ PermissionSetGroupId: 'group' });
    for (const area of ['object-permissions', 'field-permissions']) {
        const rows = intel.sections.find(s => s.area === area)!.records;
        rows.forEach(r => { r.PermissionsEdit = false; });
        rows.push({ ParentId: 'member', SobjectType: 'Contact', ...(area === 'field-permissions' ? { Field: 'Contact.LastName' } : {}), PermissionsEdit: true });
    }
    const recapture = () => { intel.snapshot.intelligenceFingerprint = intelligenceFingerprint(intel); c.scope.metadataVersion = intelligenceFingerprint(intel); c.version = permissionVersion(c); return permissionEvidenceFromMetadata(intel, c, digest(intel.identity.userId)); };
    const muted = recapture();
    assert.equal(muted.groups[0].muted, true);
    assert.equal(assessPermission(c, muted).declaredCandidate, false);
    for (const area of ['object-permissions', 'field-permissions']) intel.sections.find(s => s.area === area)!.records.find(r => r.ParentId === 'direct')!.PermissionsEdit = true;
    assert.equal(assessPermission(c, recapture()).declaredCandidate, true);
    assert.equal(assessPermission(c, recapture()).effectiveAccess, 'unknown');
    intel.sections[0].records = [];
    assert.throws(() => permissionEvidenceFromMetadata(intel, c, digest(intel.identity.userId)), /differs/);
}
finally {
    h.close();
} });
test('local reviewed expectation RAG retrieval stays source/persona isolated and invalidates changed evidence', async () => { const { f, h, index } = await setup(); try {
    await publishReviewedQAContract(h, index, 'oracle', f.contracts[0].version, f.context);
    assert.ok((await index.retrieve('Account Draft ready', f.scope, 10)).some(d => d.text.includes('runtime outcome unverified')));
    assert.equal((await index.retrieve('Account Draft ready', { ...f.scope, permission: 'other' }, 10)).length, 0);
    new WorkflowModelStore(h).observe([reviewJourneyEvidence({ ...f.rules, version: digest('changed') }, 'Synthetic Fixture Reviewer')]);
    assert.equal((await index.retrieve('Account Draft ready', f.scope, 10)).length, 0);
    let external = 0;
    await assert.rejects(publishReviewedQAContract(h, new KnowledgeIndex(h, async () => { external++; return [[1]]; }), 'oracle', f.contracts[0].version, f.context), /local-only/);
    assert.equal(external, 0);
}
finally {
    h.close();
} });
test('unobserved workflows remain blocked, report escapes markup and no proposal gets execution authority', async () => { const { f, h, index } = await setup(); try {
    const result = await designQAIntelligence({ ...f, permission: 'QA', changes: ['Field:Contact.LastName'] }, { history: h, index }, { oracles: f.contracts.map(c => c.version), permissions: [f.permission.version], visuals: [], permissionEvidence: {} });
    assert.equal(result.coverage.length, 7);
    assert.ok(result.coverage.every(c => !c.proposal));
    assert.ok(result.questions.some(q => q.reason.includes('runtime')));
    assert.equal(result.permissionsGranted, 0);
    result.questions.push({ reason: '<script>alert(1)</script>' });
    const files = await writeQAIntelligenceReport(result), html = await readFile(files.html, 'utf8');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(metadataOracleCandidates(f.graph).every(c => c.expectedOutcome === 'unknown'));
}
finally {
    h.close();
} });
const raster = (size = 20) => ({ width: size, height: size, pixels: new Uint8Array(size * size * 4).fill(255) }), policy = { dynamic: [{ id: 'clock', x: 0, y: 0, width: 2, height: 2 }], critical: [{ id: 'content', x: 5, y: 5, width: 5, height: 5 }], channelTolerance: 5, maxChangedRatio: 0.01 };
test('pixel oracle ignores only reviewed dynamic regions and flags critical layout changes', () => { const a = raster(), b = raster(); b.pixels[0] = 0; const dynamic = compareScreenshotPixels(a, b, policy); assert.equal(dynamic.status, 'within-reviewed-tolerance'); assert.equal(dynamic.ignoredDynamicChanges, 1); b.pixels[(6 * 20 + 6) * 4] = 0; const layout = compareScreenshotPixels(a, b, policy); assert.equal(layout.status, 'review-required'); assert.equal(layout.defectConfirmed, false); });
test('visual oracle rejects oversized/critical masks, invalid tolerances, viewport drift and malformed PNG', () => { const a = raster(); assert.throws(() => compareScreenshotPixels(a, a, { ...policy, dynamic: policy.critical }), /critical/); assert.throws(() => compareScreenshotPixels(a, a, { ...policy, dynamic: [{ id: 'all', x: 0, y: 0, width: 20, height: 20 }] }), /budget/); assert.throws(() => compareScreenshotPixels(a, a, { ...policy, maxChangedRatio: NaN })); assert.equal(compareScreenshotPixels(a, raster(21), policy).status, 'incompatible'); assert.throws(() => decodeScreenshotPNG(Buffer.from('not png')), /PNG/); });
test('validation-rule declarations retain exact formula evidence without inventing runtime expectations', async () => { const { f, h } = await setup(); try {
    const intel = IntelligenceSchema.parse({ orgAlias: 'fixture', observedAt: new Date().toISOString(), identity: { Id: '00D000000000001', userId: '005000000000001', IsSandbox: true }, catalogCount: 1, selection: { selected: [], unresolved: [], omitted: [], status: 'proposed' }, snapshot: f.org, sections: [{ area: 'object-business-metadata', status: 'observed', source: 'fixture:Account.metadata', detail: 'fixture', records: [{ metadata: { records: { fullName: 'Account', validationRules: { fullName: 'NameRequired', active: true, errorConditionFormula: 'ISBLANK(Name)', errorMessage: 'A name is required' } } } }] }], unknowns: [] }), graph = buildComponentGraph(intel), candidates = metadataOracleCandidates(graph);
    assert.ok(candidates.some(c => c.kind === 'ValidationRule'));
    assert.ok(candidates.every(c => c.runtimeVerified === false && c.expectedOutcome === 'unknown'));
}
finally {
    h.close();
} });
