import { z } from 'zod';
import type { Result } from '../core/history.js';
export const CaseSchema=z.object({id:z.string().min(1),criteria:z.array(z.string()),components:z.array(z.string()),criticality:z.number().int().min(0).max(5),mandatory:z.boolean()});
export type Case=z.infer<typeof CaseSchema>;
export function prioritize(cases:Case[],changed:string[],history:Result[],budget=Infinity) {
  if(budget<0) throw Error('Invalid budget');
  const scored=cases.map(input=>{const c=CaseSchema.parse(input),impact=c.components.filter(v=>changed.includes(v)),failures=history.filter(r=>r.testId===c.id&&r.status==='failed').length;return {...c,score:c.criticality*10+impact.length*20+Math.min(failures,5)*5,reasons:[`criticality:${c.criticality}`,`changed:${impact.join(',')||'none'}`,`historical failures:${failures}`]};}).sort((a,b)=>Number(b.mandatory)-Number(a.mandatory)||b.score-a.score||a.id.localeCompare(b.id));
  return scored.filter((c,i)=>c.mandatory||i<budget);
}
export function componentsFromDiff(diff:string) {return [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m=>m[1]))].sort();}
export function gaps(criteria:string[],cases:Case[]) {return criteria.filter(ac=>!cases.some(c=>c.criteria.includes(ac)));}
export function investigate(input:{message:string;evidence:string[]}) {
  if(!input.evidence.length) return {classification:'unknown',confidence:'hypothesis',evidence:[],next:'Collect trace, assertion and API evidence'};
  const classification=/strict mode violation|locator.*resolved to 0/i.test(input.message)?'automation':/INVALID_FIELD|REQUIRED_FIELD_MISSING/i.test(input.message)?'test-data':/ECONNREFUSED|ENOTFOUND|browser.*closed/i.test(input.message)?'environment':'unknown';
  return {classification,confidence:'hypothesis',evidence:input.evidence,next:'Reproduce against independently verified acceptance criteria'};
}
export function defect(testId:string,message:string,evidence:string[],expected:string) {
  if(!expected.trim()) throw Error('Verified expected behavior required');
  return {title:`Investigate ${testId}`,status:'proposed',expected,observed:message,evidence,investigation:investigate({message,evidence})};
}
export function proposeRepair(input:{testId:string;oldLocator:string;newLocator:string;originalExpected:string;newExpected:string;evidence:string[];reviewer:string;rerun:Result}) {
  if(input.originalExpected!==input.newExpected || !input.evidence.length || !input.reviewer.trim() || input.rerun.status!=='passed' || input.rerun.testId!==input.testId || input.newLocator===input.oldLocator) throw Error('Repair intent, evidence, review or rerun verification failed');
  return {...input,status:'reviewed-proposal' as const};
}
