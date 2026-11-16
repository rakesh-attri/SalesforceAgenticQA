import {launchLocalBrowser} from '../execution/local-browser.js';
import { createHash } from 'node:crypto';
import { readFile,writeFile,chmod,realpath } from 'node:fs/promises';
import { resolve,relative,dirname,isAbsolute } from 'node:path';
import { chromium,type Page } from '@playwright/test';
import { z } from 'zod';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
export const BrowserIdentitySchema=z.object({orgId:Id,userId:Id,persona:z.string().trim().min(1)});
export type BrowserIdentity=z.infer<typeof BrowserIdentitySchema>;
export const SessionReceiptSchema=BrowserIdentitySchema.extend({statePath:z.string(),hash:z.string().regex(/^[a-f0-9]{64}$/),origins:z.array(z.string().url()).min(1),reviewer:z.string().trim().min(1),verifiedAt:z.string().datetime(),expiresAt:z.string().datetime()});
export type SessionReceipt=z.infer<typeof SessionReceiptSchema>;
async function privatePath(path:string) {
  const root=await realpath(resolve('.auth')),absolute=await realpath(resolve(path)),rel=relative(root,absolute);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Session state must resolve inside ignored .auth');
  return absolute;
}
function privateJson(text:string):unknown {try{return JSON.parse(text);}catch{throw Error('Private session JSON is malformed; content withheld.');}}
export async function readPrivateSessionState(path:string) {
  const statePath=await privatePath(path),bytes=await readFile(statePath);
  if(!z.object({cookies:z.array(z.unknown()),origins:z.array(z.unknown())}).safeParse(privateJson(bytes.toString())).success)throw Error('Invalid private session state; content withheld.');
  return {statePath,hash:createHash('sha256').update(bytes).digest('hex')};
}
export async function writePrivateSessionReceipt(path:string,input:SessionReceipt) {
  const receipt=SessionReceiptSchema.parse(input),file=resolve(path),rel=relative(await realpath('.auth'),file);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Receipt must stay inside .auth');
  const parent=relative(await realpath('.auth'),await realpath(dirname(file)));if(parent.startsWith('..')||isAbsolute(parent))throw Error('Receipt directory resolves outside .auth');
  await writeFile(file,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});await chmod(file,0o600);return file;
}
export function assertSessionScope(receipt:SessionReceipt,expected:BrowserIdentity,origins:string[],now=Date.now()) {
  if(receipt.orgId!==expected.orgId||receipt.userId!==expected.userId||receipt.persona!==expected.persona)throw Error('Browser persona/org mismatch');
  const verified=Date.parse(receipt.verifiedAt),expires=Date.parse(receipt.expiresAt);
  if(verified>now||expires<=now||expires-verified>60*60*1000)throw Error('Browser session verification expired or invalid');
  if(origins.some(o=>{const u=new URL(o);return u.protocol!=='https:'||u.origin!==o||!receipt.origins.includes(o);}))throw Error('Unapproved browser origin');
}
export async function checkSessionReceipt(path:string,expected:BrowserIdentity,origins:string[]) {
  const parsed=SessionReceiptSchema.safeParse(privateJson(await readFile(await privatePath(path),'utf8')));if(!parsed.success)throw Error('Invalid private session receipt; content withheld.');const receipt=parsed.data;assertSessionScope(receipt,expected,origins);
  const statePath=await privatePath(receipt.statePath),bytes=await readFile(statePath);
  if(createHash('sha256').update(bytes).digest('hex')!==receipt.hash)throw Error('Browser state changed since verification');
  if(!z.object({cookies:z.array(z.unknown()),origins:z.array(z.unknown())}).safeParse(privateJson(bytes.toString())).success)throw Error('Invalid private session state; content withheld.');
  return {...receipt,statePath};
}
export async function probeSession(statePath:string,origin:string,allowedOrigins:string[],probe:(page:Page)=>Promise<BrowserIdentity>,verifySandbox?:()=>Promise<{Id:string;IsSandbox:boolean}>) {
  if(!allowedOrigins.includes(origin)||allowedOrigins.some(o=>{const u=new URL(o);return u.protocol!=='https:'||u.origin!==o;}))throw Error('HTTPS session probe origins required');
  if(!verifySandbox||(await verifySandbox()).IsSandbox!==true)throw Error('General session probes require a verified sandbox; production callbacks are forbidden');
  await readPrivateSessionState(statePath);
  const browser=await launchLocalBrowser();
  try {const context=await browser.newContext({storageState:await privatePath(statePath),serviceWorkers:'block'});
    await context.route('**/*',route=>allowedOrigins.includes(new URL(route.request().url()).origin)?route.continue():route.abort());
    const page=await context.newPage();await page.goto(origin);
    const identity=BrowserIdentitySchema.parse(await probe(page));if(!allowedOrigins.includes(new URL(page.url()).origin))throw Error('Session probe redirected outside boundary');return identity;
  }catch{throw Error('Sandbox browser probe failed; private session/provider details withheld.');}
  finally{await browser.close();}
}
export async function issueSessionReceipt(input:{statePath:string;identity:BrowserIdentity;origins:string[];reviewer:string;ttlMs:number;probe:(page:Page)=>Promise<BrowserIdentity>;receiptPath:string;verifySandbox?:()=>Promise<{Id:string;IsSandbox:boolean}>}) {
  if(input.ttlMs<=0||input.ttlMs>3600000)throw Error('Session lifetime must be bounded to one hour');
  BrowserIdentitySchema.parse(input.identity);if(!input.reviewer.trim())throw Error('Session review required');
  const before=await readFile(await privatePath(input.statePath));
  const identity=await probeSession(input.statePath,input.origins[0],input.origins,input.probe,input.verifySandbox);
  const bytes=await readFile(await privatePath(input.statePath)),now=Date.now();
  if(!before.equals(bytes))throw Error('Session state changed during persona verification');
  const receipt=SessionReceiptSchema.parse({...identity,statePath:input.statePath,origins:input.origins,reviewer:input.reviewer,hash:createHash('sha256').update(bytes).digest('hex'),verifiedAt:new Date(now).toISOString(),expiresAt:new Date(now+input.ttlMs).toISOString()});
  assertSessionScope(receipt,input.identity,input.origins);
  return writePrivateSessionReceipt(input.receiptPath,receipt);
}
