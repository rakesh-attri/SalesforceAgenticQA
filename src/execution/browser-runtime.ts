import { chromium, type BrowserContext, type Request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { History } from '../core/history.js';
import type { EnvironmentIdentity } from './environment.js';
import { verifyDedicatedSession, validateDedicatedState } from './dedicated-browser.js';
import { readPrivateSessionState } from '../integrations/session-gate.js';
import { authorizeBrowserSession, browserDocument, browserPlanHash, digest, fingerprint, resourceRule, resolveBrowserRecords, reserveBrowserSession, type BrowserReview, type BrowserRecord } from './browser-policy.js';
import type { BoundaryDenialReason } from './browser-diagnostics.js';
import { parseBrowserBuild } from './browser-build.js';
import { BrowserBudget, BrowserResourceBroker, validResourceContentType } from './browser-resources.js';
import { sameSalesforceIdentity } from './lightning-identity.js';
import { browserNetworkDecision, type NetworkDecision } from './browser-network.js';
import { browserTraceScope, BrowserTraceSchema, summarizeBrowserExchange, compareBrowserTraces, type BrowserTrace } from './browser-trace.js';

export async function verifyActualContext(context: BrowserContext, statePath: string, review: BrowserReview, policy: unknown, identity: EnvironmentIdentity, apiOrigin: string) {
  const source = await readPrivateSessionState(statePath);
  if (source.hash !== review.plan.sessionStateHash) throw Error('Browser state differs from the approved execution source');
  await verifyDedicatedSession(statePath, policy, identity, apiOrigin);
  const state = validateDedicatedState(JSON.parse(await readFile(source.statePath, 'utf8')), (await import('./environment.js')).EnvironmentPolicySchema.parse(policy));
  const key = (cookie: { name: string; domain: string; path: string; value: string; secure: boolean; httpOnly: boolean }) => fingerprint([cookie.name, cookie.domain, cookie.path, cookie.value, cookie.secure, cookie.httpOnly]);
  const actual = (await context.cookies()).map(key).sort(), expected = state.cookies.map(cookie => key(cookie as Parameters<typeof key>[0])).sort();
  if (fingerprint(actual) !== fingerprint(expected) || (await readPrivateSessionState(statePath)).hash !== source.hash) throw Error('Actual browser context differs from the proven approved session');
}

export async function installReviewedBrowserBoundary(context: BrowserContext, input: { review: BrowserReview; parent: unknown; identity: EnvironmentIdentity; build: { buildHash: string; appHash: string }; history: History; records: BrowserRecord[]; resourceFetch?: typeof fetch; onBlocked?: (request?: Request, reason?: BoundaryDenialReason) => void; transport?: 'native-reference'|'validated-cache' }) {
  const { review, parent, identity, build, history, records } = input;
  authorizeBrowserSession(review, parent, identity, build);
  const transport=input.transport??'validated-cache';if(!review.plan.transports.includes(transport)||transport==='native-reference'&&(review.plan.ownedDataPlanHash||review.plan.budgets.actions))throw Error('Reference transport has no workflow or agent authority');
  if (fingerprint(records) !== fingerprint(resolveBrowserRecords(review.plan, history))) throw Error('Browser records differ from the approved observation/factory scope');
  const budget = new BrowserBudget(review), broker = new BrowserResourceBroker(history, review, parent, identity, build, budget, input.resourceFetch), calls = new Map<string, number>();
  const decisions = new WeakMap<Request, NetworkDecision>(), entries: BrowserTrace['entries'] = [], pending = new Set<Promise<void>>(); let blocked = 0, serverErrors = 0, resourceValidationFailures=0,responseInspectionFailures=0,publicCredentialRequests=0;
  const trace = (request: Request, status: number, response?: unknown) => { if (entries.length < 250) entries.push(summarizeBrowserExchange({ url: request.url(), method: request.method(), type: request.resourceType(), body: request.postData() }, status, response, decisions.get(request))); };
  context.on('response', response => {
    const work = (async () => { const request = response.request(), decision = decisions.get(request); if (!decision?.allow) return;if(['script','stylesheet','image','font'].includes(request.resourceType())){if(transport==='native-reference'){const bytes=await response.body(),mime=response.headers()['content-type']??'';if(response.status()>=400)serverErrors++;if(response.status()!==200||bytes.length>review.plan.budgets.maxResourceBytes||!validResourceContentType(request.resourceType(),mime))resourceValidationFailures++;budget.consume(bytes.length);trace(request,response.status());}return;}
      let body: unknown; if (request.url().includes('/aura') && response.status() === 200) try { const bytes = await response.body(); if (bytes.length <= 262144) body = JSON.parse(bytes.toString('utf8').replace(/^(?:while\(1\);|for\(;;\);)/, '')); } catch { /* Finite response status survives; raw provider text never does. */ }
      if (response.status() >= 400 || body && typeof body === 'object' && Array.isArray((body as { actions?: unknown }).actions) && (body as { actions: Array<{ state?: unknown }> }).actions.some(action => action.state === 'ERROR')) serverErrors++;
      trace(request, response.status(), body);
    })().catch(() => { responseInspectionFailures++; }); pending.add(work); void work.finally(() => pending.delete(work));
  });
  await context.routeWebSocket('**/*', socket => { blocked++; input.onBlocked?.(undefined, 'websocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request(), data = { url: request.url(), method: request.method(), type: request.resourceType(), body: request.postData() };
    let phase='authorization';
    try {
      authorizeBrowserSession(review, parent, identity, build);phase='request-budget';budget.request();
      const rule = resourceRule(review.plan, data);
      if (rule) {
        decisions.set(request, { allow: true, kind: 'static-resource', contracts: [], reason: 'reviewed-build-resource' });
        if(!review.plan.origins.includes(rule.origin)){
          phase='public-resource-headers';const headers=await request.allHeaders(),credentialBearing=!!(headers.cookie||headers.authorization);if(credentialBearing)publicCredentialRequests++;
          if(transport==='native-reference'){phase='public-resource-credentials';if(credentialBearing)throw Error('Native reference cannot send credentials to the public CDN');phase='native-resource-transport';return route.fallback();}
          phase='public-static-validation-or-transport';const response = await broker.serve(data); trace(request, response.status); return route.fulfill(response);
        }
        if(transport==='native-reference'){phase='native-resource-transport';return route.fallback();}
        // Authenticated first-party assets retain native cookies only at the
        // exact approved origin, are checked, and are never placed in cache.
        phase='authenticated-static-transport';const response = await route.fetch({ maxRedirects: 0, timeout: Math.min(15000, budget.remaining()) });
        phase='authenticated-static-validation';
        if (response.status() !== 200 || Number(response.headers()['content-length'] ?? 0) > review.plan.budgets.maxResourceBytes) throw Error('Same-origin resource status/size denied');
        const mime = response.headers()['content-type'] ?? '', body = await response.body();
        if (body.length > review.plan.budgets.maxResourceBytes || !validResourceContentType(rule.kind, mime) || ['script', 'stylesheet'].includes(rule.kind) && /^\s*(?:<!doctype|<html)/i.test(body.subarray(0, 256).toString())) throw Error('Same-origin resource MIME denied');
        budget.consume(body.length); trace(request, 200); return route.fulfill({ response, body });
      }
      phase='request-contract';const decision = browserNetworkDecision(review.plan, records, data,{policy:authorizeBrowserSession(review,parent,identity,build).policy,identity}); decisions.set(request, decision);
      if (!decision.allow) { blocked++; input.onBlocked?.(request, 'policy-denied'); trace(request, 0); return route.abort('blockedbyclient'); }
      phase='initialization-call-budget';for (const id of new Set(decision.contracts)) { const count = (calls.get(id) ?? 0) + decision.contracts.filter(value => value === id).length, contract = review.plan.contracts.find(contract => contract.id === id)!; if (count > contract.maxCalls) throw Error('Initialization call budget exceeded'); calls.set(id, count); }
      return route.fallback();
    } catch { blocked++; input.onBlocked?.(request, 'policy-denied'); decisions.set(request, { allow: false, kind: 'denied', contracts: [], reason: phase }); trace(request, 0); return route.abort('blockedbyclient').catch(() => {}); }
  });
  return { budget, broker, async finish() { await Promise.race([Promise.allSettled([...pending]), new Promise(resolve => setTimeout(resolve, 1000))]); return { transport,blocked, serverErrors, resourceValidationFailures,responseInspectionFailures,publicCredentialRequests,pendingResponseBodies: pending.size, requests: budget.requests, resourceBytes: budget.bytes, cacheHits: broker.hits, cacheMisses: broker.misses, networkResourceBytes: broker.networkBytes, trace: BrowserTraceSchema.parse({ version: 1, scope: browserTraceScope(review.plan, records), provenance: transport==='native-reference'?'framework-native-reference':'framework-controlled', sourceHash: fingerprint(entries), identityVerified: true, entries, truncated: entries.length >= 250 || pending.size > 0, rawValuesRetained: false }) }; } };
}

export function browserLocationClass(review:BrowserReview,url:string){
  try{const target=new URL(url);return{approvedOrigin:review.plan.origins.includes(target.origin),kind:target.protocol==='about:'?'not-loaded':/(?:^|\/)(?:login|Login)(?:\/|$)|^\/secur\//.test(target.pathname)?'authentication':target.pathname==='/lightning/page/home'?'lightning-home':/^\/lightning\/r\//.test(target.pathname)?'record-document':target.pathname.startsWith('/lightning')?'lightning-other':'other',query:!!target.search,fragment:!!target.hash};}catch{return{approvedOrigin:false,kind:'unavailable',query:false,fragment:false};}
}

export async function probeReviewedBrowser(input: { review: BrowserReview; parent: unknown; history: History; statePath: string; apiOrigin: string; identity(): Promise<EnvironmentIdentity>; verifyReferences(): Promise<{ references: BrowserRecord[]; privateDisplays: Array<{ object: 'Account' | 'Contact'; id: string; display: string }>; proof: unknown }>; reference?: BrowserTrace; object?: 'Account' | 'Contact'; transport?:'native-reference'|'validated-cache';prepareContext?: (context: BrowserContext) => Promise<void>; verifyContext?: typeof verifyActualContext; resourceFetch?: typeof fetch; nativeBuild?: (context: BrowserContext) => Promise<ReturnType<typeof parseBrowserBuild>> }) {
  const review = input.review, identity = await input.identity(), preflight = await input.verifyReferences(), authority = authorizeBrowserSession(review, input.parent, identity, review.plan);
  const before = await readPrivateSessionState(input.statePath); if (before.hash !== review.plan.sessionStateHash) throw Error('Approved browser state changed');
  const browser = await chromium.launch({ headless: true }), sessionId = randomUUID(), pages: unknown[] = []; let metrics: Awaited<ReturnType<Awaited<ReturnType<typeof installReviewedBrowserBoundary>>['finish']>> | undefined;
  try {
    const context = await browser.newContext({ storageState: before.statePath, serviceWorkers: 'block', acceptDownloads: false });
    await (input.verifyContext ?? verifyActualContext)(context, input.statePath, review, authority.policy, identity, input.apiOrigin); await input.prepareContext?.(context);
    const lightning = review.plan.origins.find(origin => new URL(origin).hostname.endsWith('.lightning.force.com')); if (!lightning) throw Error('Approved Lightning origin required');
    const build = input.nativeBuild ? await input.nativeBuild(context) : await (async () => { const home = await context.request.get(`${lightning}/lightning/page/home`, { maxRedirects: 0, timeout: 15000 }); if (home.status() !== 200 || !home.headers()['content-type']?.includes('text/html') || Number(home.headers()['content-length'] ?? 0) > 2000000) throw Error('Native build proof unavailable'); return parseBrowserBuild(await home.text()); })();
    if (!sameSalesforceIdentity(build.orgId, identity.Id) || !sameSalesforceIdentity(build.userId, identity.userId)) throw Error('Native browser build identity mismatch');
    authorizeBrowserSession(review, input.parent, identity, build);
    const policyHash = browserPlanHash(review.plan); reserveBrowserSession(review, input.history, sessionId);
    const boundary = await installReviewedBrowserBoundary(context, { review, parent: input.parent, identity, build, history: input.history, records: preflight.references, resourceFetch: input.resourceFetch,transport:input.transport });
    const selected = preflight.privateDisplays.filter(record => !input.object || record.object === input.object); if (!selected.length) throw Error('Object is outside the approved browser reference scope');
    for (const record of selected) {
      const page = await context.newPage(), document = `${lightning}/lightning/r/${record.object}/${record.id}/view`; let exactHeading = 0, exactText = 0, visible = false, nativeDocumentVerified = false,phase='navigation',failure:unknown;
      try { const response = await page.goto(document, { waitUntil: 'domcontentloaded', timeout: Math.min(30000, boundary.budget.remaining()) });
        phase='record-document-proof';if (response?.status() === 200) { const actual = parseBrowserBuild(await response.text()); nativeDocumentVerified = sameSalesforceIdentity(actual.orgId, identity.Id) && sameSalesforceIdentity(actual.userId, identity.userId) && actual.buildHash === review.plan.buildHash && actual.appHash === review.plan.appHash; }
        if (!nativeDocumentVerified) throw Error('Record document build/identity differs');
        phase='expected-name-observation';const text = page.getByText(record.display, { exact: true }); await text.first().waitFor({ state: 'visible', timeout: boundary.budget.remaining() }); exactHeading = await page.getByRole('heading', { name: record.display, exact: true }).count(); exactText = await text.count(); visible = exactText === 1 && await text.first().isVisible();
      } catch(error) {failure={phase,errorClass:error instanceof Error&&['Error','TimeoutError'].includes(error.name)?error.name:'other'};}
      pages.push({ object: record.object, recordHash: digest(record.id), displayHash: digest(record.display), approvedDocument: browserDocument(review.plan, page.url(), preflight.references),nativeDocumentVerified,finalPage:browserLocationClass(review,page.url()),failure,exactHeadingMatches: exactHeading, exactTextMatches: exactText, recordNameVisible: visible, originalAssertionsChanged: false });
    }
    metrics = await boundary.finish(); input.history.db.prepare("UPDATE browser_execution_sessions SET status='observed' WHERE policy=? AND nonce=?").run(policyHash, sessionId);
  } finally { await browser.close(); }
  const after = await input.verifyReferences();
  const versions = z.object({referenceVersions:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1)});
  const beforeVersions=versions.safeParse(preflight.proof),afterVersions=versions.safeParse(after.proof);
  const referenceUnchanged=beforeVersions.success&&afterVersions.success?fingerprint(beforeVersions.data.referenceVersions)===fingerprint(afterVersions.data.referenceVersions):'not-measured';
  const referenceComparison = input.reference && metrics ? compareBrowserTraces(input.reference, metrics.trace) : { status: 'normal-reference-not-provided', rootCause: 'unresolved' };
  return { validation: input.prepareContext || input.verifyContext || input.resourceFetch || input.nativeBuild ? 'offline-mocked-salesforce' : 'live-salesforce', mode: review.plan.mode, sessionId, pages, metrics, referenceComparison, referenceUnchanged, integrityScope:'approved-record-name-and-last-modified-only', undocumentedServerEffectsEstablished:false, recordsCreated: 0, recordsDeleted: 0, agentActions: 0, generatedTestsExecuted: 0, verifiedLearning: false, renderingCause: 'unresolved' };
}
