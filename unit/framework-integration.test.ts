import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BrowserContext } from '@playwright/test';
import { demonstrateIntegratedFramework } from '../src/demos/integrated-framework.js';
import { History } from '../src/core/history.js';
import { QAContractStore } from '../src/agents/qa-oracles.js';
import { fingerprint, digest } from '../src/execution/browser-policy.js';
import { fixtureQAHash, readFixtureQAConfig, installDedicatedGuardFile } from '../src/execution/fixture-qa-guard.js';
import { startQAIntelligenceFixture } from '../fixtures/qa-intelligence-server.js';
import { frameworkDoctor, importFrameworkRequirement, inspectFramework } from '../src/core/framework-operator.js';
import { PipelineInputSchema, createSpecPipeline, executionHash } from '../src/agents/pipeline.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { DurableSaver } from '../src/core/checkpoints.js';
import { Command } from '@langchain/langgraph';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
let demonstration: Awaited<ReturnType<typeof demonstrateIntegratedFramework>>, manifest: any, db: DatabaseSync;
before(async () => { demonstration = await demonstrateIntegratedFramework(); manifest = JSON.parse(await readFile(demonstration.manifest, 'utf8')); }, { timeout: 360000 });
async function evidence() { return new History(demonstration.historyPath); }
test('connected story/metadata/application/RAG/graph/generated execution succeeds through actual reportingLabs', async () => { const success = manifest.runs[0]; assert.equal(success.lifecycle.status, 'passed'); assert.deepEqual(success.execution.results.map((r: any) => r.status), Array(7).fill('passed')); assert.deepEqual(success.factoryModes, ['api', 'business-service']); assert.equal(success.application.pages, 2); assert.equal(success.mcp.sameContext, true); assert.equal(success.mcp.snapshots, 14); assert.ok(success.semanticHits > 0 && success.persistedHits > 0); assert.deepEqual(success.modelFailures, []); assert.ok(manifest.mockedProviderCalls.chat >= 10); assert.ok(manifest.mockedProviderCalls.embedding > 0); for (const file of [success.execution.reportingLabs.html, success.execution.reportingLabs.json])
    assert.ok((await readFile(file)).length > 100); assert.equal(success.execution.reportingLabs.validation, 'offline-mocked-salesforce'); });
test('negative draft and restricted permission scenarios pass by proving the reviewed rejection rather than saving invalid data', async () => { const success = manifest.runs[0], h = await evidence(); try {
    for (const id of ['qa-AC2', 'qa-AC5'])
        assert.equal(success.execution.results.find((r: any) => r.testId === id).status, 'passed');
    const rows = h.db.prepare('SELECT payload FROM qa_observations').all().map(r => JSON.parse(String(r.payload)));
    assert.ok(rows.some(r => r.kind === 'independent-oracle-verification' && r.runId === success.runId && r.checks.some((c: any) => c.channel === 'api-error' && c.expectedHash === fingerprint('REQUIRED_FIELD_MISSING') && c.status === 'passed')));
    assert.ok(rows.some(r => r.kind === 'permission-observation' && r.runId === success.runId && r.result.effectiveAccess === 'denied' && r.result.status === 'verified'));
}
finally {
    h.close();
} });
test('incorrect API outcome and visual drift remain genuine failures, not automatically confirmed defects', async () => { const faulty = manifest.runs[1]; assert.equal(faulty.lifecycle.status, 'failed'); assert.deepEqual(faulty.execution.failures.map((r: any) => r.testId).sort(), ['qa-AC1', 'qa-AC6', 'qa-AC7']); assert.ok(faulty.execution.failures.find((r: any) => r.testId === 'qa-AC1').message.includes('Business-rule verification mismatch')); assert.ok(faulty.execution.failures.find((r: any) => r.testId === 'qa-AC7').message.includes('Visual comparison requires review')); const h = await evidence(); try {
    const rows = h.db.prepare('SELECT payload FROM qa_observations').all().map(r => JSON.parse(String(r.payload)));
    assert.ok(rows.some(r => r.kind === 'visual-comparison' && r.status === 'review-required' && r.confirmedDefect === false && r.baselineUpdated === false));
    assert.equal(h.lessons().length, 1);
}
finally {
    h.close();
} });
test('actual locator failure is recovered only with observed source, original guarded code and unchanged assertions', () => { const faulty = manifest.runs[1], repair = faulty.repair; assert.equal(repair.status, 'validated-candidate'); assert.equal(repair.candidate.steps[0].locator.value, 'current-preview'); assert.equal(repair.candidate.assertion.text, 'Known rule restored'); assert.notEqual(repair.originalHash, repair.candidateHash); assert.equal(repair.execution.results[0].status, 'passed'); assert.equal(repair.execution.reportingLabs.validation, 'offline-mocked-salesforce'); assert.ok(repair.evidence.some((p: string) => p.endsWith('.zip'))); });
test('durable workflow and exact execution reviews resume without creating data before either interrupt', async () => { for (const phase of manifest.runs) {
    assert.equal(phase.workflowReviewResumed, true);
    assert.equal(phase.executionReviewResumed, true);
    assert.ok((await readFile(join(manifest.root, phase.phase, 'workflow-checkpoints.sqlite'))).length);
    assert.ok((await readFile(join(manifest.root, phase.phase, 'execution-checkpoints.sqlite'))).length);
} const h = await evidence(); try {
    const records = h.db.prepare('SELECT status,COUNT(*) AS count FROM mutations GROUP BY status').all();
    assert.deepEqual(Object.fromEntries(records.map(r => [r.status, Number(r.count)])), { cleaned: 4, deleted: 4 });
    assert.equal(h.results().length, 15);
}
finally {
    h.close();
} });
test('cleanup after failed tests is Contact-before-Account, independently absent and never adopts the foreign sentinel', () => { assert.equal(manifest.safety.activeOwned, 0); assert.equal(manifest.safety.foreignUnchanged, true); assert.equal(manifest.safety.browserMutations, 0); for (const phase of manifest.runs) {
    assert.equal(phase.lifecycle.created, 2);
    assert.equal(phase.lifecycle.cleaned, 2);
    assert.deepEqual(manifest.safety.events.filter((e: any) => e.runId === phase.runId && e.operation === 'delete').map((e: any) => e.object), ['Contact', 'Account']);
} assert.equal(manifest.safety.events.some((e: any) => e.id === '001000000000999'), false); });
test('verified fixture learning follows actual passing regression and cleanup, then changes future generation and risk', async () => { assert.equal(manifest.learning.validation, 'offline-fixture-automation-defect-only'); assert.equal(manifest.learning.mandatory, true); assert.ok(manifest.learning.after > manifest.learning.before); const h = await evidence(); try {
    assert.equal(h.db.prepare('SELECT status FROM pipeline_runs WHERE run=?').get(manifest.learning.passingRegression)?.status, 'passed');
    assert.equal(h.results().find(r => r.runId === manifest.learning.passingRegression)?.status, 'passed');
    const future = JSON.parse(await readFile(join(manifest.root, 'future-plan', 'report.json'), 'utf8')).report;
    assert.equal(future.coverage.find((c: any) => c.id === 'qa-AC6').mandatory, true);
    assert.ok(future.coverage.find((c: any) => c.id === 'qa-AC6').proposal.typescript.includes('current-preview'));
}
finally {
    h.close();
} });
test('stale and absent knowledge cannot be reused as current reviewed QA contracts', async () => { const h = await evidence(); try {
    const old = JSON.parse(await readFile(join(manifest.root, 'success', 'guard-initial.review.json'), 'utf8')), current = JSON.parse(await readFile(join(manifest.root, 'faults', 'guard-initial.review.json'), 'utf8')), store = new QAContractStore(h);
    assert.throws(() => store.get('oracle', old.workflows[0].checks.oracles[0]), /stale/);
    assert.throws(() => store.get('oracle', digest('missing-contract')), /Reviewed/);
    assert.ok(store.get('oracle', current.workflows[0].checks.oracles[0]));
    const index = new KnowledgeIndex(h);
    assert.equal((await index.retrieve('Contact known rule', { org: 'foreign', permission: 'QA' })).length, 0);
}
finally {
    h.close();
} });
test('expired approval, wrong org/user, live origin and production evidence cannot enter the fixture execution adapter', async () => { const config = JSON.parse(await readFile(join(manifest.root, 'faults', 'guard-initial.review.json'), 'utf8')), root = await mkdtemp(resolve('.state/framework-negative-')); for (const [name, patch] of Object.entries({ expired: { approval: { ...config.approval, expiresAt: '2000-01-01T00:00:00Z' } }, org: { identity: { ...config.identity, Id: '00D000000000002' } }, user: { identity: { ...config.identity, userId: '005000000000002' } }, production: { context: { ...config.context, org: { ...config.context.org, source: 'salesforce-api' } } }, origin: { origin: 'https://salesforce.example' } })) {
    const candidate = { ...config, ...patch }, path = join(root, name + '.json');
    try {
        candidate.approval.hash = fixtureQAHash(candidate);
    }
    catch { /* Deliberately invalid identity literals are rejected by schema. */ }
    await writeFile(path, JSON.stringify(candidate));
    await assert.rejects(readFixtureQAConfig(path));
} });
test('fresh API identity mismatch stops the child adapter before any Page, request route or data write', async () => { const config = JSON.parse(await readFile(join(manifest.root, 'faults', 'guard-initial.review.json'), 'utf8')), server = await startQAIntelligenceFixture({ api: () => ({ ...config.identity, userId: '005000000000002' }) }), root = await mkdtemp(resolve('.state/framework-identity-')); try {
    config.origin = server.origin;
    for (const row of config.workflows)
        row.workflow.origin = server.origin;
    config.approval.hash = fixtureQAHash(config);
    const path = join(root, 'review.json');
    await writeFile(path, JSON.stringify(config));
    await assert.rejects(installDedicatedGuardFile({} as BrowserContext, path));
    assert.equal(server.requests.mutations, 0);
    assert.equal(server.requests.reads, 1);
}
finally {
    await server.close();
} });
test('operator commands expose safe readiness, requirement review, history and artifact paths without executing services', async () => { const doctor = await frameworkDoctor(); assert.equal(doctor.headlessOnly, true); assert.equal(doctor.liveRequests, 0); assert.equal(doctor.configurationIsNotConnectivityProof, true); assert.ok(doctor.packages.some(p => p.name === 'reporting-labs')); const imported = await importFrameworkRequirement('fixtures/integrated-account-contact.json'); assert.equal(imported.criteria, 7); assert.equal(imported.executionAuthorized, false); const history = await inspectFramework(demonstration.manifest, 'history') as any; assert.equal(history.results.length, 15); assert.equal(history.lessons.length, 1); assert.equal(history.liveRequests, 0); const reviews = await inspectFramework(demonstration.manifest, 'approvals') as any; assert.equal(reviews.liveExecutionAuthorized, false); assert.ok(reviews.runs.every((r: any) => r.approvals.scope === 'synthetic-loopback-fixture-only')); assert.equal(manifest.salesforceRequests, 0); assert.equal(manifest.liveGeminiRequests, 0); });
test('exact execution interrupt rejects a wrong approval before entering the data/execution coordinator', async () => { const h = new History(':memory:'), index = new KnowledgeIndex(h), root = await mkdtemp(resolve('.state/framework-review-')), saver = new DurableSaver(join(root, 'checkpoints.sqlite')); try {
    const config = JSON.parse(await readFile(join(manifest.root, 'faults', 'guard-initial.review.json'), 'utf8')), input = PipelineInputSchema.parse({ runId: 'review-negative', spec: config.context.spec, org: config.context.org, orgVersion: snapshotVersion(config.context.org), permission: 'QA', allowedOrigins: [config.origin], mappings: [] });
    input.executionApproval = { reviewer: 'Synthetic Fixture Operator', hash: executionHash(input) };
    const graph = createSpecPipeline({ history: h, knowledge: index, root, checkpointer: saver, requireExecutionReview: true }), thread = { configurable: { thread_id: 'review-negative' } };
    await graph.invoke({ input }, thread);
    await assert.rejects(graph.invoke(new Command({ resume: { reviewer: 'Other operator', hash: input.executionApproval.hash } }), thread), /Exact named/);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM pipeline_runs').get()?.count, 0);
}
finally {
    saver.close();
    h.close();
} });
