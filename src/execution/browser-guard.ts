import type { BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';
import { History } from '../core/history.js';
import { SalesforceClient } from '../salesforce/client.js';
import { BrowserReviewSchema, authorizeBrowserSession, resolveBrowserRecords } from './browser-policy.js';
import { BrowserActionBroker } from './browser-actions.js';
import { WorkflowSchema } from '../agents/workflows.js';
import { EnvironmentPolicySchema, type EnvironmentIdentity } from './environment.js';
import {resolveLocator} from '../core/locators.js';
import { readPrivateSessionState } from '../integrations/session-gate.js';
import { verifyActualContext, attachReviewedBrowserContext } from './browser-runtime.js';

import { proveReviewedBrowserBuild } from './browser-build.js';
export { proveReviewedBrowserBuild } from './browser-build.js';
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
  return broker.execute(workflow, step, async () => { const item = workflow.steps[step],locator=resolveLocator(page,item.locator); return item.action === 'click' ? locator.click() : locator.fill(item.value!); });
}
// Generated tests use this sole network boundary. Native initialization has no
// connection to agent action permits and cannot acquire browser write authority.
export async function installDedicatedGuardFile(context: BrowserContext, path: string) {
  const config = JSON.parse(await readFile(path, 'utf8')) as { review: unknown; parent: unknown; statePath: string; ownershipJournal: string }, review = BrowserReviewSchema.parse(config.review), parent = EnvironmentPolicySchema.parse(config.parent), history = await openBrowserJournal(config.ownershipJournal);
  try {
    const client = await SalesforceClient.connectReviewedBrowser(parent, review, history), identity = await client.identity(), references = await client.verifyReferences();
    // Factory ownership is checked again in each actual generated-test context.
    if (JSON.stringify(resolveBrowserRecords(review.plan, history)) !== JSON.stringify(references.references)) throw Error('Generated browser ownership changed');
    const attached=await attachReviewedBrowserContext(context,{review,parent,identity,history,records:references.references,statePath:config.statePath,apiOrigin:client.apiOrigin});
    actionBrokers.set(context,attached.actions); context.once('close', () => { actionBrokers.delete(context); history.close(); });
  } catch { history.close(); throw Error('Reviewed generated browser context failed its identity, build, ownership or budget gates'); }
}
