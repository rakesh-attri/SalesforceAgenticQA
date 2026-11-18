import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { History } from '../core/history.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { designSalesforceTests, type TestDesign, apiVerificationProposal } from './test-design.js';
import { QAContractStore, validateOracle, validatePermissionExpectation, assessPermission, metadataOracleCandidates, type QAContext, type PermissionEvidence } from './qa-oracles.js';
import { validateVisualBaseline } from '../execution/visual-baselines.js';
import { generateTest } from './workflows.js';
import { validateJourney } from './workflow-models.js';
import { fingerprint } from '../execution/browser-policy.js';
import type { QAChecks } from '../execution/qa-checks.js';
type Input = Parameters<typeof designSalesforceTests>[0];
export type QABindings = {
    oracles: string[];
    permissions: string[];
    visuals: string[];
    permissionEvidence: Record<string, PermissionEvidence>;
};
// Extends the existing planner/reviewer. No alternate agents or execution graph.
export async function designQAIntelligence(input: Input, services: {
    history: History;
    index: KnowledgeIndex;
}, bindings: QABindings) {
    services.index.assertLocalOnly();
    const design = await designSalesforceTests(input, services), model = input.model ? validateJourney(input.model) : undefined, context: QAContext = { spec: input.spec, org: input.org, graph: input.graph, sources: model?.sources ?? [] }, store = new QAContractStore(services.history), contracts: Array<{
        kind: 'oracle' | 'permission' | 'visual';
        version: string;
        criterionId: string;
        expected: string;
        questions: string[];
        details: unknown;
    }> = [], questions: Array<{
        criterionId?: string;
        reason: string;
    }> = [];
    for (const kind of ['oracle', 'permission', 'visual'] as const)
        for (const version of bindings[kind === 'oracle' ? 'oracles' : kind === 'permission' ? 'permissions' : 'visuals']) {
            try {
                const saved = store.get(kind, version), c = kind === 'oracle' ? validateOracle(saved.contract, context, services.history) : kind === 'permission' ? validatePermissionExpectation(saved.contract, context, services.history) : await validateVisualBaseline(saved.contract, context, services.history);
                if (fingerprint(c.scope) !== fingerprint(design.scope))
                    throw Error('Planner and QA contract persona/source differ');
                const criterionId = 'rule' in c ? c.rule.criterionId : c.criterionId, expected = 'rule' in c ? c.rule.expectedText : c.expectedText, declaration = kind === 'permission' ? assessPermission(c as any, bindings.permissionEvidence[version] ?? { profile: [], permissionSets: [], groups: [], complete: false, sharing: 'missing', sources: [] }) : undefined;
                contracts.push({ kind, version, criterionId, expected, questions: declaration?.questions ?? [], details: declaration ?? { state: 'reviewed-declaration', runtimeVerified: false } });
            }
            catch {
                questions.push({ reason: `${kind} ${version}: missing, stale, incompatible or unreviewed evidence; review exact source contract` });
            }
        }
    const coverage = design.scenarios.map(s => {
        const bound = contracts.filter(c => c.criterionId === s.criterionId), checks: QAChecks = { oracles: bound.filter(c => c.kind === 'oracle').map(c => c.version), permissions: bound.filter(c => c.kind === 'permission').map(c => c.version), visuals: bound.filter(c => c.kind === 'visual').map(c => c.version) }, gaps = [...s.reasons.filter(r => !(r === 'Visual baseline, masking scope and comparison oracle require review' && checks.visuals.length)), ...bound.flatMap(c => c.questions)];
        if (!bound.length)
            gaps.push('No independently reviewed business, permission or visual oracle');
        const workflow = model?.steps.flatMap(step => step.outcomes).find(o => o.criterionId === s.criterionId)?.workflow;
        // Runtime access gaps remain explicit. Reviewed denial scenarios can still be
        // proposed; neither a proposal nor this review creates permission authority.
        const blockers = gaps.filter(q => !bound.some(c => c.kind === 'permission' && c.questions.includes(q))), proposal = workflow && bound.length && !blockers.length ? generateTest(workflow, [workflow.origin], { module: resolve('src/execution/browser-guard.ts').replaceAll('\\', '/'), config: resolve('.state/REVIEW_REQUIRED-qa-intelligence-guard.json'), ownsNetworkBoundary: true, qa: { module: resolve('src/execution/qa-checks.ts').replaceAll('\\', '/'), checks } }) : undefined;
        questions.push(...gaps.map(reason => ({ criterionId: s.criterionId, reason })));
        return { ...s, checks, expectationState: bound.length ? 'reviewed-source-contract' : 'unresolved', runtimeOutcome: 'not-executed', reviewQuestions: gaps, proposal: proposal ? { typescript: proposal, executionAuthorized: false } : undefined };
    });
    const apiProposals = contracts.filter(c => c.kind === 'oracle').flatMap(c => { const oracle = validateOracle(store.get('oracle', c.version).contract, context, services.history), signals = oracle.rule.signals.filter(s => s.channel === 'api'); return signals.length ? [{ criterionId: c.criterionId, version: c.version, code: apiVerificationProposal(oracle.rule.object, signals.map(s => s.field), Object.fromEntries(signals.map(s => [s.field, s.expected]))), executionAuthorized: false }] : []; });
    return { version: 1, validation: 'source-grounded-proposals-not-runtime-proof', scope: design.scope, design, contracts, coverage, apiProposals, declarations: metadataOracleCandidates(input.graph), questions: [...design.questions, ...questions], agents: ['Spec Analyst', 'Test Planner', 'Risk Analyzer', 'Test Reviewer', 'Application Explorer', 'Failure Investigator', 'Knowledge/RAG'], executionAuthorized: false, permissionsGranted: 0, learningPublished: false };
}
export type QAIntelligence = Awaited<ReturnType<typeof designQAIntelligence>>;
export async function publishReviewedQAContract(h: History, index: KnowledgeIndex, kind: 'oracle' | 'permission', version: string, context: QAContext) { index.assertLocalOnly(); const store = new QAContractStore(h), saved = store.get(kind, version), c = kind === 'oracle' ? validateOracle(saved.contract, context, h) : validatePermissionExpectation(saved.contract, context, h); await index.ingest({ id: `qa-${kind}-${version}`, version, ...c.scope, kind: 'requirement', status: 'verified', text: `REVIEWED DECLARATION ONLY; runtime outcome unverified. ${JSON.stringify(c.rule)}`, evidence: c.evidence.map(r => `application-source:${r.source}@${r.version}`), testIds: [], reviewer: saved.review.operator, capturedAt: saved.review.reviewedAt, schemaVersion: c.scope.metadataVersion }); return { runtimeVerified: false, learningPublished: false }; }
export async function writeQAIntelligenceReport(report: QAIntelligence, observations: unknown[] = [], root = '.state/qa-intelligence') {
    await mkdir(root, { recursive: true });
    const json = resolve(root, 'report.json'), html = resolve(root, 'report.html'), escape = (v: unknown) => JSON.stringify(v, null, 2).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    await writeFile(json, JSON.stringify({ report, observations }, null, 2));
    await writeFile(html, `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Salesforce QA Intelligence</title><style>body{font:16px system-ui;max-width:1200px;margin:2rem auto;background:#f5f7fb;color:#17233a}section{background:white;padding:1rem;margin:1rem 0;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{color:#174d91}</style><h1>Salesforce QA Intelligence</h1><p>Reviewed expectations and scoped observations. Proposals grant no execution authority. Pixel differences require review; no automatic defect or lesson.</p>${[['Requirement → rule → test traceability and persona coverage', report.coverage], ['Impact, historical defects and risk', report.design.impact], ['Reviewed expected outcomes and permission gaps', report.contracts], ['Validation/Flow/dependency declarations (runtime unknown)', report.declarations], ['Business, permission and visual observation receipts', observations], ['Unresolved review questions', report.questions]].map(([title, value]) => `<section><h2>${title}</h2><pre>${escape(value)}</pre></section>`).join('')}</html>`);
    return { json, html };
}
