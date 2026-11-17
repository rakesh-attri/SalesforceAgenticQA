import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {lightningFixture} from '../../fixtures/lightning-server.js';
import {testDesignFixture} from './test-design.js';
import {SpecSchema} from '../specs/ingest.js';
import {History} from '../core/history.js';
import {KnowledgeIndex} from '../knowledge/index.js';
import {knowledgeFingerprint} from '../knowledge/snapshots.js';
import {exploreFixture} from '../agents/fixture-explorer.js';
import {discoverApplication,ApplicationReviewStore,compileReviewedApplication,approveApplicationModel,indexApplicationKnowledge,type ApplicationStudy} from '../agents/application-intelligence.js';
import {designSalesforceTests} from '../agents/test-design.js';
import {writeApplicationReport} from '../agents/application-report.js';
import {writeTestDesignReport} from '../agents/test-design-report.js';
import {previewBrowserDebug} from '../execution/browser-debug.js';

// Every answer in this demo describes the synthetic fixture. No operator approval
// for a Salesforce session, permission, factory or execution is manufactured.
export function fixtureApplicationAnswers(study:ApplicationStudy,origin:string){
 return study.questions.map(q=>{
  let answer:unknown;
  if(q.kind==='transition')answer={transitionId:q.transitionId};
  else if(q.kind==='business-rule')answer={criterionId:q.criterionId,object:q.object,persona:'QA',when:'Reviewed synthetic fixture state',observable:'fixture-status',expected:q.object==='Account'?'Draft ready':'Contact workspace',prerequisites:['Synthetic loopback fixture and separately reviewed QA persona'],dataRequirements:[{object:q.object,field:q.object==='Account'?'Name':'LastName',constraint:'Synthetic value only; no live data grant'}],components:[q.object==='Account'?'Field:Account.Name':'Field:Contact.LastName']};
  else if(q.kind==='workflow')answer={object:q.object,workflow:{id:`application-${q.object!.toLowerCase()}`,criterion:q.criterionId,source:'fixture:executed-reviewed-actions',reviewer:'Fixture Reviewer',origin,path:q.object==='Account'?'/lightning/o/Account':'/s/contacts',steps:q.object==='Account'?[{locator:{by:'label',value:'Account name'},action:'fill',value:'Synthetic QA Account'},{locator:{by:'role',value:'button',name:'Review draft'},action:'click'}]:[],assertion:{locator:{by:'testId',value:q.object==='Account'?'draft-status':'contact-status'},text:q.object==='Account'?'Draft ready':'Contact workspace'}},...(q.object==='Contact'?{api:{object:'Account',fields:['Name'],expected:{Name:'Synthetic QA Account'}}}:{})};
  else answer={text:q.kind==='permission'?'QA persona requires independently approved object/field/record access; no execution permissions granted.':'Review the exact synthetic observed page and stable element contracts.'};
  const reject=q.kind==='transition'&&study.transitions.find(t=>t.id===q.transitionId)?.status!=='observed';
  return{studyVersion:study.version,questionId:q.id,operator:'Fixture Reviewer',decision:reject?'reject' as const:'accept' as const,reason:reject?'Reverse navigation was not observed; retain as a discovery question.':'Explicit synthetic fixture contract review only.',...(reject?{}:{answer}),sources:q.sources};
 });
}

export async function applicationIntelligenceFixture(){const f=await testDesignFixture();return{...f,spec:SpecSchema.parse({...f.spec,id:'application-discovery-fixture',source:'fixture:application-requirements',version:'application-fixture-v1',acceptanceCriteria:[{id:'AC1',text:'Account draft is ready after reviewed input',kind:'positive',expectedText:'Draft ready'},{id:'AC2',text:'Contact workspace displays the integration view',kind:'integration',expectedText:'Contact workspace'}]})};}
export async function demonstrateApplicationIntelligence(){
 const f=await applicationIntelligenceFixture(),spec=f.spec,historyPath=`.state/application-intelligence-${randomUUID()}.sqlite`,history=new History(historyPath),server=lightningFixture();server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw Error('Fixture address missing');const origin=`http://127.0.0.1:${address.port}`;
 try{
  const observation=await exploreFixture({mode:'FIXTURE',syntheticOnly:true,origin,reviewer:'Fixture Reviewer',source:'fixture:bounded-application-discovery',paths:['/lightning/o/Account','/s/contacts'],actions:[{path:'/lightning/o/Account',locator:{by:'label',value:'Account name'},action:'fill',value:'Synthetic QA Account'},{path:'/lightning/o/Account',locator:{by:'role',value:'button',name:'Review draft'},action:'click'},{path:'/lightning/o/Account',locator:{by:'role',value:'link',name:'View contacts'},action:'click',navigation:{targetPath:'/s/contacts',source:'fixture:reviewed-GET-navigation',readOnlyReviewed:true}}],maxActions:3,maxMs:60000},{mcpObservation:true,application:{scope:{org:f.org.orgAlias,permission:'QA',metadataVersion:knowledgeFingerprint(f.org),objectsByPath:{'/lightning/o/Account':'Account','/s/contacts':'Contact'}},history,maskedScreenshots:true}});
  const study=discoverApplication({spec,org:f.org,graph:f.graph,permission:'QA',fixtureReceipts:[observation.applicationEvidenceHash!],changes:['Field:Contact.LastName']},history),reviews=new ApplicationReviewStore(history);reviews.put(study);
  const before=await compileReviewedApplication({study,spec,org:f.org,graph:f.graph},history);
  for(const decision of fixtureApplicationAnswers(study,origin))reviews.review(study.scope,decision);
  const compiled=await compileReviewedApplication({study,spec,org:f.org,graph:f.graph},history);if(!compiled.model)throw Error('Fixture workflow did not compile: '+compiled.questions.join('; '));
  const model=approveApplicationModel(history,{scope:study.scope,studyVersion:study.version,modelVersion:compiled.model.version,id:compiled.model.id,operator:'Fixture Reviewer'}),index=new KnowledgeIndex(history),knowledge=await indexApplicationKnowledge(history,study,index,[{text:'Contact reverse navigation may be available; unobserved hypothesis.',sourceIds:[study.pages[1].source]}]),design=await designSalesforceTests({spec,org:f.org,graph:f.graph,permission:'QA',model,changes:['Field:Contact.LastName']},{history,index}),report=await writeApplicationReport(history,{study,org:f.org,design}),proposals=await writeTestDesignReport(design);
  const manifest=JSON.parse(await readFile(observation.screenshots[0].manifest,'utf8')),screenshots=await previewBrowserDebug(manifest.runId),retrieved=await index.retrieve('Account Contact fixture-status',study.scope,10);
  return{...report,proposals,historyPath,studyVersion:study.version,modelVersion:model.version,fixtureEvidence:observation.applicationEvidenceHash,validation:'offline-real-headless-browser-and-MCP-synthetic-fixture',beforeReview:before.status,afterReview:design.status,questions:study.questions.length,observedTransitions:study.transitions.filter(t=>t.status==='observed').length,suggestedTransitions:study.transitions.filter(t=>t.status==='suggested').length,states:observation.pageFacts.length,locators:study.sources.filter(s=>s.kind==='browser').reduce((n,s)=>n+s.claims.filter(c=>c.kind==='locator').length,0),maskedScreenshots:observation.screenshots.length,screenshotPreview:screenshots,knowledge,verifiedRetrievalKinds:[...new Set(retrieved.map(d=>d.kind))],scenarioCount:design.scenarios.length,proposedFiles:design.files.length,mcpSameContext:observation.mcp.sameContext,salesforceRequests:0,externalModelRequests:0,executionAuthorized:false};
 }finally{history.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
