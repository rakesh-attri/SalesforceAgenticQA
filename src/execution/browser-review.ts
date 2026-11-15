import { z } from 'zod';
import { EnvironmentPolicySchema, environmentHash } from './environment.js';
import { DedicatedStaticReviewSchema, StaticAssetSchema, staticPlanHash } from './dedicated-static.js';
import { BrowserPlanSchema, ResourceRuleSchema, browserPlanHash, InitializationContractSchema, NativeInitializationExceptionPlanSchema, fingerprint, type BrowserRecord, type BrowserPlan } from './browser-policy.js';
import { currentAppAction } from './browser-native-contracts.js';
import { digest } from './browser-policy.js';
import { BrowserRecordSchema } from './browser-policy.js';
export const BrowserReviewInputSchema = z.object({ runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), statePath: z.string().min(1), references: z.array(BrowserRecordSchema).min(1).max(2), staticSource: z.string().default('.state/dedicated-static-approval.json'), initializationSource: z.string().default('.state/initialization-33-contact-source-evidence/initialization.json') }).strict();

// Prepare a build-level review from already observed resources; never activate
// it, declare unknown Aura effects safe, or promote a HAR into permissions.
export function prepareBrowserReview(input: { parent: unknown; staticSource: unknown; initialization: unknown; stateHash: string; runId: string; references: BrowserRecord[] }) {
  const parent = EnvironmentPolicySchema.parse(input.parent), prior = DedicatedStaticReviewSchema.parse(input.staticSource);
  const source = z.object({ binding: z.object({ policyHash: z.string(), sourceVersion: z.string() }), appMetadata: z.object({ appIdHash: z.string() }), requestShapes: z.array(z.object({ context: z.object({ frameworkHash: z.string(), appHash: z.string() }) })).min(1) }).parse(input.initialization);
  if (parent.mode !== 'DEDICATED_QA_ORG' || prior.approval.hash !== staticPlanHash(prior.plan) || prior.plan.policyHash !== environmentHash(parent) || source.binding.policyHash !== prior.plan.policyHash || source.binding.sourceVersion !== prior.plan.specVersion || prior.plan.orgId !== parent.dedicatedQa!.orgId || prior.plan.userId !== parent.dedicatedQa!.userId) throw Error('Browser review source scope/version mismatch');
  const rules = new Map<string, z.infer<typeof ResourceRuleSchema>>();
  for (const raw of prior.plan.assets) {
    const asset = StaticAssetSchema.parse(raw), url = new URL(asset.url), key = `${url.origin}:${url.pathname}:${asset.type}`;
    const rule = rules.get(key) ?? ResourceRuleSchema.parse({ origin: url.origin, path: url.pathname, kind: asset.type, queryKeys: [], definitions: [] });
    rule.queryKeys = [...new Set([...rule.queryKeys, ...url.searchParams.keys()])].sort();
    if (url.pathname.endsWith('/auraCmpDef')) rule.definitions = [...new Set([...rule.definitions, url.searchParams.get('_def')!])];
    rules.set(key, rule);
  }
  for (const origin of [...new Set([...parent.allowedOrigins, ...prior.plan.assets.map(asset => new URL(asset.url).origin)])]) for (const path of ['/img/', '/images/', '/icons/', '/fonts/', '/logos/']) {
    const kind = path === '/fonts/' ? 'font' : 'image'; rules.set(`${origin}:${path}:${kind}`, ResourceRuleSchema.parse({ origin, path, match: 'prefix', kind, queryKeys: ['v', 'version'] }));
  }
  const plan = BrowserPlanSchema.parse({ version: 1, mode: 'DEDICATED_REVIEWED_EXECUTION', orgId: prior.plan.orgId, userId: prior.plan.userId, persona: parent.dedicatedQa!.persona, parentPolicyHash: environmentHash(parent), sourceVersion: prior.plan.specVersion, buildHash: source.requestShapes[0].context.frameworkHash, appHash: source.requestShapes[0].context.appHash, selectedAppIdHash: source.appMetadata.appIdHash, sessionStateHash: input.stateHash, origins: parent.allowedOrigins, runId: input.runId, objects: [...new Set(input.references.map(record => record.object))], records: input.references, resources: [...rules.values()], contracts: [], agentWorkflowHashes: [], budgets: { maxMs: 60000, requests: 200, resourceBytes: 67108864, maxResourceBytes: 8388608, actions: 0, sessions: 2 }, browserWrites: false, formSubmissions: false, financial: false, administrativeChanges: false });
  plan.transports = ['native-reference', 'validated-cache'];
  plan.recordReadProfile = 'existing-scoped-reads-v1';
  return { plan, approval: { operator: 'REVIEW_REQUIRED', hash: browserPlanHash(plan), expiresAt: new Date(Date.now() + 3540000).toISOString() }, initializationApprovals: [] };
}

// This packet accepts an explicitly disclosed uncertainty. Observing the client
// request and selected-app GET does not establish the server controller's purity.
// Preparing it grants nothing, even if the outer browser review is approved.
export function prepareNativeInitializationReview(plan: BrowserPlan, rawSource: unknown, operator: string) {
  const source = z.object({ requestShapes: z.array(z.object({ actionHash:z.literal(digest(currentAppAction)),exactSingleAction:z.literal(true),query: z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/),duplicateKeys:z.literal(false) }), envelope:z.object({unknownKeys:z.literal(0),duplicateKeys:z.literal(false)}),context: z.object({ frameworkHash: z.string(), appHash: z.string() }), parameters: z.object({ valueHash: z.string(), exactKeys:z.literal(true),unknownKeys:z.literal(0) }) })).min(1) }).parse(rawSource);
  const observed = source.requestShapes.find(shape => shape.context.frameworkHash === plan.buildHash && shape.context.appHash === plan.appHash && shape.parameters.valueHash === plan.selectedAppIdHash);
  if (!observed) throw Error('Exact native app-context source evidence required');
  const definition = InitializationContractSchema.parse({ id: 'native-selected-app-initialization', descriptor: currentAppAction, query: {}, queryHash: observed.query.fingerprint, parameters: { appContextIdOrName: { kind: 'app-id' } }, maxCalls: 1,
    behavior: { classification: 'application-metadata', recordMutations: false, financial: false, permissions: false, executesApex: false, unknownEffects: true },
    evidence: { referenceHash: fingerprint(rawSource), source: 'local-reviewed-request-shape-and-independent-selected-app-get; server-effects-unknown', reviewer: operator, reviewedAt: new Date().toISOString() } });
  const exception = NativeInitializationExceptionPlanSchema.parse({ purpose: 'undocumented-native-app-initialization', orgId: plan.orgId, userId: plan.userId, parentPolicyHash: plan.parentPolicyHash, buildHash: plan.buildHash, appHash: plan.appHash, selectedAppIdHash: plan.selectedAppIdHash, contractDefinitionHash: fingerprint(definition), serverSemantics: 'not-established', riskAcknowledgment: 'authorize-exact-request-without-claiming-server-purity' });
  const exceptionHash = fingerprint(exception), next = BrowserPlanSchema.parse({ ...plan, contracts: [{ ...definition, exceptionHash }] });
  return { plan: next, approval: { operator: 'REVIEW_REQUIRED', hash: browserPlanHash(next), expiresAt: new Date(Date.now() + 3540000).toISOString() }, initializationApprovals: [{ plan: exception, approval: { operator: 'REVIEW_REQUIRED', hash: exceptionHash, expiresAt: new Date(Date.now() + 3540000).toISOString(), risksAcknowledged: true as const } }] };
}
export function browserReviewSummary(plan: BrowserPlan) { return { mode: plan.mode, orgHash: digest(plan.orgId), userHash: digest(plan.userId), buildHash: plan.buildHash, parentPolicyHash: plan.parentPolicyHash, records: plan.records.map(record => ({ object: record.object, idHash: digest(record.id), purpose: record.purpose })), resourceRules: plan.resources.length, componentDefinitions: [...new Set(plan.resources.flatMap(rule => rule.definitions))].length, initializationContracts: plan.contracts.length, agentWorkflowPermits: plan.agentWorkflowHashes.length, budgets: plan.budgets, browserWrites: plan.browserWrites, formSubmissions: plan.formSubmissions, financial: plan.financial }; }
