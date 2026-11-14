import { z } from 'zod';
import { PageSchema } from './operations.js';
import type { DiscoveryReader } from '../agents/org-discovery.js';
export const ReadBudgetSchema=z.object({maxPages:z.number().int().min(1).max(20).default(3),maxRecords:z.number().int().min(1).max(2000).default(500)});
export async function readPages(client:DiscoveryReader,soql:string,tooling=false,budget:unknown={}) {
  const b=ReadBudgetSchema.parse(budget);
  if(!/^SELECT\s/i.test(soql)||soql.length>10000||!/\bLIMIT\s+[1-9][0-9]*\s*$/i.test(soql))throw Error('Discovery queries require bounded SELECT');
  const prefix=`/services/data/${client.apiVersion}/${tooling?'tooling/':''}query`,records:Record<string,unknown>[]=[],sources:string[]=[],seen=new Set<string>();
  let path=`${prefix}?q=${encodeURIComponent(soql)}`,complete=false;
  for(let page=0;page<b.maxPages;page++){
    if(seen.has(path))throw Error('Discovery pagination repeated a cursor');seen.add(path);sources.push(path);
    const result=PageSchema.parse(await client.get(path));records.push(...result.records.slice(0,b.maxRecords-records.length));
    if(result.done){complete=records.length<b.maxRecords&&result.records.length<=b.maxRecords;break;}
    if(records.length>=b.maxRecords||page+1>=b.maxPages)break;
    if(!result.nextRecordsUrl||!result.nextRecordsUrl.startsWith(`${prefix}/`)||!/^[A-Za-z0-9_-]+$/.test(result.nextRecordsUrl.slice(prefix.length+1)))throw Error('Discovery pagination cursor escaped query boundary');
    path=result.nextRecordsUrl;
  }
  return {records,sources,status:complete?'observed' as const:'partial' as const};
}
