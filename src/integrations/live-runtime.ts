import { z } from 'zod';
import { History } from '../core/history.js';
import { SalesforceClient } from '../salesforce/client.js';
import { HybridFactory } from '../agents/hybrid-factory.js';
import { ApprovalSchema,mutationHash } from '../salesforce/approval.js';
import { verifyRecord } from '../salesforce/operations.js';
import { sandboxRuntime } from '../execution/readiness.js';
import type { Page } from '@playwright/test';
import { BrowserIdentitySchema } from './session-gate.js';
import { discoverOrg } from '../agents/org-discovery.js';
import { schemaFingerprint } from '../knowledge/snapshots.js';
export const RuntimePolicySchema=z.object({allowedOrgIds:z.array(z.string()).min(1),allowedOrigins:z.array(z.string().url()).min(1),allowedObjects:z.array(z.string()).default([]),approvals:z.record(z.string(),ApprovalSchema),browserProbe:z.object({path:z.string().startsWith('/'),orgIdTestId:z.string().min(1),userIdTestId:z.string().min(1),personaTestId:z.string().min(1)})});
// Probe selectors are supplied by an operator after observing the authorized app.
// No undocumented Salesforce UI identity element is inferred here.
export function configuredProbe(policy:z.infer<typeof RuntimePolicySchema>) {
  return async(page:Page)=>{
    const target=new URL(policy.browserProbe.path,page.url());if(!policy.allowedOrigins.includes(target.origin))throw Error('Browser probe origin denied');await page.goto(target.href);
    return BrowserIdentitySchema.parse({orgId:(await page.getByTestId(policy.browserProbe.orgIdTestId).textContent())?.trim(),userId:(await page.getByTestId(policy.browserProbe.userIdTestId).textContent())?.trim(),persona:(await page.getByTestId(policy.browserProbe.personaTestId).textContent())?.trim()});
  };
}
export function configuredSandboxRuntime(history:History,client:SalesforceClient,input:unknown) {
  const policy=RuntimePolicySchema.parse(input);
  const adapter={identity:()=>client.identity(),mutate:client.mutate.bind(client),verify:(m:Parameters<typeof client.mutate>[0],id:string)=>verifyRecord(client,m.object,id,m.values)};
  const factory=new HybridFactory(history,{api:adapter},policy.allowedObjects);
  return sandboxRuntime({factory,allowedOrgIds:policy.allowedOrgIds,allowedOrigins:policy.allowedOrigins,identity:()=>client.identity(),verifySchema:async request=>{if(!request.org.objects.length)return;const fresh=await discoverOrg(client,request.org.objects.map(o=>o.name));if(schemaFingerprint({...fresh,orgAlias:request.org.orgAlias})!==schemaFingerprint(request.org))throw Error('Live schema differs from reviewed org snapshot');},probe:configuredProbe(policy),approvalFor:async m=>{const approval=policy.approvals[mutationHash(m)];if(!approval)throw Error('No locally reviewed mutation approval');return approval;}});
}
