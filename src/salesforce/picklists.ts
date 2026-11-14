import { z } from 'zod';
import type { DiscoveryReader } from '../agents/org-discovery.js';
const Name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),RecordType=z.string().regex(/^012[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/);
const Value=z.object({label:z.string(),value:z.string(),validFor:z.array(z.number().int().nonnegative()).optional()});
export const RecordTypePicklistsSchema=z.object({picklistFieldValues:z.record(Name,z.object({controllerValues:z.record(z.string(),z.number().int().nonnegative()),values:z.array(Value).max(2000),defaultValue:Value.nullable().optional()}))});
export async function readRecordTypePicklists(client:DiscoveryReader,object:string,recordTypeId:string) {
  Name.parse(object);RecordType.parse(recordTypeId);
  const source=`/services/data/${client.apiVersion}/ui-api/object-info/${object}/picklist-values/${recordTypeId}`;
  const values=RecordTypePicklistsSchema.parse(await client.get(source));
  return {object,recordTypeId,source,...values};
}
