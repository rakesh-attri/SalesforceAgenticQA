import {launchLocalBrowser} from '../execution/local-browser.js';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WorkflowSchema } from './workflows.js';
import {resolveLocator} from '../core/locators.js';
export const FixtureExplorationSchema=z.object({mode:z.literal('FIXTURE'),syntheticOnly:z.literal(true),origin:z.string().url(),reviewer:z.string().trim().min(1),source:z.string().min(1),paths:z.array(z.string().startsWith('/')).min(1).max(10),actions:z.array(z.object({path:z.string().startsWith('/'),locator:WorkflowSchema.shape.assertion.shape.locator,action:z.enum(['click','fill']),value:z.string().optional()})).max(30),maxActions:z.number().int().min(0).max(30).default(10),maxMs:z.number().int().min(1).max(60000).default(15000)}).strict();
export async function exploreFixture(raw:unknown) {
  const input=FixtureExplorationSchema.parse(raw),origin=new URL(input.origin);
  if(!['http:','https:'].includes(origin.protocol)||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.origin!==input.origin)throw Error('Dynamic exploration is restricted to explicitly synthetic loopback fixtures');
  for(const path of [...input.paths,...input.actions.map(a=>a.path)])if(new URL(path,input.origin).origin!==origin.origin||path.includes('..'))throw Error('Fixture exploration path escaped origin');
  if(input.actions.some(a=>!input.paths.includes(a.path)||(a.action==='fill'&&a.value===undefined)))throw Error('Fixture action lacks a reviewed page/value');
  const browser=await launchLocalBrowser(),deadline=Date.now()+input.maxMs;let actions=0,blockedRequests=0;
  const observations:Array<{path:string;state:string;elements:Array<{testId:string;text:string|null}>}>=[],transitions:Array<{path:string;before:string;after:string;action:number}>=[];
  try {const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});await context.routeWebSocket('**/*',socket=>{blockedRequests++;socket.close();});await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin.origin)return route.continue();blockedRequests++;return route.abort();});
    for(const path of input.paths){if(Date.now()>=deadline)break;const page=await context.newPage();
      try {await page.goto(new URL(path,input.origin).href,{timeout:Math.max(1,deadline-Date.now())});
        const capture=async()=>{const elements=await page.locator('[data-testid]').evaluateAll(nodes=>nodes.slice(0,100).map(n=>({testId:n.getAttribute('data-testid')!,text:n.textContent?.slice(0,512)??null}))),state=createHash('sha256').update(JSON.stringify(elements)).digest('hex');observations.push({path,state,elements});return state;};
        let before=await capture();for(const action of input.actions.filter(a=>a.path===path)){if(actions>=input.maxActions||Date.now()>=deadline)break;
          const locator=resolveLocator(page,action.locator);
          if(await locator.count()!==1||!await locator.isVisible())throw Error('Fixture action locator is absent or ambiguous; no repair attempted');
          if(action.action==='fill')await locator.fill(action.value!,{timeout:Math.max(1,deadline-Date.now())});else await locator.click({timeout:Math.max(1,deadline-Date.now())});actions++;
          const after=await capture();transitions.push({path,before,after,action:actions});before=after;
        }
      }finally{await page.close();}
    }
    return {mode:'offline-synthetic-fixture',status:'observed-needs-workflow-review',reviewer:input.reviewer,source:input.source,observations,transitions,actions,blockedRequests,budgetExhausted:Date.now()>=deadline||actions>=input.maxActions,productionSupported:false};
  }finally{await browser.close();}
}
