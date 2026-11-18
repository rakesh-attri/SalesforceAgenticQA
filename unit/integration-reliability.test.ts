import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { IngestionQueue } from '../src/knowledge/ingestion-queue.js';
import { ReviewBundleSchema, authorizeAI, authorizePayload, bundleHash, verifyReviewedBundleSource } from '../src/knowledge/reviewed.js';
import { schemaFingerprint } from '../src/knowledge/snapshots.js';
import { groundedPlanning } from '../src/agents/grounded.js';
import { executeGenerated, verifyGeneratedReports } from '../src/execution/runner.js';
import { integrationReadiness } from '../src/core/integration-readiness.js';
import { salesforceJWTConfiguration } from '../src/salesforce/jwt.js';
import { qaIntelligenceFixture } from '../src/demos/qa-intelligence-fixture.js';
const minimal = () => ReviewBundleSchema.parse({ org: 'f'.repeat(64), permission: 'QA', sourceVersion: 'a'.repeat(64), capturedAt: '2026-11-14T00:00:00Z', story: { id: 'minimal', title: 'Account', description: 'Synthetic Account field review', objects: ['Account'], acceptanceCriteria: [{ id: 'AC1', text: 'Only reference reviewed field metadata; business rules are unknown' }] }, facts: [{ id: 'field:Account.Name', object: 'Account', field: 'Name', type: 'string', required: true, references: [], source: 'describe:Account@' + 'a'.repeat(64) }], history: [] });
const review = (b: ReturnType<typeof minimal>, operator = 'Fixture Reviewer') => ({ operator, bundleHash: bundleHash(b), destinations: ['gemini-chat', 'gemini-embeddings'], expiresAt: new Date(Date.now() + 60000).toISOString() });
test('REVIEW_REQUIRED is never a named AI review, including trimmed drafts and persistent ingestion', async () => { const b = minimal(), h = new History(':memory:'); let calls = 0; try {
    const index = new KnowledgeIndex(h), queue = new IngestionQueue(h, index, async (texts) => { calls++; return texts.map(() => [1, 0]); }, 'fixture');
    for (const name of ['REVIEW_REQUIRED', ' REVIEW_REQUIRED ', '']) {
        assert.throws(() => authorizeAI(b, review(b, name), 'gemini-embeddings'));
        assert.throws(() => authorizePayload(b, review(b, name), ['gemini-chat']));
        assert.throws(() => queue.enqueue(b, review(b, name)));
    }
    assert.equal(calls, 0);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM ingest_jobs').get()?.count, 0);
    await assert.rejects(groundedPlanning(b, review(b, 'REVIEW_REQUIRED'), index, { generate: async () => { calls++; throw Error('must not call'); } }));
    assert.equal(calls, 0);
    assert.equal(authorizeAI(b, review(b), 'gemini-chat').operator, 'Fixture Reviewer');
}
finally {
    h.close();
} });
test('minimal planner-only mode makes one grounded chat call and retains unknowns/citations without exporting org scope', async () => { const b = minimal(), h = new History(':memory:'), index = new KnowledgeIndex(h); let chats = 0; try {
    index.bindSchema(b, b.sourceVersion);
    await index.ingest({ id: b.facts[0].id, version: b.sourceVersion, org: b.org, permission: b.permission, kind: 'org', status: 'verified', text: JSON.stringify(b.facts[0]), reviewer: 'Fixture Reviewer', capturedAt: b.capturedAt, evidence: [b.facts[0].source], testIds: [] });
    const result = await groundedPlanning(b, review(b), index, { generate: async (request) => { chats++; const body = JSON.parse(request.prompt); assert.ok(!request.prompt.includes(b.org)); assert.equal(body.facts[0].id, b.facts[0].id); return request.schema.parse({ scenarios: [{ criterionId: 'AC1', factIds: [b.facts[0].id], historyCitations: [], priority: 'normal', questions: ['workflow-unverified', 'business-rules-unknown', 'expected-ui-text-missing', 'data-writes-disabled'] }] }); } }, { plannerOnly: true });
    assert.equal(chats, 1);
    assert.deepEqual(Object.keys(result.advice), ['test-planner']);
    assert.equal(result.evaluation.unverifiedFieldReferences, 0);
    assert.equal(result.executable, false);
    assert.equal(result.scenarios[0].expected, b.story.acceptanceCriteria[0].text);
}
finally {
    h.close();
} });
test('JWT static configuration preserves every endpoint restriction without performing authentication', () => { const base = { SF_LOGIN_URL: 'https://login.salesforce.com', SF_CLIENT_ID: 'fixture-client', SF_USERNAME: 'fixture-user', SF_PRIVATE_KEY_PATH: '.state/fixture.key' }; assert.equal(salesforceJWTConfiguration(base).login, 'https://login.salesforce.com'); for (const url of ['http://login.salesforce.com', 'https://login.salesforce.com:444', 'https://user:secret@login.salesforce.com', 'https://login.salesforce.com/extra', 'https://login.salesforce.com/?secret=1', 'https://unapproved.example'])
    assert.throws(() => salesforceJWTConfiguration({ ...base, SF_LOGIN_URL: url })); assert.throws(() => salesforceJWTConfiguration({ ...base, SF_CLIENT_ID: '' }), /Missing SF_CLIENT_ID/); });
test('readiness distinguishes local configuration from current identity, source and external service proof with zero network', async () => { await mkdir('.state', { recursive: true }); const root = await mkdtemp(resolve('.state/readiness-regression-')), f = await qaIntelligenceFixture(), org = join(root, 'org.json'), graph = join(root, 'graph.json'), key = join(root, 'fixture.key'); await writeFile(org, JSON.stringify(f.org)); await writeFile(graph, JSON.stringify(f.graph)); await writeFile(key, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })); const env = { SF_LOGIN_URL: 'https://login.salesforce.com', SF_INSTANCE_URL: 'https://fixture.my.salesforce.com', SF_CLIENT_ID: 'CLIENT_CANARY_887A', SF_USERNAME: 'USER_CANARY_887A', SF_PRIVATE_KEY_PATH: key, SFQA_MODEL_PROVIDER: 'gemini', SFQA_MODEL_NAME: 'gemini-fixture', GEMINI_API_KEY: 'KEY_CANARY_887A', SFQA_EMBEDDING_PROVIDER: 'gemini', SFQA_EMBEDDING_MODEL: 'gemini-embedding-001' }, original = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; throw Error('No network allowed'); }; try {
    const result = await integrationReadiness({ org, graph, statePath: '.auth/missing-readiness-state.json' }, env);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.checks.find(c => c.id === 'salesforce-jwt-config')?.status, 'PASS');
    assert.equal(result.checks.find(c => c.id === 'gemini-chat-config')?.status, 'PASS');
    assert.equal(result.checks.find(c => c.id === 'saved-metadata-graph')?.status, 'BLOCKED');
    assert.equal(result.checks.find(c => c.id === 'current-live-verification')?.status, 'BLOCKED');
    assert.equal(result.checks.find(c => c.id === 'browser-export')?.status, 'BLOCKED');
    assert.equal(calls, 0);
    for (const value of ['CLIENT_CANARY_887A', 'USER_CANARY_887A', 'KEY_CANARY_887A'])
        assert.ok(!JSON.stringify(result).includes(value));
    const bad = await integrationReadiness({ org, graph, statePath: '.auth/missing-readiness-state.json' }, { ...env, SFQA_MODEL_PROVIDER: 'unsupported' });
    assert.equal(bad.checks.find(c => c.id === 'gemini-chat-config')?.status, 'BLOCKED');
}
finally {
    globalThis.fetch = original;
} });
test('actual runner refuses a reserved run before changing reports and preserves explicit different-run reporting history', async () => { const root = await mkdtemp(resolve('.state/runner-reliability-')), files = [{ id: 'real-pass', code: "import {test,expect} from '@playwright/test';test('real-pass',()=>expect(2+2).toBe(4));" }]; const first = await executeGenerated(root, 'reliability-first', files, 60000, { trace: 'off', validation: 'local-fixture' }), raw = await readFile(join(root, 'results.json'), 'utf8'); assert.equal(first.exitCode, 0); assert.equal(JSON.parse(await readFile(join(root, '.sfqa-runs/reliability-first.json'), 'utf8')).status, 'complete'); await assert.rejects(executeGenerated(root, 'reliability-first', [{ id: 'never-run', code: "throw Error('unapproved replay');" }]), /already reserved/); assert.equal(await readFile(join(root, 'results.json'), 'utf8'), raw); const second = await executeGenerated(root, 'reliability-followup', files, 60000, { trace: 'off', validation: 'local-fixture' }); assert.equal(second.exitCode, 0); assert.equal(JSON.parse(await readFile(join(root, 'reporting-labs/history.json'), 'utf8')).length, 2); const folder = join(root, 'reporting-labs'); assert.equal((await verifyGeneratedReports(folder, 'local-fixture', second.results)).status, 'verified'); const original = await readFile(join(folder, 'report.json'), 'utf8'); await unlink(join(folder, 'report.json')); await assert.rejects(verifyGeneratedReports(folder, 'local-fixture', second.results)); await writeFile(join(folder, 'report.json'), original); await assert.rejects(verifyGeneratedReports(folder, 'live-salesforce', second.results), /inconsistent/); const report = JSON.parse(original); report.stats.passed = 99; await writeFile(join(folder, 'report.json'), JSON.stringify(report)); await assert.rejects(verifyGeneratedReports(folder, 'local-fixture', second.results), /inconsistent/); await mkdir(join(root, '.sfqa-runs'), { recursive: true }); await writeFile(join(root, '.sfqa-runs/pending.json'), '{}'); await assert.rejects(executeGenerated(root, 'pending', files), /already reserved/); });
test('report completeness cannot be inferred from HTML alone or an unrelated validation receipt', async () => { const root = await mkdtemp(resolve('.state/report-pair-')); await writeFile(join(root, 'index.html'), '<!doctype html>Partial output'); await assert.rejects(verifyGeneratedReports(root, 'local-fixture', [])); await writeFile(join(root, 'report.json'), JSON.stringify({ stats: { passed: 0, failed: 0, skipped: 0 } })); await assert.rejects(verifyGeneratedReports(root, 'local-fixture', [])); });
test('invalid execution prerequisites preserve previous evidence and spend no run reservation', async () => { const root = await mkdtemp(resolve('.state/runner-prerequisites-')); await writeFile(join(root, 'results.json'), 'previous-evidence'); await assert.rejects(executeGenerated(root, 'not-started', [{ id: 'never-run', code: 'throw Error("must not run");' }], 60000, { testTimeoutMs: 1 })); assert.equal(await readFile(join(root, 'results.json'), 'utf8'), 'previous-evidence'); await assert.rejects(access(join(root, '.sfqa-runs'))); });
test('reviewed AI source check rejects foreign org, stale version and changed field facts before external validation', async () => { const f = await qaIntelligenceFixture(), org = { ...f.org, source: 'salesforce-api' as const, orgIdentityHash: 'f'.repeat(64) }, b = minimal(); b.sourceVersion = schemaFingerprint(org); b.facts[0].source = `describe:Account@${b.sourceVersion}`; assert.equal(verifyReviewedBundleSource(b, org).status, 'saved-source-matched'); assert.throws(() => verifyReviewedBundleSource(b, { ...org, orgIdentityHash: 'e'.repeat(64) }), /org\/source/); assert.throws(() => verifyReviewedBundleSource({ ...b, sourceVersion: 'b'.repeat(64) }, org), /org\/source/); assert.throws(() => verifyReviewedBundleSource({ ...b, facts: [{ ...b.facts[0], required: false }] }, org), /field differs/); });
