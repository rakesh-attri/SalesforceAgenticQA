import {z} from 'zod';
import {BrowserReviewSchema,browserPlanHash,fingerprint,digest,type BrowserReview} from '../execution/browser-policy.js';
import {sameSalesforceIdentity} from '../execution/lightning-identity.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/),Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/);
export const ObservationReadSchema=z.object({plan:z.object({version:z.literal(1),purpose:z.literal('exact-record-independent-observation'),browserHash:Hash,orgId:Id,userId:Id,sourceVersion:Hash,records:z.array(z.object({object:z.enum(['Account','Contact']),id:Id,fields:z.array(z.enum(['Id','Name','LastName','AccountId','LastModifiedDate'])).min(3).max(5)}).strict()).min(1).max(2),relationship:z.object({contactId:Id,accountId:Id}).strict().optional()}).strict(),approval:z.object({operator:z.string().trim().min(1),hash:Hash,expiresAt:z.string().datetime()}).strict()}).strict();
export type ObservationRead=z.infer<typeof ObservationReadSchema>;
export type PrivateRecordObservation={object:'Account'|'Contact';id:string;values:Record<string,string|null>;version:string};
export function authorizeObservationRead(raw:unknown,review:BrowserReview,identity:{Id:string;userId:string},now=Date.now()){
 const grant=ObservationReadSchema.parse(raw),p=grant.plan,r=review.plan;
 if(review.approval.operator==='REVIEW_REQUIRED'||review.approval.hash!==browserPlanHash(r)||Date.parse(review.approval.expiresAt)<=now)throw Error('Current browser authorization is required for independent reads');
 if(grant.approval.operator==='REVIEW_REQUIRED'||grant.approval.operator!==review.approval.operator||grant.approval.hash!==fingerprint(p)||p.browserHash!==browserPlanHash(r)||p.orgId!==identity.Id||p.userId!==identity.userId||p.orgId!==r.orgId||p.userId!==r.userId||p.sourceVersion!==r.sourceVersion||Date.parse(grant.approval.expiresAt)<=now||Date.parse(grant.approval.expiresAt)>Date.parse(review.approval.expiresAt))throw Error('Exact current independent-read approval required');
 if(r.ownedDataPlanHash||r.budgets.actions||p.records.length!==r.records.length||new Set(p.records.map(x=>x.id)).size!==p.records.length)throw Error('Observation reads grant no action or ownership authority');
 for(const record of p.records){if(!r.records.some(ref=>ref.object===record.object&&ref.id===record.id&&ref.purpose==='observation-only')||record.fields.some(f=>record.object==='Account'&&!['Id','Name','LastModifiedDate'].includes(f))||new Set(record.fields).size!==record.fields.length||!['Id','Name','LastModifiedDate'].every(f=>record.fields.includes(f as 'Id')))throw Error('Independent read outside closed object/field/reference scope');}
 if(p.relationship&&(!p.records.some(r=>r.object==='Contact'&&r.id===p.relationship!.contactId&&r.fields.includes('AccountId'))||!p.relationship.accountId.startsWith('001')))throw Error('Relationship comparison must name the approved Contact and Account');
 return grant;
}
// Query construction and private values stay in the trusted API host. No SOQL,
// arbitrary fields, credentials or record values are exposed through MCP.
export async function readObservationRecords(raw:unknown,review:BrowserReview,identity:{Id:string;userId:string},query:(soql:string)=>Promise<unknown>):Promise<PrivateRecordObservation[]>{
 const grant=authorizeObservationRead(raw,review,identity),out:PrivateRecordObservation[]=[];
 for(const record of grant.plan.records){authorizeObservationRead(grant,review,identity);let result:unknown;try{result=await query(`SELECT ${record.fields.join(',')} FROM ${record.object} WHERE Id='${record.id}' LIMIT 1`);}catch{throw Error('Approved independent read unavailable; absent/denied data is unknown');}
  const parsed=z.object({records:z.array(z.record(z.string(),z.unknown())).length(1)}).safeParse(result),row=parsed.success?parsed.data.records[0]:undefined;
  if(!row||typeof row.Id!=='string'||!sameSalesforceIdentity(row.Id,record.id)||record.fields.some(f=>!(f in row)||row[f]!==null&&typeof row[f]!=='string')||typeof row.Name!=='string'||!row.Name||typeof row.LastModifiedDate!=='string'||!row.LastModifiedDate)throw Error('Independent exact record/fields unavailable; no success inferred');
  const values=Object.fromEntries(record.fields.map(f=>[f,row[f] as string|null]));out.push({object:record.object,id:record.id,values,version:fingerprint(values)});
 }return out;
}
export function independentObservationReceipt(raw:unknown,before:PrivateRecordObservation[],after:PrivateRecordObservation[]){
 const grant=ObservationReadSchema.parse(raw),records=grant.plan.records.map(ref=>{const b=before.find(r=>r.object===ref.object&&r.id===ref.id),a=after.find(r=>r.object===ref.object&&r.id===ref.id);return{object:ref.object,recordHash:digest(ref.id),status:!b||!a?'unknown':b.version===a.version?'unchanged':'drift',beforeVersion:b?.version,afterVersion:a?.version,fields:ref.fields,permissionConclusion:'not-established-by-field-presence'};});
 const contact=after.find(r=>r.object==='Contact'&&r.id===grant.plan.relationship?.contactId),value=contact?.values.AccountId,relationship=!grant.plan.relationship?'not-reviewed':typeof value!=='string'?'unknown':sameSalesforceIdentity(value,grant.plan.relationship.accountId)?'verified':'mismatch';
 return{records,relationship,status:records.every(r=>r.status==='unchanged')&&!['unknown','mismatch'].includes(relationship)?'verified':'unknown-or-drift',sourceVersion:grant.plan.sourceVersion,readGrantHash:fingerprint(grant.plan),recordWrites:0};
}
