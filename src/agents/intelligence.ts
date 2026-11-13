import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { History } from '../core/history.js';
import { KnowledgeIndex,type Scope } from '../knowledge/index.js';
export async function inspectTrace(path:string) {
  const bytes=await readFile(path);if(bytes.length>25_000_000)throw Error('Trace exceeds limit');
  const entries=unzipSync(bytes,{filter:f=>f.originalSize<10_000_000 && /\.(trace|network)$/.test(f.name)});
  const events:unknown[]=[];for(const data of Object.values(entries)){for(const line of new TextDecoder().decode(data).split('\n').filter(Boolean)){try{events.push(JSON.parse(line));}catch{throw Error('Invalid trace JSON');}if(events.length>50000)throw Error('Trace event budget exceeded');}}
  return {path,eventCount:events.length,errors:events.flatMap(event=>{const e=event as {type?:string;error?:unknown};return e.error?[e.error]:[];})};
}
export async function investigateFailure(index:KnowledgeIndex,scope:Scope,input:{testId:string;message:string;expected:string;evidence:string[];api?:Array<{status:number;errorCode?:string}>;observed?:string}) {
  const related=(await index.retrieve(`${input.testId} ${input.message} ${input.expected}`,scope)).filter(d=>d.kind==='defect'||d.kind==='lesson');
  const traces=[];for(const path of input.evidence.filter(e=>e.endsWith('.zip')))traces.push(await inspectTrace(path));
  let classification='unknown';
  if(input.api?.some(a=>['REQUIRED_FIELD_MISSING','FIELD_CUSTOM_VALIDATION_EXCEPTION','INVALID_FIELD'].includes(a.errorCode??'')))classification='test-data';
  else if(/ECONNREFUSED|ENOTFOUND|browser.*closed/.test(input.message)||input.api?.some(a=>a.status===401||a.status>=500))classification='environment';
  else if(/strict mode violation|locator.*resolved to 0/i.test(input.message))classification='automation';
  else if(input.observed!==undefined&&input.observed!==input.expected&&input.evidence.length)classification='product';
  const fingerprint=createHash('sha256').update(JSON.stringify([scope.org,scope.permission,input.testId,input.expected,classification])).digest('hex');
  return {id:`defect-${fingerprint.slice(0,16)}`,fingerprint,status:'proposed' as const,confidence:'hypothesis' as const,classification,...input,traces,related:related.map(d=>d.citation),duplicateCandidates:related.filter(d=>d.text.includes(fingerprint)).map(d=>d.citation)};
}
export const ConfirmSchema=z.object({reviewer:z.string().min(1),rootCause:z.string().min(1),fix:z.string().min(1),regressionRun:z.string().min(1)});
export async function confirmDefect(history:History,index:KnowledgeIndex,scope:Scope,proposal:Awaited<ReturnType<typeof investigateFailure>>,review:z.infer<typeof ConfirmSchema>) {
  review=ConfirmSchema.parse(review);
  if(!proposal.evidence.length||!history.results().some(r=>r.testId===proposal.testId&&r.status==='failed'&&r.evidence.some(e=>proposal.evidence.includes(e))))throw Error('Recorded failing execution evidence required');
  if(!history.results().some(r=>r.runId===review.regressionRun&&r.testId===proposal.testId&&r.status==='passed'))throw Error('Passing regression evidence required');
  const existing=history.lessons().find(l=>l.id===proposal.id);
  if(existing&&(existing.testId!==proposal.testId||existing.rootCause!==review.rootCause))throw Error('Conflicting confirmed lesson requires explicit reconciliation');
  if(!existing)history.learn({id:proposal.id,testId:proposal.testId,reviewer:review.reviewer,rootCause:review.rootCause,evidence:proposal.evidence,regressionRun:review.regressionRun});
  await index.ingest({id:proposal.id,version:review.regressionRun,org:scope.org,permission:scope.permission,kind:'defect',status:'verified',text:`${proposal.fingerprint} ${proposal.testId} ${proposal.expected} ${review.rootCause} Fix: ${review.fix}`,evidence:proposal.evidence,testIds:[proposal.testId],reviewer:review.reviewer,capturedAt:new Date().toISOString()});
  return {id:proposal.id,status:'verified',rootCause:review.rootCause,fix:review.fix};
}
