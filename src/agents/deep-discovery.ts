import { z } from 'zod';
import type { OrgIntelligence,IntelligenceReader } from './org-intelligence.js';
import { readPages,ReadBudgetSchema } from '../salesforce/pagination.js';
import { buildComponentGraph,metadataRecords } from './component-graph.js';
import { intelligenceFingerprint } from '../knowledge/intelligence-fingerprint.js';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/),Name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
export const DeepBudgetSchema=ReadBudgetSchema.extend({maxFlowDetails:z.number().int().min(0).max(10).default(3),maxPermissionGroups:z.number().int().min(1).max(20).default(5)});
export async function discoverDeepIntelligence(client:IntelligenceReader,input:OrgIntelligence,rawBudget:unknown={}) {
  const b=DeepBudgetSchema.parse(rawBudget),identity=await client.identity();
  if(identity.Id!==input.identity.Id||identity.userId!==input.identity.userId||identity.IsSandbox!==input.identity.IsSandbox)throw Error('Deep discovery identity differs from approved snapshot');
  const sections=[...input.sections],unknowns=[...input.unknowns];
  const query=async(area:string,soql:string,tooling=false,customBudget:unknown=b)=>{
    try {const result=await readPages(client,soql,tooling,customBudget);sections.push({area,status:result.status,source:result.sources[0],records:result.records,detail:JSON.stringify({pages:result.sources,scope:'bounded setup metadata only; business execution unknown'})});return result;}
    catch {sections.push({area,status:'unknown' as const,source:`${tooling?'tooling:':''}query:${soql}`,records:[],detail:'Denied, unsupported, malformed or incomplete transport; provider details withheld.'});return {records:[] as Record<string,unknown>[],status:'unknown' as const,sources:[]};}
  };
  // Name filters and queryMore are unsupported on Dependency API. One bounded inventory is retained as partial at the cap.
  await query('metadata-dependencies','SELECT MetadataComponentId,MetadataComponentName,MetadataComponentNamespace,MetadataComponentType,RefMetadataComponentId,RefMetadataComponentName,RefMetadataComponentNamespace,RefMetadataComponentType FROM MetadataComponentDependency LIMIT 500',true,{maxPages:1,maxRecords:500});
  await query('apex-classes','SELECT Id,Name,NamespacePrefix,Status FROM ApexClass LIMIT 500',true);
  await query('apex-triggers','SELECT Id,Name,NamespacePrefix,TableEnumOrId,Status FROM ApexTrigger LIMIT 500',true);
  await query('lwc-bundles','SELECT Id,DeveloperName,NamespacePrefix FROM LightningComponentBundle LIMIT 500',true);
  const versions=await query('flow-versions','SELECT Id,DefinitionId,VersionNumber,Status,MasterLabel FROM Flow LIMIT 500',true);
  const activeIds=new Set(input.sections.filter(s=>s.area==='flows').flatMap(s=>s.records).map(r=>r.ActiveVersionId).filter((id):id is string=>typeof id==='string'));
  const selected=versions.records.filter(r=>activeIds.has(String(r.Id))).slice(0,b.maxFlowDetails);
  if(activeIds.size>selected.length)unknowns.push('Flow detail budget or version inventory omitted active versions; inactive version metadata is not analyzed.');
  for(const row of selected){const id=Id.safeParse(row.Id);if(!id.success)continue;const source=`/services/data/${client.apiVersion}/tooling/sobjects/Flow/${id.data}`;
    try {const raw=z.record(z.string(),z.unknown()).parse(await client.get(source));if(raw.Id!==id.data||!raw.Metadata||typeof raw.Metadata!=='object')throw Error('Flow metadata unavailable');sections.push({area:'flow-details',status:'observed',source,records:[raw],detail:'Exact version metadata: declared conditions/actions/connectors only; no execution or expected business outcome inferred.'});}
    catch {sections.push({area:'flow-details',status:'unknown',source,records:[],detail:'Version metadata inaccessible, managed, unsupported or malformed.'});}
  }
  const assignment=await query('persona-assignments',`SELECT PermissionSetId,PermissionSetGroupId FROM PermissionSetAssignment WHERE AssigneeId='${Id.parse(identity.userId)}' LIMIT 500`);
  const groups=[...new Set(assignment.records.map(r=>r.PermissionSetGroupId).filter((id):id is string=>Id.safeParse(id).success))];
  if(groups.length>b.maxPermissionGroups)unknowns.push('Permission group budget omitted assigned groups; aggregation is unknown.');
  const ids=(values:string[])=>values.map(v=>`'${Id.parse(v)}'`).join(',');
  const componentSets:string[]=[];
  for(const group of groups.slice(0,b.maxPermissionGroups)){
    const groupInfo=await query('permission-set-groups',`SELECT Id,DeveloperName,Status FROM PermissionSetGroup WHERE Id='${group}' LIMIT 1`);
    const components=await query('permission-group-components',`SELECT PermissionSetGroupId,PermissionSetId FROM PermissionSetGroupComponent WHERE PermissionSetGroupId='${group}' LIMIT 500`);componentSets.push(...components.records.map(r=>String(r.PermissionSetId)).filter(id=>Id.safeParse(id).success));
    const groupName=Name.safeParse(groupInfo.records[0]?.DeveloperName);
    if(groupName.success&&client.readMetadata){const source=`metadata:readMetadata:PermissionSetGroup:${groupName.data}`;
      try {const raw=z.record(z.string(),z.unknown()).parse(await client.readMetadata('PermissionSetGroup',[groupName.data]));sections.push({area:'permission-group-metadata',status:'observed',source,records:[raw],detail:'Declared members/muting; activation and dependencies still require current-user API verification.'});
        for(const r of metadataRecords(raw)){const muting=Array.isArray(r.mutingPermissionSets)?r.mutingPermissionSets:r.mutingPermissionSets?[r.mutingPermissionSets]:[];
          for(const value of muting.slice(0,5)){if(typeof value!=='string'||!/^[A-Za-z][A-Za-z0-9_.]*$/.test(value))continue;const muteSource=`metadata:readMetadata:MutingPermissionSet:${value}`;try{sections.push({area:'muting-permission-sets',status:'observed',source:muteSource,records:[z.record(z.string(),z.unknown()).parse(await client.readMetadata('MutingPermissionSet',[value]))],detail:'Enabled settings represent permissions muted only within the owning group.'});}catch{sections.push({area:'muting-permission-sets',status:'unknown',source:muteSource,records:[],detail:'Named muting metadata unavailable.'});}}
        }
      }catch{sections.push({area:'permission-group-metadata',status:'unknown',source,records:[],detail:'Group metadata/muting references unavailable.'});}
    }
  }
  const user=await query('persona-profile',`SELECT ProfileId,UserRoleId FROM User WHERE Id='${Id.parse(identity.userId)}' LIMIT 1`),profile=Id.safeParse(user.records[0]?.ProfileId);
  const assigned=[...new Set([...assignment.records.map(r=>String(r.PermissionSetId)).filter(id=>Id.safeParse(id).success),...componentSets])].slice(0,100);
  if(assigned.length||profile.success){const where=[...(assigned.length?[`Id IN (${ids(assigned)})`]:[]),...(profile.success?[`ProfileId='${profile.data}'`]:[])].join(' OR ');await query('permission-sets',`SELECT Id,Name,Type,ProfileId,IsOwnedByProfile FROM PermissionSet WHERE ${where} LIMIT 500`);}
  for(const object of input.snapshot.objects){Name.parse(object.name);const source=`/services/data/${client.apiVersion}/ui-api/object-info/${object.name}`;
    try {const info=z.object({apiName:z.string(),createable:z.boolean(),updateable:z.boolean(),deletable:z.boolean(),queryable:z.boolean(),fields:z.record(z.string(),z.object({createable:z.boolean(),updateable:z.boolean()}))}).parse(await client.get(source));if(info.apiName!==object.name)throw Error('Object mismatch');
      sections.push({area:'effective-api-permissions',status:'observed',source,records:[{object:info.apiName,createable:info.createable,updateable:info.updateable,deletable:info.deletable,queryable:info.queryable,fields:info.fields,readVisibility:'Only fields returned by current-user UI API; no record-level sharing conclusion'}],detail:'Current authenticated API persona operation flags; not proof of license/session activation, record access or browser permissions.'});
    }catch {sections.push({area:'effective-api-permissions',status:'unknown',source,records:[],detail:'Current-user UI API permission flags unavailable; assigned grant inventories are not substituted as effective access.'});}
    const raw=input.sections.filter(s=>s.area==='object-business-metadata');if(!raw.length)unknowns.push(`Sharing/validation metadata for ${object.name} not read.`);
    if(client.readMetadata){const source=`metadata:readMetadata:SharingRules:${object.name}`;try{sections.push({area:'sharing-constraints',status:'observed',source,records:[z.record(z.string(),z.unknown()).parse(await client.readMetadata('SharingRules',[object.name]))],detail:'Declared sharing rules only. Role hierarchy, groups, restriction/scoping rules and actual record visibility remain unknown.'});}catch{sections.push({area:'sharing-constraints',status:'unknown',source,records:[],detail:'Sharing rule metadata unavailable; effective record sharing unknown.'});}}
  }
  unknowns.push('Dynamic Apex references, runtime Flow conditions, business process success, licenses/session-activated permissions, restriction rules and record sharing remain unresolved.');
  const intelligence={...input,sections,unknowns:[...new Set([...unknowns,...sections.filter(s=>s.status==='unknown'||s.status==='partial').map(s=>`${s.area} coverage ${s.status}`)])]};
  intelligence.snapshot={...input.snapshot,intelligenceFingerprint:intelligenceFingerprint(intelligence)};
  return {intelligence,graph:buildComponentGraph(intelligence)};
}
// Group-local muting must not subtract a separately assigned grant. This is a grant calculation, not effective record authorization.
export function calculateGrant(direct:boolean[],groups:Array<{grants:boolean[];muted:boolean;complete:boolean}>,complete:boolean) {
  const granted=direct.some(Boolean)||groups.some(g=>g.complete&&!g.muted&&g.grants.some(Boolean));
  return {candidateGrant:granted?true:complete&&groups.every(g=>g.complete)?false:'unknown' as const,effectiveRecordAccess:'unknown' as const};
}
