import { z } from 'zod';
import type { History } from '../core/history.js';
import { SpecSchema } from '../specs/ingest.js';
import { OrgSnapshotSchema } from '../core/types.js';
import { knowledgeFingerprint } from '../knowledge/snapshots.js';
import { ComponentGraphSchema } from './component-graph.js';
import { JourneyEvidenceSchema, journeyEvidenceHash } from './workflow-evidence.js';
import { WorkflowModelStore } from './workflow-models.js';
import { fingerprint, digest } from '../execution/browser-policy.js';
import { calculateGrant } from './deep-discovery.js';
const Hash = z.string().regex(/^[a-f0-9]{64}$/), Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), Value = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
export const QAScopeSchema = z.object({ org: z.string().min(1), permission: z.string().min(1), metadataVersion: Hash, graphVersion: Hash }).strict();
export const QARefSchema = z.object({ source: Hash, version: Hash, claim: z.number().int().nonnegative() }).strict();
export const PredicateSchema = z.object({ field: Name, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'blank', 'present']), value: Value.optional() }).strict().superRefine((p, c) => { if (!['blank', 'present'].includes(p.op) && p.value === undefined)
    c.addIssue({ code: 'custom', message: 'Predicate literal required' }); if (['gt', 'gte', 'lt', 'lte'].includes(p.op) && typeof p.value !== 'number')
    c.addIssue({ code: 'custom', message: 'Numeric boundary required' }); });
export const SignalSchema = z.discriminatedUnion('channel', [
    z.object({ channel: z.literal('ui'), locator: z.object({ by: z.enum(['role', 'text', 'label', 'testId']), value: z.string().min(1).max(200), name: z.string().max(200).optional() }).strict(), expected: z.string().min(1).max(1000) }).strict(),
    z.object({ channel: z.literal('api'), field: Name, expected: Value }).strict(),
    z.object({ channel: z.literal('api-error'), code: z.enum(['INSUFFICIENT_ACCESS', 'INSUFFICIENT_ACCESS_OR_READONLY', 'FIELD_CUSTOM_VALIDATION_EXCEPTION', 'REQUIRED_FIELD_MISSING']) }).strict()
]);
export const OracleRuleSchema = z.object({ criterionId: z.string().min(1), object: Name, persona: z.string().min(1), kind: z.enum(['positive', 'negative', 'boundary', 'integration', 'permission', 'regression', 'visual']), conditions: z.array(PredicateSchema).max(20), expectedText: z.string().min(1).max(1000), signals: z.array(SignalSchema).min(1).max(10), prerequisites: z.array(z.string().min(1)).min(1).max(20), components: z.array(z.string()).min(1).max(30) }).strict();
export const OracleContractSchema = z.object({ version: Hash, scope: QAScopeSchema, specVersion: z.string(), rule: OracleRuleSchema, evidence: z.array(QARefSchema).min(1).max(30) }).strict();
export const QAReviewSchema = z.object({ operator: z.string().trim().min(1).refine(s => s !== 'REVIEW_REQUIRED'), hash: Hash, reviewedAt: z.string().datetime() }).strict();
export type OracleContract = z.infer<typeof OracleContractSchema>;
export const oracleVersion = (raw: unknown) => { const { version, ...c } = OracleContractSchema.parse(raw); return fingerprint(c); };
export type QAContext = {
    spec: unknown;
    org: unknown;
    graph: unknown;
    sources: unknown[];
};
export function qaContext(raw: QAContext, scope: z.infer<typeof QAScopeSchema>, h: History) {
    const spec = SpecSchema.parse(raw.spec), org = OrgSnapshotSchema.parse(raw.org), graph = ComponentGraphSchema.parse(raw.graph), sources = raw.sources.map(s => JourneyEvidenceSchema.parse(s));
    if ((org.orgIdentityHash ?? org.orgAlias) !== scope.org || knowledgeFingerprint(org) !== scope.metadataVersion || graph.org !== scope.org || graph.knowledgeVersion !== scope.metadataVersion || graph.version !== scope.graphVersion || graph.version !== fingerprint({ org: graph.org, knowledgeVersion: graph.knowledgeVersion, nodes: graph.nodes, edges: graph.edges, unknowns: graph.unknowns }))
        throw Error('QA source scope/version differs');
    const store = new WorkflowModelStore(h);
    for (const source of sources) {
        if (source.org !== scope.org || source.permission !== scope.permission || source.review && (source.review.reviewer === 'REVIEW_REQUIRED' || source.review.hash !== journeyEvidenceHash(source)))
            throw Error('QA evidence persona/review differs');
        const current = h.db.prepare('SELECT version FROM journey_sources WHERE org=? AND permission=? AND id=?').get(scope.org, scope.permission, source.id);
        if (current?.version !== source.version)
            throw Error('QA source is stale or missing');
    }
    return { spec, org, graph, sources, store };
}
export function validateOracle(raw: unknown, context: QAContext, h: History) {
    const c = OracleContractSchema.parse(raw), { spec, org, graph, sources } = qaContext(context, c.scope, h), ac = spec.acceptanceCriteria.find(a => a.id === c.rule.criterionId), object = org.objects.find(o => o.name === c.rule.object);
    if (c.version !== oracleVersion(c) || c.specVersion !== spec.version || !ac || ac.expectedText !== c.rule.expectedText || ac.kind !== c.rule.kind || c.rule.persona !== c.scope.permission || !object || c.rule.components.some(id => !graph.nodes.some(n => n.id === id)))
        throw Error('Oracle changes requirement/persona/component outcome');
    for (const field of [...c.rule.conditions.map(p => p.field), ...c.rule.signals.flatMap(s => s.channel === 'api' ? [s.field] : [])])
        if (!object.fields.some(f => f.name === field))
            throw Error('Oracle field is not in verified schema');
    const claims = c.evidence.map(ref => { const source = sources.find(s => s.id === ref.source && s.version === ref.version), claim = source?.claims[ref.claim]; if (!source || !claim)
        throw Error('Oracle lacks exact source claim'); return { source, claim }; });
    if (!claims.some(({ source, claim }) => source.review && claim.kind === 'oracle' && claim.text === JSON.stringify(c.rule)) || !claims.some(({ source, claim }) => source.review && source.kind === 'requirement' && claim.kind === 'outcome' && claim.text === c.rule.expectedText))
        throw Error('Independently reviewed full rule and literal requirement outcome required');
    return c;
}
export class QAContractStore {
    constructor(readonly history: History) { history.db.exec('CREATE TABLE IF NOT EXISTS qa_contracts(kind TEXT,version TEXT,payload TEXT,PRIMARY KEY(kind,version));CREATE TABLE IF NOT EXISTS qa_reviews(kind TEXT,version TEXT,payload TEXT,PRIMARY KEY(kind,version));CREATE TABLE IF NOT EXISTS qa_observations(hash TEXT PRIMARY KEY,payload TEXT)'); }
    put(kind: 'oracle' | 'permission' | 'visual', version: string, payload: unknown) { const parsed = z.object({ version: Hash }).passthrough().parse(payload), { version: declared, ...body } = parsed; if (version !== declared || fingerprint(body) !== version)
        throw Error('QA contract content hash differs'); const text = JSON.stringify(payload), old = this.history.db.prepare('SELECT payload FROM qa_contracts WHERE kind=? AND version=?').get(kind, version); if (old && old.payload !== text)
        throw Error('QA contract versions are immutable'); this.history.db.prepare('INSERT OR IGNORE INTO qa_contracts VALUES(?,?,?)').run(kind, version, text); return version; }
    review(kind: 'oracle' | 'permission' | 'visual', version: string, raw: unknown) { const review = QAReviewSchema.parse(raw); if (review.hash !== version || Date.parse(review.reviewedAt) > Date.now() || !this.history.db.prepare('SELECT version FROM qa_contracts WHERE kind=? AND version=?').get(kind, version))
        throw Error('Exact existing QA contract review required'); const old = this.history.db.prepare('SELECT payload FROM qa_reviews WHERE kind=? AND version=?').get(kind, version); if (old && old.payload !== JSON.stringify(review))
        throw Error('QA review is immutable'); this.history.db.prepare('INSERT OR IGNORE INTO qa_reviews VALUES(?,?,?)').run(kind, version, JSON.stringify(review)); return review; }
    get(kind: 'oracle' | 'permission' | 'visual', version: string) { const contract = this.history.db.prepare('SELECT payload FROM qa_contracts WHERE kind=? AND version=?').get(kind, version), review = this.history.db.prepare('SELECT payload FROM qa_reviews WHERE kind=? AND version=?').get(kind, version); if (!contract || !review)
        throw Error('Reviewed QA contract required'); const r = QAReviewSchema.parse(JSON.parse(String(review.payload))), payload = JSON.parse(String(contract.payload)), { version: declared, ...body } = payload; if (r.hash !== version || declared !== version || fingerprint(body) !== version)
        throw Error('QA review content differs'); new WorkflowModelStore(this.history); for (const ref of z.array(QARefSchema).parse(payload.evidence)) {
        const current = this.history.db.prepare('SELECT version FROM journey_sources WHERE org=? AND permission=? AND id=?').get(payload.scope.org, payload.scope.permission, ref.source);
        if (current?.version !== ref.version)
            throw Error('QA contract source is stale');
    } return { contract: payload, review: r }; }
    observe<T>(payload: T) { const hash = fingerprint(payload); this.history.db.prepare('INSERT OR IGNORE INTO qa_observations VALUES(?,?)').run(hash, JSON.stringify(payload)); return { hash, payload }; }
    observation(hash: string) { const row = this.history.db.prepare('SELECT payload FROM qa_observations WHERE hash=?').get(hash); if (!row)
        throw Error('QA observation missing'); const p = JSON.parse(String(row.payload)); if (fingerprint(p) !== hash)
        throw Error('QA observation integrity failed'); return p; }
}
export function predicateResult(raw: unknown, data: Record<string, unknown>): boolean | 'unknown' { const p = PredicateSchema.parse(raw); if (!(p.field in data))
    return 'unknown'; const v = data[p.field]; if (p.op === 'blank')
    return v === null || v === ''; if (p.op === 'present')
    return v !== null && v !== '' && v !== undefined; if (p.op === 'eq' || p.op === 'neq') {
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v))
        return 'unknown';
    return p.op === 'eq' ? v === p.value : v !== p.value;
} if (typeof v !== 'number' || !Number.isFinite(v) || typeof p.value !== 'number')
    return 'unknown'; return p.op === 'gt' ? v > p.value : p.op === 'gte' ? v >= p.value : p.op === 'lt' ? v < p.value : v <= p.value; }
export function evaluateOracle(c: OracleContract, inputs: Record<string, unknown>, signals: Array<{
    channel: 'ui' | 'api' | 'api-error';
    key: string;
    value: unknown;
    available: boolean;
}>) {
    const conditions = c.rule.conditions.map(p => predicateResult(p, inputs));
    if (conditions.some(c => c === 'unknown'))
        return { status: 'unknown' as const, reason: 'Missing typed condition evidence', checks: [] };
    if (conditions.some(c => !c))
        return { status: 'not-applicable' as const, reason: 'Reviewed condition not met', checks: [] };
    const checks = c.rule.signals.map(s => { const key = s.channel === 'ui' ? fingerprint(s.locator) : s.channel === 'api' ? s.field : 'errorCode', matches = signals.filter(a => a.channel === s.channel && a.key === key), actual = matches.length === 1 ? matches[0] : undefined, expected = s.channel === 'api-error' ? s.code : s.expected, available = actual?.available && (actual.value === null || ['string', 'number', 'boolean'].includes(typeof actual.value)); return { channel: s.channel, key, expectedHash: fingerprint(expected), actualHash: available ? fingerprint(actual!.value) : undefined, status: !available ? 'unknown' : actual!.value === expected ? 'passed' : 'mismatch' }; });
    return { status: checks.some(c => c.status === 'unknown') ? 'unknown' as const : checks.every(c => c.status === 'passed') ? 'verified' as const : 'mismatch' as const, reason: 'Reviewed source-backed signals compared; no defect or learning is confirmed', checks };
}
export const PermissionRuleSchema = z.object({ criterionId: z.string(), object: Name, field: Name.optional(), persona: z.string().min(1), operation: z.enum(['read', 'create', 'edit', 'delete']), expectedAccess: z.enum(['allowed', 'denied']), expectedText: z.string().min(1), basis: z.enum(['profile', 'permission-set', 'permission-set-group', 'sharing', 'independent-runtime']), prerequisites: z.array(z.string()).min(1) }).strict();
export const PermissionContractSchema = z.object({ version: Hash, scope: QAScopeSchema, specVersion: z.string(), rule: PermissionRuleSchema, evidence: z.array(QARefSchema).min(1).max(30) }).strict();
export const permissionVersion = (raw: unknown) => { const { version, ...c } = PermissionContractSchema.parse(raw); return fingerprint(c); };
export function validatePermissionExpectation(raw: unknown, context: QAContext, h: History) { const c = PermissionContractSchema.parse(raw), { spec, org, sources } = qaContext(context, c.scope, h), ac = spec.acceptanceCriteria.find(a => a.id === c.rule.criterionId); if (c.version !== permissionVersion(c) || c.specVersion !== spec.version || c.rule.persona !== c.scope.permission || ac?.expectedText !== c.rule.expectedText || ac.kind !== 'permission' || !org.objects.some(o => o.name === c.rule.object && (!c.rule.field || o.fields.some(f => f.name === c.rule.field))))
    throw Error('Permission expectation lacks current requirement/field/persona'); const claims = c.evidence.map(ref => { const s = sources.find(s => s.id === ref.source && s.version === ref.version); if (!s?.claims[ref.claim])
    throw Error('Permission source claim missing'); return { s, c: s.claims[ref.claim] }; }); if (!claims.some(({ s, c: claim }) => s.review && claim.kind === 'permission' && claim.text === JSON.stringify(c.rule)) || !claims.some(({ s, c: claim }) => s.review && s.kind === 'requirement' && claim.kind === 'outcome' && claim.text === c.rule.expectedText))
    throw Error('Independent named permission expectation review required'); return c; }
export type PermissionEvidence = {
    profile: boolean[];
    permissionSets: boolean[];
    groups: Array<{
        grants: boolean[];
        muted: boolean;
        complete: boolean;
    }>;
    complete: boolean;
    objectGrant?: boolean | 'unknown';
    sharing: 'declared' | 'missing';
    sources: string[];
    runtime?: {
        scopeHash: string;
        object: string;
        field?: string;
        operation: string;
        recordHash: string;
        access: 'allowed' | 'denied' | 'unknown';
        evidenceHash: string;
    };
};
export function assessPermission(c: z.infer<typeof PermissionContractSchema>, evidence: PermissionEvidence) { const fieldGrant = calculateGrant([...evidence.profile, ...evidence.permissionSets], evidence.groups, evidence.complete).candidateGrant, declared = { candidateGrant: c.rule.field ? (fieldGrant === false || evidence.objectGrant === false ? false : fieldGrant === true && evidence.objectGrant === true ? true : 'unknown') : fieldGrant }, runtime = evidence.runtime, scopeHash = fingerprint(c.scope), valid = !!runtime && runtime.scopeHash === scopeHash && runtime.object === c.rule.object && runtime.field === c.rule.field && runtime.operation === c.rule.operation && /^[a-f0-9]{64}$/.test(runtime.recordHash) && /^[a-f0-9]{64}$/.test(runtime.evidenceHash), actual = valid ? runtime!.access : 'unknown'; return { criterionId: c.rule.criterionId, persona: c.rule.persona, declaredCandidate: declared.candidateGrant, effectiveAccess: actual, status: actual === 'unknown' ? 'review-required' : actual === c.rule.expectedAccess ? 'verified' : 'mismatch', sources: evidence.sources, questions: [...(declared.candidateGrant === 'unknown' ? ['Profile/set/group inventory is incomplete; absence is not denial.'] : []), ...(evidence.sharing === 'missing' ? ['Record sharing, restriction rules, license and session activation need scoped runtime evidence.'] : []), ...(actual === 'unknown' ? ['Obtain a separately authorized exact-persona/record/channel access observation; declarations do not prove effective access.'] : [])], permissionGranted: false, defectConfirmed: false }; }
export function metadataOracleCandidates(rawGraph: unknown) { const graph = ComponentGraphSchema.parse(rawGraph); return graph.nodes.filter(n => ['ValidationRule', 'FlowCondition', 'PermissionSetGroup', 'SharingModel'].includes(n.kind)).map(n => ({ component: n.id, kind: n.kind, sources: n.sources, declaration: n.details ?? 'Condition/formula details unavailable', expectedOutcome: 'unknown', runtimeVerified: false, reviewRequired: true, dependencies: graph.edges.filter(e => e.from === n.id || e.to === n.id) })); }
