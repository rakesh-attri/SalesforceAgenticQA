import {z} from 'zod';
import type {Page} from '@playwright/test';
import type {History} from '../core/history.js';
import {LocatorSchema,resolveLocator} from '../core/locators.js';
import {fingerprint} from '../execution/browser-policy.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const FixtureApplicationScopeSchema=z.object({org:z.string().min(1),permission:z.string().min(1),metadataVersion:Hash,objectsByPath:z.record(z.string(),z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/))}).strict();
export const PageFactsSchema=z.object({path:z.string(),state:Hash,complete:z.boolean(),visible:z.object({tabs:z.number(),actions:z.number(),relatedLists:z.number(),errors:z.number(),loading:z.number()}),locators:z.array(LocatorSchema).max(60),componentTags:z.array(z.string()).max(60),unknowns:z.array(z.string())}).strict();
export async function collectFixturePageFacts(page:Page,state:string){
 const url=new URL(page.url());if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Synthetic page facts require loopback');
 const nodes=page.locator('*'),count=await nodes.count(),raw=await nodes.evaluateAll(nodes=>nodes.slice(0,512).map(node=>{const e=node as HTMLElement,tag=e.tagName.toLowerCase(),role=e.getAttribute('role')??(tag==='button'?'button':tag==='a'?'link':/^h[1-6]$/.test(tag)?'heading':''),testId=e.getAttribute('data-testid'),name=(e.getAttribute('aria-label')??e.textContent??'').trim().slice(0,120),labels=(e as HTMLInputElement).labels;return{tag,role,testId,name,label:labels?.[0]?.textContent?.trim().slice(0,120)};})),locators:z.infer<typeof LocatorSchema>[]=[],seen=new Set<string>();let tabs=0,actions=0,relatedLists=0,errors=0,loading=0;
 for(const node of raw){const candidates:z.infer<typeof LocatorSchema>[]=[];if(node.testId&&/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(node.testId))candidates.push({by:'testId',value:node.testId});if(['tab','button','link','heading','region','group','status','alert'].includes(node.role)&&node.name)candidates.push({by:'role',value:node.role,name:node.name});if(node.label)candidates.push({by:'label',value:node.label});
  for(const candidate of candidates){const key=fingerprint(candidate);if(seen.has(key)||locators.length>=60)continue;seen.add(key);const locator=resolveLocator(page,candidate);if(await locator.count()!==1||!await locator.isVisible())continue;locators.push(candidate);if(candidate.by==='role'){if(candidate.value==='tab')tabs++;if(['button','link'].includes(candidate.value))actions++;if(candidate.value==='region')relatedLists++;if(candidate.value==='alert')errors++;}}
 }
 const loaders=page.locator('[aria-busy="true"],[role="progressbar"],.slds-spinner'),alerts=page.locator('[role="alert"],[role="alertdialog"]'),loaderCount=await loaders.count(),alertCount=await alerts.count();errors=0;for(let i=0;i<Math.min(loaderCount,100);i++)if(await loaders.nth(i).isVisible())loading++;for(let i=0;i<Math.min(alertCount,100);i++)if(await alerts.nth(i).isVisible())errors++;
 return PageFactsSchema.parse({path:url.pathname,state,complete:count<=512&&locators.length<60&&loaderCount<=100&&alertCount<=100,visible:{tabs,actions,relatedLists,errors,loading},locators,componentTags:[...new Set(raw.map(n=>n.tag).filter(tag=>tag.includes('-')))].slice(0,60),unknowns:['Closed/inaccessible component internals remain unknown; visible affordances grant no action authority.',...(count>512?['DOM inspection node bound reached']:[]),...(locators.length>=60?['Locator bound reached']:[]),...(loaderCount>100||alertCount>100?['Loading/error inspection bound reached']:[])]});
}
export function recordFixtureApplicationObservation(history:History,scopeRaw:unknown,report:unknown){
 const scope=FixtureApplicationScopeSchema.parse(scopeRaw),payload={scope,report,validation:'offline-synthetic-fixture',executionAuthorityGranted:false},hash=fingerprint(payload);
 history.db.exec('CREATE TABLE IF NOT EXISTS fixture_application_observations(hash TEXT PRIMARY KEY,org TEXT,permission TEXT,payload TEXT NOT NULL)');history.db.prepare('INSERT OR IGNORE INTO fixture_application_observations VALUES(?,?,?,?)').run(hash,scope.org,scope.permission,JSON.stringify(payload));return hash;
}
export function readFixtureApplicationObservation(history:History,hash:string,org:string,permission:string){
 if(!/^[a-f0-9]{64}$/.test(hash)||!history.db.prepare("SELECT name FROM sqlite_master WHERE name='fixture_application_observations'").get())throw Error('Host fixture observation required');
 const row=history.db.prepare('SELECT payload FROM fixture_application_observations WHERE hash=? AND org=? AND permission=?').get(hash,org,permission);if(!row)throw Error('Fixture observation not in scoped host journal');const payload=JSON.parse(String(row.payload));if(fingerprint(payload)!==hash||payload.validation!=='offline-synthetic-fixture')throw Error('Fixture observation changed');return payload as {scope:z.infer<typeof FixtureApplicationScopeSchema>;report:any;validation:'offline-synthetic-fixture'};
}
