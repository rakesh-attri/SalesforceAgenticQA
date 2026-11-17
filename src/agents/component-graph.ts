import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OrgIntelligence } from './org-intelligence.js';
import { knowledgeFingerprint } from '../knowledge/snapshots.js';
const Component=z.object({id:z.string(),kind:z.string(),name:z.string(),sources:z.array(z.string()).min(1),details:z.record(z.string(),z.unknown()).optional()});
export const ComponentGraphSchema=z.object({org:z.string(),version:z.string(),knowledgeVersion:z.string().optional(),nodes:z.array(Component),edges:z.array(z.object({from:z.string(),to:z.string(),relation:z.string(),evidence:z.array(z.string()).min(1),confidence:z.literal('metadata-declared')})),unknowns:z.array(z.string())});
export type ComponentGraph=z.infer<typeof ComponentGraphSchema>;
const list=(v:unknown):Record<string,unknown>[]=>v===undefined||v===null?[]:(Array.isArray(v)?v:[v]).filter((v):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v));
export function metadataRecords(raw:Record<string,unknown>) {const m=(raw.metadata??raw) as Record<string,unknown>;return list(m.records);}
export function buildComponentGraph(intel:OrgIntelligence):ComponentGraph {
  const nodes=new Map<string,z.infer<typeof Component>>(),edges:ComponentGraph['edges']=[],unknowns:string[]=[];
  const node=(kind:string,name:string,source:string,identity=name)=>{const id=`${kind}:${identity}`,old=nodes.get(id);if(old){if(!old.sources.includes(source))old.sources.push(source);}else nodes.set(id,{id,kind,name,sources:[source]});return id;};
  const edge=(from:string,to:string,relation:string,evidence:string)=>{const old=edges.find(e=>e.from===from&&e.to===to&&e.relation===relation);if(old){if(!old.evidence.includes(evidence))old.evidence.push(evidence);}else edges.push({from,to,relation,evidence:[evidence],confidence:'metadata-declared'});};
  const byId=new Map<string,string>();
  for(const section of intel.sections)for(const row of section.records){const kinds:Record<string,string>={'apex-classes':'ApexClass','apex-triggers':'ApexTrigger','lwc-bundles':'LightningComponentBundle','flows':'Flow','flow-versions':'FlowVersion'};const kind=kinds[section.area];if(kind&&typeof row.Id==='string'&&['observed','partial'].includes(section.status))byId.set(row.Id,node(kind,`${row.NamespacePrefix?`${row.NamespacePrefix}__`:''}${row.DeveloperName??row.Name??row.Id}`,section.source,row.Id));}
  for(const object of intel.snapshot.objects){const source=intel.snapshot.coverage?.find(c=>c.area===`describe:${object.name}`)?.source??`describe:${object.name}`,id=node('SObject',object.name,source);for(const field of object.fields){const f=node('Field',`${object.name}.${field.name}`,source);edge(id,f,'contains',`${source}#${field.name}`);for(const target of field.referenceTo??[])edge(f,node('SObject',target,source),'references',`${source}#${field.name}.referenceTo`);}}
  for(const section of intel.sections){if(!['observed','partial'].includes(section.status)){unknowns.push(`${section.area}: ${section.status}`);continue;}if(section.status==='partial')unknowns.push(`${section.area}: bounded/incomplete coverage`);
    for(const [i,row] of section.records.entries()){const source=`${section.source}#record:${i}`;
      if(section.area==='metadata-dependencies'&&[row.MetadataComponentName,row.MetadataComponentType,row.RefMetadataComponentName,row.RefMetadataComponentType].every(v=>typeof v==='string'&&v.length)){
        const endpoint=(prefix:'MetadataComponent'|'RefMetadataComponent')=>{const type=String(row[`${prefix}Type`]),name=String(row[`${prefix}Name`]),known=byId.get(String(row[`${prefix}Id`]));if(known){const existing=nodes.get(known)!;if(!existing.sources.includes(source))existing.sources.push(source);return known;}if(['StandardEntity','CustomObject'].includes(type)&&intel.snapshot.objects.some(o=>o.name===name))return node('SObject',name,source);return node(type,`${row[`${prefix}Namespace`]??''}:${name}:${row[`${prefix}Id`]??''}`,source);};
        edge(endpoint('MetadataComponent'),endpoint('RefMetadataComponent'),'references',source);
      }
      if(['apex-classes','apex-triggers','lwc-bundles','flows','flow-versions'].includes(section.area)){
        const kind=section.area==='apex-classes'?'ApexClass':section.area==='apex-triggers'?'ApexTrigger':section.area==='lwc-bundles'?'LightningComponentBundle':section.area==='flow-versions'?'FlowVersion':'Flow';
        const name=String(row.DeveloperName??row.Name??row.Id??'');if(!name){unknowns.push(`${source}: component name unavailable`);continue;}const id=byId.get(String(row.Id))??node(kind,name,source);const existing=nodes.get(id)!;if(!existing.sources.includes(source))existing.sources.push(source);
        if(kind==='ApexTrigger'&&typeof row.TableEnumOrId==='string'){const target=intel.snapshot.objects.find(o=>o.name===row.TableEnumOrId);if(target)edge(id,node('SObject',target.name,source),'trigger-on',source);else unknowns.push(`${source}: trigger target not resolved to described object`);}
        if(kind==='FlowVersion'&&typeof row.DefinitionId==='string')edge(id,byId.get(row.DefinitionId)??node('FlowDefinitionId',row.DefinitionId,source),'version-of',source);
        if(kind==='Flow'&&typeof row.ActiveVersionId==='string'){const active=byId.get(row.ActiveVersionId);if(active)edge(id,active,'active-version',source);else unknowns.push(`${source}: active version not present in bounded inventory`);}
      }
      if(section.area==='flow-details'){
        const meta=row.Metadata;if(!meta||typeof meta!=='object'||Array.isArray(meta)){unknowns.push(`${source}: Flow Metadata unavailable`);continue;}
        const m=meta as Record<string,unknown>,flow=byId.get(String(row.Id))??node('FlowVersion',String(row.Id),source),elements=new Map<string,string>();
        const categories=['start','recordLookups','recordCreates','recordUpdates','recordDeletes','actionCalls','subflows','decisions','assignments','screens','loops','waits'];
        for(const category of categories)for(const element of list(m[category])){const name=String(element.name??(category==='start'?'start':''));if(!name){unknowns.push(`${source}:${category}: unnamed element`);continue;}
          const path=`${source}#Metadata.${category}.${name}`,id=node('FlowElement',`${row.Id}:${name}`,path);elements.set(name,id);edge(flow,id,'contains',path);
          if(typeof element.object==='string')edge(id,node('SObject',element.object,path),category==='recordLookups'?'reads':category.startsWith('record')?'declares-mutation-target':'references',`${path}.object`);
          for(const key of ['actionName','flowName'])if(typeof element[key]==='string'){const targetKind=key==='flowName'?'Flow':element.actionType==='apex'?'ApexClass':undefined,targets=targetKind?[...nodes.values()].filter(n=>n.kind===targetKind&&n.name===element[key]):[];edge(id,targets.length===1?targets[0].id:node(key==='flowName'?'FlowReference':'ActionReference',String(element[key]),path),'invokes',`${path}.${key}`);if(targetKind&&targets.length!==1)unknowns.push(`${path}: invocation target is unresolved or ambiguous`);}
          for(const [n,condition] of [...list(element.filters),...list(element.conditions),...list(element.rules)].entries()){const conditionId=node('FlowCondition',`${row.Id}:${name}:${n}`,path);nodes.get(conditionId)!.details=condition;edge(id,conditionId,'declares-condition',path);if(typeof element.object==='string'&&typeof condition.field==='string'){const field=`${element.object}.${condition.field}`;if(nodes.has(`Field:${field}`))edge(conditionId,`Field:${field}`,'references',`${path}.filters.${n}.field`);else unknowns.push(`${path}: condition field not described`);}}
        }
        for(const category of categories)for(const element of list(m[category])){const name=String(element.name??'start'),from=elements.get(name);if(!from)continue;
          const connectors=[...list(element.connector),...list(element.defaultConnector),...list(element.faultConnector),...list(element.nextValueConnector),...list(element.noMoreValuesConnector),...list(element.rules).flatMap(r=>list(r.connector))];
          for(const c of connectors)if(typeof c.targetReference==='string'){const target=elements.get(c.targetReference);if(target)edge(from,target,'flow-connector',source);else unknowns.push(`${source}: unresolved Flow connector ${c.targetReference}`);}
        }
      }
      if(section.area==='object-business-metadata')for(const object of metadataRecords(row))for(const rule of list(object.validationRules))if(typeof object.fullName==='string'&&typeof rule.fullName==='string')edge(node('ValidationRule',`${object.fullName}.${rule.fullName}`,source),node('SObject',object.fullName,source),'constrains',source);
      if(section.area==='object-business-metadata')for(const object of metadataRecords(row))if(typeof object.fullName==='string')for(const key of ['sharingModel','externalSharingModel'])if(typeof object[key]==='string')edge(node('SObject',object.fullName,source),node('SharingModel',String(object[key]),source),'declares-sharing-model',`${source}#${key}`);
      if(section.area==='validation-rules'&&typeof row.ValidationName==='string')node('ValidationRule',String(row.Id??row.ValidationName),source);
      if(section.area==='permission-group-metadata')for(const group of metadataRecords(row))if(typeof group.fullName==='string'){const id=node('PermissionSetGroup',group.fullName,source);for(const [key,kind,relation] of [['permissionSets','PermissionSet','member-of'],['mutingPermissionSets','MutingPermissionSet','mutes']] as const){const values=Array.isArray(group[key])?group[key]:[group[key]];for(const value of values)if(typeof value==='string')edge(id,node(kind,value,source),relation,`${source}#${key}`);}}
    }
  }
  unknowns.push('Metadata references do not establish runtime reachability, business outcomes, effective record sharing or complete dynamic Apex/LWC dependencies.');
  const payload={org:intel.snapshot.orgIdentityHash??intel.orgAlias,knowledgeVersion:knowledgeFingerprint(intel.snapshot),nodes:[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id)),edges:edges.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),unknowns:[...new Set(unknowns)]};
  return ComponentGraphSchema.parse({...payload,version:createHash('sha256').update(JSON.stringify(payload)).digest('hex')});
}
export function impactedComponents(graph:ComponentGraph,changed:string[],maxNodes=2000) {
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>10000)throw Error('Impact traversal budget invalid');
  const known=new Set(graph.nodes.map(n=>n.id));if(changed.some(id=>!known.has(id)))throw Error('Changed component is not in the verified graph');
  const impacted=new Set(changed),paths:Array<{component:string;via:string;evidence:string[]}>=[];let truncated=false;
  for(const id of impacted)for(const edge of graph.edges.filter(e=>e.to===id)){if(impacted.has(edge.from))continue;if(impacted.size>=maxNodes){truncated=true;continue;}impacted.add(edge.from);paths.push({component:edge.from,via:id,evidence:edge.evidence});}
  return {components:[...impacted],paths,truncated};
}

// Consumer impact plus declared effects. These are metadata relationships,
// never proof of runtime execution, mutation permission or business outcomes.
export function analyzeChangeImpact(raw:unknown,changed:string[],maxNodes=2000){
 const graph=ComponentGraphSchema.parse(raw);if(graph.nodes.length>10000||graph.edges.length>50000||changed.length>1000||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>10000)throw Error('Impact evidence/traversal budget invalid');
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),unknown=[...new Set(changed.filter(id=>!nodes.has(id)))],seen=new Set<string>(),queue:Array<{id:string;depth:number}>=[],paths:Array<{component:string;via:string;relation:string;direction:string;depth:number;evidence:string[]}>=[];let truncated=false;
 const add=(id:string,depth:number,via?:string,relation?:string,evidence?:string[],direction?:string)=>{if(seen.has(id))return;if(seen.size>=maxNodes){truncated=true;return;}seen.add(id);queue.push({id,depth});if(via)paths.push({component:id,via,relation:relation!,direction:direction!,depth,evidence:evidence!});};
 for(const id of [...new Set(changed)].sort())if(nodes.has(id))add(id,0);
 const incoming=new Map<string,ComponentGraph['edges']>(),outgoing=new Map<string,ComponentGraph['edges']>();for(const edge of [...graph.edges].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))){if(!nodes.has(edge.from)||!nodes.has(edge.to))throw Error('Dependency endpoint is not in the verified graph');const ins=incoming.get(edge.to)??[];ins.push(edge);incoming.set(edge.to,ins);const outs=outgoing.get(edge.from)??[];outs.push(edge);outgoing.set(edge.from,outs);}
 for(let i=0;i<queue.length;i++){const {id,depth}=queue[i];for(const edge of incoming.get(id)??[])add(edge.from,depth+1,id,edge.relation,edge.evidence,'consumer');for(const edge of outgoing.get(id)??[]){const container=['SObject','Flow','FlowVersion','FlowElement'].includes(nodes.get(id)!.kind)&&edge.relation==='contains';if(container||['declares-mutation-target','invokes','flow-connector'].includes(edge.relation))add(edge.to,depth+1,id,edge.relation,edge.evidence,container?'containment':'declared-effect');}}
 return{components:[...seen],paths,truncated,unknown,coverage:truncated||unknown.length?'incomplete':'bounded-metadata',runtimeReachabilityVerified:false,questions:[...unknown.map(id=>`Resolve changed component ${id} against current source evidence`),...(truncated?['Expand reviewed impact budget before excluding tests']:[]),...graph.unknowns]};
}
