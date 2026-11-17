import {launchLocalBrowser} from '../execution/local-browser.js';
import { chromium } from '@playwright/test';
import { createHash,randomUUID } from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createConnection} from '@playwright/mcp';
import { z } from 'zod';
import { WorkflowSchema } from './workflows.js';
import {resolveLocator} from '../core/locators.js';
export const FixtureExplorationSchema=z.object({mode:z.literal('FIXTURE'),syntheticOnly:z.literal(true),origin:z.string().url(),reviewer:z.string().trim().min(1),source:z.string().min(1),paths:z.array(z.string().startsWith('/')).min(1).max(10),actions:z.array(z.object({path:z.string().startsWith('/'),locator:WorkflowSchema.shape.assertion.shape.locator,action:z.enum(['click','fill']),value:z.string().optional()})).max(30),maxActions:z.number().int().min(0).max(30).default(10),maxMs:z.number().int().min(1).max(60000).default(15000)}).strict();
export async function exploreFixture(raw:unknown,services?:{mcpObservation?:boolean;choose?:(state:{stateHash:string;candidateRefs:number[];actionsRemaining:number})=>Promise<number|undefined>}) {
  const input=FixtureExplorationSchema.parse(raw),origin=new URL(input.origin);
  if(!['http:','https:'].includes(origin.protocol)||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.origin!==input.origin)throw Error('Dynamic exploration is restricted to explicitly synthetic loopback fixtures');
  for(const path of [...input.paths,...input.actions.map(a=>a.path)])if(new URL(path,input.origin).origin!==origin.origin||path.includes('..'))throw Error('Fixture exploration path escaped origin');
  if(input.actions.some(a=>!input.paths.includes(a.path)||(a.action==='fill'&&a.value===undefined)))throw Error('Fixture action lacks a reviewed page/value');
  const browser=await launchLocalBrowser(),deadline=Date.now()+input.maxMs;let actions=0,blockedRequests=0;
  const budgetTimer=setTimeout(()=>{void browser.close().catch(()=>{});},input.maxMs);budgetTimer.unref();
  const observations:Array<{path:string;state:string;elements:Array<{testId:string;text:string|null}>}>=[],transitions:Array<{path:string;before:string;after:string;action:number}>=[];
  let mcpClient:Client|undefined,mcpServer:Awaited<ReturnType<typeof createConnection>>|undefined;const mcpHashes:string[]=[],executed=new Set<number>();
  try {const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});await context.routeWebSocket('**/*',socket=>{blockedRequests++;socket.close();});await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin.origin)return route.continue();blockedRequests++;return route.abort();});
    if(services?.mcpObservation){type McpContext=Awaited<ReturnType<NonNullable<Parameters<typeof createConnection>[1]>>>;mcpServer=await createConnection({browser:{isolated:false,launchOptions:{headless:true}},capabilities:['core','core-navigation'],saveSession:false,webmcp:false,codegen:'none',ignoreRoots:true,allowUnrestrictedFileAccess:false,outputDir:`.state/fixture-mcp-${randomUUID()}`,snapshot:{mode:'none'},imageResponses:'omit',timeouts:{navigation:5000,action:5000}},async()=>context as unknown as McpContext);mcpClient=new Client({name:'sfqa-private-fixture-observer',version:'1.0.0'});const [a,b]=InMemoryTransport.createLinkedPair();await mcpServer.connect(a);await mcpClient.connect(b);}
    for(const path of input.paths){if(Date.now()>=deadline)break;const page=await context.newPage();
      try {await page.goto(new URL(path,input.origin).href,{timeout:Math.max(1,deadline-Date.now())});
        const capture=async()=>{const elements=await page.locator('[data-testid]').evaluateAll(nodes=>nodes.slice(0,100).map(n=>({testId:n.getAttribute('data-testid')!,text:n.textContent?.slice(0,512)??null}))),state=createHash('sha256').update(JSON.stringify(elements)).digest('hex');observations.push({path,state,elements});if(mcpClient){if(browser.contexts().length!==1||!context.pages().includes(page))throw Error('Fixture MCP context differs');const observed=await mcpClient.callTool({name:'browser_snapshot',arguments:{}},undefined,{timeout:Math.max(1,deadline-Date.now())});if(observed.isError)throw Error('Fixture MCP observation failed');mcpHashes.push(createHash('sha256').update(JSON.stringify(observed)).digest('hex'));}return state;};
        let before=await capture();while(actions<input.maxActions&&Date.now()<deadline){const candidateRefs=input.actions.flatMap((a,i)=>a.path===path&&!executed.has(i)?[i]:[]);if(!candidateRefs.length)break;let selected:number|undefined=candidateRefs[0];if(services?.choose){let timer:ReturnType<typeof setTimeout>|undefined;try{selected=await Promise.race([services.choose({stateHash:before,candidateRefs,actionsRemaining:input.maxActions-actions}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Fixture choice budget exceeded')),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}}if(selected===undefined)break;if(!candidateRefs.includes(selected))throw Error('Explorer selected an unreviewed or replayed action');const action=input.actions[selected];executed.add(selected);
          const locator=resolveLocator(page,action.locator);
          if(await locator.count()!==1||!await locator.isVisible())throw Error('Fixture action locator is absent or ambiguous; no repair attempted');
          if(action.action==='fill')await locator.fill(action.value!,{timeout:Math.max(1,deadline-Date.now())});else await locator.click({timeout:Math.max(1,deadline-Date.now())});actions++;
          const after=await capture();transitions.push({path,before,after,action:actions});before=after;
        }
      }finally{await page.close();}
    }
    return {mode:'offline-synthetic-fixture',status:'observed-needs-workflow-review',reviewer:input.reviewer,source:input.source,observations,transitions,actions,blockedRequests,budgetExhausted:Date.now()>=deadline||actions>=input.maxActions,productionSupported:false,executedActionRefs:[...executed],mcp:{sameContext:!!mcpClient,observationHashes:mcpHashes},executionAuthorityGranted:false};
  }finally{clearTimeout(budgetTimer);await mcpClient?.close().catch(()=>{});await mcpServer?.close().catch(()=>{});await browser.close();}
}
