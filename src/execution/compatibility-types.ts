import {z} from 'zod';
export const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const CompatibilityScopeSchema=z.object({org:Hash,user:Hash,permission:Hash,build:Hash,app:Hash,engine:Hash,records:z.array(Hash).max(20)}).strict();
export const EvidenceSchema=z.object({kind:z.enum(['policy','trace','client-source','official-doc','regression','fixture']),hash:Hash}).strict();
export const OperationSchema=z.enum(['static-resource','documented-api-read','reviewed-initialization','navigation','component-initialization','unknown','possible-mutation','high-risk']);
export const ContractSchema=z.object({
  id:Hash,version:z.number().int().min(1),scope:CompatibilityScopeSchema,
  operation:OperationSchema,operationHash:Hash,requestShapeHash:Hash,
  method:z.enum(['GET','HEAD','POST']),parameterKeys:z.array(Hash).max(40),valueConstraints:z.array(z.enum(['exact-record','exact-app','exact-origin','exact-fields','exact-hashed-values','no-extra-parameters'])).min(1),
  response:z.enum(['static-mime','json-read','aura-success','document','unknown']),
  effects:z.enum(['reviewed-nonmutating','unknown','possible-mutation','high-risk']),
  risk:z.enum(['low','review-required','reject']),status:z.enum(['proposed','reviewed','revoked']),
  sources:z.array(EvidenceSchema).min(1).max(20),dependencies:z.array(Hash).max(30),
  runtimeBindingHash:Hash.optional(),review:z.object({operator:z.string().trim().min(1),definitionHash:Hash,expiresAt:z.string().datetime(),evidence:z.array(EvidenceSchema).min(1)}).strict().optional(),
  reReviewOn:z.tuple([z.literal('org-user-permission'),z.literal('build-app-engine'),z.literal('shape-response-effects'),z.literal('source-change-or-expiry')]),
}).strict();
export type CompatibilityScope=z.infer<typeof CompatibilityScopeSchema>;
export type PlatformContract=z.infer<typeof ContractSchema>;
