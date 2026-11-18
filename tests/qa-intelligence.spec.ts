import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { demonstrateQAIntelligence } from '../src/demos/qa-intelligence.js';
import { qaIntelligenceFixture, seedQAContracts } from '../src/demos/qa-intelligence-fixture.js';
import { startQAIntelligenceFixture, qaFixtureRecord } from '../fixtures/qa-intelligence-server.js';
import { History } from '../src/core/history.js';
import { fingerprint, digest } from '../src/execution/browser-policy.js';
import { QAContractStore } from '../src/agents/qa-oracles.js';
import { compareVisualBaseline, baselineVersion } from '../src/execution/visual-baselines.js';
import { WorkflowModelStore } from '../src/agents/workflow-models.js';
import { reviewJourneyEvidence } from '../src/agents/workflow-evidence.js';
import { generateTest, WorkflowSchema } from '../src/agents/workflows.js';
import { resolveLocator } from '../src/core/locators.js';
import { bindReviewedQAContext, verifyReviewedQAExpectations } from '../src/execution/qa-checks.js';
import { executeGeneratedQAFixture } from '../unit/support/execute-generated-qa.js';
test.use({ storageState: { cookies: [], origins: [] } });
test('real headless fixture/MCP oracles, permission denial and reviewed visual baselines', async () => {
    test.setTimeout(120000);
    const demo = await demonstrateQAIntelligence();
    expect(demo.salesforceRequests).toBe(0);
    expect(demo.externalModelRequests).toBe(0);
    expect(demo.fixtureRequests.mutations).toBe(0);
    expect(demo.mcp).toEqual({ sameContext: true, observations: 14, actions: 7 });
    expect(demo.independentBusinessOutcomes).toBe(6);
    expect(demo.proposals).toBe(7);
    expect(demo.apiProposals).toBe(4);
    expect(demo.visual.dynamic).toBe('within-reviewed-tolerance');
    expect(demo.visual.ignoredPixels).toBeGreaterThan(0);
    expect(demo.visual.layout).toBe('review-required');
    expect(demo.visual.accessibility).toBe('review-required');
    expect(demo.screenshots).toBe(4);
    const document = JSON.parse(await readFile(demo.json, 'utf8')), h = new History(demo.historyPath);
    try {
        const row = h.db.prepare('SELECT payload FROM journey_models ORDER BY rowid DESC LIMIT 1').get()!, model = JSON.parse(String(row.payload)), f = await qaIntelligenceFixture(model.steps[0].outcomes[0].workflow.origin), context = { ...f.context, sources: model.sources }, store = new QAContractStore(h), baseline = store.get('visual', demo.visualBaseline).contract, frames = document.observations.find((o: any) => o.kind === 'local-masked-frames').frames;
        expect((await compareVisualBaseline(h, baseline.version, frames[1], [], context)).payload.status).toBe('review-required');
        for (const patch of [{ engineHash: digest('other engine') }, { renderHash: digest('other build') }, { maskingHash: digest('other masking') }, { scope: { ...baseline.scope, permission: 'foreign' } }, { sha256: digest('tampered') }])
            await expect(compareVisualBaseline(h, baseline.version, { ...frames[1], ...patch }, [{ id: 'preview', role: 'button', namePresent: true }], context)).rejects.toThrow();
        const unreviewed = { ...baseline, id: 'unreviewed-baseline' };
        unreviewed.version = baselineVersion(unreviewed);
        store.put('visual', unreviewed.version, unreviewed);
        await expect(compareVisualBaseline(h, unreviewed.version, frames[1], [], context)).rejects.toThrow('Reviewed QA contract');
        new WorkflowModelStore(h).observe([reviewJourneyEvidence({ ...f.rules, version: digest('changed expectation') }, 'Synthetic Fixture Reviewer')]);
        await expect(compareVisualBaseline(h, baseline.version, frames[1], [], context)).rejects.toThrow('stale');
    }
    finally {
        h.close();
    }
});
test('generated Playwright body preserves original assertions and independently rejects a wrong API outcome', async ({ page, context }) => {
    test.setTimeout(60000);
    const server = await startQAIntelligenceFixture(), h = new History(':memory:'), f = await qaIntelligenceFixture(server.origin), c = f.contracts[0], checks = { oracles: [c.version], permissions: [], visuals: [] };
    seedQAContracts(h, f);
    let incorrect = false;
    try {
        const workflow = WorkflowSchema.parse(f.model.steps[0].outcomes[0].workflow), code = generateTest(workflow, [server.origin], { module: 'fixture:guard', config: 'fixture:only', ownsNetworkBoundary: true, qa: { module: 'fixture:qa-verifier', checks } });
        expect(code).toContain('toHaveText("Draft ready")');
        expect(code).toContain('verifyReviewedQAExpectations');
        await context.route('**/*', route => new URL(route.request().url()).origin === server.origin && route.request().method() === 'GET' ? route.continue() : route.abort());
        await context.routeWebSocket('**/*', socket => socket.close());
        const release = bindReviewedQAContext(page, { history: h, context: f.context, checks, origin: server.origin, runId: 'generated-fixture', recordId: qaFixtureRecord, inputs: { Name: 'Synthetic QA Account' }, validation: 'offline-mocked-salesforce', read: async (query) => { const response = await fetch(`${server.origin}/api/AC1?q=${encodeURIComponent(query)}`, { redirect: 'error', signal: AbortSignal.timeout(2000) }); if (!response.ok)
                throw Error('Fixture read denied'); const body = await response.json(); if (incorrect)
                body.records[0].Name = 'Wrong independently observed name'; return body; } });
        const modules = { 'fixture:qa-verifier': { verifyReviewedQAExpectations }, 'fixture:guard': { installDedicatedGuardFile: async () => { }, executeReviewedWorkflowStep: async (p: typeof page, w: unknown, i: number) => { const proposed = WorkflowSchema.parse(w); if (fingerprint(proposed) !== fingerprint(workflow) || i !== 0)
                    throw Error('Unknown fixture action'); await resolveLocator(p, proposed.steps[i].locator).click(); } } };
        await executeGeneratedQAFixture(code, page, modules);
        incorrect = true;
        await expect(executeGeneratedQAFixture(code, page, modules)).rejects.toThrow('Business-rule verification mismatch');
        release();
        await expect(verifyReviewedQAExpectations(page, checks)).rejects.toThrow('binding');
        expect(server.requests.mutations).toBe(0);
    }
    finally {
        h.close();
        await server.close();
    }
});
