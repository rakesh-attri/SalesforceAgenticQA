import { createHash } from 'node:crypto';
import { z } from 'zod';
export const MutationSchema=z.object({runId:z.string().min(1),object:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),operation:z.enum(['create','delete']),values:z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),z.union([z.string(),z.number().finite(),z.boolean(),z.null()])).default({}),id:z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/).optional()});
export type Mutation=z.infer<typeof MutationSchema>;
export function mutationHash(input:Mutation) {const m=MutationSchema.parse(input);return createHash('sha256').update(JSON.stringify({...m,values:Object.fromEntries(Object.entries(m.values).sort(([a],[b])=>a.localeCompare(b)))})).digest('hex');}
export const ApprovalSchema=z.object({orgId:z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/),reviewer:z.string().min(1),expiresAt:z.string().datetime(),hash:z.string().regex(/^[a-f0-9]{64}$/),nonFinancialReviewed:z.literal(true)});
export type Approval=z.infer<typeof ApprovalSchema>;
export function authorize(input:Mutation,approval:Approval,org:{Id:string;IsSandbox:boolean},allowedObjects:string[]) {
  const m=MutationSchema.parse(input),a=ApprovalSchema.parse(approval);
  if(!org.IsSandbox || org.Id!==a.orgId || Date.parse(a.expiresAt)<=Date.now() || a.hash!==mutationHash(m) || !allowedObjects.includes(m.object)) throw Error('Sandbox identity, scoped approval or object permission denied');
  if(m.operation==='delete'&&!m.id) throw Error('Delete requires owned record ID');
  return m;
}
