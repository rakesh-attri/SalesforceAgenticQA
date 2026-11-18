import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { qaIntelligenceFixture, seedQAContracts, reviewFixtureQAPages } from './qa-intelligence-fixture.js';
import { startQAIntelligenceFixture, qaCases, qaFixtureRecord, qaFixtureContact } from '../../fixtures/qa-intelligence-server.js';
import { History } from '../core/history.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { fingerprint, digest } from '../execution/browser-policy.js';
import { launchLocalBrowser, installedBrowser } from '../execution/local-browser.js';
import { exploreFixture } from '../agents/fixture-explorer.js';
import { bindReviewedQAContext, verifyReviewedQAExpectations } from '../execution/qa-checks.js';
import { captureFixtureApplicationDebug } from '../execution/browser-debug.js';
import { VisualFrameSchema, VisualBaselineSchema, baselineVersion, compareVisualBaseline } from '../execution/visual-baselines.js';
import { visualAccessibilityFacts } from '../execution/qa-verification.js';
import { designQAIntelligence, publishReviewedQAContract, writeQAIntelligenceReport } from '../agents/qa-intelligence.js';
import { investigateFailure } from '../agents/intelligence.js';
import type { PermissionEvidence } from '../agents/qa-oracles.js';
export async function demonstrateQAIntelligence() {
    const fixture = await startQAIntelligenceFixture(), historyPath = `.state/qa-intelligence-${randomUUID()}.sqlite`, h = new History(historyPath), f = await qaIntelligenceFixture(fixture.origin), store = seedQAContracts(h, f), index = new KnowledgeIndex(h), runId = `qa-intelligence-${randomUUID()}`, sessionId = randomUUID(), policyHash = fingerprint({ synthetic: true, runId }), declarations: PermissionEvidence = { profile: [false], permissionSets: [false], groups: [], complete: true, objectGrant: true, sharing: 'missing', sources: ['fixture:restricted-persona'] };
    let browser: Awaited<ReturnType<typeof launchLocalBrowser>> | undefined;
    try {
        index.bindSchema(f.scope, f.scope.metadataVersion);
        for (const c of f.contracts)
            await publishReviewedQAContract(h, index, 'oracle', c.version, f.context);
        await publishReviewedQAContract(h, index, 'permission', f.permission.version, f.context);
        const exploration = await exploreFixture({ mode: 'FIXTURE', syntheticOnly: true, origin: fixture.origin, reviewer: 'Synthetic Fixture Reviewer', source: 'fixture:qa-preview-v1', paths: qaCases.map(c => `/cases/${c.id}`), actions: qaCases.map(c => ({ path: `/cases/${c.id}`, locator: { by: 'testId', value: 'preview' }, action: 'click' })), maxActions: 7, maxMs: 60000 }, { mcpObservation: true });
        reviewFixtureQAPages(f, exploration, h);
        browser = await launchLocalBrowser();
        const context = await browser.newContext({ viewport: { width: 1000, height: 650 }, serviceWorkers: 'block', acceptDownloads: false });
        await context.route('**/*', route => new URL(route.request().url()).origin === fixture.origin && route.request().method() === 'GET' ? route.continue() : route.abort());
        await context.routeWebSocket('**/*', s => s.close());
        const page = await context.newPage(), observations: unknown[] = [], entries: unknown[] = [], frames: unknown[] = [];
        const capture = async () => { const s = await captureFixtureApplicationDebug(page, { runId, sessionId, policyHash, sequence: entries.length + 1, remainingMs: 10000, remainingBytes: 8388608, entries }); entries.push(s.entry); const binding = { runId, sessionId, policyHash, validation: 'offline-mocked-salesforce' as const }, frame = VisualFrameSchema.parse({ manifest: s.manifest, file: s.entry.file, sha256: s.entry.sha256, manifestHash: fingerprint({ binding, entry: s.entry }), ...binding, scope: f.scope, engineHash: installedBrowser().sha256, renderHash: digest('fixture:qa-preview-v1/1000x650'), maskingHash: digest('fixture:known-sensitive-elements-v1'), width: 1000, height: 650 }); frames.push(frame); return frame; };
        for (const c of qaCases.filter(c => c.id !== 'AC7')) {
            await page.goto(`${fixture.origin}/cases/${c.id}`);
            await page.getByTestId('preview').click();
            const oracle = f.contracts.find(o => o.rule.criterionId === c.id), checks = { oracles: oracle ? [oracle.version] : [], permissions: c.id === 'AC5' ? [f.permission.version] : [], visuals: [] }, read = async (query: string) => { const response = await fetch(`${fixture.origin}/api/${c.id}?q=${encodeURIComponent(query)}`, { redirect: 'error', signal: AbortSignal.timeout(3000) }); if (!response.ok)
                throw Error('Fixture read denied'); return response.json(); }, release = bindReviewedQAContext(page, { history: h, context: f.context, checks, origin: fixture.origin, runId, recordId: c.object === 'Account' ? qaFixtureRecord : qaFixtureContact, inputs: c.input, validation: 'offline-mocked-salesforce', read, permission: async () => { const response = await read(`SELECT Id,LastName FROM Contact WHERE Id='${qaFixtureContact}' LIMIT 1`); return { access: response.errorCode === 'INSUFFICIENT_ACCESS' ? 'denied' : 'unknown', channel: 'api', evidenceHash: fingerprint(response), observedOperation: 'read', observedObject: 'Contact', observedField: 'LastName', observedScopeHash: fingerprint(f.scope), declarations }; } });
            try {
                observations.push({ criterionId: c.id, ...await verifyReviewedQAExpectations(page, checks) });
            }
            finally {
                release();
            }
        }
        await page.goto(`${fixture.origin}/cases/AC7`);
        await page.getByTestId('preview').click();
        const frame = await capture(), requirement = f.model.sources.find(s => s.kind === 'requirement')!, baseline = VisualBaselineSchema.parse({ version: digest('pending'), id: 'synthetic-contact-preview', criterionId: 'AC7', expectedText: 'Layout approved', scope: f.scope, frame, evidence: [{ source: requirement.id, version: requirement.version, claim: 6 }, { source: f.rules.id, version: f.rules.version, claim: f.rules.claims.length - 1 }], critical: [{ id: 'preview-card', x: 40, y: 40, width: 650, height: 350 }], dynamic: [{ id: 'clock', x: 700, y: 8, width: 180, height: 25 }], channelTolerance: 8, maxChangedRatio: 0.001, requiredAccessibility: [{ id: 'preview', role: 'button', namePresent: true }], maskingAcknowledged: true });
        baseline.version = baselineVersion(baseline);
        store.put('visual', baseline.version, baseline);
        store.review('visual', baseline.version, { operator: 'Synthetic Fixture Reviewer', hash: baseline.version, reviewedAt: new Date().toISOString() });
        await page.locator('#clock').evaluate(n => { n.textContent = '09:00:01'; });
        const dynamic = await compareVisualBaseline(h, baseline.version, await capture(), await visualAccessibilityFacts(page, baseline), f.context);
        observations.push(dynamic);
        await page.getByTestId('card').evaluate(n => { n.style.marginLeft = '95px'; });
        const layout = await compareVisualBaseline(h, baseline.version, await capture(), await visualAccessibilityFacts(page, baseline), f.context);
        observations.push(layout);
        await page.getByTestId('card').evaluate(n => { n.style.marginLeft = '40px'; });
        await page.getByTestId('preview').evaluate(n => { n.setAttribute('aria-hidden', 'true'); });
        const accessibility = await compareVisualBaseline(h, baseline.version, await capture(), await visualAccessibilityFacts(page, baseline), f.context);
        observations.push(accessibility);
        const input = { ...f, permission: 'QA', changes: ['Field:Contact.LastName'] }, bindings = { oracles: f.contracts.map(c => c.version), permissions: [f.permission.version], visuals: [baseline.version], permissionEvidence: { [f.permission.version]: declarations } }, report = await designQAIntelligence(input, { history: h, index }, bindings), investigation = await investigateFailure(index, f.scope, { testId: 'qa-AC7', message: 'Reviewed visual preview differs', expected: baseline.expectedText, evidence: [layout.hash, accessibility.hash] });
        observations.push({ failureInvestigator: investigation, confirmedDefect: false });
        observations.push({ kind: 'local-masked-frames', frames, localOnly: true, automaticallyUploaded: false });
        const files = await writeQAIntelligenceReport(report, observations, `.state/${runId}`);
        await mkdir(`.state/${runId}/proposals`, { recursive: true });
        for (const scenario of report.coverage)
            if (scenario.proposal)
                await writeFile(`.state/${runId}/proposals/${scenario.id}.proposal.spec.ts`, scenario.proposal.typescript);
        for (const api of report.apiProposals)
            await writeFile(`.state/${runId}/proposals/${api.criterionId}.api.proposal.ts`, api.code);
        const hits = await index.retrieve('Account Contact reviewed declaration boundary permission', f.scope, 20), savedManifest = JSON.parse(await readFile(frame.manifest, 'utf8'));
        return { ...files, historyPath, validation: 'offline-synthetic-headless-Chrome-and-MCP', scenarios: report.coverage.length, reviewedOracles: f.contracts.length, permissionExpectations: 1, visualBaseline: baseline.version, visual: { dynamic: dynamic.payload.status, ignoredPixels: dynamic.payload.pixels.status === 'incompatible' ? 0 : dynamic.payload.pixels.ignoredDynamicChanges, layout: layout.payload.status, accessibility: accessibility.payload.status }, proposals: report.coverage.filter(c => c.proposal).length, apiProposals: report.apiProposals.length, independentBusinessOutcomes: observations.filter((o: any) => o.criterionId).length, mcp: { sameContext: exploration.mcp.sameContext, observations: exploration.mcp.observationHashes.length, actions: exploration.actions }, screenshots: savedManifest.entries.length, retrievedDeclarations: hits.filter(d => d.id.startsWith('qa-')).length, fixtureRequests: fixture.requests, salesforceRequests: 0, externalModelRequests: 0, executionAuthorityGranted: false, liveReadinessClaimed: false, learningPublished: false };
    }
    finally {
        await browser?.close();
        h.close();
        await fixture.close();
    }
}
