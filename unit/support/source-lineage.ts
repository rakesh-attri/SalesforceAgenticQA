import {browserFixture} from './browser-policy.js';
import {History} from '../../src/core/history.js';
import {OrgSnapshotSchema} from '../../src/core/types.js';
import {IntelligenceSchema,selectStoryObjects} from '../../src/agents/org-intelligence.js';
import {intelligenceFingerprint} from '../../src/knowledge/intelligence-fingerprint.js';
import {knowledgeFingerprint,snapshotVersion} from '../../src/knowledge/snapshots.js';
import {buildComponentGraph} from '../../src/agents/component-graph.js';
import {environmentHash} from '../../src/execution/environment.js';
import {digest,fingerprint} from '../../src/execution/browser-policy.js';
import {lightningEngineHash} from '../../src/execution/lightning-engine.js';
import {LightningViewSchema,lightningViewHash} from '../../src/execution/lightning-view.js';
import {recordLightningReadiness} from '../../src/execution/lightning-proof.js';
export function reconciliationFixture(){
 const h=new History(':memory:'),b=browserFixture(h),org=OrgSnapshotSchema.parse({...b.f.org,observedAt:new Date(Date.now()-86400000).toISOString(),objects:b.f.org.objects.map(o=>({...o,fields:[...o.fields,{name:'Id',type:'id',nillable:false,createable:false},{name:'LastModifiedDate',type:'datetime',nillable:false,createable:false},...(o.name==='Contact'?[{name:'Name',type:'string',nillable:false,createable:false}]:[])]}))}),catalog=org.objects.map(o=>({name:o.name,label:o.label}));
 const intel=IntelligenceSchema.parse({orgAlias:org.orgAlias,observedAt:org.observedAt,identity:b.f.identity,catalogCount:catalog.length,selection:selectStoryObjects(b.f.input.spec,catalog),snapshot:org,sections:[],unknowns:['Synthetic reconciliation fixture only']});intel.snapshot.intelligenceFingerprint=intelligenceFingerprint(intel);org.intelligenceFingerprint=intel.snapshot.intelligenceFingerprint;
 const parent=structuredClone(b.f.policy);parent.dedicatedQa!.automationReview.sourceVersion=knowledgeFingerprint(org);parent.approval.definitionHash=environmentHash(parent);b.plan.parentPolicyHash=environmentHash(parent);b.plan.engineProfileHash=lightningEngineHash();
 const view=LightningViewSchema.parse({version:1,object:'Account',sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:parent.approval.operator,evidenceHash:digest('synthetic-locator-source'),recordName:{by:'role',value:'heading',name:'{{record-name}}'},content:[{by:'role',value:'tab',name:'Related'},{by:'role',value:'tab',name:'Details'}],busy:[],faults:[],stableMs:100});b.plan.renderContractHash=lightningViewHash(view);const review=b.approve(),historical={spec:b.f.input.spec,org:structuredClone(org),permission:b.plan.persona,data:{plan:{orgId:b.plan.orgId,userId:b.plan.userId,policyHash:b.plan.parentPolicyHash,sourceVersion:snapshotVersion(org),automationVersion:knowledgeFingerprint(org)}},ui:{plan:{orgId:b.plan.orgId,userId:b.plan.userId,policyHash:b.plan.parentPolicyHash,sourceVersion:b.f.input.spec.version}}},graph=buildComponentGraph(intel);
 const receipt=recordLightningReadiness(h,review,{status:'rendered-reviewed-view',object:'Account',nativeDocumentVerified:true,independentReferenceUnchanged:true,validation:'offline-mocked-salesforce',measuredAt:new Date(Date.now()-5000).toISOString()}),row=h.db.prepare('SELECT payload FROM lightning_readiness WHERE hash=?').get(receipt.hash)!,proof=JSON.parse(String(row.payload));proof.expiresAt=new Date(Date.now()-1000).toISOString();const hash=fingerprint(proof);h.db.prepare('INSERT INTO lightning_readiness VALUES(?,?)').run(hash,JSON.stringify(proof));const report={policyHash:review.approval.hash,referenceUnchanged:true,validation:'offline-mocked-salesforce',readinessProof:{hash,expiresAt:proof.expiresAt}};
 return{h,b,input:{historical,org,intelligence:intel,graph,parent,review,view,report},close:()=>h.close()};
}
