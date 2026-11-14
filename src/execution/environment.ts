import { createHash } from 'node:crypto';
import { z } from 'zod';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
const Origin=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password;},'Canonical HTTPS origin required');
export const EnvironmentModeSchema=z.enum(['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA','DEDICATED_QA_ORG']);
export const DedicatedQaDefinitionSchema=z.object({orgId:Id,userId:Id,persona:z.string().trim().min(1),dedicatedTestUser:z.literal(true),exclusiveTesting:z.literal(true),noCustomerData:z.literal(true),syntheticOnly:z.literal(true),objects:z.array(z.enum(['Account','Contact'])).min(1).max(2),actions:z.array(z.enum(['create','read-owned','delete-owned','ui-read-owned','explore-read-owned'])).min(1),maxRecordsPerRun:z.number().int().min(1).max(2),maxRunsPerDay:z.number().int().min(1).max(5).default(3),automationReview:z.object({reviewer:z.string().trim().min(1),sourceVersion:z.string().regex(/^[a-f0-9]{64}$/),nonFinancial:z.literal(true)}).strict()}).strict();
export const EnvironmentDefinitionSchema=z.object({
  mode:EnvironmentModeSchema,allowedOrgIds:z.array(Id).min(1),
  personas:z.array(z.object({name:z.string().trim().min(1),userId:Id})).min(1),
  allowedOrigins:z.array(Origin).min(1),
  capabilities:z.array(z.enum(['metadata','soql','browser-observe','sandbox-ui','sandbox-data','dedicated-data','dedicated-ui','dedicated-explore'])).min(1),
  dedicatedQa:DedicatedQaDefinitionSchema.optional(),
}).strict();
export type EnvironmentDefinition=z.infer<typeof EnvironmentDefinitionSchema>;
export const EnvironmentPolicySchema=EnvironmentDefinitionSchema.extend({approval:z.object({operator:z.string().trim().min(1),definitionHash:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.string().datetime()}).strict()}).strict();
export type EnvironmentPolicy=z.infer<typeof EnvironmentPolicySchema>;
export type EnvironmentIdentity={Id:string;IsSandbox:boolean;userId:string};
export function environmentHash(input:EnvironmentDefinition) {const {mode,allowedOrgIds,personas,allowedOrigins,capabilities,dedicatedQa}=input;return createHash('sha256').update(JSON.stringify(EnvironmentDefinitionSchema.parse({mode,allowedOrgIds,personas,allowedOrigins,capabilities,...(dedicatedQa?{dedicatedQa}:{})}))).digest('hex');}
export function authorizeEnvironment(raw:unknown,identity:EnvironmentIdentity,capability:EnvironmentDefinition['capabilities'][number],origin:string,persona?:string,now=Date.now()) {
  const p=EnvironmentPolicySchema.parse(raw);
  if(p.approval.definitionHash!==environmentHash(p)||Date.parse(p.approval.expiresAt)<=now)throw Error('Environment approval is expired or differs from reviewed definition');
  if(!p.allowedOrgIds.includes(identity.Id)||!p.allowedOrigins.includes(origin))throw Error('Environment org/origin is not exactly allowlisted');
  const actor=p.personas.find(a=>a.userId===identity.userId&&(!persona||a.name===persona));
  if(!actor)throw Error('Environment persona is not approved for authenticated user');
  if(p.mode==='DEDICATED_QA_ORG'){
    const qa=DedicatedQaDefinitionSchema.parse(p.dedicatedQa);
    if(Date.parse(p.approval.expiresAt)>now+3600000)throw Error('Dedicated authorization lifetime must be bounded to one hour');
    if(p.allowedOrgIds.length!==1||p.allowedOrgIds[0]!==qa.orgId||identity.Id!==qa.orgId||identity.userId!==qa.userId||actor.name!==qa.persona||p.personas.length!==1||qa.automationReview.reviewer!==p.approval.operator)throw Error('Dedicated QA requires exact org, dedicated test user and named local authorization');
    if(!['metadata','soql','dedicated-data','dedicated-ui','dedicated-explore'].includes(capability)||!p.capabilities.includes(capability)||p.capabilities.some(c=>c.startsWith('sandbox-')||c==='browser-observe'))throw Error('Dedicated QA capability is not approved');
    return {...p,persona:actor.name};
  }
  if(p.dedicatedQa||p.capabilities.some(c=>c.startsWith('dedicated-')))throw Error('Normal modes cannot inherit dedicated QA permissions');
  if(p.mode==='PRODUCTION_CONTROLLED_QA')throw Error('Production controlled QA supports policy review only; execution is disabled');
  if((p.mode==='SANDBOX_QA')!==identity.IsSandbox)throw Error('Environment mode differs from freshly verified org type');
  if(!p.capabilities.includes(capability))throw Error('Capability is not approved');
  if(!identity.IsSandbox&&(p.capabilities.some(c=>c.startsWith('sandbox-'))||!['metadata','soql','browser-observe'].includes(capability)))throw Error('Production mutations and unknown operations are disabled');
  return {...p,persona:actor.name};
}
