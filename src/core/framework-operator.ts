import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { relative, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import { installedBrowser } from '../execution/local-browser.js';
import { ingestSpec } from '../specs/ingest.js';
import { fingerprint } from '../execution/browser-policy.js';
async function source(path: string, max = 8388608) { const root = await realpath('.'), file = await realpath(path), rel = relative(root, file); if (!rel || rel.startsWith('..') || isAbsolute(rel) || (await stat(file)).size > max)
    throw Error('Bounded workspace artifact required'); return file; }
export async function frameworkDoctor() { const versions = await Promise.all(['@playwright/test', '@playwright/mcp', 'reporting-labs'].map(async (name) => ({ name, version: JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version }))); let browser: ReturnType<typeof installedBrowser> | undefined; try {
    browser = installedBrowser();
}
catch { /* Missing local installation is a readiness result, not a download request. */ } const db = new DatabaseSync(':memory:'); db.close(); return { ready: Number(process.versions.node.split('.')[0]) >= 22 && !!browser, node: process.version, sqlite: 'available', browser: browser ?? { status: 'install-local-Chrome-or-Edge' }, packages: versions, configured: { salesforceJWT: ['SF_INSTANCE_URL', 'SF_CLIENT_ID', 'SF_USERNAME', 'SF_PRIVATE_KEY_PATH'].every(k => !!process.env[k]), chat: process.env.SFQA_MODEL_PROVIDER === 'gemini', embeddings: process.env.SFQA_EMBEDDING_PROVIDER === 'gemini', embeddingModel: process.env.SFQA_EMBEDDING_MODEL === 'gemini-embedding-001' }, configurationIsNotConnectivityProof: true, liveRequests: 0, headlessOnly: true }; }
export async function importFrameworkRequirement(path: string) { const file = await source(path, 2097152), spec = await ingestSpec(file), root = resolve('.state', 'requirements'); await mkdir(root, { recursive: true }); const output = join(root, `${fingerprint(spec)}.json`); await writeFile(output, JSON.stringify(spec, null, 2)); return { output, criteria: spec.acceptanceCriteria.length, missingExpected: spec.acceptanceCriteria.filter(c => !c.expectedText).map(c => c.id), requiresNamedSourceAndWorkflowReview: true, executionAuthorized: false, externalRequests: 0 }; }
export async function readFrameworkManifest(path?: string) { if (!path) {
    const pointer = JSON.parse(await readFile('.state/framework-latest.json', 'utf8'));
    path = z.object({ manifest: z.string() }).strict().parse(pointer).manifest;
} const manifest = z.object({ version: z.literal(1), id: z.string(), root: z.string(), historyPath: z.string(), validation: z.string().startsWith('offline-'), runs: z.array(z.object({ phase: z.string(), runId: z.string(), lifecycle: z.object({ status: z.string(), created: z.number(), cleaned: z.number() }).passthrough(), execution: z.object({ results: z.array(z.object({ testId: z.string(), status: z.string() }).passthrough()), reportingLabs: z.object({ status: z.literal('generated'), html: z.string(), json: z.string() }).passthrough() }).passthrough(), approvals: z.unknown().optional() }).passthrough()), safety: z.object({ activeOwned: z.number(), foreignUnchanged: z.boolean() }).passthrough(), learning: z.unknown().optional() }).passthrough().parse(JSON.parse(await readFile(await source(path), 'utf8'))); await source(manifest.historyPath); return manifest; }
export async function inspectFramework(path?: string, mode = 'status') {
    const m = await readFrameworkManifest(path);
    if (mode === 'history') {
        const db = new DatabaseSync(await source(m.historyPath), { readOnly: true });
        try {
            return { historyPath: m.historyPath, results: db.prepare('SELECT run,test,payload FROM results ORDER BY rowid').all().map(r => { const p = JSON.parse(String(r.payload)); return { run: r.run, test: r.test, status: p.status, durationMs: p.durationMs }; }), lessons: db.prepare('SELECT id,payload FROM lessons ORDER BY id').all().map(r => { const p = JSON.parse(String(r.payload)); return { id: r.id, testId: p.testId, reviewer: p.reviewer, regressionRun: p.regressionRun }; }), validation: m.validation, liveRequests: 0 };
        }
        finally {
            db.close();
        }
    }
    return { manifest: resolve(m.root, 'manifest.json'), html: resolve(m.root, 'index.html'), validation: m.validation, runs: m.runs.map(r => ({ phase: r.phase, runId: r.runId, lifecycle: r.lifecycle, tests: r.execution.results, reportingLabs: r.execution.reportingLabs, screenshots: (r as any).screenshots ?? [], ...(mode === 'approvals' ? { approvals: r.approvals ?? 'See phase guard-initial.review.json and checkpoint review' } : {}) })), safety: m.safety, learning: m.learning, liveExecutionAuthorized: false, liveRequests: 0 };
}
