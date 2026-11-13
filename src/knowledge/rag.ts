import { createHash } from 'node:crypto';
import { ChromaClient, type Collection } from 'chromadb';
import { z } from 'zod';
export const SourceSchema=z.object({id:z.string().min(1),version:z.string().min(1),org:z.string().min(1),permission:z.string().min(1),status:z.literal('verified'),text:z.string().min(1),capturedAt:z.string().datetime()});
export type Source=z.infer<typeof SourceSchema>;
export type Embed=(texts:string[])=>Promise<number[][]>;
export function httpEmbeddings(endpoint:string,key:string,model:string):Embed {
  if(new URL(endpoint).protocol!=='https:'||!key||!model) throw Error('HTTPS embedding endpoint, model and key required');
  return async texts=>{
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:texts}),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error(`Embedding provider failed (${response.status})`);
    const body=z.object({data:z.array(z.object({index:z.number().int().nonnegative(),embedding:z.array(z.number().finite()).min(1)}))}).parse(await response.json());
    const ordered=body.data.sort((a,b)=>a.index-b.index);
    if(ordered.length!==texts.length||ordered.some((e,i)=>e.index!==i)) throw Error('Embedding response index mismatch');
    return ordered.map(e=>e.embedding);
  };
}
export function redact(text:string) {return text.replace(/Bearer\s+\S+/gi,'[REDACTED]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[EMAIL]').replace(/\b(?:00[1-9A-Za-z])[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/g,'[RECORD-ID]');}
export class SemanticKnowledge {
  constructor(private collection:Pick<Collection,'upsert'|'query'>,private embed:Embed){}
  static async connect(host:string,embed:Embed,headers:Record<string,string>={}) {
    const client=new ChromaClient({host,ssl:true,headers,fetchOptions:{redirect:'error'}});
    return new SemanticKnowledge(await client.getOrCreateCollection({name:'sfqa_verified',embeddingFunction:null}),embed);
  }
  async ingest(input:Source) {
    const source=SourceSchema.parse(input),text=redact(source.text),chunks=text.match(/[\s\S]{1,1200}/g)!;
    const embeddings=await this.embed(chunks);
    if(embeddings.length!==chunks.length||embeddings.some(e=>!e.length||e.some(v=>!Number.isFinite(v)))) throw Error('Invalid embeddings');
    const ids=chunks.map((_c,i)=>createHash('sha256').update(`${source.org}:${source.permission}:${source.id}:${source.version}:${i}`).digest('hex'));
    await this.collection.upsert({ids,documents:chunks,embeddings,metadatas:chunks.map(()=>({sourceId:source.id,version:source.version,org:source.org,permission:source.permission,status:source.status,capturedAt:source.capturedAt}))});return ids;
  }
  async retrieve(text:string,scope:{org:string;permission:string;version:string},count=5) {
    if(!scope.org||!scope.permission||!scope.version||count<1||count>20) throw Error('Explicit retrieval scope and bounded count required');
    const embeddings=await this.embed([redact(text)]);
    return this.collection.query({queryEmbeddings:embeddings,nResults:count,where:{$and:[{org:scope.org},{permission:scope.permission},{version:scope.version},{status:'verified'}]}});
  }
}
