import {launchLocalBrowser} from './local-browser.js';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { chromium } from '@playwright/test';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';
import { History } from '../core/history.js';
import { SalesforceClient } from '../salesforce/client.js';
import { BrowserReviewSchema, authorizeBrowserSession, resolveBrowserRecords,type BrowserRecord } from './browser-policy.js';
import { BrowserActionBroker } from './browser-actions.js';
import { WorkflowSchema } from '../agents/workflows.js';
import { EnvironmentPolicySchema, type EnvironmentIdentity } from './environment.js';
import {resolveLocator} from '../core/locators.js';
import { readPrivateSessionState } from '../integrations/session-gate.js';
import { verifyActualContext, attachReviewedBrowserContext } from './browser-runtime.js';

import { proveReviewedBrowserBuild } from './browser-build.js';
import {attachBrowserDebug,type DebugReason} from './browser-debug.js';
import {loadPreferredChromeProfile} from './dedicated-chrome-profile.js';
import {withBrowserStage,browserErrorDiagnostic,BrowserStageError,type BrowserStageObserver} from './browser-diagnostics.js';
export { proveReviewedBrowserBuild } from './browser-build.js';
export async function preflightReviewedBrowser(raw: unknown, parent: unknown, identity: EnvironmentIdentity, statePath: string, apiOrigin: string, observer?:BrowserStageObserver) {
  let browser:Awaited<ReturnType<typeof launchLocalBrowser>>|undefined,failed=false;
  const sanitized=(error:unknown)=>{const diagnostic=browserErrorDiagnostic(error);return diagnostic?new BrowserStageError(diagnostic):Error('Browser preflight denied; provider details withheld');};
  try {
    const {review,authority}=await withBrowserStage(observer,'authorization',async()=>{const review=BrowserReviewSchema.parse(raw);return{review,authority:authorizeBrowserSession(review,parent,identity,review.plan)};});
    const source=await withBrowserStage(observer,'storage-state',async()=>{const source=await readPrivateSessionState(statePath);if(source.hash!==review.plan.sessionStateHash)throw Error('Reviewed state changed');return source;});
    const ownedBrowser=browser=await withBrowserStage(observer,'browser-launch',()=>launchLocalBrowser());
    const context = await withBrowserStage(observer,'context-create',()=>ownedBrowser.newContext({ storageState: source.statePath, javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false }));
    await withBrowserStage(observer,'context-identity',()=>verifyActualContext(context, statePath, review, authority.policy, identity, apiOrigin,observer));
    return await withBrowserStage(observer,'browser-build',()=>proveReviewedBrowserBuild(context, review, parent, identity));
  } catch(error){failed=true;throw sanitized(error);} finally {
    if(browser)try{await withBrowserStage(observer,'cleanup',()=>browser!.close());}catch(error){if(!failed)throw sanitized(error);}
  }
}
export async function openBrowserJournal(path: string) {
  const root = await realpath('.state'), file = await realpath(resolve(path)), rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Browser journal must stay in ignored workspace state');
  return new History(file);
}
const actionBrokers = new WeakMap<BrowserContext, BrowserActionBroker>();
type DebugReferences={references:BrowserRecord[];privateDisplays:Array<{object:'Account'|'Contact';id:string;display:string}>};
const debugContexts=new WeakMap<BrowserContext,{attached:Awaited<ReturnType<typeof attachReviewedBrowserContext>>;references:DebugReferences;runId:string}>();
export function installReviewedDebugHooks(context:BrowserContext,attached:Awaited<ReturnType<typeof attachReviewedBrowserContext>>,references:DebugReferences,runId:string){
  debugContexts.set(context,{attached,references,runId});
  const watch=(page:Page)=>{page.on('domcontentloaded',()=>{void attached.finishDocumentProofs().then(()=>attached.visual.watch(page,async()=>({nativeDocumentVerified:attached.recordDocumentVerified(page),records:references.references,privateValues:references.privateDisplays.map(r=>r.display)}))).catch(()=>{});});page.on('pageerror',()=>{void captureReviewedBrowserDebug(page,'rendering-failure').catch(()=>{});});};
  context.pages().forEach(watch);context.on('page',watch);context.once('close',()=>{debugContexts.delete(context);void attached.visual.report().catch(()=>{});});
}
export async function captureReviewedBrowserDebug(page:Page,reason:DebugReason,info?:Pick<TestInfo,'attach'>){
  const debug=debugContexts.get(page.context());if(!debug)return{status:'disabled' as const};
  await debug.attached.finishDocumentProofs();const entry=await debug.attached.visual.capture(page,{nativeDocumentVerified:debug.attached.recordDocumentVerified(page),records:debug.references.references,privateValues:debug.references.privateDisplays.map(r=>r.display)},reason);
  if(info)await attachBrowserDebug(info,entry,debug.runId);return entry;
}
export async function executeReviewedWorkflowStep(page: Page, workflowRaw: unknown, step: number) {
  const broker = actionBrokers.get(page.context()), workflow = WorkflowSchema.parse(workflowRaw); if (!broker) throw Error('Reviewed action context missing');
  return broker.execute(workflow, step, async () => { const item = workflow.steps[step],locator=resolveLocator(page,item.locator); return item.action === 'click' ? locator.click() : locator.fill(item.value!); });
}
// Generated tests use this sole network boundary. Native initialization has no
// connection to agent action permits and cannot acquire browser write authority.
export async function installDedicatedGuardFile(context: BrowserContext, path: string) {
  const config = JSON.parse(await readFile(path, 'utf8')) as { review: unknown; parent: unknown; statePath: string; ownershipJournal: string }, review = BrowserReviewSchema.parse(config.review), parent = EnvironmentPolicySchema.parse(config.parent);
  // Reject inactive/expired/cross-mode proposals before opening a journal or
  // authenticating. Fresh server identity is still proved below for valid grants.
  authorizeBrowserSession(review, parent, { Id: review.plan.orgId, userId: review.plan.userId, IsSandbox: false }, review.plan);
  const history = await openBrowserJournal(config.ownershipJournal);
  try {
    const client = await SalesforceClient.connectReviewedBrowser(parent, review, history), identity = await client.identity(), references = await client.verifyReferences();
    // Factory ownership is checked again in each actual generated-test context.
    if (JSON.stringify(resolveBrowserRecords(review.plan, history)) !== JSON.stringify(references.references)) throw Error('Generated browser ownership changed');
    const attached=await attachReviewedBrowserContext(context,{review,parent,identity,history,records:references.references,statePath:config.statePath,apiOrigin:client.apiOrigin,dedicatedChromeProfile:await loadPreferredChromeProfile(review)});
    installReviewedDebugHooks(context,attached,references,review.plan.runId);
    actionBrokers.set(context,attached.actions); context.once('close', () => { actionBrokers.delete(context);history.close(); });
  } catch { history.close(); throw Error('Reviewed generated browser context failed its identity, build, ownership or budget gates'); }
}
