import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import type { History } from '../core/history.js';
import { fingerprint, digest } from './browser-policy.js';
import { readExplorationManifest, verifyExplorationImage } from '../agents/exploration-investigation.js';
import { QAScopeSchema, QARefSchema, QAContractStore, qaContext, type QAContext } from '../agents/qa-oracles.js';
import { decodeScreenshotPNG, compareScreenshotPixels } from './visual-pixels.js';
const Hash = z.string().regex(/^[a-f0-9]{64}$/), Rect = z.object({ id: z.string().min(1), x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export const VisualFrameSchema = z.object({ manifest: z.string().min(1), file: z.string().min(1), sha256: Hash, manifestHash: Hash, runId: z.string(), sessionId: z.string().uuid(), policyHash: Hash, validation: z.enum(['offline-mocked-salesforce', 'live-salesforce']), scope: QAScopeSchema, engineHash: Hash, renderHash: Hash, maskingHash: Hash, width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export const VisualBaselineSchema = z.object({ version: Hash, id: z.string().regex(/^[A-Za-z0-9_-]+$/), criterionId: z.string(), expectedText: z.string().min(1), scope: QAScopeSchema, frame: VisualFrameSchema, evidence: z.array(QARefSchema).min(1).max(20), critical: z.array(Rect).min(1).max(20), dynamic: z.array(Rect).max(10), channelTolerance: z.number().int().min(0).max(32), maxChangedRatio: z.number().min(0).max(0.05), requiredAccessibility: z.array(z.object({ id: z.string(), role: z.enum(['button', 'heading', 'tab', 'textbox', 'link', 'status', 'alert']), namePresent: z.literal(true) }).strict()).min(1).max(20), maskingAcknowledged: z.literal(true) }).strict();
export const baselineVersion = (raw: unknown) => { const { version, ...b } = VisualBaselineSchema.parse(raw); return fingerprint(b); };
export async function verifyVisualFrame(raw: unknown) { const f = VisualFrameSchema.parse(raw), binding = { runId: f.runId, sessionId: f.sessionId, policyHash: f.policyHash, validation: f.validation }, { manifest } = await readExplorationManifest(f.manifest, binding), entry = manifest.entries.find(e => e.file === f.file && e.sha256 === f.sha256); if (fingerprint({ binding, entry }) !== f.manifestHash)
    throw Error('Visual manifest entry changed'); const image = await verifyExplorationImage(f, binding), bytes = await readFile(image.path); if (digest(bytes) !== f.sha256)
    throw Error('Visual image changed'); const decoded = decodeScreenshotPNG(bytes); if (decoded.width !== f.width || decoded.height !== f.height)
    throw Error('Visual viewport declaration differs'); return { frame: f, image, decoded }; }
export async function validateVisualBaseline(raw: unknown, context: QAContext, h: History) { const b = VisualBaselineSchema.parse(raw), { spec, sources } = qaContext(context, b.scope, h), criterion = spec.acceptanceCriteria.find(c => c.id === b.criterionId); if (b.version !== baselineVersion(b) || fingerprint(b.scope) !== fingerprint(b.frame.scope) || criterion?.expectedText !== b.expectedText || criterion.kind !== 'visual')
    throw Error('Visual baseline source/requirement/scope differs'); const claims = b.evidence.map(ref => { const source = sources.find(s => s.id === ref.source && s.version === ref.version); if (!source?.claims[ref.claim])
    throw Error('Baseline source missing'); return { source, claim: source.claims[ref.claim] }; }); if (!claims.some(c => c.source.review && c.claim.kind === 'outcome' && c.claim.text === b.expectedText))
    throw Error('Independently reviewed visual expectation required'); for (const a of b.requiredAccessibility)
    if (!claims.some(c => c.source.review && c.claim.kind === 'locator' && c.claim.text === JSON.stringify({ by: 'testId', value: a.id })))
        throw Error('Reviewed accessibility locator evidence required'); const checked = await verifyVisualFrame(b.frame); compareScreenshotPixels(checked.decoded, checked.decoded, b); return b; }
export async function compareVisualBaseline(h: History, version: string, candidate: unknown, accessibility: Array<{
    id: string;
    role: string;
    namePresent: boolean;
}>, context: QAContext) {
    const store = new QAContractStore(h), saved = store.get('visual', version), b = await validateVisualBaseline(saved.contract, context, h), left = await verifyVisualFrame(b.frame), right = await verifyVisualFrame(candidate), c = right.frame;
    if (fingerprint(c.scope) !== fingerprint(b.scope) || c.engineHash !== b.frame.engineHash || c.renderHash !== b.frame.renderHash || c.maskingHash !== b.frame.maskingHash || c.validation !== b.frame.validation)
        throw Error('Visual comparison org/persona/source/engine/render/masking differs');
    const pixels = compareScreenshotPixels(left.decoded, right.decoded, b), a11y = b.requiredAccessibility.map(expected => { const found = accessibility.filter(a => a.id === expected.id); return { id: expected.id, status: found.length !== 1 ? 'unknown' : found[0].role === expected.role && found[0].namePresent ? 'matches' : 'potential-accessibility-regression' }; });
    return store.observe({ kind: 'visual-comparison', baselineVersion: version, baselineImage: b.frame.sha256, candidateImage: c.sha256, scope: b.scope, validation: c.validation, pixels, accessibility: a11y, status: pixels.status === 'incompatible' ? 'incompatible' : a11y.some(a => a.status !== 'matches') || pixels.status === 'review-required' ? 'review-required' : 'within-reviewed-tolerance', confirmedDefect: false, baselineUpdated: false, localOnly: true, learningPublished: false });
}
