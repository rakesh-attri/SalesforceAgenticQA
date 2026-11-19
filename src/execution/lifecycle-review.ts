import { z } from 'zod';
import type { History } from '../core/history.js';
import { OrgSnapshotSchema } from '../core/types.js';
import { SpecSchema } from '../specs/ingest.js';
import { EnvironmentPolicySchema, environmentHash } from './environment.js';
import { proposeDedicatedPlan, dedicatedPlanHash } from '../salesforce/dedicated-qa.js';
import { DedicatedExecutionSchema } from './dedicated-pipeline.js';
import { dedicatedUiHash, DedicatedUiPlanSchema } from './dedicated-browser.js';
import { BrowserReviewSchema, browserPlanHash, fingerprint, digest } from './browser-policy.js';
import { prepareDedicatedChromeReview } from './dedicated-chrome-review.js';
import { prepareDedicatedChromeProfile, DedicatedChromeProfileSchema } from './dedicated-chrome-profile.js';
import { LightningViewSchema, lightningViewHash } from './lightning-view.js';
import { lightningEngineHash } from './lightning-engine.js';
import { acquireRenderedWorkflowEvidence } from '../agents/workflow-evidence.js';
import { generateTest, WorkflowSchema } from '../agents/workflows.js';
import { knowledgeFingerprint } from '../knowledge/snapshots.js';

const ObjectName = z.enum(['Account', 'Contact']);
const readinessRequirements = ['fresh-exact-api-native-org-user-active-user-app-build', 'fresh-schema-createable-fields-and-automation-review', 'fresh-account-and-contact-visible-readiness', 'fresh-state-bound-session-receipt', 'current-persona-permissions-and-cleanup-cascade-visibility', 'unchanged-utc-quota-and-no-active-uncertain-run', 'separate-exact-business-mutation-and-native-risk-approvals', 'bind-fresh-readiness-hash-and-re-review-all-changed-hashes'];
const lifecycleOperations = ['create-Account', 'verify-owned-Account', 'create-linked-Contact', 'verify-owned-Contact-and-AccountId', 'observe-owned-selectors', 'execute-two-generated-read-only-tests', 'verify-owned-post-browser', 'delete-owned-Contact', 'delete-owned-Account', 'independently-confirm-absence'];
export type LifecycleSource = { review: unknown; view: unknown; report: unknown; journal: History };
const Input = z.object({ runId: z.string().regex(/^[A-Za-z0-9_-]{1,50}$/), operator: z.string().trim().min(1).refine(s => s !== 'REVIEW_REQUIRED'), stateHash: z.string().regex(/^[a-f0-9]{64}$/), policy: EnvironmentPolicySchema, org: OrgSnapshotSchema, spec: SpecSchema, guardModule: z.string().min(1), guardConfig: z.string().min(1) }).strict();
export type LifecycleReviewInput = z.input<typeof Input>;

function sourceEvidence(sources: LifecycleSource[], input: z.infer<typeof Input>) {
  if (sources.length !== 2) throw Error('Exactly two journal-backed object views required');
  const result = sources.map(source => {
    const review = BrowserReviewSchema.parse(source.review), view = LightningViewSchema.parse(source.view);
    const evidence = acquireRenderedWorkflowEvidence(source.journal, review, source.report, view);
    if (review.plan.ownedDataPlanHash || view.reviewer !== input.operator || review.approval.operator !== input.operator || review.plan.orgId !== input.policy.dedicatedQa?.orgId || review.plan.userId !== input.policy.dedicatedQa.userId || review.plan.persona !== input.policy.dedicatedQa.persona || review.plan.parentPolicyHash !== environmentHash(input.policy) || review.plan.sourceVersion !== input.spec.version || view.sourceVersion !== input.spec.version || evidence.org !== input.org.orgIdentityHash || evidence.permission !== input.policy.dedicatedQa.persona) throw Error('Historical source has a different exact identity/specification scope');
    if (!['Related', 'Details'].every(name => view.content.some(c => c.by === 'role' && c.value === 'tab' && c.name === name)) || !JSON.stringify(view.recordName).includes('{{record-name}}')) throw Error('Source-backed exact name and independent Related/Details required');
    return { object: ObjectName.parse(view.object), review, view, evidence };
  });
  if (new Set(result.map(s => s.object)).size !== 2) throw Error('One Account and one Contact source required');
  const [first, second] = result;
  if (first.review.plan.buildHash !== second.review.plan.buildHash || first.review.plan.appHash !== second.review.plan.appHash || first.review.plan.selectedAppIdHash !== second.review.plan.selectedAppIdHash || fingerprint(first.review.plan.origins) !== fingerprint(second.review.plan.origins)) throw Error('Historical application/build/origin sources disagree');
  return result;
}

/** Preparation only. It never opens a data run, renews policy, copies readiness
 * authority, contacts Salesforce, chooses a preferred profile or activates a grant. */
export function prepareLifecycleReview(raw: LifecycleReviewInput, sources: LifecycleSource[], ownership: History, now = Date.now()) {
  const input = Input.parse(raw), policy = input.policy, qa = policy.dedicatedQa;
  if (policy.mode !== 'DEDICATED_QA_ORG' || !qa || policy.approval.operator !== input.operator || policy.approval.definitionHash !== environmentHash(policy) || !policy.allowedOrgIds.includes(qa.orgId) || !policy.personas.some(p => p.userId === qa.userId && p.name === qa.persona) || input.org.source !== 'salesforce-api' || input.org.orgIdentityHash !== digest(qa.orgId) || qa.automationReview.sourceVersion !== knowledgeFingerprint(input.org)) throw Error('Exact dedicated policy and saved automation/source binding required');
  if (ownership.db.prepare("SELECT name FROM sqlite_master WHERE name='dedicated_runs'").get() && ownership.db.prepare('SELECT run FROM dedicated_runs WHERE run=?').get(input.runId)) throw Error('Previously reserved lifecycle cannot be prepared again');
  if (ownership.db.prepare("SELECT name FROM sqlite_master WHERE name='pipeline_runs'").get() && ownership.db.prepare('SELECT run FROM pipeline_runs WHERE run=?').get(input.runId)) throw Error('Previously attempted pipeline cannot be prepared again');
  const observed = sourceEvidence(sources, input), account = observed.find(s => s.object === 'Account')!;
  const expiry = new Date(now + 3540000).toISOString();
  const identity = { Id: qa.orgId, userId: qa.userId, IsSandbox: false };
  const plan = proposeDedicatedPlan(input.org, identity, policy, input.runId), factoryHash = dedicatedPlanHash(plan);
  const prepared = prepareDedicatedChromeReview(account.review, { runId: input.runId, stateHash: input.stateHash, view: account.view });
  const { liveReadinessProofHash: discardedHistoricalAuthority, ...base } = prepared.review.plan;
  const browser = BrowserReviewSchema.parse({ plan: { ...base, runId: input.runId, objects: ['Account', 'Contact'], records: [], ownedDataPlanHash: factoryHash, referenceDisplayFields: { Contact: 'Name' }, budgets: { maxMs: 60000, requests: 200, resourceBytes: 67108864, maxResourceBytes: 8388608, actions: 0, sessions: 4 }, agentWorkflowHashes: [], transports: ['validated-cache'] }, approval: { operator: 'REVIEW_REQUIRED', hash: digest('pending-review-hash'), expiresAt: expiry }, initializationApprovals: [] });
  // The mode/hash-bound profile is a separate inactive proposal. No preference
  // file is modified, and no historical readiness hash is placed in the plan.
  const profile = prepareDedicatedChromeProfile(browser); profile.approval.expiresAt = expiry;
  browser.plan.profileHash = profile.approval.hash;
  browser.approval.hash = browserPlanHash(browser.plan);
  const origin = browser.plan.origins.find(o => new URL(o).hostname.endsWith('.lightning.force.com'));
  if (!origin || input.spec.acceptanceCriteria.length !== 2 || input.spec.requiresReview || input.spec.warnings.length) throw Error('Reviewed two-criterion Salesforce specification required');
  const workflows = observed.map(source => {
    const token = source.object === 'Account' ? '{{synthetic:Account.Name}}' : '{{synthetic:Contact.LastName}}';
    const criteria = input.spec.acceptanceCriteria.filter(c => c.expectedText === token);
    if (criteria.length !== 1) throw Error('Original exact synthetic assertion must be preserved');
    const locator = JSON.parse(JSON.stringify(source.view.recordName).replaceAll('{{record-name}}', token));
    return WorkflowSchema.parse({ id: 'dedicated-' + source.object.toLowerCase() + '-view', criterion: criteria[0].id, source: 'host-rendered-view:' + source.evidence.version, reviewer: input.operator, origin, path: `/lightning/r/${source.object}/{{record:${source.object}}}/view`, steps: [], assertion: { locator, text: token }, contentAssertions: source.view.content.map(locator => ({ locator, source: 'host-rendered-view:' + source.evidence.version, expected: 'visible' })), apiAssertions: [] });
  });
  const uiPlan = DedicatedUiPlanSchema.parse({ orgId: qa.orgId, userId: qa.userId, runId: input.runId, policyHash: environmentHash(policy), dataPlanHash: factoryHash, sourceVersion: input.spec.version, sessionReceipt: `.auth/${input.runId}-receipt.json`, maxActions: 0, maxMs: 60000, contactDisplay: 'name-equals-synthetic-lastname', selectorSessions: 'per-workflow', publishVerifiedExecutionLesson: false, browserSessionPolicyHash: browser.approval.hash, workflows });
  const execution = DedicatedExecutionSchema.parse({ spec: input.spec, org: input.org, permission: qa.persona, data: { plan, approval: { operator: 'REVIEW_REQUIRED', planHash: factoryHash, expiresAt: expiry } }, ui: { plan: uiPlan, approval: { operator: 'REVIEW_REQUIRED', hash: dedicatedUiHash(uiPlan), expiresAt: expiry } } });
  const policyDraft = EnvironmentPolicySchema.parse({ ...policy, approval: { operator: 'REVIEW_REQUIRED', definitionHash: environmentHash(policy), expiresAt: expiry } });
  const proposals = workflows.map(w => ({ id: w.id, code: generateTest(w, [origin], { module: input.guardModule, config: input.guardConfig, ownsNetworkBoundary: true, ...(browser.plan.visualDebug ? { visualDebug: true as const } : {}) }) }));
  const provenance = observed.map(s => ({ object: s.object, evidenceHash: fingerprint(s.evidence), sourceVersion: s.evidence.version, viewHash: lightningViewHash(s.view), historicalBrowserHash: browserPlanHash(s.review.plan), validation: s.evidence.validation, runtimeAuthority: false as const }));
  const manifest = { version: 1, kind: 'inactive-dedicated-lifecycle-review', runId: input.runId, operator: input.operator, preparedAt: new Date(now).toISOString(), originalDraftExpiry: expiry, status: 'INACTIVE', executionStatus: 'BLOCKED', activated: false, executionAuthorized: false, requirements: readinessRequirements, readinessAuthorityCopied: false, objects: ['Account', 'Contact'], operations: lifecycleOperations, approvalPlanes: ['business-factory-and-owned-cleanup', 'browser-native-effects-and-user-access', 'exact-final-source-state-and-run'], nativeRisk: profile.plan.risk, browserSessions: 4, browserSessionMs: 60000, browserRequestsPerSession: 200, accountedResourcesPerSession: 67108864, visualPerContext: browser.plan.visualDebug ?? null, runtimeIds: 'only-create-response-ids-verified-and-journaled-for-this-run', contactTraversal: false, uiActions: 0, externalUploads: false, generatedTestsExecuted: 0, verifiedLessonsPublished: 0, hashes: { policy: environmentHash(policyDraft), factory: factoryHash, ui: execution.ui.approval.hash, browser: browser.approval.hash, profile: profile.approval.hash, execution: fingerprint(execution), proposals: proposals.map(p => ({ id: p.id, hash: digest(p.code) })), provenance: fingerprint(provenance) } };
  manifest.requirements = [...manifest.requirements];
  manifest.operations = [...manifest.operations];
  return { manifest, policy: policyDraft, execution, browser, profile, proposals, provenance };
}
export type LifecycleReview = ReturnType<typeof prepareLifecycleReview>;

/** Independent checks at the saved package boundary: reject substitutions even
 * if an editor recomputed the outer manifest hash. No authorization is issued. */
export function auditLifecycleReview(bundle: LifecycleReview, raw: LifecycleReviewInput, sources: LifecycleSource[], ownership: History) {
  const input = Input.parse(raw), e = DedicatedExecutionSchema.parse(bundle.execution), b = BrowserReviewSchema.parse(bundle.browser);
  DedicatedChromeProfileSchema.parse(bundle.profile);EnvironmentPolicySchema.parse(bundle.policy);
  if (fingerprint(Object.keys(bundle).sort()) !== fingerprint(['manifest','policy','execution','browser','profile','proposals','provenance'].sort()) || bundle.manifest.readinessAuthorityCopied !== false || bundle.manifest.externalUploads !== false || bundle.manifest.uiActions !== 0 || bundle.manifest.contactTraversal !== false || bundle.manifest.browserSessions !== 4 || bundle.manifest.browserSessionMs !== 60000 || bundle.manifest.browserRequestsPerSession !== 200 || bundle.manifest.accountedResourcesPerSession !== 67108864 || bundle.manifest.generatedTestsExecuted !== 0 || bundle.manifest.verifiedLessonsPublished !== 0 || Date.parse(bundle.manifest.preparedAt) > Date.now() || b.plan.contracts.length || b.initializationApprovals.length || b.plan.budgets.resourceBytes !== 67108864 || b.plan.budgets.maxResourceBytes !== 8388608 || fingerprint(b.plan.transports) !== fingerprint(['validated-cache'])) throw Error('Unsupported review authority, operation, budget or contract');
  const observed = sourceEvidence(sources, input), expected = proposeDedicatedPlan(input.org, { Id: input.policy.dedicatedQa!.orgId, userId: input.policy.dedicatedQa!.userId, IsSandbox: false }, input.policy, input.runId);
  if (fingerprint(bundle.manifest.operations) !== fingerprint(lifecycleOperations) || fingerprint(bundle.manifest.requirements) !== fingerprint(readinessRequirements) || fingerprint(bundle.manifest.objects) !== fingerprint(['Account','Contact']) || bundle.manifest.nativeRisk !== bundle.profile.plan.risk || fingerprint(bundle.manifest.visualPerContext) !== fingerprint(b.plan.visualDebug ?? null)) throw Error('Unsupported operation, omitted prerequisite or visual scope');
  const account = observed.find(s => s.object === 'Account')!.review.plan;
  if (b.plan.orgId !== expected.orgId || b.plan.userId !== expected.userId || b.plan.runId !== input.runId || b.plan.parentPolicyHash !== expected.policyHash || b.plan.sourceVersion !== input.spec.version || b.plan.persona !== input.policy.dedicatedQa!.persona || b.plan.executionProfile !== 'DEDICATED_QA_NORMAL_CHROME' || fingerprint(b.plan.objects) !== fingerprint(['Account','Contact']) || fingerprint(b.plan.origins) !== fingerprint(account.origins) || b.plan.buildHash !== account.buildHash || b.plan.appHash !== account.appHash || b.plan.selectedAppIdHash !== account.selectedAppIdHash || b.plan.renderContractHash !== account.renderContractHash || fingerprint(b.plan.visualDebug ?? null) !== fingerprint(account.visualDebug ?? null) || e.ui.plan.orgId !== expected.orgId || e.ui.plan.userId !== expected.userId || e.ui.plan.policyHash !== expected.policyHash || e.ui.plan.runId !== input.runId || e.ui.plan.sourceVersion !== input.spec.version || e.data.approval.planHash !== dedicatedPlanHash(expected) || e.permission !== input.policy.dedicatedQa!.persona || environmentHash(bundle.policy) !== environmentHash(input.policy) || bundle.manifest.runId !== input.runId || bundle.manifest.status !== 'INACTIVE' || bundle.manifest.executionStatus !== 'BLOCKED' || Date.parse(bundle.manifest.originalDraftExpiry) - Date.parse(bundle.manifest.preparedAt) !== 3540000) throw Error('Exact org/user/source/budget/expiry review scope changed');
  if (input.policy.mode !== 'DEDICATED_QA_ORG' || e.data.plan.runId !== input.runId || fingerprint(e.spec) !== fingerprint(input.spec) || fingerprint(e.org) !== fingerprint(input.org) || dedicatedPlanHash(e.data.plan) !== dedicatedPlanHash(expected) || b.plan.ownedDataPlanHash !== dedicatedPlanHash(expected) || b.plan.sessionStateHash !== input.stateHash || b.plan.liveReadinessProofHash || b.plan.records.length || b.plan.agentWorkflowHashes.length || b.plan.budgets.actions || b.plan.budgets.sessions !== 4 || b.plan.budgets.requests !== 200 || b.plan.budgets.maxMs !== 60000 || b.plan.engineProfileHash !== lightningEngineHash() || b.approval.hash !== browserPlanHash(b.plan) || e.ui.plan.browserSessionPolicyHash !== b.approval.hash || e.ui.plan.dataPlanHash !== dedicatedPlanHash(expected) || e.ui.approval.hash !== dedicatedUiHash(e.ui.plan) || e.ui.plan.contactDisplay !== 'name-equals-synthetic-lastname' || e.ui.plan.selectorSessions !== 'per-workflow' || e.ui.plan.publishVerifiedExecutionLesson || e.ui.plan.maxActions || bundle.manifest.activated || bundle.manifest.executionAuthorized) throw Error('Inactive lifecycle source/factory/browser/UI binding invalid');
  for (const approval of [e.data.approval, e.ui.approval, b.approval, bundle.profile.approval, bundle.policy.approval]) if (approval.operator !== 'REVIEW_REQUIRED' || approval.expiresAt !== bundle.manifest.originalDraftExpiry) throw Error('Preparation must not acquire or extend named approvals');
  const workflowIds = new Set<string>();
  for (const source of observed) {
    const path = `/lightning/r/${source.object}/{{record:${source.object}}}/view`, w = e.ui.plan.workflows.find(w => w.path === path);
    if (w && (w.reviewer !== input.operator || w.contentAssertions?.some(c => c.source !== 'host-rendered-view:' + source.evidence.version))) throw Error('Original reviewer or content evidence citation changed');
    const token = source.object === 'Account' ? '{{synthetic:Account.Name}}' : '{{synthetic:Contact.LastName}}';
    const locator = JSON.parse(JSON.stringify(source.view.recordName).replaceAll('{{record-name}}', token));
    if (!w || workflowIds.has(w.id) || w.steps.length || w.apiAssertions.length || w.origin !== source.review.plan.origins.find(o => new URL(o).hostname.endsWith('.lightning.force.com')) || w.assertion.text !== token || fingerprint(w.assertion.locator) !== fingerprint(locator) || fingerprint(w.contentAssertions?.map(c => c.locator)) !== fingerprint(source.view.content) || w.source !== 'host-rendered-view:' + source.evidence.version || !input.spec.acceptanceCriteria.some(c => c.id === w.criterion && c.expectedText === token)) throw Error('Original source-backed assertions, relationship scope or zero-action boundary changed');
    workflowIds.add(w.id);
    const proposal = bundle.proposals.find(p => p.id === w.id), code = generateTest(w, [w.origin], { module: input.guardModule, config: input.guardConfig, ownsNetworkBoundary: true, ...(b.plan.visualDebug ? { visualDebug: true as const } : {}) });
    if (!proposal || proposal.code !== code) throw Error('Saved TypeScript proposal differs from original reviewed workflow');
  }
  const hashes = { policy: environmentHash(bundle.policy), factory: dedicatedPlanHash(e.data.plan), ui: e.ui.approval.hash, browser: b.approval.hash, profile: fingerprint(bundle.profile.plan), execution: fingerprint(e), proposals: bundle.proposals.map(p => ({ id: p.id, hash: digest(p.code) })), provenance: fingerprint(bundle.provenance) };
  const provenance = observed.map(s => ({ object: s.object, evidenceHash: fingerprint(s.evidence), sourceVersion: s.evidence.version, viewHash: lightningViewHash(s.view), historicalBrowserHash: browserPlanHash(s.review.plan), validation: s.evidence.validation, runtimeAuthority: false }));
  if (fingerprint(bundle.provenance) !== fingerprint(provenance)) throw Error('Original journal provenance changed');
  if (e.ui.plan.workflows.length !== 2 || bundle.proposals.length !== 2 || fingerprint(hashes) !== fingerprint(bundle.manifest.hashes) || bundle.profile.approval.hash !== hashes.profile || b.plan.profileHash !== hashes.profile || fingerprint(bundle.profile.plan) !== fingerprint(prepareDedicatedChromeProfile(b).plan)) throw Error('Consolidated review manifest/profile integrity failed');
  const table = (name: string) => !!ownership.db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(name);
  const active = table('dedicated_records') ? Number(ownership.db.prepare("SELECT COUNT(*) AS n FROM dedicated_records WHERE org=? AND status<>'deleted'").get(e.data.plan.orgId)?.n ?? 0) : null;
  const uncertain = table('dedicated_mutations') ? Number(ownership.db.prepare("SELECT COUNT(*) AS n FROM dedicated_mutations WHERE org=? AND status='pending'").get(e.data.plan.orgId)?.n ?? 0) : null;
  const dayUTC = new Date().toISOString().slice(0,10), runsToday = table('dedicated_runs') ? Number(ownership.db.prepare('SELECT COUNT(*) AS n FROM dedicated_runs WHERE org=? AND started>=?').get(e.data.plan.orgId,Date.parse(dayUTC+'T00:00:00Z'))?.n ?? 0) : null;
  if (table('dedicated_runs') && ownership.db.prepare('SELECT run FROM dedicated_runs WHERE run=?').get(input.runId)) throw Error('Review run was already reserved');
  return { status: 'PASS' as const, preparation: 'independently-checked', execution: 'BLOCKED' as const, reasons: bundle.manifest.requirements, activeOwnedRecords: active, uncertainEffects: uncertain, localQuota: { dayUTC, runsToday, maxRunsPerDay: input.policy.dedicatedQa!.maxRunsPerDay, remaining: runsToday === null ? null : Math.max(0,input.policy.dedicatedQa!.maxRunsPerDay-runsToday), reserved: false, distributedQuotaEstablished: false }, runtimeReadinessEstablished: false, permissionConclusion: 'saved-declarations-only-current-effective-access-unverified', externalCalls: 0, activated: false, reviewHash: fingerprint(bundle.manifest) };
}
