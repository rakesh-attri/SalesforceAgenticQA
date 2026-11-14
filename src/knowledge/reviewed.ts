import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OrgIntelligence } from '../agents/org-intelligence.js';
import { schemaFingerprint } from './snapshots.js';
import { StorySchema,type Story } from '../core/types.js';
import { KnowledgeIndex,type Knowledge,KnowledgeSchema } from './index.js';
import { redactModelText,environmentSecrets } from '../ai/privacy.js';
const Name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ReviewBundleSchema=z.object({
  org:Hash,permission:z.string().min(1),sourceVersion:Hash,capturedAt:z.string().datetime(),story:StorySchema,
  facts:z.array(z.object({id:z.string(),object:Name,field:Name,type:Name,required:z.boolean(),references:z.array(Name),source:z.string()}).strict()).min(1),
  history:z.array(KnowledgeSchema).default([]),
}).strict();
export type ReviewBundle=z.infer<typeof ReviewBundleSchema>;
export const AIReviewSchema=z.object({operator:z.string().trim().min(1),bundleHash:Hash,destinations:z.array(z.enum(['gemini-chat','gemini-embeddings','chroma'])).min(1),expiresAt:z.string().datetime()}).strict();
export function bundleHash(bundle:ReviewBundle) {return createHash('sha256').update(JSON.stringify(ReviewBundleSchema.parse(bundle))).digest('hex');}
export function payloadHash(payload:unknown) {return createHash('sha256').update(JSON.stringify(payload)).digest('hex');}
export function authorizePayload(payload:unknown,raw:unknown,destinations:Array<'gemini-chat'|'gemini-embeddings'|'chroma'>) {
  const review=AIReviewSchema.parse(raw);
  if(review.bundleHash!==payloadHash(payload)||Date.parse(review.expiresAt)<=Date.now()||destinations.some(d=>!review.destinations.includes(d)))throw Error('External payload lacks exact named content/destination approval');
  return review;
}
export function prepareReviewBundle(intel:OrgIntelligence,story:Story,permission:string,history:Knowledge[]=[],objects=story.objects,fields?:string[]) {
  const sourceVersion=schemaFingerprint(intel.snapshot),org=createHash('sha256').update(intel.identity.Id).digest('hex'),secrets=environmentSecrets();
  const cleaned=StorySchema.parse(JSON.parse(redactModelText(JSON.stringify(story),secrets)));
  const selected=intel.snapshot.objects.filter(o=>objects.includes(o.name));
  if(objects.some(name=>!selected.some(o=>o.name===name)))throw Error('Review bundle requests an unobserved object');
  const facts=selected.flatMap(o=>o.fields.filter(f=>!fields||fields.includes(`${o.name}.${f.name}`)).map(f=>({id:`field:${o.name}.${f.name}`,object:o.name,field:f.name,type:f.type,required:f.createable&&!f.nillable&&!f.defaultedOnCreate,references:f.referenceTo??[],source:`describe:${o.name}@${sourceVersion}`})));
  if(fields?.some(name=>!facts.some(f=>`${f.object}.${f.field}`===name)))throw Error('Field review requests an unobserved field');
  return ReviewBundleSchema.parse({org,permission,sourceVersion,capturedAt:intel.observedAt,story:cleaned,facts,
    history:history.filter(d=>d.org===org&&d.permission===permission&&['lesson','defect'].includes(d.kind)&&d.status==='verified').map(d=>({...d,text:redactModelText(d.text,secrets)})),
  });
}
export function authorizeAI(bundle:ReviewBundle,raw:unknown,destination:'gemini-chat'|'gemini-embeddings'|'chroma') {
  const review=AIReviewSchema.parse(raw);
  if(review.bundleHash!==bundleHash(bundle)||Date.parse(review.expiresAt)<=Date.now()||!review.destinations.includes(destination))throw Error('AI data review is missing, expired or does not cover exact content/destination');
  return review;
}
export async function ingestReviewedBundle(bundle:ReviewBundle,rawReview:unknown,index:KnowledgeIndex) {
  const review=authorizeAI(bundle,rawReview,'gemini-embeddings');
  index.bindSchema({org:bundle.org,permission:bundle.permission},bundle.sourceVersion);
  authorizeAI(bundle,rawReview,'gemini-embeddings');
  await index.ingestMany(bundle.facts.map(fact=>({id:fact.id,version:bundle.sourceVersion,org:bundle.org,permission:bundle.permission,kind:'org',status:'verified' as const,text:JSON.stringify(fact),evidence:[fact.source],reviewer:review.operator,capturedAt:bundle.capturedAt,testIds:[]})));
  for(const item of bundle.history){authorizeAI(bundle,rawReview,'gemini-embeddings');await index.ingest(item);}
  return {indexed:bundle.facts.length+bundle.history.length,sourceVersion:bundle.sourceVersion};
}
