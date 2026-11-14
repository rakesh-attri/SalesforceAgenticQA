import { z } from 'zod';
import { createHash } from 'node:crypto';
import { OrgSnapshotSchema,ObjectSchema, type OrgSnapshot } from '../core/types.js';
import { SalesforceClient } from '../salesforce/client.js';
const DescribeSchema=z.object({
  name:z.string(), label:z.string(), createable:z.boolean(),
  fields:z.array(z.object({name:z.string(),type:z.string(),nillable:z.boolean(),createable:z.boolean(),
    defaultedOnCreate:z.boolean().optional(),referenceTo:z.array(z.string()).optional(),
    picklistValues:z.array(z.object({active:z.boolean(),value:z.string()})).optional(),relationshipName:z.string().nullable().optional(),relationshipOrder:z.number().nullable().optional(),restrictedPicklist:z.boolean().optional(),length:z.number().optional(),precision:z.number().optional(),scale:z.number().optional(),updateable:z.boolean().optional()})),
  recordTypeInfos:ObjectSchema.shape.recordTypeInfos,
  childRelationships:ObjectSchema.shape.childRelationships,
});
export interface DiscoveryReader { apiVersion:string; get<T>(path:string):Promise<T> }
export async function discoverOrg(client:DiscoveryReader,objectNames:string[]):Promise<OrgSnapshot> {
  if(!objectNames.length || objectNames.length>50 || objectNames.some(n=>!/^[A-Za-z][A-Za-z0-9_]*$/.test(n))) throw Error('Provide 1 to 50 valid explicit object names');
  const objects:OrgSnapshot['objects']=[],coverage:NonNullable<OrgSnapshot['coverage']>=[];
  for(const name of new Set(objectNames)) {
    const path=`/services/data/${client.apiVersion}/sobjects/${name}/describe`;
    const described=DescribeSchema.parse(await client.get<unknown>(path));
    if(described.name!==name) throw Error('Describe response object does not match request');
    objects.push({...described,fields:described.fields.map(f=>({...f,picklistValues:(f.picklistValues??[]).filter(p=>p.active).map(p=>p.value)}))});
    coverage.push({area:`describe:${name}`,status:'observed',source:path,detail:'API field requirements only; picklists are not record-type scoped.'});
  }
  for(const area of ['record-type-picklists','validation-rules','flows','apex','permissions','sharing','browser-workflows']) coverage.push({area,status:'unknown',source:'discovery:scope',detail:'Not inspected. Describe metadata does not establish business workflow validity.'});
  return OrgSnapshotSchema.parse({orgAlias:process.env.SFQA_ORG_ALIAS||'authorized-org',observedAt:new Date().toISOString(),source:'salesforce-api',objects,coverage});
}
export async function discoverLiveOrg(objectNames:string[]):Promise<OrgSnapshot> {
  if(!objectNames.length || objectNames.length>50 || objectNames.some(n=>!/^[A-Za-z][A-Za-z0-9_]*$/.test(n))) throw Error('Provide 1 to 50 valid explicit object names');
  const client=await SalesforceClient.connect(),identity=await client.identity();
  return OrgSnapshotSchema.parse({...await discoverOrg(client,objectNames),orgIdentityHash:createHash('sha256').update(identity.Id).digest('hex')});
}
