import { GeminiChat,geminiEmbeddings,ModelProviderError,type GeminiConfig } from './gemini.js';
import { environmentSecrets } from './privacy.js';
import { httpEmbeddings,type Embed } from '../knowledge/rag.js';
import { createHash } from 'node:crypto';
export function configuredEmbeddingSpace(env:NodeJS.ProcessEnv=process.env) {return createHash('sha256').update(JSON.stringify([env.SFQA_EMBEDDING_PROVIDER,env.SFQA_EMBEDDING_MODEL||env.GEMINI_EMBEDDING_MODEL,env.SFQA_EMBEDDING_DIMENSIONS,env.SFQA_EMBEDDING_URL])).digest('hex');}
function alias(env:NodeJS.ProcessEnv,names:string[]) {const values=[...new Set(names.map(n=>env[n]?.trim()).filter((v):v is string=>!!v))];if(values.length>1)throw new ModelProviderError('configuration',undefined,'aliases');return values[0]??'';}
function geminiConfig(env:NodeJS.ProcessEnv,embedding=false):GeminiConfig {
  const number=(name:string,fallback:number)=>env[name]?.trim()?Number(env[name]):fallback;
  return {apiKey:alias(env,[embedding?'SFQA_EMBEDDING_KEY':'SFQA_MODEL_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY']),model:alias(env,[embedding?'SFQA_EMBEDDING_MODEL':'SFQA_MODEL_NAME',embedding?'GEMINI_EMBEDDING_MODEL':'GEMINI_MODEL']),timeoutMs:number('SFQA_GEMINI_TIMEOUT_MS',30000),retries:number('SFQA_GEMINI_RETRIES',2),minIntervalMs:number('SFQA_GEMINI_MIN_INTERVAL_MS',0),batchSize:embedding?number('SFQA_EMBEDDING_BATCH_SIZE',5):100,...(embedding&&env.SFQA_EMBEDDING_DIMENSIONS?{dimensions:Number(env.SFQA_EMBEDDING_DIMENSIONS)}:{})};
}
export function configuredChat(env:NodeJS.ProcessEnv=process.env) {
  const provider=env.SFQA_MODEL_PROVIDER?.trim();if(!provider||provider==='none')return undefined;
  if(provider!=='gemini')throw new ModelProviderError('configuration',undefined,'provider');return new GeminiChat(geminiConfig(env),{secrets:environmentSecrets(env)});
}
export function configuredEmbeddings(env:NodeJS.ProcessEnv=process.env):Embed|undefined {
  const provider=env.SFQA_EMBEDDING_PROVIDER?.trim()||(env.SFQA_EMBEDDING_URL?'openai-compatible':'none');
  if(provider==='none')return undefined;
  if(provider==='gemini'){if(env.SFQA_EMBEDDING_URL)throw new ModelProviderError('configuration',undefined,'endpoint');return geminiEmbeddings(geminiConfig(env,true),{secrets:environmentSecrets(env)});}
  if(provider==='openai-compatible')return httpEmbeddings(env.SFQA_EMBEDDING_URL??'',env.SFQA_EMBEDDING_KEY??'',env.SFQA_EMBEDDING_MODEL??'');
  throw new ModelProviderError('configuration',undefined,'provider');
}
