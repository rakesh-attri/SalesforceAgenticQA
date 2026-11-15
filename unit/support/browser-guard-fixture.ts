import type { BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { BrowserReviewSchema, resolveBrowserRecords, reserveBrowserSession } from '../../src/execution/browser-policy.js';
import { installReviewedBrowserBoundary } from '../../src/execution/browser-runtime.js';
import { openBrowserJournal } from '../../src/execution/browser-guard.js';
import { EnvironmentPolicySchema } from '../../src/execution/environment.js';
import { randomUUID } from 'node:crypto';
import type { History } from '../../src/core/history.js';

// Unit-only Salesforce transport/identity fixture, never a live authentication
// adapter. The production boundary still makes every browser network decision.
export async function installFixtureDocuments(context: BrowserContext, history: History) {
  await context.route('**/*', route => {
    const id=new URL(route.request().url()).pathname.split('/').at(-2),row=history.db.prepare('SELECT object,values_json FROM dedicated_records WHERE id=?').get(id??'');
    if(!row)return route.abort();
    const values=JSON.parse(String(row.values_json)),text=String(row.object==='Account'?values.Name:values.LastName).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    return route.fulfill({contentType:'text/html',body:`<!doctype html><h1>${text}</h1>`});
  });
}
export async function installDedicatedGuardFile(context: BrowserContext, path: string) {
  const config=JSON.parse(await readFile(path,'utf8')),review=BrowserReviewSchema.parse(config.review),parent=EnvironmentPolicySchema.parse(config.parent),history=await openBrowserJournal(config.ownershipJournal);
  try {
    const identity={Id:review.plan.orgId,userId:review.plan.userId,IsSandbox:false};
    await installFixtureDocuments(context,history);reserveBrowserSession(review,history,randomUUID());
    await installReviewedBrowserBoundary(context,{review,parent,identity,build:review.plan,history,records:resolveBrowserRecords(review.plan,history)});
    context.once('close',()=>history.close());
  }catch(error){history.close();throw error;}
}
