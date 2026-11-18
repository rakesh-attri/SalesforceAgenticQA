import type { Page } from '@playwright/test';
import { z } from 'zod';
import type { History } from '../core/history.js';
import { fingerprint } from './browser-policy.js';
import { QAContractStore, type QAContext, type PermissionEvidence } from '../agents/qa-oracles.js';
import { observeOracleUI, observeOracleAPI, combineOracleObservations, observePermissionAccess, visualAccessibilityFacts } from './qa-verification.js';
import { compareVisualBaseline } from './visual-baselines.js';
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const QAChecksSchema = z.object({ oracles: z.array(Hash).max(20), permissions: z.array(Hash).max(20), visuals: z.array(Hash).max(10) }).strict().refine(c => c.oracles.length + c.permissions.length + c.visuals.length > 0, 'At least one reviewed QA expectation required');
export type QAChecks = z.infer<typeof QAChecksSchema>;
type Binding = {
    history: History;
    context: QAContext;
    checks: QAChecks;
    origin: string;
    runId: string;
    recordId: string;
    inputs: Record<string, unknown>;
    validation: 'offline-mocked-salesforce' | 'live-salesforce';
    read?: (query: string) => Promise<{
        records?: Record<string, unknown>[];
        errorCode?: string;
    }>;
    permission?: (version: string) => Promise<{
        access: 'allowed' | 'denied' | 'unknown';
        channel: 'api' | 'ui';
        evidenceHash: string;
        observedOperation: 'read' | 'create' | 'edit' | 'delete';
        observedObject: string;
        observedField?: string;
        observedScopeHash: string;
        declarations: PermissionEvidence;
    }>;
    capture?: () => Promise<unknown>;
};
const bindings = new WeakMap<Page, Binding>();
// Trusted execution hosts bind an ALREADY authorized Page and independently
// approved transport. This function cannot launch, authenticate or grant actions.
export function bindReviewedQAContext(page: Page, input: Binding) { if (bindings.has(page))
    throw Error('QA page binding cannot be replaced'); if (new URL(input.origin).origin !== input.origin)
    throw Error('Exact QA origin required'); QAChecksSchema.parse(input.checks); bindings.set(page, input); return () => bindings.delete(page); }
export async function verifyReviewedQAExpectations(page: Page, raw: unknown) {
    const checks = QAChecksSchema.parse(raw), b = bindings.get(page);
    if (!b || new URL(page.url()).origin !== b.origin || fingerprint(checks) !== fingerprint(b.checks))
        throw Error('Reviewed QA execution-host binding required');
    const results: unknown[] = [], store = new QAContractStore(b.history);
    for (const version of checks.oracles) {
        if (!b.read)
            throw Error('Independent approved API oracle adapter required');
        const session = { runId: b.runId, recordHash: (await import('./browser-policy.js')).digest(b.recordId), validation: b.validation }, ui = await observeOracleUI(b.history, version, b.context, page, b.inputs, session), api = await observeOracleAPI(b.history, version, b.context, b, b.read), result = combineOracleObservations(b.history, version, ui.hash, api.hash);
        results.push(result);
        if (result.payload.status !== 'verified')
            throw Error(`Business-rule verification ${result.payload.status}; receipt ${result.hash}`);
    }
    for (const version of checks.permissions) {
        if (!b.permission)
            throw Error('Independent persona permission adapter required');
        const observation = await b.permission(version), result = observePermissionAccess(b.history, version, b.context, { runId: b.runId, recordHash: (await import('./browser-policy.js')).digest(b.recordId), validation: b.validation, channel: observation.channel, access: observation.access, evidenceHash: observation.evidenceHash, observedOperation: observation.observedOperation, observedObject: observation.observedObject, observedField: observation.observedField, observedScopeHash: observation.observedScopeHash }, observation.declarations);
        results.push(result);
        if (result.payload.result.status !== 'verified')
            throw Error(`Permission expectation ${result.payload.result.status}; receipt ${result.hash}`);
    }
    for (const version of checks.visuals) {
        if (!b.capture)
            throw Error('Reviewed masked screenshot adapter required');
        const baseline = store.get('visual', version).contract, result = await compareVisualBaseline(b.history, version, await b.capture(), await visualAccessibilityFacts(page, baseline), b.context);
        results.push(result);
        if (result.payload.status !== 'within-reviewed-tolerance')
            throw Error(`Visual comparison requires review; receipt ${result.hash}`);
    }
    return { results, executionAuthorityGranted: false, learningPublished: false };
}
