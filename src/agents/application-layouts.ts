import {z} from 'zod';
import type {IntelligenceReader,OrgIntelligence} from './org-intelligence.js';
import {buildComponentGraph} from './component-graph.js';
import {intelligenceFingerprint} from '../knowledge/intelligence-fingerprint.js';
// Public UI API record-layout metadata, View mode only; no record IDs or Aura.
// https://developer.salesforce.com/docs/atlas.en-us.uiapi.meta/uiapi/ui_api_resources_record_layout.htm
export async function discoverApplicationLayouts(client:IntelligenceReader,input:OrgIntelligence,rawBudget:unknown={}){
 const budget=z.object({maxObjects:z.number().int().min(0).max(5).default(3),maxFields:z.number().int().min(1).max(1000).default(500)}).strict().parse(rawBudget),identity=await client.identity();if(identity.Id!==input.identity.Id||identity.userId!==input.identity.userId||identity.IsSandbox!==input.identity.IsSandbox||!/^v\d+\.\d+$/.test(client.apiVersion))throw Error('Layout discovery identity/API version differs');
 const sections=[...input.sections],unknowns=[...input.unknowns];for(const object of input.snapshot.objects.slice(0,budget.maxObjects)){
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(object.name))throw Error('Observed object API name required');const source=`/services/data/${client.apiVersion}/ui-api/layout/${object.name}?layoutType=Full&mode=View&formFactor=Large`;
  try{const raw=await client.get<unknown>(source);if(JSON.stringify(raw).length>1048576)throw Error('Layout byte bound exceeded');const layout=z.object({objectApiName:z.literal(object.name),sections:z.array(z.object({layoutRows:z.array(z.object({layoutItems:z.array(z.object({required:z.boolean().optional(),layoutComponents:z.array(z.object({apiName:z.string().optional(),componentType:z.string().optional()}))}))}))})).max(100)}).parse(raw),fields:Array<{name:string;required:boolean}>=[];let omitted=false;
   for(const section of layout.sections)for(const row of section.layoutRows)for(const item of row.layoutItems)for(const component of item.layoutComponents){if(component.componentType!=='Field'||!component.apiName)continue;if(!object.fields.some(f=>f.name===component.apiName)||fields.length>=budget.maxFields){omitted=true;continue;}fields.push({name:component.apiName,required:item.required===true});}
   sections.push({area:'application-layouts',status:omitted?'partial':'observed',source,records:[{object:object.name,mode:'View',formFactor:'Large',sectionCount:layout.sections.length,fields}],detail:'Declared current-user default View layout only. Layout-required flags do not establish backend validation, runtime visibility, record sharing or business outcomes.'});if(omitted)unknowns.push(`${object.name}: layout fields outside verified Describe or budget omitted`);
  }catch{sections.push({area:'application-layouts',status:'unknown',source,records:[],detail:'Layout denied, unsupported, oversized or malformed; provider details withheld.'});}
 }
 if(input.snapshot.objects.length>budget.maxObjects)unknowns.push('Application layout object budget omitted objects');const intelligence={...input,sections,unknowns};intelligence.snapshot={...input.snapshot,intelligenceFingerprint:intelligenceFingerprint(intelligence)};return{intelligence,graph:buildComponentGraph(intelligence)};
}
