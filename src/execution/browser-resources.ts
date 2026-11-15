import type { History } from '../core/history.js';
import type { EnvironmentIdentity } from './environment.js';
import { authorizeBrowserSession, browserPlanHash, digest, resourceRule, type BrowserReview } from './browser-policy.js';

export class BrowserBudget {
  readonly started: number; requests = 0; bytes = 0; actions = 0;
  constructor(readonly review: BrowserReview, readonly now: () => number = Date.now) { this.started = now(); }
  check() { if (this.now() >= Math.min(this.started + this.review.plan.budgets.maxMs, Date.parse(this.review.approval.expiresAt))) throw Error('Browser duration or authorization expired'); }
  request() { this.check(); if (++this.requests > this.review.plan.budgets.requests) throw Error('Browser request budget exceeded'); }
  consume(bytes: number) { this.check(); if ((this.bytes += bytes) > this.review.plan.budgets.resourceBytes) throw Error('Browser resource-byte budget exceeded'); }
  action() { this.check(); if (++this.actions > this.review.plan.budgets.actions) throw Error('Browser agent-action budget exceeded'); }
  remaining() { return Math.max(1, Math.min(this.started + this.review.plan.budgets.maxMs, Date.parse(this.review.approval.expiresAt)) - this.now()); }
}
export type CachedResource = { status: number; headers: Record<string, string>; body: Buffer };

function contentType(type: string, mime: string) {
  if (mime.length > 200 || /[\r\n]/.test(mime)) return false;
  const value = mime.split(';')[0].trim().toLowerCase();
  return type === 'script' ? ['application/javascript', 'text/javascript', 'application/x-javascript'].includes(value) : type === 'stylesheet' ? value === 'text/css' : type === 'image' ? /^image\/(?:png|jpeg|gif|webp|svg\+xml|x-icon|vnd.microsoft.icon)$/.test(value) : /^(?:font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|vnd.ms-fontobject))$/.test(value);
}
export { contentType as validResourceContentType };
export function validatedResourceHeaders(raw: unknown, origins: string[], mime: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Resource cache headers are invalid');
  const headers = raw as Record<string, unknown>, allowed = ['content-type', 'x-content-type-options', 'access-control-allow-origin', 'cross-origin-resource-policy'];
  if (Object.keys(headers).some(key => !allowed.includes(key)) || headers['content-type'] !== mime || headers['x-content-type-options'] !== 'nosniff' || Object.values(headers).some(value => typeof value !== 'string' || /[\r\n]/.test(value)) || headers['access-control-allow-origin'] !== undefined && headers['access-control-allow-origin'] !== '*' && !origins.includes(String(headers['access-control-allow-origin'])) || headers['cross-origin-resource-policy'] !== undefined && !['same-origin', 'same-site', 'cross-origin'].includes(String(headers['cross-origin-resource-policy']))) throw Error('Resource cache header integrity failed');
  return headers as Record<string, string>;
}

// Persistent cache contains public first-party code/assets only. Never API,
// document, cookie-bearing, authenticated or Vary:Cookie responses.
export class BrowserResourceBroker {
  private namespace: string; private inflight = new Map<string, Promise<CachedResource>>();
  hits = 0; misses = 0; networkBytes = 0;
  constructor(private history: History, readonly review: BrowserReview, private parent: unknown, private identity: EnvironmentIdentity, private build: { buildHash: string; appHash: string }, readonly budget: BrowserBudget, private get: typeof fetch = fetch) {
    authorizeBrowserSession(review, parent, identity, build, budget.now());
    this.namespace = digest(JSON.stringify([review.plan.orgId, review.plan.userId, review.plan.buildHash, browserPlanHash(review.plan)]));
    history.db.exec('CREATE TABLE IF NOT EXISTS browser_resource_cache(namespace TEXT,url TEXT,kind TEXT,hash TEXT,mime TEXT,headers TEXT,body BLOB,expires INTEGER,used INTEGER,PRIMARY KEY(namespace,url,kind))');
  }
  async serve(request: { url: string; method: string; type: string }): Promise<CachedResource> {
    authorizeBrowserSession(this.review, this.parent, this.identity, this.build, this.budget.now()); this.budget.check();
    const rule = resourceRule(this.review.plan, request);
    if (!rule || this.review.plan.origins.includes(rule.origin)) throw Error('Public resource policy denied');
    const key = digest(request.url), cached = this.history.db.prepare('SELECT hash,mime,headers,body,expires FROM browser_resource_cache WHERE namespace=? AND url=? AND kind=?').get(this.namespace, key, rule.kind);
    if (cached && Number(cached.expires) > this.budget.now()) {
      const body = Buffer.from(cached.body as Uint8Array);
      if (body.length > this.review.plan.budgets.maxResourceBytes || digest(body) !== cached.hash || !contentType(rule.kind, String(cached.mime))) throw Error('Cached resource integrity failed');
      this.budget.consume(body.length); this.hits++;
      this.history.db.prepare('UPDATE browser_resource_cache SET used=? WHERE namespace=? AND url=? AND kind=?').run(this.budget.now(), this.namespace, key, rule.kind);
      return { status: 200, body, headers: validatedResourceHeaders(JSON.parse(String(cached.headers)), this.review.plan.origins, String(cached.mime)) };
    }
    // Concurrent script imports share one validated download, not a browser jar.
    const existing = this.inflight.get(key);
    if (existing) { const result = await existing; this.budget.consume(result.body.length); this.hits++; return result; }
    const work = this.download(request.url, rule.kind, cached?.hash as string | undefined, key); this.inflight.set(key, work);
    try { return await work; } finally { this.inflight.delete(key); }
  }
  private async download(url: string, kind: string, previousHash: string | undefined, key: string) {
    this.misses++;
    let response: Response;
    try { response = await this.get(url, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { Accept: kind === 'script' ? 'application/javascript,text/javascript' : kind === 'stylesheet' ? 'text/css' : '*/*', Origin: this.review.plan.origins.find(origin => new URL(origin).hostname.endsWith('.lightning.force.com')) ?? this.review.plan.origins[0] }, signal: AbortSignal.timeout(Math.min(15000, this.budget.remaining())) }); }
    catch { throw Error('Public resource transport unavailable; details withheld'); }
    if (response.status !== 200 || response.headers.has('set-cookie') || /cookie|authorization/i.test(response.headers.get('vary') ?? '')) throw Error('Public resource status, redirect or credential variance denied');
    const mime = response.headers.get('content-type') ?? '', limit = this.review.plan.budgets.maxResourceBytes;
    if (!contentType(kind, mime) || Number(response.headers.get('content-length') ?? 0) > limit || !response.body) throw Error('Resource MIME or size denied');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) throw Error('Resource size denied'); this.budget.consume(next.value.length); chunks.push(next.value); } }
    catch { await reader.cancel().catch(() => {}); throw Error('Resource body unavailable or over budget'); }
    const body = Buffer.concat(chunks), hash = digest(body);
    if (['script', 'stylesheet'].includes(kind) && /^\s*(?:<!doctype|<html|<script)/i.test(body.subarray(0, 256).toString('utf8'))) throw Error('HTML is not executable static code');
    if (previousHash && previousHash !== hash) throw Error('Resource content changed under an unchanged build; review required');
    authorizeBrowserSession(this.review, this.parent, this.identity, this.build, this.budget.now()); this.budget.check();
    const headers: Record<string, string> = { 'content-type': mime, 'x-content-type-options': 'nosniff' };
    const cors = response.headers.get('access-control-allow-origin'), corp = response.headers.get('cross-origin-resource-policy');
    if (cors === '*' || this.review.plan.origins.includes(cors ?? '')) headers['access-control-allow-origin'] = cors!;
    if (['same-origin', 'same-site', 'cross-origin'].includes(corp ?? '')) headers['cross-origin-resource-policy'] = corp!;
    this.networkBytes += size;
    this.history.db.prepare('INSERT OR REPLACE INTO browser_resource_cache VALUES(?,?,?,?,?,?,?,?,?)').run(this.namespace, key, kind, hash, mime, JSON.stringify(headers), body, Math.min(this.budget.now() + 300000, Date.parse(this.review.approval.expiresAt)), this.budget.now());
    while (Number(this.history.db.prepare('SELECT COALESCE(SUM(length(body)),0) AS bytes FROM browser_resource_cache').get()?.bytes) > 134217728 || Number(this.history.db.prepare('SELECT COUNT(*) AS count FROM browser_resource_cache').get()?.count) > 256) this.history.db.prepare('DELETE FROM browser_resource_cache WHERE rowid=(SELECT rowid FROM browser_resource_cache ORDER BY used LIMIT 1)').run();
    return { status: 200, headers, body };
  }
}
