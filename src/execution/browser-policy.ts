import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EnvironmentPolicySchema, environmentHash, authorizeEnvironment, type EnvironmentIdentity } from './environment.js';
import type { History } from '../core/history.js';
import { sameSalesforceIdentity } from './lightning-identity.js';
import { currentAppAction } from './browser-native-contracts.js';

export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Id = z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
const Origin = z.string().url().refine(value => new URL(value).protocol === 'https:' && new URL(value).origin === value);
export const BrowserSessionModeSchema = z.enum(['PRODUCTION_READ_ONLY_OBSERVATION', 'DEDICATED_INITIALIZATION_AUDIT', 'DEDICATED_REVIEWED_EXECUTION']);
export const BrowserRecordSchema = z.object({ object: z.enum(['Account', 'Contact']), id: Id, purpose: z.enum(['observation-only', 'owned-run']) }).strict();
export const ResourceRuleSchema = z.object({
  origin: Origin, path: z.string().max(16384).regex(/^\/(?:[A-Za-z0-9_./=-]|%[A-Fa-f0-9]{2})+$/), match: z.enum(['exact', 'prefix']).default('exact'), kind: z.enum(['script', 'stylesheet', 'image', 'font']),
  queryKeys: z.array(z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_.]*$/)).max(20),
  definitions: z.array(z.string().min(1).max(4000)).max(30).default([]),
}).strict().refine(rule => !/\.\.|\/\/(?!$)|^\/(?:services|secur|apex|setup|lightning|aura)(?:\/|$)/i.test(rule.path), 'Business endpoints cannot be static resource rules');
const ParameterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('app-id') }).strict(), z.object({ kind: z.literal('record-id') }).strict(),
  z.object({ kind: z.literal('hash'), valueHash: Hash }).strict(),
]);
export const InitializationContractSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), descriptor: z.string().max(500).regex(/^(?:aura|serviceComponent):\/\/[A-Za-z][A-Za-z0-9_.]*\/ACTION\$[A-Za-z][A-Za-z0-9_]*$/),
  query: z.record(z.string().max(200), Hash), queryHash: Hash.optional(), parameters: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), ParameterSchema), exceptionHash: Hash.optional(),
  maxCalls: z.number().int().min(1).max(10),
  behavior: z.object({ classification: z.enum(['application-metadata', 'scoped-record-read']), recordMutations: z.literal(false), financial: z.literal(false), permissions: z.literal(false), executesApex: z.literal(false), unknownEffects: z.boolean() }).strict(),
  evidence: z.object({ referenceHash: Hash, source: z.string().min(1).max(500), reviewer: z.string().trim().min(1), reviewedAt: z.string().datetime() }).strict(),
}).strict();
export const BrowserPlanSchema = z.object({
  version: z.literal(1), mode: z.enum(['DEDICATED_INITIALIZATION_AUDIT', 'DEDICATED_REVIEWED_EXECUTION']),
  orgId: Id, userId: Id, persona: z.string().min(1), parentPolicyHash: Hash,
  sourceVersion: Hash, buildHash: Hash, appHash: Hash, selectedAppIdHash: Hash, sessionStateHash: Hash,
  origins: z.array(Origin).min(1).max(2), runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  objects: z.array(z.enum(['Account', 'Contact'])).min(1).max(2), records: z.array(BrowserRecordSchema).max(2), ownedDataPlanHash: Hash.optional(), resources: z.array(ResourceRuleSchema).min(1).max(80),
  contracts: z.array(InitializationContractSchema).max(20),
  agentWorkflowHashes: z.array(Hash).max(20).default([]),
  transports: z.array(z.enum(['validated-cache', 'native-reference'])).min(1).max(2).default(['validated-cache']), recordReadProfile: z.enum(['documented-ui-api-only', 'existing-scoped-reads-v1']).default('documented-ui-api-only'),
  budgets: z.object({ maxMs: z.number().int().min(1000).max(60000), requests: z.number().int().min(1).max(250), resourceBytes: z.number().int().min(1).max(67108864), maxResourceBytes: z.number().int().min(1).max(8388608), actions: z.number().int().min(0).max(20), sessions: z.number().int().min(1).max(5) }).strict(),
  browserWrites: z.literal(false), formSubmissions: z.literal(false), financial: z.literal(false), administrativeChanges: z.literal(false),
}).strict();
export const NativeInitializationExceptionPlanSchema=z.object({purpose:z.literal('undocumented-native-app-initialization'),orgId:Id,userId:Id,parentPolicyHash:Hash,buildHash:Hash,appHash:Hash,selectedAppIdHash:Hash,contractDefinitionHash:Hash,serverSemantics:z.literal('not-established'),riskAcknowledgment:z.literal('authorize-exact-request-without-claiming-server-purity')}).strict();
export const NativeInitializationExceptionSchema=z.object({plan:NativeInitializationExceptionPlanSchema,approval:z.object({operator:z.string().min(1),hash:Hash,expiresAt:z.string().datetime(),risksAcknowledged:z.literal(true)}).strict()}).strict();
export const BrowserReviewSchema = z.object({ plan: BrowserPlanSchema, approval: z.object({ operator: z.string().trim().min(1), hash: Hash, expiresAt: z.string().datetime() }).strict(),initializationApprovals:z.array(NativeInitializationExceptionSchema).max(1).default([]) }).strict();
export type BrowserPlan = z.infer<typeof BrowserPlanSchema>;
export type BrowserReview = z.infer<typeof BrowserReviewSchema>;
export type BrowserRecord = z.infer<typeof BrowserRecordSchema>;
export const browserPlanHash = (plan: unknown) => fingerprint(BrowserPlanSchema.parse(plan));

export function authorizeBrowserSession(raw: unknown, parent: unknown, identity: EnvironmentIdentity, build: { buildHash: string; appHash: string }, now = Date.now()) {
  const review = BrowserReviewSchema.parse(raw), policy = EnvironmentPolicySchema.parse(parent), plan = review.plan;
  if (policy.mode !== 'DEDICATED_QA_ORG' || policy.approval.definitionHash !== environmentHash(policy) || plan.parentPolicyHash !== environmentHash(policy) || review.approval.operator === 'REVIEW_REQUIRED' || review.approval.operator !== policy.approval.operator || review.approval.hash !== browserPlanHash(plan) || Date.parse(review.approval.expiresAt) <= now || Date.parse(review.approval.expiresAt) > now + 3600000) throw Error('Exact named dedicated browser authorization required');
  if (identity.Id !== plan.orgId || identity.userId !== plan.userId || policy.dedicatedQa?.persona !== plan.persona || build.buildHash !== plan.buildHash || build.appHash !== plan.appHash || plan.origins.some(origin => !policy.allowedOrigins.includes(origin))) throw Error('Dedicated browser org/user/persona/build/origin mismatch');
  const effective = { ...policy, approval: { ...policy.approval, expiresAt: review.approval.expiresAt } };
  for (const origin of plan.origins) authorizeEnvironment(effective, identity, 'dedicated-ui', origin, plan.persona, now);
  if (plan.mode === 'DEDICATED_INITIALIZATION_AUDIT' && (plan.contracts.length || plan.budgets.actions || plan.agentWorkflowHashes.length)) throw Error('Audit mode cannot acquire execution or agent-action authority');
  if (plan.ownedDataPlanHash ? plan.records.length !== 0 : !plan.records.length || plan.records.some(record => record.purpose !== 'observation-only') || plan.budgets.actions !== 0) throw Error('Owned records must be resolved from the exact factory journal; observation references grant no agent actions');
  if(plan.ownedDataPlanHash&&plan.transports.includes('native-reference'))throw Error('Native reference transport cannot acquire owned-run or agent authority');
  if (new Set(plan.records.map(record => record.id)).size !== plan.records.length || plan.records.some(record => !policy.dedicatedQa!.objects.includes(record.object) || !record.id.startsWith(record.object === 'Account' ? '001' : '003'))) throw Error('Browser reference scope differs from permitted objects');
  for (const contract of plan.contracts) if (contract.evidence.reviewer !== review.approval.operator || Date.parse(contract.evidence.reviewedAt) > now || /Apex|AuthController|PermissionController|AdminController/i.test(contract.descriptor) || /(?:execute|create|update|save|delete|insert|pay|refund|transfer|permission|admin)/i.test(contract.descriptor.split('/ACTION$')[1])) throw Error('Unreviewed or high-risk initialization action denied');
  if(plan.contracts.some(contract=>contract.descriptor===currentAppAction&&!contract.behavior.unknownEffects))throw Error('Native current-app server semantics cannot be declared established');
  for(const contract of plan.contracts)if(contract.behavior.unknownEffects){
    const {exceptionHash,...definition}=contract,expected=NativeInitializationExceptionPlanSchema.parse({purpose:'undocumented-native-app-initialization',orgId:plan.orgId,userId:plan.userId,parentPolicyHash:plan.parentPolicyHash,buildHash:plan.buildHash,appHash:plan.appHash,selectedAppIdHash:plan.selectedAppIdHash,contractDefinitionHash:fingerprint(definition),serverSemantics:'not-established',riskAcknowledgment:'authorize-exact-request-without-claiming-server-purity'}),grant=review.initializationApprovals.find(grant=>fingerprint(grant.plan)===exceptionHash);
    if(contract.descriptor!==currentAppAction||contract.maxCalls!==1||contract.behavior.classification!=='application-metadata'||!contract.queryHash||Object.keys(contract.parameters).length!==1||contract.parameters.appContextIdOrName?.kind!=='app-id'||!grant||fingerprint(expected)!==exceptionHash||grant.approval.operator!==review.approval.operator||grant.approval.hash!==exceptionHash||!grant.approval.risksAcknowledged||Date.parse(grant.approval.expiresAt)<=now||Date.parse(grant.approval.expiresAt)>Date.parse(review.approval.expiresAt))throw Error('Undocumented native initialization needs its separate exact risk authorization');
  }
  for (const rule of plan.resources) {
    const host = new URL(rule.origin).hostname;
    if (!plan.origins.includes(rule.origin) && !/^(?:[a-z0-9-]+\.)?static\.lightning\.force\.com$|\.(?:salesforce-static\.com|sfdcstatic\.com)$/i.test(host)) throw Error('Resource origin is not an approved first-party static host');
    if (rule.path.endsWith('/auraCmpDef') && (!rule.definitions.length || rule.kind !== 'script' || !rule.queryKeys.includes('_def'))) throw Error('Component resources require a reviewed definition set');
    if (rule.match === 'prefix' && (!['image', 'font'].includes(rule.kind) || !['/img/', '/images/', '/icons/', '/fonts/', '/logos/'].includes(rule.path))) throw Error('Only reviewed non-executable static asset roots support prefix policies');
    if (rule.queryKeys.some(key => /token|secret|password|session|assertion|^sid$|^otp$/i.test(key))) throw Error('Credential-bearing resource parameters denied');
  }
  return { review, policy: effective };
}

export function resourceRule(plan: BrowserPlan, request: { url: string; method: string; type: string }) {
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || /\.\./i.test(url.pathname)) return;
    const rule = plan.resources.find(rule => rule.origin === url.origin && (rule.match === 'exact' ? rule.path === url.pathname : url.pathname.startsWith(rule.path)) && rule.kind === request.type);
    if (!rule) return;
    // Native Salesforce paths can encode JSON and embedded slashes. An exact
    // reviewed pathname is compared byte-for-byte; prefix rules cannot use them.
    if(rule.match==='prefix'&&/%2f|%5c/i.test(url.pathname))return;
    if (rule.match === 'prefix' && !(rule.kind === 'font' ? /\.(?:woff2?|ttf|otf|eot)$/i : /\.(?:png|jpe?g|gif|webp|svg|ico)$/i).test(url.pathname)) return;
    for (const key of url.searchParams.keys()) {
      const value = url.searchParams.get(key)!;
      if (!rule.queryKeys.includes(key) || url.searchParams.getAll(key).length !== 1 || value.length > 8192 || /[\x00-\x20<>"'`\\]|Bearer|-----BEGIN|\b(?:00D|005|001|003)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/i.test(value)) return;
    }
    if (rule.definitions.length && (!url.searchParams.has('_uid') || !rule.definitions.includes(url.searchParams.get('_def') ?? ''))) return;
    return rule;
  } catch { return; }
}

export function browserDocument(plan: BrowserPlan, url: string, records: BrowserRecord[] = plan.records) {
  try { const target = new URL(url), match = /^\/lightning\/r\/(?:(Account|Contact)\/)?([A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?)\/view$/.exec(target.pathname); return !!match && !target.search && !target.hash && !target.username && !target.password && plan.origins.includes(target.origin) && records.some(record => (!match[1] || match[1] === record.object) && sameSalesforceIdentity(match[2], record.id)); } catch { return false; }
}

export function resolveBrowserRecords(plan: BrowserPlan, history?: History): BrowserRecord[] {
  if (!plan.ownedDataPlanHash) return plan.records;
  if (!history) throw Error('Owned browser sessions require the factory ownership journal');
  const key = [plan.orgId, plan.userId, plan.runId], run = history.db.prepare('SELECT hash,status FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(...key);
  if (run?.hash !== plan.ownedDataPlanHash || run.status !== 'open' || history.db.prepare("SELECT hash FROM dedicated_mutations WHERE org=? AND user=? AND run=? AND status='pending'").get(...key)) throw Error('Owned browser scope requires the exact active certain factory run');
  const records = history.db.prepare('SELECT object,id,status FROM dedicated_records WHERE org=? AND user=? AND run=?').all(...key);
  if (records.length !== plan.objects.length || records.some(record => record.status !== 'verified' || !plan.objects.includes(record.object as 'Account' | 'Contact'))) throw Error('Browser ownership references are not fully verified');
  return records.map(record => BrowserRecordSchema.parse({ object: record.object, id: record.id, purpose: 'owned-run' }));
}
export function reserveBrowserSession(review: BrowserReview, history: History, nonce: string) {
  history.db.exec('CREATE TABLE IF NOT EXISTS browser_execution_sessions(policy TEXT,nonce TEXT UNIQUE,status TEXT,PRIMARY KEY(policy,nonce)); PRAGMA busy_timeout=5000');
  const hash = browserPlanHash(review.plan); history.db.exec('BEGIN IMMEDIATE');
  try { if (Number(history.db.prepare('SELECT COUNT(*) AS count FROM browser_execution_sessions WHERE policy=?').get(hash)?.count) >= review.plan.budgets.sessions) throw Error('Reviewed browser session budget exhausted'); history.db.prepare("INSERT INTO browser_execution_sessions VALUES(?,?,'started')").run(hash, nonce); history.db.exec('COMMIT'); } catch (error) { history.db.exec('ROLLBACK'); throw error; }
}
