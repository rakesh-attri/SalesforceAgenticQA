import { z } from 'zod';
import type { SalesforceClient } from './client.js';
const Name=z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
export const PageSchema=z.object({done:z.boolean(),records:z.array(z.record(z.string(),z.unknown())),nextRecordsUrl:z.string().optional()});
export async function query(client:SalesforceClient,soql:string,tooling=false) {
  if(!/^SELECT\s/i.test(soql) || soql.length>10000) throw Error('Only bounded SELECT is supported');
  const path=`/services/data/${client.apiVersion}/${tooling?'tooling/':''}query?q=${encodeURIComponent(soql)}`;
  return PageSchema.parse(await client.get(path));
}
const toolingFields={ApexClass:'Id,Name,NamespacePrefix',FlowDefinition:'Id,DeveloperName,ActiveVersionId',ValidationRule:'Id,ValidationName,Active,EntityDefinitionId'} as const;
export async function discoverTooling(client:SalesforceClient,kinds:Array<keyof typeof toolingFields>) {
  const output=[];
  for(const kind of new Set(kinds)) {
    if(!(kind in toolingFields)) throw Error('Unsupported metadata kind');
    const source=`SELECT ${toolingFields[kind]} FROM ${kind} LIMIT 200`;
    try {const page=await query(client,source,true);output.push({kind,source,status:page.done?'observed':'partial',records:page.records});}
    catch {output.push({kind,source,status:'unknown',records:[]});}
  }
  return output;
}
export async function verifyRecord(client:SalesforceClient,object:string,id:string,expected:Record<string,unknown>,attempts=5) {
  Name.parse(object);if(!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)) throw Error('Invalid record ID');
  const fields=Object.keys(expected);fields.forEach(f=>Name.parse(f));
  if(!fields.length || attempts<1 || attempts>20) throw Error('Expected fields and bounded attempts required');
  for(let n=0;n<attempts;n++) {
    const page=await query(client,`SELECT Id,${fields.join(',')} FROM ${object} WHERE Id = '${id}' LIMIT 1`);
    if(page.records.length===1 && fields.every(f=>page.records[0][f]===expected[f])) return page.records[0];
    if(n+1<attempts) await new Promise(r=>setTimeout(r,250));
  }
  throw Error('SOQL expected state not observed');
}
