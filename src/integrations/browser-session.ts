import { chromium, type Page } from '@playwright/test';
import { mkdir, chmod,realpath } from 'node:fs/promises';
import { resolve, relative,isAbsolute } from 'node:path';
export async function createBrowserSession(input:{origin:string;allowedOrigins:string[];persona:string;reviewer:string;authenticate:(page:Page)=>Promise<void>;verify:(page:Page)=>Promise<boolean>;root?:string}) {
  const origin=new URL(input.origin);
  if(origin.protocol!=='https:'||!input.allowedOrigins.includes(origin.origin)||!input.reviewer.trim()||!input.persona.match(/^[a-zA-Z0-9_-]+$/)) throw Error('Approved persona and HTTPS origin required');
  const root=resolve(input.root??'.auth'),file=resolve(root,`${input.persona}.json`);
  const intended=relative(resolve('.auth'),file);if(intended.startsWith('..')||isAbsolute(intended)) throw Error('Sessions must remain inside ignored .auth');
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext();
    await context.route('**/*',async route=>{const u=new URL(route.request().url());if(input.allowedOrigins.includes(u.origin)) await route.continue();else await route.abort();});
    const page=await context.newPage();await page.goto(origin.href);
    // Authenticator is an explicitly reviewed org-specific function, never inferred from JWT.
    await input.authenticate(page);
    if(!input.allowedOrigins.includes(new URL(page.url()).origin)||!await input.verify(page)) throw Error('Authenticated persona not verified');
    await mkdir(root,{recursive:true});const actual=relative(await realpath('.auth'),await realpath(root));if(actual.startsWith('..')||isAbsolute(actual))throw Error('Session directory resolves outside .auth');await context.storageState({path:file});await chmod(file,0o600);
    return {file,persona:input.persona,reviewer:input.reviewer,verifiedAt:new Date().toISOString()};
  } finally {await browser.close();}
}
