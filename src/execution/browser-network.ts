import { z } from 'zod';
import { browserDocument, digest, type BrowserPlan, type BrowserRecord } from './browser-policy.js';
import { sameSalesforceIdentity } from './lightning-identity.js';
import { allowDedicatedRequest } from './dedicated-browser.js';
import type { EnvironmentPolicy,EnvironmentIdentity } from './environment.js';
import { currentAppAction } from './browser-native-contracts.js';

export type BrowserRequestInput = { url: string; method: string; type: string; body?: string | null };
export type NetworkDecision = { allow: boolean; kind: 'document' | 'static-resource' | 'documented-ui-api' | 'reviewed-initialization' | 'denied'; contracts: string[]; reason: string };
const denied = (reason: string): NetworkDecision => ({ allow: false, kind: 'denied', contracts: [], reason });

// No startsWith('get') permission rule. Aura actions need explicit source/effect
// review in the build-bound policy, including every action in a batch.
export function browserNetworkDecision(plan: BrowserPlan, records: BrowserRecord[], request: BrowserRequestInput, legacy?:{policy:EnvironmentPolicy;identity:EnvironmentIdentity}): NetworkDecision {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !plan.origins.includes(url.origin) || /%2f|%5c|\.\./i.test(url.pathname)) return denied('origin-or-path');
    if (request.type === 'document') return request.method === 'GET' && browserDocument(plan, request.url, records) ? { allow: true, kind: 'document', contracts: [], reason: 'approved-reference-document' } : denied('document-scope');
    if (!['xhr', 'fetch'].includes(request.type)) return denied('unknown-resource');
    if (request.method === 'GET') {
      if (/^\/services\/data\/v\d+\.\d+\/ui-api\/records\/[A-Za-z0-9]+$/.test(url.pathname)) {
        const record = records.find(record => sameSalesforceIdentity(url.pathname.split('/').at(-1)!, record.id));
        const keys = [...url.searchParams.keys()];
        if (!record || !keys.length || keys.some(key => !['fields', 'optionalFields'].includes(key) || url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)!.split(',').every(value => new RegExp(`^${record.object}\\.[A-Za-z][A-Za-z0-9_]*$`).test(value)))) return denied('record-or-field-scope');
        return { allow: true, kind: 'documented-ui-api', contracts: [], reason: 'exact-approved-record-read' };
      }
      if (/^\/services\/data\/v\d+\.\d+\/ui-api\/(?:object-info|layout)\/(?:Account|Contact)$/.test(url.pathname) && !url.search && plan.objects.some(object => url.pathname.endsWith('/' + object))) return { allow: true, kind: 'documented-ui-api', contracts: [], reason: 'approved-object-metadata' };
      return denied('unreviewed-get');
    }
    const lightningOrigin=plan.origins.find(origin=>new URL(origin).hostname.endsWith('.lightning.force.com'));
    if (request.method !== 'POST' || url.origin!==lightningOrigin || url.pathname !== '/aura' || plan.mode !== 'DEDICATED_REVIEWED_EXECUTION' || !request.body || request.body.length > 262144) return denied('business-write-or-unreviewed-rpc');
    const body = new URLSearchParams(request.body), bodyKeys = [...body.keys()];
    if (bodyKeys.some(key => !['message', 'aura.context', 'aura.token', 'aura.pageURI'].includes(key) || body.getAll(key).length !== 1)) return denied('aura-envelope');
    const envelope = z.object({ actions: z.array(z.object({ id: z.string().max(100).optional(), descriptor: z.string(), callingDescriptor: z.string().max(500).optional(), params: z.record(z.string(), z.unknown()), storable: z.boolean().optional(), abortable: z.boolean().optional() }).strict()).min(1).max(10) }).strict().safeParse(JSON.parse(body.get('message') ?? 'null'));
    const context = z.object({ fwuid: z.string(), app: z.string() }).safeParse(JSON.parse(body.get('aura.context') ?? 'null'));
    if (!envelope.success || !context.success || digest(context.data.fwuid) !== plan.buildHash || digest(context.data.app) !== plan.appHash) return denied('aura-build-context');
    if(plan.recordReadProfile==='existing-scoped-reads-v1'&&legacy){
      const query=[...url.searchParams];
      const expected=envelope.data.actions.map(action=>{const parts=/\/\/.*[./]([A-Za-z0-9_]+)\/ACTION\$([A-Za-z0-9_]+)$/.exec(action.descriptor)??/^aura:\/\/([A-Za-z0-9_]+)\/ACTION\$([A-Za-z0-9_]+)$/.exec(action.descriptor);return parts?`aura.${parts[1]}.${parts[2]}`:'';});
      if(envelope.data.actions.every(action=>action.params.objectApiName===undefined||plan.objects.includes(action.params.objectApiName as 'Account'|'Contact'))&&(query.length===0||query.every(([key,value])=>expected.includes(key)&&value==='1'&&url.searchParams.getAll(key).length===1))&&allowDedicatedRequest({policy:legacy.policy,identity:legacy.identity,origins:plan.origins,documents:[],owned:records,expiresAt:legacy.policy.approval.expiresAt},{...request,url:url.origin+'/aura'}))return{allow:true,kind:'reviewed-initialization',contracts:[],reason:'existing-scoped-record-read'};
    }
    const contracts: string[] = [];
    for (const action of envelope.data.actions) {
      if(action.descriptor===currentAppAction&&(envelope.data.actions.length!==1||bodyKeys.length!==3||!['message','aura.context','aura.token'].every(key=>body.has(key))))return denied('native-envelope-scope');
      const contract = plan.contracts.find(contract => contract.descriptor === action.descriptor);
      if (!contract || (contract.queryHash?digest(url.search)!==contract.queryHash:[...url.searchParams.keys()].length !== Object.keys(contract.query).length || Object.entries(contract.query).some(([key, hash]) => url.searchParams.getAll(key).length !== 1 || digest(url.searchParams.get(key) ?? '') !== hash)) || Object.keys(action.params).length !== Object.keys(contract.parameters).length) return denied('unknown-action-or-query');
      for (const [key, rule] of Object.entries(contract.parameters)) {
        const value = action.params[key];
        if (typeof value !== 'string' || (rule.kind === 'app-id' ? digest(value) !== plan.selectedAppIdHash : rule.kind === 'record-id' ? !records.some(record => sameSalesforceIdentity(record.id, value)) : digest(value) !== rule.valueHash)) return denied('initialization-parameter-scope');
      }
      contracts.push(contract.id);
    }
    return { allow: true, kind: 'reviewed-initialization', contracts, reason: 'explicit-reviewed-behavior' };
  } catch { return denied('unsupported-request-shape'); }
}
