import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPages } from '../src/salesforce/pagination.js';
import { discoverDeepIntelligence,calculateGrant } from '../src/agents/deep-discovery.js';
import { buildComponentGraph,impactedComponents } from '../src/agents/component-graph.js';
import { IntelligenceSchema,type IntelligenceReader } from '../src/agents/org-intelligence.js';
import { intelligenceFingerprint } from '../src/knowledge/intelligence-fingerprint.js';
import { schemaFingerprint } from '../src/knowledge/snapshots.js';
function intelligence(){return IntelligenceSchema.parse({orgAlias:'synthetic',observedAt:new Date().toISOString(),identity:{Id:'00D000000000001',IsSandbox:false,userId:'005000000000001'},catalogCount:1,selection:{selected:[],unresolved:[],omitted:[],status:'proposed'},snapshot:{orgAlias:'synthetic',source:'salesforce-api',observedAt:new Date().toISOString(),objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',nillable:false,createable:true}]}]},sections:[{area:'flows',status:'observed',source:'fixture:FlowDefinition',detail:'synthetic',records:[{Id:'300000000000001',DeveloperName:'AccountFlow',ActiveVersionId:'301000000000001'}]},{area:'object-business-metadata',status:'partial',source:'fixture:CustomObject',detail:'synthetic',records:[{metadata:{records:{fullName:'Account',sharingModel:'Private',validationRules:{fullName:'NameRequired',errorConditionFormula:'ISBLANK(Name)',active:'true'}}}}]}],unknowns:[]});}
test('pagination follows bounded same-API cursors, keeps sources and rejects escape/repetition',async()=>{
  let calls=0;const client={apiVersion:'v62.0',async get<T>(){calls++;return (calls===1?{done:false,records:[{Id:'one'}],nextRecordsUrl:'/services/data/v62.0/query/cursor-2'}:{done:true,records:[{Id:'two'}]}) as T;}};
  const result=await readPages(client,'SELECT Id FROM ApexClass LIMIT 500');assert.equal(result.records.length,2);assert.equal(result.sources.length,2);assert.equal(result.status,'observed');
  for(const url of ['https://evil.example/query/cursor','/services/data/v62.0/sobjects/Account','/services/data/v62X0/query/cursor','/services/data/v62.0/query/cursor?next=evil'])await assert.rejects(readPages({apiVersion:'v62.0',async get<T>(){return {done:false,records:[],nextRecordsUrl:url} as T;}},'SELECT Id FROM ApexClass LIMIT 500'),/escaped/);
  const partial=await readPages({apiVersion:'v62.0',async get<T>(){return {done:false,records:[{Id:'one'}]} as T;}},'SELECT Id FROM ApexClass LIMIT 500',false,{maxPages:1,maxRecords:10});assert.equal(partial.status,'partial');assert.equal(partial.records.length,1);
  await assert.rejects(readPages(client,'DELETE FROM ApexClass'));await assert.rejects(readPages(client,'SELECT Id FROM ApexClass'));
});
test('deep reads retain exact Flow conditions/actions, Apex/LWC edges, current-user flags, groups/muting and sharing sources',async()=>{
  const input=intelligence(),calls:string[]=[];
  const client:IntelligenceReader={apiVersion:'v62.0',async identity(){return input.identity;},async get<T>(path:string){calls.push(path);const q=decodeURIComponent(path);
    if(path.endsWith('/tooling/sobjects/Flow/301000000000001'))return {Id:'301000000000001',Metadata:{start:{connector:{targetReference:'find'}},recordLookups:[{name:'find',object:'Account',filters:[{field:'Name',operator:'EqualTo',value:{stringValue:'synthetic'}}],connector:{targetReference:'run'}}],actionCalls:[{name:'run',actionType:'apex',actionName:'AccountService'}]}} as T;
    if(path.includes('/ui-api/'))return {apiName:'Account',createable:true,updateable:false,deletable:false,queryable:true,fields:{Name:{createable:true,updateable:false}}} as T;
    let records:unknown[]=[];
    if(q.includes('FROM MetadataComponentDependency'))records=[{MetadataComponentId:'01p000000000001',MetadataComponentName:'AccountService',MetadataComponentType:'ApexClass',RefMetadataComponentName:'Account',RefMetadataComponentType:'StandardEntity',RefMetadataComponentId:'Account'}];
    else if(q.includes('FROM ApexClass'))records=[{Id:'01p000000000001',Name:'AccountService'}];
    else if(q.includes('FROM ApexTrigger'))records=[{Id:'01q000000000001',Name:'AccountTrigger',TableEnumOrId:'Account'}];
    else if(q.includes('FROM Flow LIMIT'))records=[{Id:'301000000000001',DefinitionId:'300000000000001',VersionNumber:1,Status:'Active'}];
    else if(q.includes('FROM PermissionSetAssignment'))records=[{PermissionSetId:'0PS000000000001',PermissionSetGroupId:'0PG000000000001'}];
    else if(q.includes('FROM PermissionSetGroup WHERE'))records=[{Id:'0PG000000000001',DeveloperName:'QAGroup',Status:'Updated'}];
    else if(q.includes('FROM PermissionSetGroupComponent'))records=[{PermissionSetGroupId:'0PG000000000001',PermissionSetId:'0PS000000000001'}];
    else if(q.includes('FROM User WHERE'))records=[{ProfileId:'00e000000000001'}];
    return {done:true,records} as T;
  },async readMetadata(type){calls.push(`read:${type}`);return {metadata:{records:type==='PermissionSetGroup'?{fullName:'QAGroup',permissionSets:'QA',mutingPermissionSets:'QAMute'}:{fullName:'QAMute',objectPermissions:{object:'Account',allowDelete:'true'}}}};}};
  const result=await discoverDeepIntelligence(client,input);assert.ok(result.graph.edges.some(e=>e.from==='ApexClass:01p000000000001'&&e.to==='SObject:Account'));assert.ok(result.graph.edges.some(e=>e.relation==='flow-connector'));assert.ok(result.graph.nodes.some(n=>n.kind==='FlowCondition'&&n.details));assert.ok(result.graph.nodes.some(n=>n.kind==='ValidationRule'));assert.ok(result.graph.edges.some(e=>e.relation==='mutes'));assert.ok(calls.includes('read:MutingPermissionSet'));
  assert.equal(result.intelligence.sections.find(s=>s.area==='effective-api-permissions')?.status,'observed');assert.ok(impactedComponents(result.graph,['SObject:Account']).components.includes('ApexClass:01p000000000001'));assert.ok(result.graph.edges.every(e=>e.evidence.length));assert.ok(calls.filter(p=>p.startsWith('/')).every(p=>p.startsWith('/services/data/')));assert.ok(!calls.some(p=>decodeURIComponent(p).includes('WHERE RefMetadataComponentName')));
});
test('denied setup metadata stays unknown and muting never subtracts independent grants',async()=>{
  const input=intelligence(),client:IntelligenceReader={apiVersion:'v62.0',async identity(){return input.identity;},async get(){throw Error('private provider response');}};
  const result=await discoverDeepIntelligence(client,input);assert.ok(result.intelligence.sections.some(s=>s.area==='metadata-dependencies'&&s.status==='unknown'));assert.ok(!JSON.stringify(result).includes('private provider response'));assert.equal(calculateGrant([true],[{grants:[true],muted:true,complete:true}],true).candidateGrant,true);assert.equal(calculateGrant([],[{grants:[true],muted:true,complete:true}],true).candidateGrant,false);assert.equal(calculateGrant([],[{grants:[true],muted:false,complete:false}],false).candidateGrant,'unknown');
  assert.throws(()=>impactedComponents(buildComponentGraph(input),['invented']),/not in/);
  const duplicates=structuredClone(input);duplicates.sections.push({area:'apex-classes',status:'observed',source:'fixture:namespaces',detail:'synthetic',records:[{Id:'01p000000000001',Name:'Same',NamespacePrefix:'one'},{Id:'01p000000000002',Name:'Same',NamespacePrefix:'two'}]});const graph=buildComponentGraph(duplicates);assert.equal(graph.nodes.filter(n=>n.kind==='ApexClass').length,2);assert.ok(graph.nodes.some(n=>n.name==='one__Same'));
  const recaptured=structuredClone(input);recaptured.observedAt=new Date(Date.now()+1000).toISOString();assert.equal(intelligenceFingerprint(recaptured),intelligenceFingerprint(input));const changed=structuredClone(input);changed.sections[1].records[0]={metadata:{records:{fullName:'Account',validationRules:{fullName:'NameRequired',errorConditionFormula:'Name = "changed"',active:'true'}}}};assert.equal(schemaFingerprint(changed.snapshot),schemaFingerprint(input.snapshot));assert.notEqual(intelligenceFingerprint(changed),intelligenceFingerprint(input));
  await assert.rejects(discoverDeepIntelligence({...client,async identity(){return {...input.identity,userId:'005000000000002'};}},input),/identity differs/);
});
