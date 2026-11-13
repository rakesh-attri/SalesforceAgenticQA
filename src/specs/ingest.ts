import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as yaml } from 'yaml';
import { z } from 'zod';
import { StorySchema } from '../core/types.js';
export const CriterionSchema=z.object({id:z.string().min(1),text:z.string().min(1),expectedText:z.string().min(1).optional(),kind:z.enum(['positive','negative','boundary']).default('positive')});
export const SpecSchema=StorySchema.extend({acceptanceCriteria:z.array(CriterionSchema).min(1),source:z.string().min(1),version:z.string().min(1),warnings:z.array(z.string()).default([])}).superRefine((s,c)=>{
  if(new Set(s.acceptanceCriteria.map(a=>a.id)).size!==s.acceptanceCriteria.length)c.addIssue({code:'custom',message:'Duplicate criterion identifiers'});
});
export type Spec=z.infer<typeof SpecSchema>;
export function parseText(text:string,source:string,version:string):Spec {
  const lines=text.replace(/\r/g,'').split('\n'),criteria:unknown[]=[];
  for(const line of lines) {
    const match=line.match(/^\s*(?:[-*]\s*)?(AC[\w-]+)\s*[:.]\s*(?:\[(positive|negative|boundary)\]\s*)?(.+)$/i);
    if(match)criteria.push({id:match[1],kind:match[2]?.toLowerCase()??'positive',text:match[3]});
  }
  const value=(key:string)=>lines.find(l=>new RegExp(`^${key}:`,'i').test(l))?.split(':').slice(1).join(':').trim();
  return SpecSchema.parse({id:value('ID')??'imported-spec',title:value('Title')??lines.find(l=>l.startsWith('# '))?.slice(2)??'Imported specification',description:text.trim(),objects:value('Objects')?.split(',').map(s=>s.trim()).filter(Boolean)??[],persona:value('Persona'),acceptanceCriteria:criteria,source,version,warnings:['Only explicitly identified AC lines are executable requirements; prose needs review. PDF/DOCX extraction does not establish table/layout meaning.']});
}
export function parseStructured(value:unknown,source:string,version:string):Spec {
  const object=z.record(z.string(),z.unknown()).parse(value);
  if(object.openapi) {
    const criteria:unknown[]=[];
    const paths=z.record(z.string(),z.record(z.string(),z.unknown())).parse(object.paths);
    for(const [path,methods] of Object.entries(paths)) for(const [method,raw] of Object.entries(methods)) {
      if(!['get','post','put','patch','delete','head','options'].includes(method))continue;
      const op=z.object({operationId:z.string().optional(),responses:z.record(z.string(),z.unknown())}).parse(raw);
      for(const status of Object.keys(op.responses))if(/^\d{3}$/.test(status))criteria.push({id:`API-${criteria.length+1}`,text:`${method.toUpperCase()} ${path} declares response ${status}`,kind:Number(status)>=400?'negative':'positive'});
    }
    return SpecSchema.parse({id:'openapi-import',title:'OpenAPI contract',description:'Declared HTTP response contracts; no UI workflow or response body inferred.',objects:[],acceptanceCriteria:criteria,source,version,warnings:['No external $ref resolved. UI actions, personas and Salesforce mappings require review.']});
  }
  return SpecSchema.parse({...object,source,version});
}
export async function ingestSpec(path:string):Promise<Spec> {
  const bytes=await readFile(path);if(bytes.length>10_000_000)throw Error('Specification exceeds 10 MB');
  const version=createHash('sha256').update(bytes).digest('hex'),extension=extname(path).toLowerCase();
  if(extension==='.json')return parseStructured(JSON.parse(bytes.toString()),path,version);
  if(['.yaml','.yml'].includes(extension))return parseStructured(yaml(bytes.toString(),{maxAliasCount:50}),path,version);
  if(['.md','.txt'].includes(extension))return parseText(bytes.toString('utf8'),path,version);
  if(extension==='.docx') {
    const {extractRawText}=await import('mammoth');const result=await extractRawText({buffer:bytes});
    return parseText(result.value,path,version);
  }
  if(extension==='.pdf') {
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
    try {const pdf=await task.promise;if(pdf.numPages>200)throw Error('PDF exceeds 200 pages');let text='';
      for(let i=1;i<=pdf.numPages;i++){const content=await (await pdf.getPage(i)).getTextContent();text+=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('')+'\n';}
      return parseText(text,path,version);
    } finally {await task.destroy();}
  }
  throw Error(`Unsupported specification format: ${extension}`);
}
