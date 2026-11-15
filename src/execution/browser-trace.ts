import { z } from 'zod';
import { digest, fingerprint, type BrowserPlan, type BrowserRecord } from './browser-policy.js';
import type { BrowserRequestInput, NetworkDecision } from './browser-network.js';
import { currentAppAction } from './lightning-initialization.js';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const ScopeSchema = z.object({ org: Hash, user: Hash, build: Hash, app: Hash, records: z.array(Hash).max(2) }).strict();
const EntrySchema = z.object({ key: Hash, urlHash: Hash, route: z.enum(['document', 'static', 'ui-api', 'aura', 'other']), method: z.enum(['GET', 'POST', 'HEAD', 'PATCH', 'PUT', 'DELETE', 'other']), status: z.number().int().min(0).max(599), descriptors: z.array(Hash).max(10), knownAction: z.enum(['OneController.getCurrentApp', 'unclassified']), parameterHashes: z.record(z.string(), Hash), responseStates: z.array(z.enum(['SUCCESS', 'ERROR', 'other'])).max(10), responseShape: z.array(z.string()).max(80), decision: z.enum(['reference', 'allowed', 'blocked']), reason: z.string().regex(/^[a-z0-9-]{1,80}$/) }).strict();
export const BrowserTraceSchema = z.object({ version: z.literal(1), scope: ScopeSchema, provenance: z.enum(['operator-normal-session-import', 'framework-native-reference', 'framework-controlled']), sourceHash: Hash, identityVerified: z.boolean(), entries: z.array(EntrySchema).max(250), truncated: z.boolean(), rawValuesRetained: z.literal(false) }).strict();
export type BrowserTrace = z.infer<typeof BrowserTraceSchema>;
export function browserTraceScope(plan: BrowserPlan, records: BrowserRecord[]) { return { org: digest(plan.orgId), user: digest(plan.userId), build: plan.buildHash, app: plan.appHash, records: records.map(record => digest(record.id)).sort() }; }
const safeKeys = new Set(['actions', 'state', 'returnValue', 'errors', 'context', 'appId', 'developerName', 'navItems', 'records', 'fields', 'Id', 'Name', 'LastName', 'displayValue', 'value', 'label', 'url', 'apiName', 'recordId', 'recordIds', 'objectApiName', 'appContextIdOrName']);
function responseShape(raw: unknown) {
  const shapes: string[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 3 || shapes.length >= 80) return;
    if (Array.isArray(value)) { shapes.push(path + ':array'); for (const item of value.slice(0, 2)) visit(item, path + '[]', depth + 1); }
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value).slice(0, 20)) { const safe = safeKeys.has(key) ? key : 'key-' + digest(key).slice(0, 12); shapes.push(`${path}.${safe}:${item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item}`); visit(item, `${path}.${safe}`, depth + 1); }
  }; visit(raw, '$', 0); return [...new Set(shapes)].slice(0, 80);
}
export function summarizeBrowserExchange(input: BrowserRequestInput, status: number, response?: unknown, decision?: NetworkDecision) {
  const url = new URL(input.url), route = url.pathname === '/aura' ? 'aura' : url.pathname.includes('/ui-api/') ? 'ui-api' : input.type === 'document' ? 'document' : ['script', 'stylesheet', 'image', 'font'].includes(input.type) ? 'static' : 'other';
  const descriptors: string[] = [], parameterHashes: Record<string, string> = {}; let knownAction: 'OneController.getCurrentApp' | 'unclassified' = 'unclassified';
  if (route === 'aura' && input.body && input.body.length <= 262144) try {
    const message = JSON.parse(new URLSearchParams(input.body).get('message') ?? 'null');
    for (const action of Array.isArray(message?.actions) ? message.actions.slice(0, 10) : []) {
      if (typeof action?.descriptor !== 'string') continue; const hash = digest(action.descriptor); descriptors.push(hash); if (action.descriptor === currentAppAction) knownAction = 'OneController.getCurrentApp';
      if (action.params && typeof action.params === 'object' && !Array.isArray(action.params)) for (const [key, value] of Object.entries(action.params).slice(0, 20)) parameterHashes[(safeKeys.has(key) ? key : 'key-' + digest(key).slice(0, 12)) + '-' + hash.slice(0, 8)] = fingerprint(value);
    }
  } catch { /* Raw bodies, context/token fields and values never leave memory. */ }
  const states: Array<'SUCCESS' | 'ERROR' | 'other'> = [];
  if (response && typeof response === 'object' && Array.isArray((response as { actions?: unknown }).actions)) for (const action of ((response as { actions: unknown[] }).actions).slice(0, 10)) { const state = action && typeof action === 'object' ? (action as { state?: unknown }).state : undefined; states.push(state === 'SUCCESS' || state === 'ERROR' ? state : 'other'); }
  // Semantic matching removes nonce/style URL differences only for comparison,
  // never for permission decisions or resource cache keys.
  const key = fingerprint([route, input.method, url.origin, url.pathname, route === 'static' ? url.searchParams.get('_def') ?? '' : route === 'aura' ? [descriptors, parameterHashes] : digest(url.search)]);
  return EntrySchema.parse({ key, urlHash: digest(input.url), route, method: ['GET', 'POST', 'HEAD', 'PATCH', 'PUT', 'DELETE'].includes(input.method) ? input.method : 'other', status, descriptors, knownAction, parameterHashes, responseStates: states, responseShape: responseShape(response), decision: decision ? decision.allow ? 'allowed' : 'blocked' : 'reference', reason: decision?.reason ?? 'operator-reference' });
}
export function sanitizeBrowserHar(raw: unknown, plan: BrowserPlan, records: BrowserRecord[]) {
  const har = z.object({ log: z.object({ entries: z.array(z.object({ request: z.object({ url: z.string().url(), method: z.string(), postData: z.object({ text: z.string().optional() }).optional() }), response: z.object({ status: z.number().int(), content: z.object({ mimeType: z.string().optional(), text: z.string().optional(), encoding: z.string().optional() }).optional() }), _resourceType: z.string().optional() })) }) }).safeParse(raw);
  if (!har.success || har.data.log.entries.length > 10000) throw Error('Reference HAR shape/size unsupported; raw content withheld');
  const entries = [];
  for (const entry of har.data.log.entries) {
    const url = new URL(entry.request.url);
    if (!plan.origins.includes(url.origin) && !plan.resources.some(rule => rule.origin === url.origin)) continue;
    let body: unknown; const content = entry.response.content;
    if (content?.text && content.text.length <= 262144 && content.encoding !== 'base64' && /json/i.test(content.mimeType ?? '')) try { body = JSON.parse(content.text.replace(/^(?:while\(1\);|for\(;;\);)/, '')); } catch { /* A successful HTTP status alone is not a successful Aura action. */ }
    const mime=content?.mimeType??'',type=entry._resourceType??(/javascript/i.test(mime)?'script':/text\/css/i.test(mime)?'stylesheet':/text\/html/i.test(mime)?'document':/json/i.test(mime)?'xhr':'other');
    entries.push(summarizeBrowserExchange({ url: entry.request.url, method: entry.request.method, type, body: entry.request.postData?.text }, entry.response.status, body)); if (entries.length >= 250) break;
  }
  return BrowserTraceSchema.parse({ version: 1, scope: browserTraceScope(plan, records), provenance: 'operator-normal-session-import', sourceHash: fingerprint(raw), identityVerified: false, entries, truncated: har.data.log.entries.length > entries.length, rawValuesRetained: false });
}
export function compareBrowserTraces(referenceRaw: unknown, controlledRaw: unknown) {
  const reference = BrowserTraceSchema.parse(referenceRaw), controlled = BrowserTraceSchema.parse(controlledRaw);
  if (fingerprint(reference.scope) !== fingerprint(controlled.scope) || !['operator-normal-session-import','framework-native-reference'].includes(reference.provenance) || controlled.provenance !== 'framework-controlled' || !controlled.identityVerified) throw Error('Comparison requires matching org/user/build/record scope and verified controlled identity');
  const differences = controlled.entries.filter(entry => entry.decision === 'blocked').map(entry => ({ key: entry.key, reason: entry.reason, referenceSucceeded: reference.entries.some(other => other.key === entry.key && other.status >= 200 && other.status < 300 && (other.route!=='aura'||other.responseStates.length>0&&other.responseStates.every(state=>state==='SUCCESS'))), route: entry.route, knownAction: entry.knownAction }));
  return { kind: 'bounded-browser-network-comparison', referenceIdentity: reference.identityVerified ? 'independently-verified' : 'operator-supplied-unverified', entriesCompared: controlled.entries.length, blockedDifferences: differences, traceTruncated: reference.truncated || controlled.truncated, rendersEquivalent: false, controllerReadOnlyEstablished: false, rootCause: 'unresolved', permissionsGranted: 0 };
}
