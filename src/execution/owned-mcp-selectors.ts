import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {z} from 'zod';
import {setTimeout as delay} from 'node:timers/promises';
import type {History} from '../core/history.js';
import {WorkflowSchema} from '../agents/workflows.js';
import {SalesforceClient} from '../salesforce/client.js';
import {LightningSession} from './lightning-session.js';
import {createLightningMcp} from '../integrations/lightning-mcp.js';
import {BrowserReviewSchema,browserPlanHash,fingerprint,digest} from './browser-policy.js';
import {SelectorEvidenceSchema} from './dedicated-selectors.js';

/** Uses the existing managed session/gateway, never raw browser tools or a new
 * transport. The opt-in UI hash and existing four-session quota cover this step. */
export async function observeOwnedSelectorsMcp(input:{review:unknown;parent:unknown;profile:unknown;history:History;statePath:string;workflow:unknown;binding:{runId:string;planHash:string;policyHash:string;sourceVersion:string}},fixtures?:{connect:typeof SalesforceClient.connectReviewedBrowser;open:typeof LightningSession.open}) {
  const review=BrowserReviewSchema.parse(input.review),workflow=WorkflowSchema.parse(input.workflow),p=review.plan,b=input.binding;
  const target=new URL(workflow.path,workflow.origin),match=/^\/lightning\/r\/(Account|Contact)\/([A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?)\/view$/.exec(target.pathname);
  if(!p.ownedDataPlanHash||p.ownedDataPlanHash!==b.planHash||p.runId!==b.runId||p.parentPolicyHash!==b.policyHash||p.sourceVersion!==b.sourceVersion||p.executionProfile!=='DEDICATED_QA_NORMAL_CHROME'||p.budgets.actions||p.agentWorkflowHashes.length||workflow.steps.length||workflow.apiAssertions.length||!match||target.search||target.hash||!p.origins.includes(target.origin))throw Error('MCP selectors require the exact reviewed zero-action owned workflow');
  const object=z.enum(['Account','Contact']).parse(match[1]),recordId=match[2];
  const api=await(fixtures?.connect??SalesforceClient.connectReviewedBrowser.bind(SalesforceClient))(input.parent,review,input.history);
  await api.preflight();
  const references=async()=>{const result=await api.verifyReferences(),record=result.references.find(r=>r.object===object&&r.id===recordId&&r.purpose==='owned-run'),display=result.privateDisplays.find(r=>r.object===object&&r.id===recordId);
    if(!record||display?.display!==workflow.assertion.text)throw Error('Owned MCP reference or original synthetic expectation differs');return result;};
  await references();
  const observationDeadline=Date.now()+p.budgets.maxMs;
  const session=await(fixtures?.open??LightningSession.open.bind(LightningSession))({review,parent:input.parent,history:input.history,statePath:input.statePath,apiOrigin:api.apiOrigin,dedicatedChromeProfile:input.profile,identity:()=>api.preflight(),verifyReferences:references});
  const gateway=createLightningMcp(session),client=new Client({name:'sfqa-owned-selector-observer',version:'1'}),[a,c]=InMemoryTransport.createLinkedPair();
  let navigation:Record<string,unknown>={},discovery:Record<string,unknown>={},closed:Record<string,unknown>={},failure=false;
  try{await gateway.connect(a);await client.connect(c);const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error('Owned selector MCP operation denied');const text=(r.content as Array<{type:string;text?:string}>).find(v=>v.type==='text')?.text;if(!text)throw Error('Owned selector MCP metadata missing');return JSON.parse(text) as Record<string,unknown>;};
    navigation=await call('sfqa_browser_observe_record',{object});
    // Lightning may finish its native document before its record component.
    // Poll only sanitized observations of the unchanged reviewed locator.
    for(let attempt=0;attempt<50;attempt++){discovery=await call('sfqa_browser_discover_view',{});if((Array.isArray(discovery.recordNameCandidates)&&discovery.recordNameCandidates.length>0)||Date.now()+1000>=observationDeadline)break;await delay(500);}
    if(p.visualDebug)await call('sfqa_browser_debug_capture',{});
  }catch{failure=true;}finally{await client.close().catch(()=>{});await gateway.close().catch(()=>{});closed=await session.close() as Record<string,unknown>;}
  const expectedValidation=fixtures?'offline-mocked-salesforce':'live-salesforce';
  if(closed.validation!==expectedValidation)throw Error('Owned MCP provenance differs from the actual host');
  const candidates=z.array(WorkflowSchema.shape.assertion.shape.locator).max(10).parse(discovery.recordNameCandidates??[]),matches=z.object({text:z.number().int(),heading:z.number().int()}).safeParse(discovery.nameMatches);
  const supported=candidates.some(candidate=>fingerprint(JSON.parse(JSON.stringify(candidate).replaceAll('{{record-name}}',workflow.assertion.text)))===fingerprint(workflow.assertion.locator));
  const count=matches.success?(workflow.assertion.locator.by==='text'?matches.data.text:workflow.assertion.locator.by==='role'&&workflow.assertion.locator.value==='heading'?matches.data.heading:0):0;
  const connected=session.status().nativeMcpConnected,doc=navigation.approvedDocument===true&&navigation.nativeDocumentVerified===true&&navigation.recordHash===digest(recordId);
  const metrics=z.object({requests:z.number().int().nonnegative(),blocked:z.number().int().nonnegative(),closedForBudget:z.boolean().optional()}).parse(closed.metrics);
  const observed=!failure&&doc&&connected&&supported&&count===1&&closed.referenceUnchanged===true&&metrics.requests<=p.budgets.requests&&!metrics.closedForBudget;
  return SelectorEvidenceSchema.parse({...b,capturedAt:new Date().toISOString(),observations:[{workflowId:workflow.id,criterion:workflow.criterion,documentHash:fingerprint(target.href),expectedHash:fingerprint(workflow.assertion.text),locator:workflow.assertion.locator,status:observed?'observed':'review-required',reason:observed?'unique-exact-match':count>1?'ambiguous':'not-observed',count}],blockedRequests:metrics.blocked,deniedRequests:[],mcpSessions:[{workflowId:workflow.id,sessionId:closed.sessionId,policyHash:browserPlanHash(p),validation:expectedValidation,connected,approvedDocument:doc,referenceUnchanged:closed.referenceUnchanged===true,requests:metrics.requests,diagnosticHash:fingerprint(closed.diagnostics??null),originalAssertionPreserved:true,generatedTestsExecuted:0}]});
}
