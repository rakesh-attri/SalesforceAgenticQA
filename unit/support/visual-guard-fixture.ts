import type {BrowserContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {BrowserReviewSchema} from '../../src/execution/browser-policy.js';
import {parseBrowserBuild} from '../../src/execution/browser-build.js';
import {attachReviewedBrowserContext} from '../../src/execution/browser-runtime.js';
import {History} from '../../src/core/history.js';
import {installReviewedDebugHooks} from '../../src/execution/browser-guard.js';
export {captureReviewedBrowserDebug} from '../../src/execution/browser-guard.js';

// Unit-only identity/transport adapter; generated tests retain the real shared
// boundary, native document parser, visual hooks and installed reporter.
export async function installDedicatedGuardFile(context:BrowserContext,path:string){
  const input=JSON.parse(await readFile(path,'utf8')),review=BrowserReviewSchema.parse(input.review),history=new History(':memory:'),references={references:review.plan.records,privateDisplays:review.plan.records.map(r=>({object:r.object,id:r.id,display:'Synthetic Account'})),proof:{}};
  try{const attached=await attachReviewedBrowserContext(context,{review,parent:input.parent,history,identity:{Id:review.plan.orgId,userId:review.plan.userId,IsSandbox:false},records:references.references,statePath:input.statePath,apiOrigin:review.plan.origins[0],verifyContext:async()=>{},nativeBuild:async()=>parseBrowserBuild(input.native),prepareContext:async ctx=>{await ctx.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html>${input.native}<h1>Synthetic Account</h1><p>Independent local fixture content</p>`}));}});installReviewedDebugHooks(context,attached,references,review.plan.runId);context.once('close',()=>history.close());}catch(error){history.close();throw error;}
}
