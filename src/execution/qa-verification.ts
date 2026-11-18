import { z } from 'zod';
import type { Page } from '@playwright/test';
import type { History } from '../core/history.js';
import { fingerprint, digest } from './browser-policy.js';
import { resolveLocator } from '../core/locators.js';
import { QAContractStore, validateOracle, evaluateOracle, validatePermissionExpectation, assessPermission, type QAContext, type PermissionEvidence } from '../agents/qa-oracles.js';
import { VisualBaselineSchema } from './visual-baselines.js';
const Session = z.object({ runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), recordHash: z.string().regex(/^[a-f0-9]{64}$/), validation: z.enum(['offline-mocked-salesforce', 'live-salesforce']) }).strict();
export async function observeOracleUI(h: History, version: string, context: QAContext, page: Page, inputs: Record<string, unknown>, session: z.infer<typeof Session>) {
    const s = Session.parse(session), store = new QAContractStore(h), saved = store.get('oracle', version), c = validateOracle(saved.contract, context, h), signals = [];
    for (const expected of c.rule.signals.filter(s => s.channel === 'ui')) {
        if (expected.channel !== 'ui')
            continue;
        const locator = resolveLocator(page, expected.locator), count = await locator.count(), available = count === 1 && await locator.isVisible();
        signals.push({ channel: 'ui' as const, key: fingerprint(expected.locator), value: available ? await locator.textContent() : undefined, available });
    }
    // A UI-only observation cannot satisfy independent API signals.
    return store.observe({ kind: 'oracle-observation', contractVersion: version, scope: c.scope, ...s, inputHash: fingerprint(inputs), channel: 'ui', result: evaluateOracle(c, inputs, signals), expected: c.rule.expectedText, executionAuthority: false, verifiedLearning: false });
}
export async function observeOracleAPI(h: History, version: string, context: QAContext, input: {
    runId: string;
    recordId: string;
    inputs: Record<string, unknown>;
    validation: 'offline-mocked-salesforce' | 'live-salesforce';
}, read: (query: string) => Promise<{
    records?: Record<string, unknown>[];
    errorCode?: string;
}>) {
    if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(input.recordId))
        throw Error('Exact independently approved record required');
    const session = Session.parse({ runId: input.runId, recordHash: digest(input.recordId), validation: input.validation }), store = new QAContractStore(h), c = validateOracle(store.get('oracle', version).contract, context, h), fields = [...new Set(['Id', ...c.rule.signals.flatMap(s => s.channel === 'api' ? [s.field] : [])])];
    let response: Awaited<ReturnType<typeof read>> | undefined;
    try {
        response = await read(`SELECT ${fields.join(',')} FROM ${c.rule.object} WHERE Id='${input.recordId}' LIMIT 1`);
    }
    catch { /* Missing/denied/transport errors remain unknown, never fabricated API codes. */ }
    const row = response?.records?.length === 1 && response.records[0].Id === input.recordId ? response.records[0] : undefined, signals = c.rule.signals.filter(s => s.channel !== 'ui').map(s => s.channel === 'api' ? { channel: 'api' as const, key: s.field, value: row?.[s.field], available: !!row && s.field in row } : { channel: 'api-error' as const, key: 'errorCode', value: response?.errorCode, available: typeof response?.errorCode === 'string' });
    return store.observe({ kind: 'oracle-observation', contractVersion: version, scope: c.scope, ...session, inputHash: fingerprint(input.inputs), channel: 'api', responseHash: fingerprint(response ?? 'unavailable'), result: evaluateOracle(c, input.inputs, signals), expected: c.rule.expectedText, executionAuthority: false, verifiedLearning: false });
}
export function combineOracleObservations(h: History, version: string, uiHash: string, apiHash: string) { const store = new QAContractStore(h), ui = store.observation(uiHash), api = store.observation(apiHash); if (ui.kind !== 'oracle-observation' || api.kind !== 'oracle-observation' || ui.contractVersion !== version || api.contractVersion !== version || ui.channel !== 'ui' || api.channel !== 'api' || ui.runId !== api.runId || ui.recordHash !== api.recordHash || ui.inputHash !== api.inputHash || ui.validation !== api.validation || fingerprint(ui.scope) !== fingerprint(api.scope))
    throw Error('Independent oracle observations belong to different contract/run/record/input/scope'); const checks = [...ui.result.checks.filter((c: any) => c.channel === 'ui'), ...api.result.checks.filter((c: any) => c.channel !== 'ui')], contract = store.get('oracle', version).contract; if (!contract.rule.signals.some((s: any) => s.channel === 'ui') || !contract.rule.signals.some((s: any) => s.channel !== 'ui') || checks.length !== contract.rule.signals.length)
    throw Error('Independent signal coverage incomplete'); return store.observe({ kind: 'independent-oracle-verification', contractVersion: version, scope: ui.scope, runId: ui.runId, recordHash: ui.recordHash, validation: ui.validation, checks, status: checks.some((c: any) => c.status === 'unknown') ? 'unknown' : checks.every((c: any) => c.status === 'passed') ? 'verified' : 'mismatch', evidence: [uiHash, apiHash], defectConfirmed: false, learningPublished: false }); }
export function observePermissionAccess(h: History, version: string, context: QAContext, input: {
    runId: string;
    recordHash: string;
    validation: 'offline-mocked-salesforce' | 'live-salesforce';
    channel: 'api' | 'ui';
    access: 'allowed' | 'denied' | 'unknown';
    evidenceHash: string;
    observedOperation: 'read' | 'create' | 'edit' | 'delete';
    observedObject: string;
    observedField?: string;
    observedScopeHash: string;
}, declarations: PermissionEvidence) { const store = new QAContractStore(h), c = validatePermissionExpectation(store.get('permission', version).contract, context, h), session = Session.parse({ runId: input.runId, recordHash: input.recordHash, validation: input.validation }); if (!/^[a-f0-9]{64}$/.test(input.evidenceHash) || input.observedScopeHash !== fingerprint(c.scope) || input.observedObject !== c.rule.object || input.observedField !== c.rule.field || input.observedOperation !== c.rule.operation)
    throw Error('Independent permission source scope/operation evidence required'); const result = assessPermission(c, { ...declarations, runtime: { scopeHash: fingerprint(c.scope), object: c.rule.object, field: c.rule.field, operation: c.rule.operation, recordHash: session.recordHash, access: input.access, evidenceHash: input.evidenceHash } }); return store.observe({ kind: 'permission-observation', contractVersion: version, scope: c.scope, ...session, channel: input.channel, result, evidence: input.evidenceHash, authorityGranted: false }); }
export async function visualAccessibilityFacts(page: Page, raw: unknown) { const b = VisualBaselineSchema.parse(raw); return Promise.all(b.requiredAccessibility.map(async (expected) => { const locator = page.getByTestId(expected.id), count = await locator.count(), matches = await page.getByRole(expected.role as 'button', { name: /\S/ }).and(locator).count(); return { id: expected.id, role: count === 1 && matches === 1 ? expected.role : 'unknown', namePresent: count === 1 && matches === 1 && await locator.isVisible() }; })); }
