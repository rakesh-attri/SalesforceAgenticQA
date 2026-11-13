import type { Result } from '../core/history.js';
export function evaluateReadiness(scenarios:Array<{id:string;status:string;evidence:string[]}>,results:Result[]) {
  const executed=new Set(results.filter(r=>r.status!=='skipped').map(r=>r.testId));
  return {totalCriteria:scenarios.length,reviewed:scenarios.filter(s=>s.status==='reviewed').length,blocked:scenarios.filter(s=>s.status==='blocked').length,groundedFraction:scenarios.filter(s=>s.evidence.length>0).length/Math.max(scenarios.length,1),executionCoverage:scenarios.filter(s=>executed.has(s.id)).length/Math.max(scenarios.length,1),passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,skipped:results.filter(r=>r.status==='skipped').length,kind:'deterministic-evaluation'};
}
export function crossRunTrends(results:Result[]) {
  return [...new Set(results.map(r=>r.testId))].map(testId=>{const runs=results.filter(r=>r.testId===testId),executed=runs.filter(r=>r.status!=='skipped');return {testId,runs:runs.length,failures:executed.filter(r=>r.status==='failed').length,failureRate:executed.filter(r=>r.status==='failed').length/Math.max(executed.length,1),mixedOutcomes:executed.some(r=>r.status==='failed')&&executed.some(r=>r.status==='passed'),regressionRecommendation:executed.some(r=>r.status==='failed')?'retain regression; review root cause':'no historical failure'};});
}
export function htmlReport(input:unknown) {
  const text=JSON.stringify(input,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>SalesforceAgenticQA execution evidence</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;background:#f6f8fa;color:#182230}pre{white-space:pre-wrap;background:white;padding:24px;border:1px solid #ccd5df;border-radius:8px}</style></head><body><h1>Execution and quality evidence</h1><p>Actual outcomes, blocked criteria and traceable decisions. Fixture results do not validate Salesforce.</p><pre>${text}</pre></body></html>`;
}
