import { z } from 'zod';
import type { Embed } from '../knowledge/rag.js';
import { redactModelText,redactModelValue,environmentSecrets } from './privacy.js';
import type { StructuredChat } from './types.js';
export type { StructuredChat } from './types.js';
const Model=z.string().regex(/^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
export const GeminiConfigSchema=z.object({apiKey:z.string().trim().min(1).max(512).regex(/^\S+$/),model:Model,timeoutMs:z.number().int().min(1).max(60000).default(30000),retries:z.number().int().min(0).max(3).default(2),minIntervalMs:z.number().int().min(0).max(60000).default(0),dimensions:z.number().int().min(1).max(3072).optional()});
export type GeminiConfig=z.infer<typeof GeminiConfigSchema>;
type Setting='apiKey'|'model'|'timeoutMs'|'retries'|'minIntervalMs'|'dimensions'|'provider'|'aliases'|'endpoint';
export class ModelProviderError extends Error {
  constructor(readonly code:'configuration'|'transport'|'rate-limit'|'http'|'response'|'structured-output'|'blocked',readonly status?:number,setting?:Setting) {
    super(`Gemini ${code}${setting?` (${setting})`:''}${status?` (HTTP ${status})`:''}; provider text withheld to protect credentials.`);this.name='ModelProviderError';
  }
}
function config(input:z.input<typeof GeminiConfigSchema>) {const parsed=GeminiConfigSchema.safeParse(input);if(!parsed.success){const field=parsed.error.issues[0]?.path[0];const safeField=['apiKey','model','timeoutMs','retries','minIntervalMs','dimensions'].includes(String(field))?field as Setting:undefined;throw new ModelProviderError('configuration',undefined,safeField);}return parsed.data;}
type Dependencies={fetch?:typeof fetch;sleep?:(ms:number)=>Promise<void>;secrets?:string[]};
class GeminiTransport {
  private tail:Promise<unknown>=Promise.resolve();private nextAllowed=0;
  readonly options:GeminiConfig;readonly secrets:string[];
  constructor(input:z.input<typeof GeminiConfigSchema>,private deps:Dependencies={}) {this.options=config(input);this.secrets=[this.options.apiKey,...environmentSecrets(),...deps.secrets??[]];}
  request(operation:'generateContent'|'batchEmbedContents',body:unknown):Promise<unknown> {
    const result=this.tail.then(()=>this.send(operation,body));this.tail=result.catch(()=>undefined);return result;
  }
  private async send(operation:string,body:unknown) {
    const sleep=this.deps.sleep??(ms=>new Promise<void>(r=>setTimeout(r,ms))),fetcher=this.deps.fetch??globalThis.fetch;
    for(let attempt=0;attempt<=this.options.retries;attempt++){
      const wait=Math.max(0,this.nextAllowed-Date.now());if(wait)await sleep(wait);
      this.nextAllowed=Date.now()+this.options.minIntervalMs;
      let response:Response;
      try{response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${this.options.model.replace(/^models\//,'')}:${operation}`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.options.apiKey},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(this.options.timeoutMs)});}
      catch {if(attempt===this.options.retries)throw new ModelProviderError('transport');await sleep(Math.min(1000*2**attempt,8000));continue;}
      if(!response.ok){
        const retry=response.status===429||[500,502,503,504].includes(response.status);const status=response.status;
        const header=response.headers.get('retry-after');
        await response.body?.cancel();
        if(!retry||attempt===this.options.retries)throw new ModelProviderError(status===429?'rate-limit':'http',status);
        const retryMs=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-Date.now()):1000*2**attempt;
        if(retryMs>30000)throw new ModelProviderError('rate-limit',status);
        await sleep(Math.min(30000,Math.max(0,Number.isFinite(retryMs)?retryMs:1000)));continue;
      }
      try{return await response.json();}catch{throw new ModelProviderError('response');}
    }
    throw new ModelProviderError('transport');
  }
}
const ChatResponse=z.object({candidates:z.array(z.object({finishReason:z.string().optional(),content:z.object({parts:z.array(z.object({text:z.string().optional(),thought:z.boolean().optional()}))}).optional()})).optional(),promptFeedback:z.object({blockReason:z.string().optional()}).optional()});
export class GeminiChat implements StructuredChat {
  private transport:GeminiTransport;
  constructor(input:z.input<typeof GeminiConfigSchema>,deps:Dependencies={}){this.transport=new GeminiTransport(input,deps);}
  async generate<T>(input:{system:string;prompt:string;schema:z.ZodType<T>}):Promise<T> {
    if(input.system.length+input.prompt.length>120000)throw new ModelProviderError('configuration');
    let responseSchema:unknown;try{responseSchema=z.toJSONSchema(input.schema);}catch{throw new ModelProviderError('structured-output');}
    const raw=await this.transport.request('generateContent',{systemInstruction:{parts:[{text:redactModelText(input.system,this.transport.secrets)}]},contents:[{role:'user',parts:[{text:redactModelText(input.prompt,this.transport.secrets)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:responseSchema}});
    const parsed=ChatResponse.safeParse(raw);if(!parsed.success)throw new ModelProviderError('response');
    const candidate=parsed.data.candidates?.[0];if(parsed.data.promptFeedback?.blockReason||candidate?.finishReason!=='STOP')throw new ModelProviderError('blocked');
    const text=candidate.content?.parts.filter(p=>!p.thought).map(p=>p.text??'').join('');if(!text)throw new ModelProviderError('response');
    let value:unknown;try{value=JSON.parse(text);}catch{throw new ModelProviderError('structured-output');}
    const output=input.schema.safeParse(redactModelValue(value,this.transport.secrets));if(!output.success)throw new ModelProviderError('structured-output');return output.data;
  }
}
export function geminiEmbeddings(input:z.input<typeof GeminiConfigSchema>,deps:Dependencies={}):Embed {
  const transport=new GeminiTransport(input,deps);
  return async texts=>{
    if(!texts.length)return [];if(texts.some(t=>typeof t!=='string'||!t.trim()))throw new ModelProviderError('configuration');
    const vectors:number[][]=[];const model=`models/${transport.options.model.replace(/^models\//,'')}`;
    // The existing Embed contract is symmetric; use SEMANTIC_SIMILARITY for both ingestion/query.
    // This avoids silently applying RETRIEVAL_DOCUMENT to query text.
    for(let start=0;start<texts.length;start+=100){
      const batch=texts.slice(start,start+100),raw=await transport.request('batchEmbedContents',{requests:batch.map(text=>({model,content:{parts:[{text:redactModelText(text,transport.secrets)}]},taskType:'SEMANTIC_SIMILARITY',...(transport.options.dimensions?{outputDimensionality:transport.options.dimensions}:{})}))});
      const parsed=z.object({embeddings:z.array(z.object({values:z.array(z.number().finite()).min(1)}))}).safeParse(raw);
      if(!parsed.success||parsed.data.embeddings.length!==batch.length)throw new ModelProviderError('response');
      for(const embedding of parsed.data.embeddings){if(transport.options.dimensions&&embedding.values.length!==transport.options.dimensions)throw new ModelProviderError('response');if(vectors.length&&embedding.values.length!==vectors[0].length)throw new ModelProviderError('response');vectors.push(embedding.values);}
    }return vectors;
  };
}
