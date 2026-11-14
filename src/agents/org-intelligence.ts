import { z } from 'zod';
import { createHash } from 'node:crypto';
import { OrgSnapshotSchema,StorySchema,type Story,type OrgSnapshot } from '../core/types.js';
import { discoverOrg,type DiscoveryReader } from './org-discovery.js';
import { PageSchema } from '../salesforce/operations.js';
const Name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
export const CatalogSchema=z.object({sobjects:z.array(z.object({name:Name,label:z.string(),labelPlural:z.string().optional(),queryable:z.boolean().optional(),createable:z.boolean().optional()}))});
export type Catalog=z.infer<typeof CatalogSchema>['sobjects'];
const words=(value:string)=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/__(?:c|r|mdt|e)\b/g,'').toLowerCase().match(/[a-z0-9]+/g)??[];
const singular=(value:string)=>value.endsWith('ies')?value.slice(0,-3)+'y':value.endsWith('s')&&!value.endsWith('ss')?value.slice(0,-1):value;
export function selectStoryObjects(story:Story,catalog:Catalog,limit=12) {
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Object discovery budget must be 1–50');
  const text=new Set(words(`${story.title} ${story.description} ${story.acceptanceCriteria.map(a=>a.text).join(' ')}`).map(singular));
  const explicit=new Set(story.objects),byName=new Map(catalog.map(o=>[o.name,o]));
  const matches=catalog.map(object=>{
    const labels=[object.name,object.label,object.labelPlural??''].filter(Boolean).map(v=>words(v).map(singular));
    const actorOnly=object.name==='User'&&!/\b(?:create|provision|manage|update|delete|deactivate)\s+(?:an?\s+|the\s+)?(?:salesforce\s+)?users?\b|\buser\s+(?:record|object)\b/i.test(`${story.title} ${story.description}`);
    const phrase=!actorOnly&&labels.some(tokens=>tokens.length>0&&tokens.every(t=>text.has(t)));
    const exact=explicit.has(object.name);
    return {name:object.name,score:exact?100:phrase?20:0,reason:exact?'Explicit story object verified in accessible catalog':'Story terms match accessible API name/label; workflow relevance requires review',source:'salesforce:global-describe'};
  }).filter(o=>o.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  return {selected:matches.slice(0,limit),unresolved:story.objects.filter(n=>!byName.has(n)),omitted:matches.slice(limit).map(m=>m.name),status:'proposed' as const};
}
export interface IntelligenceReader extends DiscoveryReader {identity():Promise<{Id:string;IsSandbox:boolean;userId:string}>;readMetadata?(type:string,names:string[]):Promise<unknown>}
export const MetadataSectionSchema=z.object({area:z.string(),status:z.enum(['observed','partial','unknown','blocked']),source:z.string(),records:z.array(z.record(z.string(),z.unknown())),detail:z.string()});
const SelectionSchema=z.object({selected:z.array(z.object({name:Name,score:z.number(),reason:z.string(),source:z.string()})),unresolved:z.array(z.string()),omitted:z.array(z.string()),status:z.literal('proposed')});
export const IntelligenceSchema=z.object({orgAlias:z.string(),observedAt:z.string(),identity:z.object({Id,IsSandbox:z.boolean(),userId:Id}),catalogCount:z.number(),selection:SelectionSchema,snapshot:OrgSnapshotSchema,sections:z.array(MetadataSectionSchema),unknowns:z.array(z.string())});
export type OrgIntelligence=z.infer<typeof IntelligenceSchema>;
export async function discoverOrgIntelligence(client:IntelligenceReader,storyInput:Story,budget={maxObjects:12,maxParentDepth:2},policy={allowNonSandboxRead:false}) {
  const story=StorySchema.parse(storyInput);let rawIdentity:unknown;
  try{rawIdentity=await client.identity();}catch{throw Error('Read-only org/user identity could not be verified; provider details withheld.');}
  const identity=z.object({Id,IsSandbox:z.boolean(),userId:Id}).safeParse(rawIdentity);
  if(!identity.success)throw Error('Read-only intelligence requires a verified org/user identity');
  if(!identity.data.IsSandbox&&!policy.allowNonSandboxRead)throw Error('Configured org reports IsSandbox=false; only an explicit non-sandbox metadata-read policy can continue');
  if(!Number.isInteger(budget.maxParentDepth)||budget.maxParentDepth<0||budget.maxParentDepth>3)throw Error('Parent depth must be 0–3');
  const catalog=CatalogSchema.parse(await client.get(`/services/data/${client.apiVersion}/sobjects/`)).sobjects;
  const selection=selectStoryObjects(story,catalog,budget.maxObjects),objects:OrgSnapshot['objects']=[],coverage:NonNullable<OrgSnapshot['coverage']>=[],sections:z.infer<typeof MetadataSectionSchema>[]=[];
  let pending=selection.selected.map(o=>o.name);const seen=new Set<string>(),catalogNames=new Set(catalog.map(o=>o.name));
  for(let depth=0;depth<=budget.maxParentDepth&&pending.length;depth++){
    const parents=new Set<string>();
    for(const name of pending){if(seen.has(name)||objects.length>=budget.maxObjects)continue;seen.add(name);
      try {const result=await discoverOrg(client,[name]);objects.push(...result.objects);coverage.push(...result.coverage!.filter(c=>c.area.startsWith('describe:')));
        for(const field of result.objects[0].fields.filter(f=>f.type==='reference'&&!f.nillable&&f.createable&&!f.defaultedOnCreate))if(field.referenceTo?.length===1&&catalogNames.has(field.referenceTo[0]))parents.add(field.referenceTo[0]);
      }catch {coverage.push({area:`describe:${name}`,status:'unknown',source:`/services/data/${client.apiVersion}/sobjects/${name}/describe`,detail:'Access denied, request failed or response invalid; no workflow inferred.'});}
    }pending=[...parents].filter(n=>!seen.has(n));
  }
  const names=objects.map(o=>o.name),where=names.map(n=>`'${Name.parse(n)}'`).join(',');
  const querySection=async(area:string,soql:string,tooling=false)=>{
    const source=`/services/data/${client.apiVersion}/${tooling?'tooling/':''}query?q=${encodeURIComponent(soql)}`;
    try{const page=PageSchema.parse(await client.get(source));sections.push({area,status:page.done&&page.records.length<200?'observed':'partial',source,records:page.records,detail:'Bounded metadata inventory, not proof of business workflow or effective access.'});}
    catch{sections.push({area,status:'unknown',source,records:[],detail:'Access denied, query unsupported, request failed or response invalid.'});}
  };
  if(names.length){
    await querySection('record-types',`SELECT Id,SobjectType,DeveloperName,Name,IsActive FROM RecordType WHERE SobjectType IN (${where}) LIMIT 200`);
    await querySection('validation-rules',`SELECT Id,ValidationName,Active,EntityDefinitionId FROM ValidationRule WHERE EntityDefinition.QualifiedApiName IN (${where}) LIMIT 200`,true);
    await querySection('metadata-dependencies',`SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType,RefMetadataComponentName,RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentName IN (${where}) LIMIT 200`,true);
    await querySection('object-permissions',`SELECT ParentId,SobjectType,PermissionsRead,PermissionsCreate,PermissionsEdit,PermissionsDelete,PermissionsViewAllRecords,PermissionsModifyAllRecords FROM ObjectPermissions WHERE SobjectType IN (${where}) LIMIT 200`);
    await querySection('field-permissions',`SELECT ParentId,SobjectType,Field,PermissionsRead,PermissionsEdit FROM FieldPermissions WHERE SobjectType IN (${where}) LIMIT 200`);
    if(client.readMetadata)for(let offset=0;offset<names.length;offset+=10){const batch=names.slice(offset,offset+10),source=`metadata:readMetadata:CustomObject:${batch.join(',')}`;
      try{const result=await client.readMetadata('CustomObject',batch);sections.push({area:'object-business-metadata',status:'partial',source,records:[z.record(z.string(),z.unknown()).parse(result)],detail:'Raw authorized component metadata retained locally; missing components/formula interpretation require review.'});}
      catch{sections.push({area:'object-business-metadata',status:'unknown',source,records:[],detail:'Named metadata read unavailable; business constraints remain unknown.'});}
    }
  }
  await querySection('apex-classes','SELECT Id,Name,NamespacePrefix,Status FROM ApexClass LIMIT 200',true);
  await querySection('apex-triggers','SELECT Id,Name,TableEnumOrId,Status FROM ApexTrigger LIMIT 200',true);
  await querySection('flows','SELECT Id,DeveloperName,ActiveVersionId FROM FlowDefinition LIMIT 200',true);
  await querySection('assigned-permission-sets',`SELECT PermissionSetId,PermissionSet.Name FROM PermissionSetAssignment WHERE AssigneeId = '${identity.data.userId}' LIMIT 200`);
  const unknowns=[...(!identity.data.IsSandbox?['Configured org reports IsSandbox=false. This is metadata-only inspection; sandbox writes/UI execution are not authorized.']:[]),'Object relevance is proposed from catalog evidence; UI workflows and expected outcomes require review.','Configured permission rows do not prove effective user/record access, permission-set-group muting, sharing, restriction rules or UI visibility.','Apex/Flow inventories do not prove trigger behavior, validation formulas, async dependencies or business-valid data.','Record-type picklist restrictions and persona-specific browser workflows remain unverified.',...selection.unresolved.map(n=>`Story object ${n} is absent from the accessible catalog.`),...(pending.length||objects.length>=budget.maxObjects?['Discovery budget may omit parent objects; unresolved dependencies remain blocked.']:[])];
  unknowns.push(...sections.filter(s=>s.status!=='observed').map(s=>`${s.area} coverage is ${s.status}: ${s.detail}`),...coverage.filter(c=>c.status==='unknown').map(c=>`${c.area}: ${c.detail}`));
  if(!names.length)unknowns.push('No relevant object was successfully described; field-dependent planning remains blocked.');
  for(const area of ['record-type-picklists','business-workflows','effective-sharing'])coverage.push({area,status:'unknown',source:'intelligence:scope',detail:'Not established by these metadata reads.'});
  coverage.push(...sections.map(section=>({area:section.area,status:section.status==='observed'?'observed' as const:'unknown' as const,source:section.source,detail:`${section.status}: ${section.detail}`})));
  const snapshot=OrgSnapshotSchema.parse({orgAlias:process.env.SFQA_ORG_ALIAS||'authorized-org',observedAt:new Date().toISOString(),source:'salesforce-api',objects,coverage});
  return IntelligenceSchema.parse({orgAlias:snapshot.orgAlias,observedAt:snapshot.observedAt,identity:identity.data,catalogCount:catalog.length,selection,snapshot,sections,unknowns});
}
export function intelligenceVersion(value:OrgIntelligence){return createHash('sha256').update(JSON.stringify(IntelligenceSchema.parse(value))).digest('hex');}
