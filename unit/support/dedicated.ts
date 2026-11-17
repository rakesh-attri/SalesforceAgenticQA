import { createHash } from 'node:crypto';
import { OrgSnapshotSchema } from '../../src/core/types.js';
import { EnvironmentPolicySchema,environmentHash } from '../../src/execution/environment.js';
import { dedicatedReviewPackage } from '../../src/execution/dedicated-review.js';
import { DedicatedExecutionSchema } from '../../src/execution/dedicated-pipeline.js';
import { DedicatedData,type DedicatedApi } from '../../src/salesforce/dedicated-qa.js';
import { History } from '../../src/core/history.js';
export function dedicatedFixture(history:History,runId='qa-run') {
  let identity={Id:'00D000000000001',userId:'005000000000001',IsSandbox:false},active=true,visible=true,emptyChildNull=false,uncertainCreate=false,uncertainDelete=false,corrupt=false,seq=0;
  const origin='https://qa-fixture.my.salesforce.com',browserOrigin='https://qa-fixture.lightning.force.com',records=new Map<string,Record<string,unknown>>(),writes:Array<{operation:string;object:string;id?:string;values:unknown}>=[],queries:string[]=[];
  const org=OrgSnapshotSchema.parse({orgAlias:'offline-dedicated-fixture',orgIdentityHash:createHash('sha256').update(identity.Id).digest('hex'),source:'salesforce-api',observedAt:new Date().toISOString(),objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true},{name:'Description',type:'textarea',nillable:true,createable:true}],childRelationships:[{childSObject:'Contact',field:'AccountId',relationshipName:'Contacts',cascadeDelete:true}]},{name:'Contact',label:'Contact',createable:true,fields:[{name:'LastName',type:'string',nillable:false,createable:true},{name:'Description',type:'textarea',nillable:true,createable:true},{name:'AccountId',type:'reference',referenceTo:['Account'],nillable:true,createable:true}],childRelationships:[]}]});
  const pkg=dedicatedReviewPackage({identity,origin,browserOrigin,org,operator:'fixture-operator',runId}),expiresAt=new Date(Date.now()+3600000).toISOString();
  let policy=EnvironmentPolicySchema.parse({...pkg.policyReview.definition,approval:{operator:'fixture-operator',definitionHash:environmentHash(pkg.policyReview.definition),expiresAt}});
  const input=DedicatedExecutionSchema.parse({...pkg.executionReview,data:{...pkg.executionReview.data,approval:{...pkg.executionReview.data.approval,operator:'fixture-operator'}},ui:{...pkg.executionReview.ui,approval:{...pkg.executionReview.ui.approval,operator:'fixture-operator'}}});
  const api:DedicatedApi={origin,apiVersion:'v62.0',async identity(){return identity;},async policy(){return policy;},async get<T>(path:string){const decoded=decodeURIComponent(path);queries.push(decoded);
    if(path.endsWith('/describe')){const object=org.objects.find(o=>path.endsWith(`/${o.name}/describe`));if(!object)throw Error('unknown object');return object as T;}
    if(decoded.includes('FROM User '))return {records:[{Id:identity.userId,IsActive:active,Profile:{PermissionsViewAllData:visible,PermissionsModifyAllData:false}}]} as T;
    const nested=/\(SELECT Id FROM ([A-Za-z0-9_]+) LIMIT 2\) FROM (Account|Contact) WHERE Id='([^']+)'/.exec(decoded);
    if(nested){const [,relationship,object,parentId]=nested,parent=records.get(parentId),child=org.objects.find(o=>o.name===object)?.childRelationships?.find(c=>c.relationshipName===relationship);if(!child)throw Error('unknown child relationship');const rows=[...records.values()].filter(r=>r.object===child.childSObject&&r[child.field!]===parentId).slice(0,2).map(r=>({Id:r.Id}));return {records:parent?[{Id:parentId,[relationship]:emptyChildNull&&!rows.length?null:{records:rows}}]:[]} as T;}
    const object=/FROM (Account|Contact)\b/.exec(decoded)?.[1],id=/WHERE Id='([^']+)'/.exec(decoded)?.[1],parent=/WHERE AccountId='([^']+)'/.exec(decoded)?.[1];
    const values=id?[records.get(id)].filter(Boolean):[...records.values()].filter(r=>r.object===object&&(!parent||r.AccountId===parent));
    return {records:values.map(raw=>{const r=raw?.object==='Contact'?{...raw,Name:raw.Name??raw.LastName}:raw;return corrupt?{...r,Description:'changed-by-unrelated-actor'}:r;})} as T;
  },async dispatch(m){writes.push({operation:m.operation,object:m.object,id:m.id,values:m.values});if(m.operation==='create'){const id=(m.object==='Account'?'001':'003')+String(++seq).padStart(12,'0');records.set(id,{Id:id,object:m.object,CreatedById:identity.userId,...m.values});if(uncertainCreate)throw Error('simulated lost response');return {id,success:true};}records.delete(m.id!);if(uncertainDelete)throw Error('simulated lost delete response');return undefined;}};
  const data=new DedicatedData(history,api);
  return {input,org,api,data,records,writes,queries,origin,browserOrigin,get policy(){return policy;},set policy(value){policy=value;},get identity(){return identity;},set identity(value){identity=value;},set active(value:boolean){active=value;},set visible(value:boolean){visible=value;},set emptyChildNull(value:boolean){emptyChildNull=value;},set uncertainCreate(value:boolean){uncertainCreate=value;},set uncertainDelete(value:boolean){uncertainDelete=value;},set corrupt(value:boolean){corrupt=value;}};
}
