import { z } from 'zod';
import { RecipeSchema } from '../agents/recipe-registry.js';
import type { PipelineInput } from '../agents/pipeline.js';
import { HybridFactory } from '../agents/hybrid-factory.js';
import type { Approval,Mutation } from '../salesforce/approval.js';
import { BrowserIdentitySchema,checkSessionReceipt,probeSession } from '../integrations/session-gate.js';
import type { Page } from '@playwright/test';
export const SandboxRequestSchema=BrowserIdentitySchema.extend({sessionReceipt:z.string().min(1),reviewer:z.string().trim().min(1),expiresAt:z.string().datetime(),nonFinancialReviewed:z.literal(true)});
export const DataSetupSchema=z.object({recipes:z.array(RecipeSchema).min(1),cleanup:z.enum(['always','retain-reviewed']).default('always'),retentionReviewer:z.string().trim().min(1).optional()}).superRefine((v,c)=>{if(v.cleanup==='retain-reviewed'&&!v.retentionReviewer)c.addIssue({code:'custom',message:'Retention requires named review'});});
export type SetupRecords=Awaited<ReturnType<HybridFactory['setup']>>;
export interface PipelineRuntime {
  factory:HybridFactory;
  approvalFor(m:Mutation):Promise<Approval>;
  preflight(input:PipelineInput):Promise<{storageState?:string;orgId?:string;userId?:string;persona?:string}>;
}
export function sandboxRuntime(input:{factory:HybridFactory;approvalFor:(m:Mutation)=>Promise<Approval>;identity:()=>Promise<{Id:string;IsSandbox:boolean;userId:string}>;verifySchema:(request:PipelineInput)=>Promise<void>;allowedOrgIds:string[];allowedOrigins:string[];probe:(page:Page)=>Promise<z.infer<typeof BrowserIdentitySchema>>}):PipelineRuntime {
  return {factory:input.factory,approvalFor:input.approvalFor,async preflight(request) {
    const target=SandboxRequestSchema.parse(request.sandbox);
    if(request.org.source!=='salesforce-api'||!input.allowedOrgIds.includes(target.orgId)||Date.parse(target.expiresAt)<=Date.now())throw Error('Sandbox execution authorization missing/expired');
    if(request.allowedOrigins.some(o=>!input.allowedOrigins.includes(o)))throw Error('Sandbox origin permission denied');
    const org=await input.identity();if(!org.IsSandbox||org.Id!==target.orgId||org.userId!==target.userId)throw Error('Fresh sandbox API identity mismatch');
    await input.verifySchema(request);
    const receipt=await checkSessionReceipt(target.sessionReceipt,target,request.allowedOrigins);
    const actual=await probeSession(receipt.statePath,request.allowedOrigins[0],request.allowedOrigins,input.probe,input.identity);
    if(actual.orgId!==target.orgId||actual.userId!==target.userId||actual.persona!==target.persona)throw Error('Fresh browser identity mismatch');
    return {storageState:receipt.statePath,orgId:org.Id,userId:org.userId,persona:actual.persona};
  }};
}
