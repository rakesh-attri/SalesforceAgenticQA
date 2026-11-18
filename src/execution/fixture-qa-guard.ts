import { z } from 'zod';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { History } from '../core/history.js';
import { OrgSnapshotSchema } from '../core/types.js';
import { WorkflowSchema, type Workflow } from '../agents/workflows.js';
import { workflowHash } from '../agents/healing.js';
import { resolveLocator } from '../core/locators.js';
import { fingerprint } from './browser-policy.js';
import { bindReviewedQAContext, verifyReviewedQAExpectations as verifyQA, QAChecksSchema } from './qa-checks.js';
import { captureFixtureApplicationDebug } from './browser-debug.js';
import { VisualFrameSchema } from './visual-baselines.js';
import { installedBrowser } from './local-browser.js';
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const FixtureQAConfigSchema = z.object({ mode: z.literal('INTEGRATED_FIXTURE_ONLY'), validation: z.literal('offline-mocked-salesforce'), runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), history: z.string(), origin: z.string().url(), identity: z.object({ Id: z.literal('00D000000000001'), userId: z.literal('005000000000001'), IsSandbox: z.literal(true), persona: z.literal('QA') }).strict(), context: z.object({ spec: z.unknown(), org: OrgSnapshotSchema, graph: z.unknown(), sources: z.array(z.unknown()) }).strict(), renderHash: Hash, maskingHash: Hash, owned: z.array(z.object({ object: z.enum(['Account', 'Contact']), id: z.string().regex(/^[A-Za-z0-9]{15}$/) }).strict()).length(2), workflows: z.array(z.object({ workflow: WorkflowSchema, checks: QAChecksSchema, recordId: z.string(), inputs: z.record(z.string(), z.unknown()) }).strict()).min(1).max(8), repairs: z.array(z.object({ originalHash: Hash, candidateHash: Hash, evidence: z.array(z.string()).min(1), observedLocator: WorkflowSchema.shape.assertion.shape.locator, reviewer: z.string().min(1) }).strict()).max(1).default([]), approval: z.object({ operator: z.string().trim().min(1), hash: Hash, expiresAt: z.string().datetime() }).strict() }).strict();
export type FixtureQAConfig = z.infer<typeof FixtureQAConfigSchema>;
export function fixtureQAHash(raw: unknown) { const { approval, ...body } = FixtureQAConfigSchema.parse(raw); return fingerprint(body); }
async function contained(path: string) { const root = await realpath('.'), actual = await realpath(path), rel = relative(root, actual); if (!rel || rel.startsWith('..') || isAbsolute(rel) || !['.state', 'artifacts'].includes(rel.split(/[\\/]/)[0]))
    throw Error('Contained runtime artifact required'); return actual; }
export async function readFixtureQAConfig(path: string) { const file = await contained(path); if ((await stat(file)).size > 2097152)
    throw Error('Fixture guard config budget exceeded'); const c = FixtureQAConfigSchema.parse(JSON.parse(await readFile(file, 'utf8'))), url = new URL(c.origin); if (c.context.org.source !== 'fixture' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.origin !== c.origin || c.approval.operator === 'REVIEW_REQUIRED' || c.approval.hash !== fixtureQAHash(c) || Date.parse(c.approval.expiresAt) <= Date.now())
    throw Error('Exact unexpired loopback fixture approval required'); await contained(c.history); for (const w of c.workflows)
    if (w.workflow.origin !== c.origin || !/^\/cases\/AC[1-7]$/.test(w.workflow.path) || !c.owned.some(r => r.id === w.recordId) || w.workflow.steps.some(s => s.action !== 'click' || s.locator.by !== 'testId' || !['preview', 'current-preview'].includes(s.locator.value)))
        throw Error('Fixture workflow outside reviewed boundary'); return c; }
type Host = {
    config: FixtureQAConfig;
    history: History;
    used: WeakMap<Page, Set<number>>;
    bound: WeakSet<Page>;
    entries: unknown[];
    sessionId: string;
};
const hosts = new WeakMap<BrowserContext, Host>();
async function api(c: FixtureQAConfig, id: string, query: string) { if (Date.parse(c.approval.expiresAt) <= Date.now())
    throw Error('Fixture approval expired'); const response = await fetch(`${c.origin}/api/${id}?q=${encodeURIComponent(query)}`, { redirect: 'error', signal: AbortSignal.timeout(3000) }); if (!response.ok)
    throw Error('Independent fixture read denied'); return response.json(); }
export async function installDedicatedGuardFile(context: BrowserContext, path: string) {
    if (hosts.has(context))
        throw Error('Fixture guard cannot be replaced');
    const c = await readFixtureQAConfig(path), identity = await api(c, 'identity', 'identity');
    if (fingerprint(FixtureQAConfigSchema.shape.identity.parse(identity)) !== fingerprint(c.identity))
        throw Error('Fixture org/user identity mismatch');
    const history = new History(await contained(c.history)), host: Host = { config: c, history, used: new WeakMap(), bound: new WeakSet(), entries: [], sessionId: randomUUID() };
    for (const r of c.owned) {
        if (!history.db.prepare("SELECT id FROM mutations WHERE run=? AND object=? AND id=? AND status='created'").get(c.runId, r.object, r.id)) {
            history.close();
            throw Error('Fixture page record is not run owned');
        }
    }
    hosts.set(context, host);
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => { const request = route.request(), url = new URL(request.url()); return Date.parse(c.approval.expiresAt) > Date.now() && request.method() === 'GET' && url.origin === c.origin && c.workflows.some(w => url.href === new URL(w.workflow.path, c.origin).href) ? route.continue() : route.abort(); });
    const attach = (page: Page) => { page.on('framenavigated', frame => { if (frame !== page.mainFrame() || host.bound.has(page))
        return; const w = c.workflows.find(w => new URL(w.workflow.path, c.origin).href === page.url()); if (!w)
        return; host.bound.add(page); bindReviewedQAContext(page, { history, context: c.context, checks: w.checks, origin: c.origin, runId: c.runId, recordId: w.recordId, inputs: w.inputs, validation: c.validation, read: query => api(c, w.workflow.criterion, query), permission: async () => { const response = await api(c, 'AC5', `SELECT Id,LastName FROM Contact WHERE Id='${w.recordId}' LIMIT 1`); return { access: response.errorCode === 'INSUFFICIENT_ACCESS' ? 'denied' : 'unknown', channel: 'api', evidenceHash: fingerprint(response), observedOperation: 'read', observedObject: 'Contact', observedField: 'LastName', observedScopeHash: fingerprint((c.context.graph as {
                org: string;
            }).org ? { org: (c.context.graph as any).org, permission: 'QA', metadataVersion: (c.context.graph as any).knowledgeVersion, graphVersion: (c.context.graph as any).version } : {}), declarations: { profile: [false], permissionSets: [], groups: [], complete: true, objectGrant: true, sharing: 'missing', sources: ['fixture:restricted-read-persona'] } }; }, capture: () => captureFrame(page, host) }); }); };
    context.on('page', attach);
    context.pages().forEach(attach);
    context.on('close', () => { hosts.delete(context); history.close(); });
}
async function captureFrame(page: Page, host: Host) { const c = host.config, frame = await captureFixtureApplicationDebug(page, { runId: c.runId, sessionId: host.sessionId, policyHash: c.approval.hash, sequence: host.entries.length + 1, remainingMs: 10000, remainingBytes: 8388608, entries: host.entries }); host.entries.push(frame.entry); const binding = { runId: c.runId, sessionId: host.sessionId, policyHash: c.approval.hash, validation: c.validation }, graph = c.context.graph as any, viewport = page.viewportSize(); if (!viewport)
    throw Error('Fixed fixture viewport required'); return VisualFrameSchema.parse({ manifest: frame.manifest, file: frame.entry.file, sha256: frame.entry.sha256, manifestHash: fingerprint({ binding, entry: frame.entry }), ...binding, scope: { org: graph.org, permission: 'QA', metadataVersion: graph.knowledgeVersion, graphVersion: graph.version }, engineHash: installedBrowser().sha256, renderHash: c.renderHash, maskingHash: c.maskingHash, ...viewport }); }
export async function executeReviewedWorkflowStep(page: Page, raw: unknown, index: number) { const host = hosts.get(page.context()), w = WorkflowSchema.parse(raw); if (!host || Date.parse(host.config.approval.expiresAt) <= Date.now() || !host.config.workflows.some(entry => workflowHash(entry.workflow) === workflowHash(w)) || page.url() !== new URL(w.path, w.origin).href)
    throw Error('Unapproved fixture workflow'); const used = host.used.get(page) ?? new Set<number>(); if (used.has(index) || index !== used.size || !w.steps[index])
    throw Error('Unreviewed or replayed fixture action'); used.add(index); host.used.set(page, used); const step = w.steps[index]; await resolveLocator(page, step.locator).click({ timeout: 1500 }); }
export async function verifyReviewedQAExpectations(page: Page, checks: unknown) { const host = hosts.get(page.context()); if (!host)
    throw Error('Fixture execution host required'); const result = await verifyQA(page, checks); host.history.db.prepare('CREATE TABLE IF NOT EXISTS integrated_checks(run TEXT,test TEXT,payload TEXT)').run(); host.history.db.prepare('INSERT INTO integrated_checks VALUES(?,?,?)').run(host.config.runId, new URL(page.url()).pathname, JSON.stringify(result)); return result; }
