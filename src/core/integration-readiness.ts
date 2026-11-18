import { z } from 'zod';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { frameworkDoctor } from './framework-operator.js';
import { salesforceJWTConfiguration } from '../salesforce/jwt.js';
import { configuredChat, configuredEmbeddings } from '../ai/providers.js';
import { readPrivateSessionState } from '../integrations/session-gate.js';
import { readLocalExplorationJson, localDatabase } from '../agents/live-exploration-cli.js';
import { OrgSnapshotSchema } from './types.js';
import { ComponentGraphSchema } from '../agents/component-graph.js';
import { knowledgeFingerprint } from '../knowledge/snapshots.js';
import { fingerprint } from '../execution/browser-policy.js';
import { History } from './history.js';
import { validateLiveExploration, liveExplorationHash, authorizeLiveExploration, proposedLiveApproval } from '../agents/live-exploration.js';
import { ReviewBundleSchema, authorizeAI, verifyReviewedBundleSource } from '../knowledge/reviewed.js';
const Path = z.string().min(1);
export const IntegrationReadinessInput = z.object({ org: Path, graph: Path, statePath: Path, observation: z.object({ history: Path, definition: Path, approval: Path, parent: Path }).strict().optional(), ai: z.object({ bundle: Path, approval: Path }).strict().optional() }).strict();
type Check = {
    id: string;
    status: 'PASS' | 'FAIL' | 'BLOCKED';
    evidenceClass: 'local-checked' | 'cached-evidence' | 'authorization' | 'not-executed';
    reason: string;
    next: string;
};
export async function integrationReadiness(raw: unknown, env: NodeJS.ProcessEnv = process.env) {
    const input = IntegrationReadinessInput.parse(raw), checks: Check[] = [], add = (id: string, status: Check['status'], evidenceClass: Check['evidenceClass'], reason: string, next: string) => checks.push({ id, status, evidenceClass, reason, next });
    try {
        const doctor = await frameworkDoctor();
        add('local-tools', doctor.ready ? 'PASS' : 'BLOCKED', 'local-checked', 'Local Node/SQLite/browser/package check only; configured credentials are not live proof.', 'Use npm run doctor; install a compatible local Chrome or Edge if missing.');
    }
    catch {
        add('local-tools', 'FAIL', 'local-checked', 'Local dependency contract failed; private details withheld.', 'Run npm ci and inspect supported local package/browser versions.');
    }
    try {
        const config = salesforceJWTConfiguration(env), url = new URL(env.SF_INSTANCE_URL ?? '');
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port || !url.hostname.endsWith('.my.salesforce.com'))
            throw Error('Instance host');
        const info = await stat(config.keyPath);
        if (!info.isFile() || info.size > 65536)
            throw Error('Bounded key');
        const key = createPrivateKey(await readFile(config.keyPath));
        if (key.asymmetricKeyType !== 'rsa')
            throw Error('RSA key');
        add('salesforce-jwt-config', 'PASS', 'local-checked', 'Approved-host syntax, required settings and local RSA key parse succeeded. App approval/certificate match/authentication are not verified.', 'Obtain fresh exact read-only authorization before OAuth or API calls.');
    }
    catch {
        add('salesforce-jwt-config', 'BLOCKED', 'local-checked', 'Required JWT/HTTPS configuration or local RSA key could not be validated. No values or signing material retained.', 'Review .env.example and the approved key path; never paste credentials.');
    }
    for (const role of ['chat', 'embeddings'] as const) {
        try {
            const provider = role === 'chat' ? configuredChat(env) : configuredEmbeddings(env);
            if (!provider)
                throw Error('Missing provider');
            if (role === 'chat' && env.SFQA_MODEL_PROVIDER !== 'gemini' || role === 'embeddings' && (env.SFQA_EMBEDDING_PROVIDER !== 'gemini' || (env.SFQA_EMBEDDING_MODEL || env.GEMINI_EMBEDDING_MODEL) !== 'gemini-embedding-001'))
                throw Error('Expected Gemini model/provider');
            add('gemini-' + role + '-config', 'PASS', 'local-checked', 'Existing provider-specific configuration validation succeeded without a request.', 'Separate exact sanitized-content/destination approval is required for live validation.');
        }
        catch {
            add('gemini-' + role + '-config', 'BLOCKED', 'local-checked', 'Provider configuration missing, conflicting or invalid; credential/model values withheld.', 'Use existing Gemini settings and gemini-embedding-001; resolve aliases/timeouts without weakening checks.');
        }
    }
    try {
        const org = OrgSnapshotSchema.parse(await readLocalExplorationJson(input.org)), g = ComponentGraphSchema.parse(await readLocalExplorationJson(input.graph));
        if (org.source !== 'salesforce-api' || g.org !== (org.orgIdentityHash ?? org.orgAlias) || g.knowledgeVersion !== knowledgeFingerprint(org) || g.version !== fingerprint({ org: g.org, knowledgeVersion: g.knowledgeVersion, nodes: g.nodes, edges: g.edges, unknowns: g.unknowns }))
            throw Error('Source mismatch');
        add('saved-metadata-graph', 'PASS', 'cached-evidence', `Saved source fingerprints agree; metadata captured ${org.observedAt}. This is not current org verification.`, 'Fresh authorized identity/build checks must pass; request separately scoped metadata refresh if current schema/automation cannot be established.');
    }
    catch {
        add('saved-metadata-graph', 'BLOCKED', 'cached-evidence', 'Saved source/graph evidence is absent, synthetic or does not match.', 'Reconcile actual source producers and versions; do not copy unrelated hashes.');
    }
    try {
        await readPrivateSessionState(input.statePath);
        add('browser-export', 'PASS', 'local-checked', 'Contained browser export is readable; cookies, contents and hashes withheld. File time does not prove identity or validity.', 'Confirm a fresh independently approved export; new binding/expiry/session authority is never inferred.');
    }
    catch {
        add('browser-export', 'BLOCKED', 'local-checked', 'Approved export missing or malformed; contents withheld.', 'Export a normal login under .auth for the exact dedicated QA user; never paste state contents.');
    }
    if (input.observation) {
        let h: History | undefined;
        try {
            h = new History(await localDatabase(input.observation.history));
            const d = validateLiveExploration(await readLocalExplorationJson(input.observation.definition), h), a = await readLocalExplorationJson(input.observation.approval), parent = await readLocalExplorationJson(input.observation.parent);
            const draft = a.operator === 'REVIEW_REQUIRED', hash = draft ? proposedLiveApproval(d, d.objective.reviewer).hash : liveExplorationHash(d);
            if (a.definitionHash !== hash)
                throw Error('Approval hash mismatch');
            if (draft)
                add('salesforce-observation-authorization', 'BLOCKED', 'authorization', 'Exact observation and source-lineage reviews are inactive; no live action is authorized.', 'Review the exact manifest/hash, native-background-effects risk, original expiry and all separate leaf/profile/API/source approvals.');
            else {
                authorizeLiveExploration(d, parent, a);
                add('salesforce-observation-authorization', 'PASS', 'authorization', 'Named exact unexpired local grants passed policy validation; no live proof was executed.', 'Runtime identity, active user, state, app/build, source and record-equality gates still must pass.');
            }
        }
        catch {
            add('salesforce-observation-authorization', 'BLOCKED', 'authorization', 'Draft/grant unavailable, stale, expired or inconsistent; no approval was applied.', 'Prepare/review a fresh exact no-create scope; never replay declined 002 or renew an old grant.');
        }
        finally {
            h?.close();
        }
    }
    else
        add('salesforce-observation-authorization', 'BLOCKED', 'authorization', 'No fresh exact observation package supplied.', 'Prepare a new inactive one-Account package using the existing exploration preparation service.');
    if (input.ai) {
        try {
            const bundle = ReviewBundleSchema.parse(await readLocalExplorationJson(input.ai.bundle)), approval = await readLocalExplorationJson(input.ai.approval);
            verifyReviewedBundleSource(bundle, await readLocalExplorationJson(input.org));
            authorizeAI(bundle, approval, 'gemini-chat');
            authorizeAI(bundle, approval, 'gemini-embeddings');
            add('gemini-content-authorization', 'PASS', 'authorization', 'Exact named current bundle/destination review passed; no external request made.', 'Use bounded local-only publish, one-role grounding and persistent retrieval; stop on quota, source drift or expired review.');
        }
        catch {
            add('gemini-content-authorization', 'BLOCKED', 'authorization', 'Minimal AI content review is inactive, missing or expired.', 'Independently review exact minimized fields/story and both destinations; no records, formulas, descriptions, permission rows or raw traces.');
        }
    }
    else
        add('gemini-content-authorization', 'BLOCKED', 'authorization', 'No fresh separately reviewed AI validation bundle supplied.', 'Prepare the existing filtered structural bundle with a synthetic story and independent Gemini destination review.');
    add('current-live-verification', 'BLOCKED', 'not-executed', 'No fresh Salesforce OAuth/API/browser, Gemini or Chroma validation was executed. Historical success is separate evidence.', 'Execute only after fresh exact authorization; retain genuine FAIL/BLOCKED outcomes and source-linked evidence.');
    add('future-write-lifecycle', 'BLOCKED', 'authorization', 'No new write-execution request. Declined lifecycle 012 stays inactive.', 'A future explicit request must separately review current automation, factory/UI/session/run quotas, owned cleanup, independent SOQL and reportingLabs.');
    return { version: 1, status: checks.some(c => c.status === 'FAIL') ? 'FAIL' as const : 'BLOCKED' as const, checkedAt: new Date().toISOString(), checks, scope002: 'declined-inactive', scope012: 'declined-inactive', salesforceRequests: 0, externalModelRequests: 0, credentialsRetained: false, permissionsGranted: 0 };
}
export async function runIntegrationReadiness(path: string) { const report = await integrationReadiness(await readLocalExplorationJson(path)), root = resolve('.state', 'integration-readiness'); await mkdir(root, { recursive: true }); const json = resolve(root, 'report.json'), html = resolve(root, 'report.html'), text = JSON.stringify(report, null, 2).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)); await writeFile(json, JSON.stringify(report, null, 2)); await writeFile(html, `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><title>Salesforce integration readiness</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Integration readiness: ${report.status}</h1><p>Local checks and saved sources only. Historical live proof, configured keys and named local grants do not prove current service health.</p><pre>${text}</pre></html>`); return { status: report.status, json, html, checks: report.checks, salesforceRequests: 0, externalModelRequests: 0 }; }
