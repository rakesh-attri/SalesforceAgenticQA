import type { BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DedicatedGuardSchema,installDedicatedBoundary } from '../../src/execution/dedicated-browser.js';
import type { DedicatedGuard } from '../../src/execution/dedicated-browser.js';
// Unit-only HTTPS response fixture. The real guard runs first and must permit the request before this response exists.
export async function installDedicatedGuardFile(context:BrowserContext,path:string) {
  const g=DedicatedGuardSchema.parse(JSON.parse(await readFile(path,'utf8')));
  await installFixtureResponses(context,g);await installDedicatedBoundary(context,g);
}
export async function installFixtureResponses(context:BrowserContext,g:DedicatedGuard) {
  await context.route('**/*',async route=>{const u=new URL(route.request().url()),record=g.owned.find(r=>u.pathname===`/lightning/r/${r.object}/${r.id}/view`);if(!record)return route.abort();
    const text=(record.display??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><h1>${text}</h1><div data-testid="owned-detail">Synthetic owned ${record.object}</div>`});
  });
}
