import type {Page} from '@playwright/test';
import {fingerprint} from './browser-policy.js';
import {resolveLocator,type ReviewedLocator} from '../core/locators.js';
import type {ExplorationCheck,ExplorationObservation} from '../agents/exploration-ledger.js';
import type {PageFactsSchema} from '../agents/application-observations.js';
import type {z} from 'zod';
export type FixtureObservationHooks={
 beforeSession?:()=>void;
 sessionOpened?:(version:string)=>void;
 request?:(input:{document:boolean;method:string})=>void;
 observe?:(observation:ExplorationObservation)=>void|Promise<void>;
 beforeAction?:(input:{ref:number;path:string;stateHash:string})=>void;
 afterAction?:(input:{ref:number;before:string;after:string;path:string})=>void;
 failed?:(input:{ref?:number;category:string})=>void;
 stop?:()=>boolean;
 checks:Array<{id:string;criterionId:string;path:string;locator:ReviewedLocator;expectedText:string}>;
};
export async function fixtureStateHash(page:Page,elements:unknown){
 if(await page.locator('input,textarea,select,[contenteditable]').count()>200)throw Error('Form-state inspection budget exceeded');
 const forms=await page.locator('input,textarea,select,[contenteditable]').evaluateAll(nodes=>nodes.slice(0,200).map(node=>{const e=node as HTMLInputElement;return{tag:e.tagName,type:e.type,value:e.value??e.textContent,checked:e.checked};}));
 const visibleText=await page.locator('body').innerText();if(visibleText.length>20000||JSON.stringify(forms).length>65536)throw Error('Complete fixture state hash exceeds inspection budget');
 // Form values exist only in this loopback host calculation, never in a receipt.
 return fingerprint({path:new URL(page.url()).pathname,elements,visibleTextHash:fingerprint(visibleText),formHash:fingerprint(forms)});
}
export async function fixtureChecks(page:Page,checks:FixtureObservationHooks['checks']){
 const result:ExplorationCheck[]=[],path=new URL(page.url()).pathname;
 for(const c of checks.filter(c=>c.path===path)){const locator=resolveLocator(page,c.locator),matches=await locator.count(),visible=matches===1&&await locator.isVisible(),text=visible?await locator.textContent():undefined;result.push({id:c.id,criterionId:c.criterionId,expectedHash:fingerprint(c.expectedText),...(text!==undefined?{actualHash:fingerprint(text)}:{}),matches,visible,status:matches!==1||!visible?'unavailable':text===c.expectedText?'passed':'failed'});}
 return result;
}
export function fixtureObservation(input:{path:string;state:string;facts?:z.infer<typeof PageFactsSchema>;checks:ExplorationCheck[];mcpHash?:string;image?:{manifest:string;entry:{sha256?:string;file?:string}};network:Array<{kind:string;status?:number}>;console:string[]}):ExplorationObservation{
 const f=input.facts;return{path:input.path,stateHash:input.state,complete:!!f?.complete,errors:f?.visible.errors??0,loading:f?.visible.loading??0,checks:input.checks,locators:f?.locators??[],mcpHash:input.mcpHash??'',...(input.image?.entry.sha256&&input.image.entry.file?{image:{manifest:input.image.manifest,sha256:input.image.entry.sha256,file:input.image.entry.file}}:{}),network:input.network.slice(-200),console:input.console.slice(-100)};
}
export function consoleCategory(message:string){return/permission|access denied/i.test(message)?'permission':/network|fetch|connection/i.test(message)?'network':/TypeError|ReferenceError|exception/i.test(message)?'javascript':'application-error';}
