import { createHash } from 'node:crypto';
import { ChromaClient, type Collection } from 'chromadb';
import { z } from 'zod';
import { redactModelText,environmentSecrets } from '../ai/privacy.js';
export const SourceSchema=z.object({id:z.string().min(1),version:z.string().min(1),org:z.string().min(1),permission:z.string().min(1),status:z.literal('verified'),text:z.string().min(1),capturedAt:z.string().datetime()});
export type Source=z.infer<typeof SourceSchema>;
export type Embed=(texts:string[])=>Promise<number[][]>;
export function httpEmbeddings(endpoint:string,key:string,model:string):Embed {
  try {const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||!key||!model)throw Error();}catch{throw Error('HTTPS embedding endpoint, model and key required; configuration values withheld.');}
  return async texts=>{
    let response:Response;
    try{response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:texts.map(text=>redactModelText(text,[key,...environmentSecrets()]))}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('Embedding provider transport failed; details withheld to protect credentials.');}
    if(!response.ok) throw Error(`Embedding provider failed (${response.status})`);
    let raw:unknown;try{raw=await response.json();}catch{throw Error('Invalid embedding provider response; details withheld.');}
    const parsed=z.object({data:z.array(z.object({index:z.number().int().nonnegative(),embedding:z.array(z.number().finite()).min(1)}))}).safeParse(raw);
    if(!parsed.success)throw Error('Invalid embedding provider response; details withheld.');const body=parsed.data;
    const ordered=body.data.sort((a,b)=>a.index-b.index);
    if(ordered.length!==texts.length||ordered.some((e,i)=>e.index!==i)) throw Error('Embedding response index mismatch');
    return ordered.map(e=>e.embedding);
  };
}
export function redact(text:string) {return redactModelText(text,environmentSecrets());}
export class SemanticKnowledge {
  constructor(private collection:Pick<Collection,'upsert'|'query'>,private embed:Embed){}
  static async connect(host:string,embed:Embed,headers:Record<string,string>={},embeddingSpace?:string) {
    const client=new ChromaClient({host,ssl:true,headers,fetchOptions:{redirect:'error'}});
    const name=embeddingSpace?`sfqa_${createHash('sha256').update(embeddingSpace).digest('hex').slice(0,24)}`:'sfqa_verified';
    return new SemanticKnowledge(await client.getOrCreateCollection({name,embeddingFunction:null}),embed);
  }
  async ingest(input:Source,precomputed?:number[]) {
    const source=SourceSchema.parse(input),text=redact(source.text),chunks=precomputed?[text]:text.match(/[\s\S]{1,1200}/g)!;
    const embeddings=precomputed?[precomputed]:await this.embed(chunks);
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
