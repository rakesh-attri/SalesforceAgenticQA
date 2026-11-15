import { createHash } from 'node:crypto';
import { z } from 'zod';

// Private review metadata, never a request template or an executable approval.
// Only identifiers and top-level value types survive; no token, body or value.
export const ReadContractCandidateSchema=z.object({
  descriptor:z.string().max(1024).regex(/^(?:aura|serviceComponent):\/\/[A-Za-z][A-Za-z0-9_.]*\/ACTION\$(?:get|read|describe|fetch|load)[A-Za-z0-9_]*$/),
  descriptorHash:z.string().regex(/^[a-f0-9]{64}$/),
  parameters:z.array(z.object({name:z.string().max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),type:z.enum(['null','string','number','boolean','array','object']),exactOwnedReference:z.boolean()}).strict()).max(40),
  queryPresent:z.boolean(),queryKeyCount:z.number().int().max(40),
  reviewRequired:z.literal(true),requestExecuted:z.literal(false),readSafetyEstablished:z.literal(false)
}).strict();
export type ReadContractCandidate=z.infer<typeof ReadContractCandidateSchema>;
export function readContractCandidates(input:{url:string;method:string;type:string;body?:string|null},origins:string[],ownedIds:string[]):ReadContractCandidate[]{
  try{
    const url=new URL(input.url);
    if(input.method!=='POST'||!['xhr','fetch'].includes(input.type)||!origins.includes(url.origin)||url.pathname!=='/aura'||url.username||url.password||[...url.searchParams.keys()].some(key=>/token|secret|password|session|assertion|^sid$/i.test(key))||!input.body||input.body.length>262144)return [];
    const encoded=new URLSearchParams(input.body);
    if(encoded.getAll('message').length!==1)return [];
    const message=JSON.parse(encoded.get('message')!);
    if(!Array.isArray(message?.actions)||message.actions.length>10)return [];
    const result:ReadContractCandidate[]=[];
    for(const action of message.actions){
      if(typeof action?.descriptor!=='string'||!action.params||typeof action.params!=='object'||Array.isArray(action.params)||Object.keys(action.params).length>40)continue;
      const parameters=Object.entries(action.params).map(([name,value])=>({name,type:value===null?'null':Array.isArray(value)?'array':typeof value,exactOwnedReference:typeof value==='string'&&ownedIds.includes(value)}));
      const parsed=ReadContractCandidateSchema.safeParse({descriptor:action.descriptor,descriptorHash:createHash('sha256').update(action.descriptor).digest('hex'),parameters,queryPresent:!!url.search,queryKeyCount:[...url.searchParams.keys()].length,reviewRequired:true,requestExecuted:false,readSafetyEstablished:false});
      if(parsed.success)result.push(parsed.data);
    }
    return result;
  }catch{return [];}
}
