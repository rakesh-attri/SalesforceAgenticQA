import { createHash } from 'node:crypto';
import { z } from 'zod';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
const Origin=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password;},'Canonical HTTPS origin required');
export const EnvironmentModeSchema=z.enum(['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA']);
export const EnvironmentDefinitionSchema=z.object({
  mode:EnvironmentModeSchema,allowedOrgIds:z.array(Id).min(1),
  personas:z.array(z.object({name:z.string().trim().min(1),userId:Id})).min(1),
  allowedOrigins:z.array(Origin).min(1),
  capabilities:z.array(z.enum(['metadata','soql','browser-observe','sandbox-ui','sandbox-data'])).min(1),
}).strict();
export type EnvironmentDefinition=z.infer<typeof EnvironmentDefinitionSchema>;
export const EnvironmentPolicySchema=EnvironmentDefinitionSchema.extend({approval:z.object({operator:z.string().trim().min(1),definitionHash:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.string().datetime()}).strict()}).strict();
export type EnvironmentPolicy=z.infer<typeof EnvironmentPolicySchema>;
export type EnvironmentIdentity={Id:string;IsSandbox:boolean;userId:string};
export function environmentHash(input:EnvironmentDefinition) {const {mode,allowedOrgIds,personas,allowedOrigins,capabilities}=input;return createHash('sha256').update(JSON.stringify(EnvironmentDefinitionSchema.parse({mode,allowedOrgIds,personas,allowedOrigins,capabilities}))).digest('hex');}
export function authorizeEnvironment(raw:unknown,identity:EnvironmentIdentity,capability:EnvironmentDefinition['capabilities'][number],origin:string,persona?:string,now=Date.now()) {
  const p=EnvironmentPolicySchema.parse(raw);
  if(p.approval.definitionHash!==environmentHash(p)||Date.parse(p.approval.expiresAt)<=now)throw Error('Environment approval is expired or differs from reviewed definition');
  if(!p.allowedOrgIds.includes(identity.Id)||!p.allowedOrigins.includes(origin))throw Error('Environment org/origin is not exactly allowlisted');
  const actor=p.personas.find(a=>a.userId===identity.userId&&(!persona||a.name===persona));
  if(!actor)throw Error('Environment persona is not approved for authenticated user');
  if(p.mode==='PRODUCTION_CONTROLLED_QA')throw Error('Production controlled QA supports policy review only; execution is disabled');
  if((p.mode==='SANDBOX_QA')!==identity.IsSandbox)throw Error('Environment mode differs from freshly verified org type');
  if(!p.capabilities.includes(capability))throw Error('Capability is not approved');
  if(!identity.IsSandbox&&(p.capabilities.some(c=>c.startsWith('sandbox-'))||!['metadata','soql','browser-observe'].includes(capability)))throw Error('Production mutations and unknown operations are disabled');
  return {...p,persona:actor.name};
}
