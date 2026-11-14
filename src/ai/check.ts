import 'dotenv/config';
import { z } from 'zod';
import { configuredChat,configuredEmbeddings } from './providers.js';
import { ModelProviderError } from './gemini.js';
async function main() {
  let failed=false;
  for(const component of ['chat','embeddings'] as const){
    try {
      if(component==='chat'){const chat=configuredChat();if(!chat){console.log(JSON.stringify({component,status:'not-configured'}));failed=true;continue;}await chat.generate({system:'Return the requested JSON object.',prompt:'Connectivity test with synthetic public text only. Return {"ok":true}.',schema:z.object({ok:z.literal(true)})});}
      else {const embed=configuredEmbeddings();if(!embed){console.log(JSON.stringify({component,status:'not-configured'}));failed=true;continue;}const vectors=await embed(['Synthetic QA connectivity check']);if(vectors.length!==1||!vectors[0].length||vectors[0].some(v=>!Number.isFinite(v)))throw new ModelProviderError('response');}
      console.log(JSON.stringify({component,status:'success',validated:'actual API response'}));
    }catch(error){failed=true;console.log(JSON.stringify({component,status:'failed',diagnostic:error instanceof ModelProviderError?error.message:'Model connectivity failed; details withheld to protect credentials.'}));}
  }
  if(failed)process.exitCode=1;
}
await main();
