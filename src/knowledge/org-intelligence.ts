import type { OrgIntelligence } from '../agents/org-intelligence.js';
import { intelligenceVersion } from '../agents/org-intelligence.js';
import { KnowledgeIndex } from './index.js';
import { schemaFingerprint } from './snapshots.js';
export async function indexOrgIntelligence(value:OrgIntelligence,index:KnowledgeIndex,permission:string,reviewer?:string) {
  const version=intelligenceVersion(value),scope={org:value.orgAlias,permission};index.bindSchema(scope,schemaFingerprint(value.snapshot));
  const status=reviewer?.trim()?'verified' as const:'observed' as const;
  const records=[...value.snapshot.objects.map(object=>({id:`org-schema:${object.name}`,text:`Observed Salesforce object ${object.name}: ${JSON.stringify(object)}. Describe requirements are API-level facts only.`,evidence:value.snapshot.coverage!.filter(c=>c.area===`describe:${object.name}`).map(c=>c.source)})),...value.sections.filter(s=>s.status==='observed'||s.status==='partial').map(section=>({id:`org-metadata:${section.area}:${section.source}`,text:`${section.area}: ${JSON.stringify(section.records)}. Coverage: ${section.status}. ${section.detail}`,evidence:[section.source]}))];
  for(const record of records)await index.ingest({...record,version,...scope,kind:'org',status,testIds:[],reviewer:reviewer?.trim(),capturedAt:value.observedAt});
  return {version,status,indexed:records.length};
}
