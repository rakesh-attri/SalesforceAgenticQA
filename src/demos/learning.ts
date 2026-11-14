import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { History } from '../core/history.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { SpecSchema } from '../specs/ingest.js';
import { OrgSnapshotSchema } from '../core/types.js';
import { snapshotVersion } from '../knowledge/snapshots.js';
import { PipelineInputSchema,createSpecPipeline,executionHash } from '../agents/pipeline.js';
import { confirmDefect } from '../agents/intelligence.js';
import { saveJson } from '../core/io.js';
import { intelligentSpecPlan } from '../agents/spec-intelligence.js';
export async function demonstrateLearning() {
  let broken=true,status='Unpaid';
  const server=createServer((req,res)=>{
    if(req.url==='/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status}));return;}
    if(req.url==='/apply'){status=broken?'Declined':'Paid';res.end(status);return;}
    if(req.url!=='/'){res.writeHead(404);res.end();return;}
    status='Unpaid';res.end('<div data-testid="status">Unpaid</div><button onclick="fetch(\'/apply\').then(r=>r.text()).then(s=>document.querySelector(\'[data-testid=status]\').textContent=s)">Apply</button>');
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,id=`learning-${randomUUID()}`,root=resolve('artifacts',id);
  const h=new History(),knowledge=new KnowledgeIndex(h),scope={org:'fixture-learning',permission:'QA'};
  try {
    const org=OrgSnapshotSchema.parse({orgAlias:scope.org,source:'fixture',observedAt:new Date().toISOString(),objects:[]});
    const spec=SpecSchema.parse({id:'fixture-status',title:'Apply status',description:'Apply updates status to Paid',objects:[],source:'demo:reviewed-fixture-spec',version:'1',acceptanceCriteria:[{id:'AC1',text:'Apply updates status to Paid',expectedText:'Paid'}]});
    const run=async(suffix:string,execute=true)=>{
      const input=PipelineInputSchema.parse({runId:`${id}-${suffix}`,spec,org,orgVersion:snapshotVersion(org),permission:scope.permission,allowedOrigins:[origin],mappings:[{criterionId:'AC1',workflow:{id:'status-regression',criterion:'AC1',reviewer:'fixture-maintainer',source:'demo:reviewed-fixture-workflow',origin,path:'/',steps:[{action:'click',locator:{by:'role',value:'button',name:'Apply'}}],assertion:{locator:{by:'testId',value:'status'},text:'Paid'},apiAssertions:[{path:'/state',source:'demo:fixture-api-contract',expected:{status:'Paid'}}]}}]});
      if(execute)input.executionApproval={reviewer:'fixture-maintainer',hash:executionHash(input)};
      return createSpecPipeline({history:h,knowledge,root}).invoke({input});
    };
    const failed=await run('failure');if(failed.execution?.results[0].status!=='failed')throw Error('Seeded failure was not observed');
    broken=false;const fixed=await run('regression');if(fixed.execution?.results[0].status!=='passed')throw Error('Corrected fixture did not pass unchanged assertion');
    await confirmDefect(h,knowledge,scope,failed.investigations[0],{reviewer:'fixture-maintainer',rootCause:'Seeded fixture handler returned Declined',fix:'Return Paid from corrected fixture handler; assertions unchanged',regressionRun:`${id}-regression`});
    const future=await run('future',false);
    if(!future.analysis.selection.find(s=>s.id==='status-regression')?.lessons.length)throw Error('Verified lesson did not influence future plan');
    const intelligent=await intelligentSpecPlan(spec,org,knowledge,h,scope.permission,future.input.mappings);
    if(!intelligent.selection.find(s=>s.id==='status-regression')?.mandatory)throw Error('Confirmed defect did not influence intelligent spec planning');
    const contrast=new History(':memory:');let learningImpact;
    try {const without=await intelligentSpecPlan(spec,org,new KnowledgeIndex(contrast),h,scope.permission,future.input.mappings),before=without.selection.find(s=>s.id==='status-regression')!,after=intelligent.selection.find(s=>s.id==='status-regression')!;if(before.mandatory||after.score<=before.score)throw Error('Verified learning did not change regression priority');learningImpact={withoutReviewedKnowledge:{mandatory:before.mandatory,score:before.score},withReviewedKnowledge:{mandatory:after.mandatory,score:after.score}};}finally{contrast.close();}
    const intelligentPlan=resolve(root,'intelligent-plan.json');await saveJson(intelligentPlan,intelligent);
    const manifest={mode:'offline-fixture',seededFailure:failed.reportPath,verifiedRegression:fixed.reportPath,futurePlan:future.reportPath,intelligentPlan,lesson:failed.investigations[0].id,selected:future.analysis.selection,intelligentSelection:intelligent.selection,learningImpact,notes:'No Salesforce or financial transaction executed. Seeded failure is expected demonstration evidence.'};
    await saveJson(resolve(root,'manifest.json'),manifest);return {path:resolve(root,'manifest.json'),...manifest};
  }finally{h.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
}
