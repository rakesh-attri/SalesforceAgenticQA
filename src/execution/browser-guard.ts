import type { BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';
import { History } from '../core/history.js';
import { SalesforceClient } from '../salesforce/client.js';
import { BrowserReviewSchema, authorizeBrowserSession, resolveBrowserRecords, reserveBrowserSession } from './browser-policy.js';
import { randomUUID } from 'node:crypto';
import { BrowserActionBroker } from './browser-actions.js';
import { WorkflowSchema } from '../agents/workflows.js';
import { EnvironmentPolicySchema, type EnvironmentIdentity } from './environment.js';
import { readPrivateSessionState } from '../integrations/session-gate.js';
import { verifyActualContext, installReviewedBrowserBoundary } from './browser-runtime.js';
import { parseBrowserBuild } from './browser-build.js';
import { sameSalesforceIdentity } from './lightning-identity.js';

export async function proveReviewedBrowserBuild(context: BrowserContext, raw: unknown, parent: unknown, identity: EnvironmentIdentity) {
  const review = BrowserReviewSchema.parse(raw), lightning = review.plan.origins.find(origin => new URL(origin).hostname.endsWith('.lightning.force.com'));
  if (!lightning) throw Error('Exact Lightning origin missing');
  const home = await context.request.get(`${lightning}/lightning/page/home`, { maxRedirects: 0, timeout: 15000 });
  if (home.status() !== 200 || !home.headers()['content-type']?.includes('text/html') || Number(home.headers()['content-length'] ?? 0) > 2000000) throw Error('Native Lightning build proof unavailable');
  const build = parseBrowserBuild(await home.text());
  if (!sameSalesforceIdentity(build.orgId, identity.Id) || !sameSalesforceIdentity(build.userId, identity.userId)) throw Error('Native build actor mismatch');
  authorizeBrowserSession(review, parent, identity, build); return build;
}
export async function preflightReviewedBrowser(raw: unknown, parent: unknown, identity: EnvironmentIdentity, statePath: string, apiOrigin: string) {
  const review = BrowserReviewSchema.parse(raw), authority = authorizeBrowserSession(review, parent, identity, review.plan), browser = await chromium.launch({ headless: true });
  try { const source = await readPrivateSessionState(statePath); if (source.hash !== review.plan.sessionStateHash) throw Error('Reviewed state changed');
    const context = await browser.newContext({ storageState: source.statePath, javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false });
    await verifyActualContext(context, statePath, review, authority.policy, identity, apiOrigin); return await proveReviewedBrowserBuild(context, review, parent, identity);
  } finally { await browser.close(); }
}
export async function openBrowserJournal(path: string) {
  const root = await realpath('.state'), file = await realpath(resolve(path)), rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Browser journal must stay in ignored workspace state');
  return new History(file);
}
const actionBrokers = new WeakMap<BrowserContext, BrowserActionBroker>();
export async function executeReviewedWorkflowStep(page: Page, workflowRaw: unknown, step: number) {
  const broker = actionBrokers.get(page.context()), workflow = WorkflowSchema.parse(workflowRaw); if (!broker) throw Error('Reviewed action context missing');
  return broker.execute(workflow, step, async () => { const item = workflow.steps[step], l = item.locator, locator = l.by === 'role' ? page.getByRole(l.value as 'button', { name: l.name ?? '', exact: true }) : l.by === 'label' ? page.getByLabel(l.value, { exact: true }) : page.getByTestId(l.value); return item.action === 'click' ? locator.click() : locator.fill(item.value!); });
}
// Generated tests use this sole network boundary. Native initialization has no
// connection to agent action permits and cannot acquire browser write authority.
export async function installDedicatedGuardFile(context: BrowserContext, path: string) {
  const config = JSON.parse(await readFile(path, 'utf8')) as { review: unknown; parent: unknown; statePath: string; ownershipJournal: string }, review = BrowserReviewSchema.parse(config.review), parent = EnvironmentPolicySchema.parse(config.parent), history = await openBrowserJournal(config.ownershipJournal);
  try {
    const client = await SalesforceClient.connectReviewedBrowser(parent, review, history), identity = await client.identity(), references = await client.verifyReferences();
    const authority = authorizeBrowserSession(review, parent, identity, review.plan); await verifyActualContext(context, config.statePath, review, authority.policy, identity, client.apiOrigin);
    const build = await proveReviewedBrowserBuild(context, review, parent, identity);
    // Factory ownership is checked again in each actual generated-test context.
    if (JSON.stringify(resolveBrowserRecords(review.plan, history)) !== JSON.stringify(references.references)) throw Error('Generated browser ownership changed');
    reserveBrowserSession(review, history, randomUUID());
    const boundary = await installReviewedBrowserBoundary(context, { review, parent, identity, build, history, records: references.references });
    actionBrokers.set(context, new BrowserActionBroker(history, review, parent, identity, build, boundary.budget)); context.once('close', () => { actionBrokers.delete(context); history.close(); });
  } catch { history.close(); throw Error('Reviewed generated browser context failed its identity, build, ownership or budget gates'); }
}
