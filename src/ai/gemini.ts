import { z } from 'zod';
import type { Embed } from '../knowledge/rag.js';
import { redactModelText,redactModelValue,environmentSecrets } from './privacy.js';
import type { StructuredChat } from './types.js';
export type { StructuredChat } from './types.js';
const Model=z.string().regex(/^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
export const GeminiConfigSchema=z.object({apiKey:z.string().trim().min(1).max(512).regex(/^\S+$/),model:Model,timeoutMs:z.number().int().min(1).max(60000).default(30000),retries:z.number().int().min(0).max(3).default(2),minIntervalMs:z.number().int().min(0).max(60000).default(0),dimensions:z.number().int().min(1).max(3072).optional(),batchSize:z.number().int().min(1).max(100).default(100)});
export type GeminiConfig=Omit<z.infer<typeof GeminiConfigSchema>,'batchSize'>&{batchSize?:number};
type Setting='apiKey'|'model'|'timeoutMs'|'retries'|'minIntervalMs'|'dimensions'|'provider'|'aliases'|'endpoint'|'batchSize';
export const GeminiResponseDiagnosticSchema=z.object({operation:z.enum(['generateContent','batchEmbedContents']),stage:z.enum(['response-json','embedding-validation']),reason:z.enum(['json-invalid','body-timeout','body-read-failed','embedding-envelope','embedding-count','embedding-values','embedding-empty','embedding-non-finite','embedding-dimensions','embedding-too-large','embedding-zero-norm']),httpStatus:z.number().int().min(100).max(599),elapsedMs:z.number().int().min(0),responseKind:z.enum(['object','array','null','string','number','boolean','undefined']).optional(),expectedCount:z.number().int().min(1).max(100).optional(),receivedCount:z.number().int().min(0).max(101).optional(),expectedDimensions:z.number().int().min(1).max(3072).optional(),receivedDimensions:z.number().int().min(0).max(3073).optional(),rawValuesRetained:z.literal(false)}).strict();
export type GeminiResponseDiagnostic=z.infer<typeof GeminiResponseDiagnosticSchema>;
export class ModelProviderError extends Error {
  readonly diagnostic?:GeminiResponseDiagnostic;
  constructor(readonly code:'configuration'|'transport'|'rate-limit'|'http'|'response'|'structured-output'|'blocked',readonly status?:number,setting?:Setting,readonly retryAfterMs?:number,diagnostic?:unknown) {
    const parsed=GeminiResponseDiagnosticSchema.safeParse(diagnostic),safe=parsed.success?parsed.data:undefined;
    super(`Gemini ${code}${setting?` (${setting})`:''}${status?` (HTTP ${status})`:''}${safe?` [${safe.stage}:${safe.reason}]`:''}; provider text withheld to protect credentials.`);this.name='ModelProviderError';this.diagnostic=safe;
  }
}
function config(input:z.input<typeof GeminiConfigSchema>) {const parsed=GeminiConfigSchema.safeParse(input);if(!parsed.success){const field=parsed.error.issues[0]?.path[0];const safeField=['apiKey','model','timeoutMs','retries','minIntervalMs','dimensions'].includes(String(field))?field as Setting:undefined;throw new ModelProviderError('configuration',undefined,safeField);}return parsed.data;}
type Dependencies={fetch?:typeof fetch;sleep?:(ms:number)=>Promise<void>;secrets?:string[];now?:()=>number};
class GeminiTransport {
  private tail:Promise<unknown>=Promise.resolve();private nextAllowed=0;
  readonly options:z.output<typeof GeminiConfigSchema>;readonly secrets:string[];
  constructor(input:z.input<typeof GeminiConfigSchema>,private deps:Dependencies={}) {this.options=config(input);this.secrets=[this.options.apiKey,...environmentSecrets(),...deps.secrets??[]];}
  request(operation:'generateContent'|'batchEmbedContents',body:unknown):Promise<{value:unknown;httpStatus:number;elapsedMs:number}> {
    const result=this.tail.then(()=>this.send(operation,body));this.tail=result.catch(()=>undefined);return result;
  }
  private async send(operation:string,body:unknown) {
    const sleep=this.deps.sleep??(ms=>new Promise<void>(r=>setTimeout(r,ms))),fetcher=this.deps.fetch??globalThis.fetch,now=this.deps.now??Date.now;
    for(let attempt=0;attempt<=this.options.retries;attempt++){
      const wait=Math.max(0,this.nextAllowed-now());if(wait)await sleep(wait);
      this.nextAllowed=now()+this.options.minIntervalMs;
      let response:Response;
      const started=now();
      try{response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${this.options.model.replace(/^models\//,'')}:${operation}`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.options.apiKey},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(this.options.timeoutMs)});}
      catch {if(attempt===this.options.retries)throw new ModelProviderError('transport');await sleep(Math.min(1000*2**attempt,8000));continue;}
      if(!response.ok){
        const retry=response.status===429||[500,502,503,504].includes(response.status);const status=response.status;
        const header=response.headers.get('retry-after');
        await response.body?.cancel();
        const retryMs=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-now()):1000*2**attempt;
        const delay=Number.isFinite(retryMs)?Math.max(0,retryMs):1000;
        if(!retry||attempt===this.options.retries||delay>30000)throw new ModelProviderError(status===429?'rate-limit':'http',status,undefined,delay);
        await sleep(Math.min(30000,Math.max(0,Number.isFinite(retryMs)?retryMs:1000)));continue;
      }
      try{return{value:await response.json(),httpStatus:response.status,elapsedMs:Math.max(0,now()-started)};}catch(error){const timeout=error instanceof Error&&['AbortError','TimeoutError'].includes(error.name),invalid=error instanceof SyntaxError;throw new ModelProviderError(timeout||!invalid?'transport':'response',response.status,undefined,undefined,{operation,stage:'response-json',reason:timeout?'body-timeout':invalid?'json-invalid':'body-read-failed',httpStatus:response.status,elapsedMs:Math.max(0,now()-started),rawValuesRetained:false});}
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
    const {value:raw}=await this.transport.request('generateContent',{systemInstruction:{parts:[{text:redactModelText(input.system,this.transport.secrets)}]},contents:[{role:'user',parts:[{text:redactModelText(input.prompt,this.transport.secrets)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:responseSchema}});
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
    for(let start=0;start<texts.length;start+=transport.options.batchSize){
      const batch=texts.slice(start,start+transport.options.batchSize),response=await transport.request('batchEmbedContents',{requests:batch.map(text=>({model,content:{parts:[{text:redactModelText(text,transport.secrets)}]},taskType:'SEMANTIC_SIMILARITY',...(transport.options.dimensions?{outputDimensionality:transport.options.dimensions}:{})}))});
      vectors.push(...validateGeminiEmbeddingResponse(response.value,{count:batch.length,dimensions:transport.options.dimensions,priorDimensions:vectors[0]?.length,httpStatus:response.httpStatus,elapsedMs:response.elapsedMs}));
    }return vectors;
  };
}
// REST batchEmbedContents returns embeddings[].values, in request order. SDK
// embedContent wrappers and asynchronous batch envelopes are not interchangeable.
export function validateGeminiEmbeddingResponse(raw:unknown,context:{count:number;dimensions?:number;priorDimensions?:number;httpStatus:number;elapsedMs:number}){
 const kind=raw===null?'null':Array.isArray(raw)?'array':typeof raw,base={operation:'batchEmbedContents' as const,stage:'embedding-validation' as const,httpStatus:context.httpStatus,elapsedMs:context.elapsedMs,responseKind:['object','array','null','string','number','boolean','undefined'].includes(kind)?kind:'undefined',expectedCount:context.count,expectedDimensions:context.dimensions,rawValuesRetained:false as const};
 const fail=(reason:GeminiResponseDiagnostic['reason'],extra:{receivedCount?:number;receivedDimensions?:number;expectedDimensions?:number}={})=>{throw new ModelProviderError('response',context.httpStatus,undefined,undefined,{...base,reason,...extra});};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray((raw as {embeddings?:unknown}).embeddings))return fail('embedding-envelope');
 const embeddings=(raw as {embeddings:unknown[]}).embeddings;if(embeddings.length!==context.count)return fail('embedding-count',{receivedCount:Math.min(101,embeddings.length)});
 const out:number[][]=[];for(const row of embeddings){if(!row||typeof row!=='object'||Array.isArray(row)||!Array.isArray((row as {values?:unknown}).values))return fail('embedding-values');const values=(row as {values:unknown[]}).values,receivedDimensions=Math.min(3073,values.length);
  if(!values.length)return fail('embedding-empty',{receivedDimensions});if(values.length>3072)return fail('embedding-too-large',{receivedDimensions});if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))return fail('embedding-non-finite',{receivedDimensions});
  if(context.dimensions&&values.length!==context.dimensions||context.priorDimensions&&values.length!==context.priorDimensions||out.length&&values.length!==out[0].length)return fail('embedding-dimensions',{receivedDimensions,expectedDimensions:context.dimensions??context.priorDimensions??out[0].length});
  if(values.every(v=>v===0))return fail('embedding-zero-norm',{receivedDimensions});out.push(values as number[]);
 }return out;
}
