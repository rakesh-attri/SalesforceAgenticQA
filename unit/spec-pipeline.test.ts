import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { History } from '../src/core/history.js';
import { KnowledgeIndex,retrievalMetrics } from '../src/knowledge/index.js';
import { createSpecPipeline,executionHash,PipelineInputSchema } from '../src/agents/pipeline.js';
import { SpecSchema,parseText,parseStructured } from '../src/specs/ingest.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { confirmDefect } from '../src/agents/intelligence.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { healReviewedWorkflow,workflowHash } from '../src/agents/healing.js';
import { evaluateReadiness,htmlReport } from '../src/agents/evaluation.js';
test('spec extraction never invents expected outcomes and rejects duplicate criteria',()=>{
  const spec=parseText('# Test\nID: sample\nObjects: Account,Contact\nPersona: QA\nAC1: [negative] Rejection preserves unpaid state','spec.md','v1');
  assert.equal(spec.acceptanceCriteria[0].kind,'negative');assert.deepEqual(spec.objects,['Account','Contact']);assert.equal(spec.persona,'QA');assert.equal(spec.acceptanceCriteria[0].expectedText,undefined);
  assert.throws(()=>parseText('Unstructured prose is insufficient','x','v1'));
  assert.throws(()=>parseText('AC1: First\nAC1: Second','x','v1'));
  const api=parseStructured({openapi:'3.1.0',paths:{'/accounts':{get:{responses:{'200':{},'404':{}}}}}},'api.yaml','v1');
  assert.equal(api.acceptanceCriteria.length,2);assert.equal(api.acceptanceCriteria[1].kind,'negative');
});
test('knowledge persists scope, review, source version and stale invalidation; retrieval metrics are deterministic',async()=>{
  const h=new History(':memory:'),index=new KnowledgeIndex(h);
  const source={id:'lesson',version:'v1',org:'fixture',permission:'QA',kind:'lesson' as const,status:'verified' as const,text:'Account regression',evidence:['schema:v1'],testIds:['T'],reviewer:'reviewer',capturedAt:new Date().toISOString()};
  try {
    await assert.rejects(index.ingest({...source,reviewer:undefined}));await index.ingest(source);
    await assert.rejects(index.ingest({...source,text:'Silently replaced source'}));
    assert.equal((await index.retrieve('Account',{org:'other',permission:'QA'})).length,0);
    await index.ingest({...source,version:'v2'});assert.equal(index.all({org:'fixture',permission:'QA'}).find(d=>d.version==='v1')?.status,'deprecated');
    assert.equal((await index.retrieve('Account',{org:'fixture',permission:'QA'}))[0].citation,'lesson@v2');
    index.invalidate({org:'fixture',permission:'QA'},'schema:v1');assert.equal((await index.retrieve('Account',{org:'fixture',permission:'QA'})).length,0);
    await index.ingest({...source,version:'v3'});index.bindSchema({org:'fixture',permission:'QA'},'schema-one');
    assert.deepEqual(index.bindSchema({org:'fixture',permission:'QA'},'schema-two'),['lesson']);assert.equal((await index.retrieve('Account',{org:'fixture',permission:'QA'})).length,0);
    assert.deepEqual(retrievalMetrics(['lesson'],['lesson','other']),{precision:0.5,recall:1});
  } finally {h.close();}
});
test('Specs -> generated browser/API checks -> failure evidence -> confirmed lesson -> future regression', {timeout:90000},async()=>{
  let broken=true;let observed='Unpaid';
  const server=createServer((req,res)=>{
    if(req.url==='/state'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:observed}));return;}
    if(req.url==='/apply'){observed=broken?'Declined':'Paid';res.end(observed);return;}
    if(req.url!=='/'){res.writeHead(404);res.end();return;}
    observed='Unpaid';res.end('<div data-testid="status" aria-label="status">Unpaid</div><button onclick="fetch(\'/apply\').then(r=>r.text()).then(s=>document.querySelector(\'[data-testid=status]\').textContent=s)">Apply</button>');
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const root=await mkdtemp(resolve('.state/spec-integration-')),path=join(root,'history.sqlite');
  let h=new History(path),index=new KnowledgeIndex(h);
  try {
    const org=OrgSnapshotSchema.parse({orgAlias:'fixture',source:'fixture',observedAt:new Date().toISOString(),objects:[]});
    const spec=SpecSchema.parse({id:'status',title:'Apply status',description:'Apply updates status to Paid',objects:[],acceptanceCriteria:[{id:'AC1',kind:'positive',text:'Apply updates status to Paid',expectedText:'Paid'}],source:'fixture-spec.json',version:'v1'});
    const make=(runId:string)=>PipelineInputSchema.parse({runId,spec,org,orgVersion:snapshotVersion(org),permission:'QA',allowedOrigins:[origin],mappings:[{criterionId:'AC1',workflow:{id:'status-regression',criterion:'AC1',origin,path:'/',source:'reviewed-fixture-workflow:v1',reviewer:'fixture-reviewer',steps:[{action:'click',locator:{by:'role',value:'button',name:'Apply'}}],assertion:{locator:{by:'testId',value:'status'},text:'Paid'},apiAssertions:[{path:'/state',source:'fixture-contract:status',expected:{status:'Paid'}}]}}]});
    const run=async(runId:string,execute=true)=>{const input=make(runId);if(execute)input.executionApproval={reviewer:'fixture-reviewer',hash:executionHash(input)};return createSpecPipeline({history:h,knowledge:index,root}).invoke({input});};
    const failure=await run('seeded-failure');assert.equal(failure.execution?.exitCode,1);assert.equal(failure.execution?.results[0].status,'failed');
    assert.ok(failure.execution?.results[0].evidence.some(e=>e.endsWith('.png')));assert.ok(failure.investigations[0].traces[0].eventCount>0);
    const proposal=failure.investigations[0];assert.equal(proposal.status,'proposed');assert.equal(proposal.confidence,'hypothesis');
    broken=false;const fixed=await run('verified-fix');assert.equal(fixed.execution?.exitCode,0);assert.equal(fixed.execution?.results[0].status,'passed');
    await confirmDefect(h,index,{org:'fixture',permission:'QA'},proposal,{reviewer:'fixture-reviewer',rootCause:'Seeded fixture returned Declined from apply handler',fix:'Corrected fixture handler to return Paid; assertion unchanged',regressionRun:'verified-fix'});
    await confirmDefect(h,index,{org:'fixture',permission:'QA'},proposal,{reviewer:'fixture-reviewer',rootCause:'Seeded fixture returned Declined from apply handler',fix:'Corrected fixture handler to return Paid; assertion unchanged',regressionRun:'verified-fix'});
    assert.equal(h.lessons().length,1);
    await assert.rejects(confirmDefect(h,index,{org:'fixture',permission:'QA'},proposal,{reviewer:'fixture-reviewer',rootCause:'Conflicting root cause',fix:'different',regressionRun:'verified-fix'}),/Conflicting/);
    h.close();h=new History(path);index=new KnowledgeIndex(h);
    const future=await run('future-planning',false);assert.ok(future.context.some(d=>d.kind==='defect'));
    assert.equal(future.analysis.selection[0].id,'status-regression');assert.equal(future.analysis.selection[0].mandatory,true);assert.ok(future.analysis.selection[0].lessons.length);
    assert.equal(future.execution,undefined);assert.equal(h.results().length,2);
    const original=make('repair-original').mappings[0].workflow;
    const repair=await healReviewedWorkflow({original,originalHash:workflowHash(original),target:'assertion',locator:{by:'label',value:'status'},reviewer:'fixture-reviewer',failureRun:'seeded-failure',runId:'locator-rerun',evidence:proposal.evidence},{history:h,root:join(root,'repair'),allowedOrigins:[origin]});
    assert.equal(repair.candidate.assertion.text,original.assertion.text);assert.equal(repair.execution.results[0].status,'passed');
    await assert.rejects(healReviewedWorkflow({original,originalHash:'wrong',target:'assertion',locator:{by:'label',value:'status'},reviewer:'fixture-reviewer',failureRun:'seeded-failure',runId:'denied',evidence:proposal.evidence},{history:h,root:join(root,'denied'),allowedOrigins:[origin]}));
    const report=JSON.parse(await readFile(future.reportPath,'utf8'));assert.equal(report.execution.status,'not-executed');assert.ok(report.analysis.questions.some((q:string)=>q.includes('negative')));
    await assert.rejects(createSpecPipeline({history:h,knowledge:index,root}).invoke({input:{...make('stale'),orgVersion:'wrong'}}));
    await assert.rejects(createSpecPipeline({history:h,knowledge:index,root}).invoke({input:{...make('bad-approval'),executionApproval:{reviewer:'reviewer',hash:'wrong'}}}));
  } finally {h.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
test('quality evaluation never counts blocked/unexecuted criteria as passed and HTML escapes evidence',()=>{
  assert.equal(evaluateReadiness([{id:'T',status:'blocked',evidence:['s']}],[]).passed,0);
  assert.equal(evaluateReadiness([{id:'T',status:'blocked',evidence:['s']}],[]).executionCoverage,0);
  assert.ok(!htmlReport({message:'<script>bad()</script>'}).includes('<script>'));
});
