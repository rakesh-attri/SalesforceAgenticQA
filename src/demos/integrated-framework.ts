import { randomUUID } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { Command } from '@langchain/langgraph';
import { integratedSalesforceFixture, integratedIdentity } from '../../fixtures/integrated-salesforce.js';
import { qaCases, qaFixtureRecord, qaFixtureContact } from '../../fixtures/qa-intelligence-server.js';
import { integratedFixturePlan } from './integrated-fixture-plan.js';
import { seedQAContracts, reviewFixtureQAPages } from './qa-intelligence-fixture.js';
import { History } from '../core/history.js';
import { DurableSaver } from '../core/checkpoints.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { snapshotVersion } from '../knowledge/snapshots.js';
import { GeminiChat, geminiEmbeddings } from '../ai/gemini.js';
import { ReasoningAgents } from '../agents/reasoning.js';
import { HybridFactory } from '../agents/hybrid-factory.js';
import { mutationHash } from '../salesforce/approval.js';
import { PipelineInputSchema, executionHash, createSpecPipeline } from '../agents/pipeline.js';
import type { PipelineRuntime } from '../execution/readiness.js';
import { createWorkflowIntelligenceGraph } from '../agents/workflow-planning.js';
import { discoverApplication, ApplicationReviewStore, indexApplicationKnowledge } from '../agents/application-intelligence.js';
import { exploreFixture } from '../agents/fixture-explorer.js';
import { recordFixtureApplicationObservation } from '../agents/application-observations.js';
import { publishReviewedQAContract, designQAIntelligence, writeQAIntelligenceReport } from '../agents/qa-intelligence.js';
import { reasonAboutTestDesign, testDesignAIPayload } from '../agents/test-design.js';
import { fingerprint, digest } from '../execution/browser-policy.js';
import { captureFixtureApplicationDebug } from '../execution/browser-debug.js';
import { VisualFrameSchema, VisualBaselineSchema, baselineVersion } from '../execution/visual-baselines.js';
import { installedBrowser, launchLocalBrowser } from '../execution/local-browser.js';
import { FixtureQAConfigSchema, fixtureQAHash } from '../execution/fixture-qa-guard.js';
import { workflowHash, healReviewedWorkflow } from '../agents/healing.js';
import { confirmDefect } from '../agents/intelligence.js';
import { WorkflowModelStore, journeyModelHash } from '../agents/workflow-models.js';
import { JourneyEvidenceSchema, reviewJourneyEvidence } from '../agents/workflow-evidence.js';
import { readExplorationManifest, verifyExplorationImage } from '../agents/exploration-investigation.js';
export async function demonstrateIntegratedFramework(options: {
    failures?: boolean;
} = {}) {
    if (process.env.SFQA_REPORTING_LABS === '0')
        throw Error('Integrated demonstration requires local reportingLabs; explicitly set SFQA_REPORTING_LABS=1');
    const id = `framework-${randomUUID()}`, root = resolve('artifacts', id);
    await mkdir(root, { recursive: true });
    const historyPath = join(root, 'history.sqlite'), h = new History(historyPath), server = await integratedSalesforceFixture(), local = new KnowledgeIndex(h), counts = { chat: 0, embedding: 0 }, runs: any[] = [];
    const embed = geminiEmbeddings({ apiKey: 'fixture-only-no-live-key', model: 'gemini-embedding-001', retries: 0, batchSize: 2 }, { fetch: async (_url, init) => { counts.embedding++; const body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ embeddings: body.requests.map((r: any) => { const text = r.content.parts[0].text; return { values: [/Account/i.test(text) ? 1 : 0.1, /Contact/i.test(text) ? 1 : 0.1, 0.2] }; }) })); } }), semantic = new KnowledgeIndex(h, embed, undefined, 'fixture-gemini-embedding-001');
    const chat = new GeminiChat({ apiKey: 'fixture-only-no-live-key', model: 'gemini-fixture', retries: 0 }, { fetch: async (_url, init) => { counts.chat++; const body = JSON.parse(String(init?.body)), payload = JSON.parse(body.contents[0].parts[0].text), rank = !!body.generationConfig.responseJsonSchema.properties?.priorities, output = rank ? { priorities: [{ scenarioId: payload.criteria[0].id, priority: 'high', citations: [payload.criteria[0].citations[0]] }], questions: [] } : { status: 'proposed', findings: [{ text: 'Reviewed synthetic source retained; no execution authority', citations: ['e1'] }], questions: [], workflowProposals: [] }; return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] })); } });
    const guardModule = resolve('src/execution/fixture-qa-guard.ts').replaceAll('\\', '/'), maskingHash = digest('fixture:known-sensitive-elements-v1'), renderHash = digest('integrated-preview-v1/1280x720');
    let learning: unknown;
    try {
        for (const phase of options.failures === false ? ['success'] : ['success', 'faults']) {
            const runId = `fw-${id.slice(-36)}-${phase}`, phaseRoot = join(root, phase), f = await integratedFixturePlan(server.origin, runId);
            await mkdir(phaseRoot, { recursive: true });
            server.begin(runId, f.values);
            const store = seedQAContracts(h, f);
            local.bindSchema(f.scope, f.scope.metadataVersion);
            const observation = await exploreFixture({ mode: 'FIXTURE', syntheticOnly: true, origin: server.origin, reviewer: 'Synthetic Fixture Operator', source: 'fixture:integrated-preview', paths: qaCases.map(c => `/cases/${c.id}`), actions: qaCases.map(c => ({ path: `/cases/${c.id}`, locator: { by: 'testId', value: 'preview' }, action: 'click' })), maxActions: 7, maxMs: 60000 }, { mcpObservation: true, application: { scope: { org: f.scope.org, permission: 'QA', metadataVersion: f.scope.metadataVersion, objectsByPath: Object.fromEntries(qaCases.map(c => [`/cases/${c.id}`, c.object])) }, history: h } });
            reviewFixtureQAPages(f, observation, h);
            const selectedPages = recordFixtureApplicationObservation(h, { org: f.scope.org, permission: 'QA', metadataVersion: f.scope.metadataVersion, objectsByPath: { '/cases/AC1': 'Account', '/cases/AC4': 'Contact' } }, observation), study = discoverApplication({ ...f, permission: 'QA', fixtureReceipts: [selectedPages] }, h), reviews = new ApplicationReviewStore(h);
            reviews.put(study);
            await indexApplicationKnowledge(h, study, local);
            // Index only explicitly reviewed synthetic declarations. These transports are
            // injected mocks: no configured live provider or credential is constructed.
            for (const c of f.contracts)
                await publishReviewedQAContract(h, local, 'oracle', c.version, f.context);
            await publishReviewedQAContract(h, local, 'permission', f.permission.version, f.context);
            for (const d of local.all(f.scope).filter(d => d.status === 'verified' && d.id.startsWith('qa-')))
                await semantic.ingest(d);
            const semanticHits = await semantic.retrieve('Account Contact reviewed expectation', f.scope, 20), reopened = new History(historyPath);
            let persistedHits: number;
            try {
                persistedHits = (await new KnowledgeIndex(reopened, embed, undefined, 'fixture-gemini-embedding-001').retrieve('Account Contact reviewed expectation', f.scope, 20)).length;
            }
            finally {
                reopened.close();
            }
            const cpPath = join(phaseRoot, 'workflow-checkpoints.sqlite'), thread = { configurable: { thread_id: runId } };
            let saver = new DurableSaver(cpPath), graph = createWorkflowIntelligenceGraph({ index: local, history: h, checkpointer: saver });
            await graph.invoke({ model: f.model, spec: f.spec, org: f.org, graph: f.graph, changed: ['Field:Contact.LastName'] }, thread);
            if (!(await graph.getState(thread)).next.length || server.state().activeOwned)
                throw Error('Workflow review did not stop before data creation');
            saver.close();
            saver = new DurableSaver(cpPath);
            graph = createWorkflowIntelligenceGraph({ index: local, history: h, checkpointer: saver });
            await graph.invoke(new Command({ resume: { modelVersion: f.model.version, reviewer: 'Synthetic Fixture Operator' } }), thread);
            saver.close();
            let baseline: any, guardConfig: any, design: any, repair: any, repairObservation: any;
            const guardPath = join(phaseRoot, 'fixture-guard.json'), repairRun = `${runId}-repair`, adapter = { ...server, identity: async () => server.identity() }, factory = new HybridFactory(h, { api: adapter, 'business-service': adapter }, ['Account', 'Contact']);
            const runtime: PipelineRuntime = { factory, approvalFor: async (m) => ({ orgId: integratedIdentity.Id, hash: mutationHash(m), reviewer: 'Synthetic Fixture Operator', expiresAt: new Date(Date.now() + 3600000).toISOString(), nonFinancialReviewed: true }), preflight: async (input) => { if (input.org.source !== 'fixture' || input.allowedOrigins.length !== 1 || input.allowedOrigins[0] !== server.origin || input.permission !== 'QA' || fingerprint(server.identity()) !== fingerprint(integratedIdentity))
                    throw Error('Integrated fixture identity/origin denied'); return {}; },
                prepareExecution: async (input, owned) => {
                    const browser = await launchLocalBrowser();
                    try {
                        const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
                        await context.route('**/*', route => new URL(route.request().url()).origin === server.origin && route.request().method() === 'GET' ? route.continue() : route.abort());
                        const page = await context.newPage();
                        await page.goto(server.origin + '/cases/AC7');
                        await page.getByTestId('preview').click();
                        const sessionId = randomUUID(), policyHash = digest(`fixture:baseline:${runId}`), image = await captureFixtureApplicationDebug(page, { runId, sessionId, policyHash, sequence: 1, remainingMs: 10000, remainingBytes: 8388608, entries: [] }), binding = { runId, sessionId, policyHash, validation: 'offline-mocked-salesforce' }, frame = VisualFrameSchema.parse({ manifest: image.manifest, file: image.entry.file, sha256: image.entry.sha256, manifestHash: fingerprint({ binding, entry: image.entry }), ...binding, scope: f.scope, engineHash: installedBrowser().sha256, renderHash, maskingHash, width: 1280, height: 720 }), requirement = f.model.sources.find(s => s.kind === 'requirement')!;
                        baseline = VisualBaselineSchema.parse({ version: digest('pending'), id: 'integrated-contact-preview', criterionId: 'AC7', expectedText: 'Layout approved', scope: f.scope, frame, evidence: [{ source: requirement.id, version: requirement.version, claim: 6 }, { source: f.rules.id, version: f.rules.version, claim: f.rules.claims.length - 1 }], critical: [{ id: 'preview-card', x: 40, y: 40, width: 650, height: 350 }], dynamic: [{ id: 'clock', x: 700, y: 8, width: 180, height: 25 }], channelTolerance: 8, maxChangedRatio: 0.001, requiredAccessibility: [{ id: 'preview', role: 'button', namePresent: true }], maskingAcknowledged: true });
                        baseline.version = baselineVersion(baseline);
                        store.put('visual', baseline.version, baseline);
                        store.review('visual', baseline.version, { operator: 'Synthetic Fixture Operator', hash: baseline.version, reviewedAt: new Date().toISOString() });
                    }
                    finally {
                        await browser.close();
                    }
                    const bindings = { oracles: f.contracts.map(c => c.version), permissions: [f.permission.version], visuals: [baseline.version], permissionEvidence: {} }, qa = await designQAIntelligence({ ...f, permission: 'QA', changes: ['Field:Contact.LastName'] }, { history: h, index: local }, bindings);
                    if (qa.coverage.some(c => !c.proposal))
                        throw Error('Integrated planning left an unreviewed workflow');
                    const payload = testDesignAIPayload(qa.design), advice = await reasonAboutTestDesign(qa.design, chat, { operator: 'Synthetic Fixture Operator', bundleHash: fingerprint(payload), destinations: ['gemini-chat'], expiresAt: new Date(Date.now() + 60000).toISOString() });
                    design = { ...qa, design: advice };
                    await writeQAIntelligenceReport(design, [], phaseRoot);
                    guardConfig = FixtureQAConfigSchema.parse({ mode: 'INTEGRATED_FIXTURE_ONLY', validation: 'offline-mocked-salesforce', runId, history: historyPath, origin: server.origin, identity: integratedIdentity, context: f.context, renderHash, maskingHash, owned: owned.map(r => ({ object: r.object, id: r.id })), workflows: f.model.steps.flatMap(s => s.outcomes.map(o => ({ workflow: o.workflow!, checks: qa.coverage.find(c => c.criterionId === o.criterionId)!.checks, recordId: s.object === 'Account' ? qaFixtureRecord : qaFixtureContact, inputs: server.inputs(o.criterionId) }))), approval: { operator: 'Synthetic Fixture Operator', hash: digest('pending'), expiresAt: new Date(Date.now() + 3600000).toISOString() } });
                    guardConfig.approval.hash = fixtureQAHash(guardConfig);
                    await writeFile(guardPath, JSON.stringify(guardConfig, null, 2));
                    await writeFile(join(phaseRoot, 'guard-initial.review.json'), JSON.stringify(guardConfig, null, 2));
                    if (phase === 'faults')
                        server.setFault('all' as any);
                },
                guardFor: async (_input, workflow) => ({ module: guardModule, config: guardPath, ownsNetworkBoundary: true, qa: { module: guardModule, checks: guardConfig.workflows.find((w: any) => w.workflow.id === workflow.id).checks } }),
                afterExecution: async (input, execution) => {
                    for (const owned of factory.owned(runId)) {
                        const fields = owned.object === 'Account' ? 'Name' : 'LastName,AccountId', row = (await server.read(`SELECT Id,${fields} FROM ${owned.object} WHERE Id='${owned.id}' LIMIT 1`)).records?.[0];
                        if (!row || Object.entries(f.values[owned.object as 'Account' | 'Contact']).some(([k, v]) => row[k] !== v))
                            throw Error('Post-browser owned record changed');
                    }
                    if (phase !== 'faults')
                        return;
                    const failure = execution.failures.find(f => f.testId === 'qa-AC6');
                    if (!failure)
                        throw Error('Seeded locator failure was not recorded');
                    const observed = await exploreFixture({ mode: 'FIXTURE', syntheticOnly: true, origin: server.origin, reviewer: 'Synthetic Fixture Operator', source: 'fixture:locator-recovery', paths: ['/cases/AC6'], actions: [], maxActions: 0, maxMs: 15000 }, { mcpObservation: true });
                    if (!observed.observations[0].elements.some(e => e.testId === 'current-preview') || !observed.mcp.observationHashes.length)
                        throw Error('Repair locator was not observed');
                    repairObservation = observed;
                    const evidence = join(phaseRoot, 'repair-observation.json');
                    await writeFile(evidence, JSON.stringify(observed, null, 2));
                    const original = f.model.steps.find(s => s.id === 'AC6')!.outcomes[0].workflow!, guard = await runtime.guardFor!(input, original);
                    h.db.prepare('INSERT INTO pipeline_runs VALUES(?,?,NULL)').run(repairRun, 'pending');
                    repair = await healReviewedWorkflow({ original, originalHash: workflowHash(original), target: 0, locator: { by: 'testId', value: 'current-preview' }, reviewer: 'Synthetic Fixture Operator', failureRun: runId, runId: repairRun, evidence: [...failure.evidence, evidence] }, { history: h, root: join(phaseRoot, 'repair-execution'), allowedOrigins: [server.origin], guard, validation: 'offline-mocked-salesforce', prepareCandidate: async (candidate) => { const locator = candidate.steps[0].locator; if (locator.by !== 'testId' || locator.value !== 'current-preview')
                            throw Error('Candidate was not observed'); guardConfig.repairs = [{ originalHash: workflowHash(original), candidateHash: workflowHash(candidate), evidence: [evidence, ...observed.mcp.observationHashes], observedLocator: locator, reviewer: 'Synthetic Fixture Operator' }]; guardConfig.workflows.push({ ...guardConfig.workflows.find((w: any) => w.workflow.id === 'qa-AC6'), workflow: candidate }); guardConfig.approval.hash = fixtureQAHash(guardConfig); await writeFile(guardPath, JSON.stringify(guardConfig, null, 2)); await writeFile(join(phaseRoot, 'guard-repair.review.json'), JSON.stringify(guardConfig, null, 2)); } });
                }, verifyCleanup: async (_input, owned) => { for (const r of owned)
                    if ((await server.read(`SELECT Id FROM ${r.object} WHERE Id='${r.id}' LIMIT 1`)).records?.length)
                        throw Error('Independent owned absence check failed'); if (!server.state().foreignUnchanged || server.state().activeOwned)
                    throw Error('Cleanup ownership boundary failed'); }
            };
            const input = PipelineInputSchema.parse({ runId, spec: f.spec, org: f.org, orgVersion: snapshotVersion(f.org), permission: 'QA', allowedOrigins: [server.origin], mappings: f.model.steps.flatMap(s => s.outcomes.map(o => ({ criterionId: o.criterionId, workflow: o.workflow!, preconditions: ['Reviewed synthetic factory-owned Account/Contact and preview-only negative/boundary cases'] }))), dataSetup: { recipes: f.recipes, cleanup: 'always' } });
            input.executionApproval = { reviewer: 'Synthetic Fixture Operator', hash: executionHash(input) };
            const pipelineCP = join(phaseRoot, 'execution-checkpoints.sqlite');
            let executionSaver = new DurableSaver(pipelineCP);
            const services = { history: h, knowledge: semantic, root: phaseRoot, runtime, reasoning: new ReasoningAgents(chat), requireExecutionReview: true }, config = { configurable: { thread_id: runId } };
            let pipeline = createSpecPipeline({ ...services, checkpointer: executionSaver });
            await pipeline.invoke({ input }, config);
            if (!(await pipeline.getState(config)).next.includes('execution_review') || server.state().activeOwned)
                throw Error('Execution did not interrupt before setup');
            executionSaver.close();
            executionSaver = new DurableSaver(pipelineCP);
            pipeline = createSpecPipeline({ ...services, checkpointer: executionSaver });
            const result = await pipeline.invoke(new Command({ resume: { hash: executionHash(input), reviewer: 'Synthetic Fixture Operator' } }), config);
            executionSaver.close();
            const failures = result.execution?.failures.map((f: any) => f.testId).sort() ?? [];
            if (result.lifecycle.created !== 2 || result.lifecycle.cleaned !== 2 || server.state().activeOwned || !server.state().foreignUnchanged)
                throw Error('Integrated lifecycle cleanup did not verify');
            if (phase === 'success' && (result.lifecycle.status !== 'passed' || failures.length))
                throw Error('Successful integrated fixture workflow failed');
            if (phase === 'faults' && (JSON.stringify(failures) !== JSON.stringify(['qa-AC1', 'qa-AC6', 'qa-AC7']) || !repair))
                throw Error('Seeded failure evidence incomplete');
            if (repair) {
                h.db.prepare('UPDATE pipeline_runs SET status=?,payload=? WHERE run=?').run('passed', JSON.stringify({ cleanupVerified: true, ownedRun: runId, cleaned: 2 }), repairRun);
                const proposal = result.investigations.find((p: any) => p.testId === 'qa-AC6')!, before = design.coverage.find((c: any) => c.id === 'qa-AC6')!.score;
                learning = await confirmDefect(h, local, f.scope, proposal, { reviewer: 'Synthetic Fixture Operator', rootCause: 'Seeded local fixture renamed preview test ID to current-preview; actual MCP observation and trace confirm locator drift', fix: 'Use the independently observed current-preview locator, preserving click/value/criterion/assertion and QA checks', regressionRun: repairRun });
                const repairedSource = reviewJourneyEvidence(JourneyEvidenceSchema.parse({ id: digest(`fixture:reviewed-repair:${runId}`), version: fingerprint(repairObservation), org: f.scope.org, permission: 'QA', kind: 'browser', claims: [{ kind: 'locator', text: server.origin + '/cases/AC6', component: 'SObject:Contact' }, { kind: 'locator', text: JSON.stringify(repair.candidate.steps[0].locator), component: 'SObject:Contact' }, { kind: 'action', text: JSON.stringify(repair.candidate.steps[0]), component: 'SObject:Contact' }], sourceHashes: [fingerprint(repairObservation), repair.candidateHash], verification: 'rendered-reviewed-view', validation: 'offline-mocked-salesforce' }), 'Synthetic Fixture Operator');
                f.model.sources.push(repairedSource);
                const repairedStep = f.model.steps.find(s => s.id === 'AC6')!;
                repairedStep.outcomes[0].workflow = repair.candidate;
                repairedStep.evidence.push({ source: repairedSource.id, claim: 0 });
                f.model.version = journeyModelHash(f.model);
                f.model.review = { reviewer: 'Synthetic Fixture Operator', hash: f.model.version };
                new WorkflowModelStore(h).observe([repairedSource]);
                new WorkflowModelStore(h).put(f.model);
                f.context.sources = f.model.sources;
                const future = await designQAIntelligence({ ...f, permission: 'QA', changes: ['Field:Contact.LastName'] }, { history: h, index: local }, { oracles: f.contracts.map(c => c.version), permissions: [f.permission.version], visuals: [baseline.version], permissionEvidence: {} }), after = future.coverage.find(c => c.id === 'qa-AC6')!;
                if (!after.mandatory || after.score <= before)
                    throw Error('Verified fixture learning did not influence future plan');
                learning = { ...learning as any, validation: 'offline-fixture-automation-defect-only', before, after: after.score, mandatory: after.mandatory, passingRegression: repairRun };
                await writeQAIntelligenceReport(future, [], join(root, 'future-plan'));
            }
            const screenshots = [];
            for (const name of await readdir(join('artifacts/browser-debug', runId))) {
                if (!name.endsWith('.json'))
                    continue;
                const path = join('artifacts/browser-debug', runId, name), parsed = await readExplorationManifest(path), binding = { runId, sessionId: parsed.manifest.sessionId, policyHash: parsed.manifest.policyHash, validation: 'offline-mocked-salesforce' as const };
                for (const entry of parsed.manifest.entries)
                    if (entry.status === 'captured' && entry.file && entry.sha256)
                        screenshots.push(await verifyExplorationImage({ manifest: path, file: entry.file, sha256: entry.sha256 }, binding));
            }
            runs.push({ phase, runId, screenshots, report: result.reportPath, lifecycle: result.lifecycle, execution: result.execution, investigations: result.investigations, repair, semanticHits: semanticHits.length, persistedHits, modelFailures: result.modelFailures, workflowReviewResumed: true, executionReviewResumed: true, mcp: { sameContext: observation.mcp.sameContext, snapshots: observation.mcp.observationHashes.length }, application: { pages: study.pages.length, questions: study.questions.length }, baseline: baseline.version, approvals: { scope: 'synthetic-loopback-fixture-only', operator: 'Synthetic Fixture Operator', executionHash: executionHash(input), workflowVersion: f.model.version, guardHash: guardConfig.approval.hash, baselineVersion: baseline.version, expiresAt: guardConfig.approval.expiresAt }, factoryModes: f.recipes.map(r => r.mode) });
        }
        const manifest = { version: 1, id, root, historyPath, validation: 'offline-mocked-Salesforce-Gemini-with-real-headless-Chrome-MCP-and-reportingLabs', status: 'verified-expected-fixture-outcomes', runs, learning, mockedProviderCalls: counts, safety: server.state(), salesforceRequests: 0, liveGeminiRequests: 0, liveChromaRequests: 0, liveApprovalCreated: false, createdAt: new Date().toISOString() };
        await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
        await writeFile(join(root, 'index.html'), integratedHTML(manifest));
        await mkdir('.state', { recursive: true });
        await writeFile('.state/framework-latest.json', JSON.stringify({ manifest: join(root, 'manifest.json') }, null, 2));
        return { manifest: join(root, 'manifest.json'), html: join(root, 'index.html'), historyPath, validation: manifest.validation, status: manifest.status, runs: runs.map(r => ({ phase: r.phase, runId: r.runId, status: r.lifecycle.status, created: r.lifecycle.created, cleaned: r.lifecycle.cleaned, tests: r.execution.results.length, failed: r.execution.failures.length, reportingLabs: r.execution.reportingLabs })), learning, mockedProviderCalls: counts, safety: manifest.safety, salesforceRequests: 0, liveModelRequests: 0 };
    }
    finally {
        h.close();
        await server.close();
    }
}
function integratedHTML(manifest: any) { const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); return `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><title>Integrated Salesforce QA fixture</title><style>body{font:16px system-ui;max-width:1200px;margin:2rem auto;padding:1rem;color:#17233a}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{background:#f3f6fb;padding:1rem;margin:1rem 0}a{color:#174d91}</style><h1>Connected Salesforce QA framework</h1><p>Real generated Playwright and local reportingLabs; mocked Salesforce and Gemini. The faults phase intentionally fails three tests. No live authorization or Salesforce lesson.</p>${manifest.runs.map((r: any) => `<section><h2>${r.phase}: ${r.lifecycle.status}</h2><p>${r.screenshots.map((s: any, i: number) => `<a href="${esc(relativeReport(manifest.root, s.path))}">Masked screenshot ${i + 1}</a> · `).join('')}<a href="${esc(relativeReport(manifest.root, r.execution.reportingLabs.html))}">reportingLabs</a> · <a href="${esc(relativeReport(manifest.root, r.report))}">Execution report JSON</a></p><pre>${esc(JSON.stringify({ lifecycle: r.lifecycle, tests: r.execution.results.map((t: any) => ({ test: t.testId, status: t.status })), mcp: r.mcp, application: r.application, semanticHits: r.semanticHits, persistedHits: r.persistedHits, reviewResumed: r.executionReviewResumed, baseline: r.baseline }, null, 2))}</pre></section>`).join('')}<section><h2>Evidence-backed fixture learning</h2><pre>${esc(JSON.stringify(manifest.learning ?? 'No learning requested', null, 2))}</pre></section><section><h2>Ownership and integration evidence</h2><pre>${esc(JSON.stringify({ safety: manifest.safety, mockedProviderCalls: manifest.mockedProviderCalls, salesforceRequests: 0, liveModelRequests: 0 }, null, 2))}</pre></section></html>`; }
function relativeReport(root: string, path: string) { return relative(root, path).replaceAll('\\', '/'); }
