import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { GeminiChat,geminiEmbeddings,ModelProviderError } from '../src/ai/gemini.js';
import { configuredChat,configuredEmbeddings } from '../src/ai/providers.js';
import { ReasoningAgents } from '../src/agents/reasoning.js';
import { redactModelValue } from '../src/ai/privacy.js';
import { History } from '../src/core/history.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { createSpecPipeline,PipelineInputSchema } from '../src/agents/pipeline.js';
import { OrgSnapshotSchema } from '../src/core/types.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
import { mkdtemp,mkdir,rm,readFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const options={apiKey:'mock-api-key',model:'gemini-test',retries:0},schema=z.object({ok:z.literal(true)});
const chatResponse=(value:unknown,finishReason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}]}));
test('Gemini chat uses header authentication, JSON schema, bounded request and input/output redaction',async()=>{
  let sent='';const chat=new GeminiChat(options,{secrets:['mock-consumer-key'],fetch:async(url,init)=>{
    assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');assert.ok(!String(url).includes(options.apiKey));
    assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],options.apiKey);assert.equal(init?.redirect,'error');assert.ok(init?.signal);
    sent=String(init?.body);const payload=JSON.parse(sent);assert.equal(payload.generationConfig.responseMimeType,'application/json');assert.ok(payload.generationConfig.responseJsonSchema.properties);
    return chatResponse({answer:'mock-api-key mock-consumer-key example@test.invalid'});
  }});
  const result=await chat.generate({system:'Never expose mock-api-key',prompt:'mock-consumer-key password=unlisted-secret eyJabc.def.ghi',schema:z.object({answer:z.string()})});
  for(const value of ['mock-api-key','mock-consumer-key','unlisted-secret','eyJabc.def.ghi'])assert.ok(!sent.includes(value));
  assert.ok(!result.answer.includes('mock-api-key'));assert.ok(!result.answer.includes('example@'));
});
test('blocked, malformed and schema-invalid chat responses fail without raw provider output',async()=>{
  for(const response of [chatResponse({ok:false}),chatResponse({ok:true},'MAX_TOKENS'),new Response('secret response'),new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}))]){
    const chat=new GeminiChat(options,{fetch:async()=>response});
    await assert.rejects(chat.generate({system:'test',prompt:'test',schema}),error=>{assert.ok(error instanceof ModelProviderError);assert.ok(!String(error).includes('secret response'));return true;});
  }
});
test('429 retry-after and transient failures retry within budget; auth failures do not retry or leak bodies',async()=>{
  const sleeps:number[]=[];let calls=0;
  const chat=new GeminiChat({...options,retries:2},{sleep:async ms=>{sleeps.push(ms);},fetch:async()=>{calls++;if(calls===1)return new Response('mock-api-key echoed',{status:429,headers:{'retry-after':'2'}});if(calls===2)return new Response('private provider body',{status:503});return chatResponse({ok:true});}});
  assert.deepEqual(await chat.generate({system:'test',prompt:'test',schema}),{ok:true});assert.equal(calls,3);assert.deepEqual(sleeps,[2000,2000]);
  calls=0;const denied=new GeminiChat({...options,retries:3},{fetch:async()=>{calls++;return new Response('mock-api-key',{status:403});}});
  await assert.rejects(denied.generate({system:'test',prompt:'test',schema}),error=>{assert.ok(!String(error).includes(options.apiKey));assert.match(String(error),/HTTP 403/);return true;});assert.equal(calls,1);
});
test('timeouts/transport failures and exhausted rate budgets are sanitized and bounded',async()=>{
  let calls=0;const chat=new GeminiChat({...options,retries:1},{sleep:async()=>{},fetch:async()=>{calls++;throw Error('mock-api-key transport echo');}});
  await assert.rejects(chat.generate({system:'test',prompt:'test',schema}),error=>{assert.ok(!String(error).includes(options.apiKey));assert.match(String(error),/transport/);return true;});assert.equal(calls,2);
  const limited=new GeminiChat({...options,retries:1},{sleep:async()=>{throw Error('Should not wait beyond bounded budget');},fetch:async()=>new Response('echo',{status:429,headers:{'retry-after':'3600'}})});
  await assert.rejects(limited.generate({system:'test',prompt:'test',schema}),/rate-limit/);
  let aborted=false;const timed=new GeminiChat({...options,timeoutMs:5},{fetch:async(_u,init)=>new Promise<Response>((_r,j)=>{init!.signal!.addEventListener('abort',()=>{aborted=true;j(Error('secret timeout'));});})});
  // Keep the test event loop alive while AbortSignal.timeout's timer is unref'ed.
  const keepAlive=setInterval(()=>{},100);try{await assert.rejects(timed.generate({system:'test',prompt:'test',schema}),/transport/);assert.equal(aborted,true);}finally{clearInterval(keepAlive);}
});
test('embeddings use separate model, preserve order and the existing Embed callable contract',async()=>{
  let batch:number=0;const embed=geminiEmbeddings({...options,model:'models/gemini-embedding-test',dimensions:2},{fetch:async(url,init)=>{
    assert.ok(String(url).endsWith('/gemini-embedding-test:batchEmbedContents'));const body=JSON.parse(String(init?.body));batch++;
    assert.equal(body.requests[0].taskType,'SEMANTIC_SIMILARITY');assert.equal(body.requests[0].outputDimensionality,2);assert.ok(!JSON.stringify(body).includes(options.apiKey));
    return new Response(JSON.stringify({embeddings:body.requests.map((_r:unknown,i:number)=>({values:[batch,i]}))}));
  }});
  const vectors=await embed(Array.from({length:101},()=>`text ${options.apiKey}`));assert.equal(vectors.length,101);assert.deepEqual(vectors[0],[1,0]);assert.deepEqual(vectors[100],[2,0]);
});
test('embedding shape, count and dimension failures reject safely',async()=>{
  for(const raw of [{embeddings:[]},{embeddings:[{values:[]}]},{embeddings:[{values:[1,2,3]}]},{embeddings:[{values:['secret']}]}]){
    const embed=geminiEmbeddings({...options,dimensions:2},{fetch:async()=>new Response(JSON.stringify(raw))});await assert.rejects(embed(['input']),/response/);
  }
});
test('provider configuration is explicit, separated and backward compatible',()=>{
  assert.equal(configuredChat({}),undefined);assert.equal(configuredEmbeddings({}),undefined);
  assert.ok(configuredChat({SFQA_MODEL_PROVIDER:'gemini',GEMINI_API_KEY:'mock',GEMINI_MODEL:'gemini-chat-test'}));
  assert.ok(configuredEmbeddings({SFQA_EMBEDDING_PROVIDER:'gemini',GEMINI_API_KEY:'mock',GEMINI_EMBEDDING_MODEL:'gemini-embed-test'}));
  assert.ok(configuredEmbeddings({SFQA_EMBEDDING_URL:'https://embedding.example',SFQA_EMBEDDING_KEY:'mock',SFQA_EMBEDDING_MODEL:'legacy-model'}));
  for(const env of [{SFQA_MODEL_PROVIDER:'unsupported'},{SFQA_MODEL_PROVIDER:'gemini',GEMINI_API_KEY:'mock'},{SFQA_MODEL_PROVIDER:'gemini',GEMINI_API_KEY:'mock',GEMINI_MODEL:'model?key=secret'},{SFQA_MODEL_PROVIDER:'gemini',GEMINI_API_KEY:'mock',SFQA_MODEL_API_KEY:'conflict',GEMINI_MODEL:'m'},{SFQA_MODEL_PROVIDER:'gemini',GEMINI_API_KEY:'mock',GEMINI_MODEL:'m',SFQA_GEMINI_RETRIES:'99'}])assert.throws(()=>configuredChat(env),/configuration/);
});
test('all reasoning roles return reviewed-source-cited proposals and reject invented citations',async()=>{
  const calls:string[]=[];const chat=new GeminiChat(options,{fetch:async(_u,init)=>{calls.push(String(init?.body));return chatResponse({status:'proposed',findings:[{text:'Missing workflow evidence',citations:['e1']}],questions:['Which reviewed workflow applies?'],workflowProposals:[]});}});
  const agents=new ReasoningAgents(chat,['mock-api-key']);
  for(const role of ['spec-analyst','test-planner','generator','investigator','risk-analyzer','reviewer','explorer','learning'] as const){const advice=await agents.advise(role,{'story:AC1':{text:'Known criterion',apiKey:'private-value'}});assert.equal(advice.status,'proposed');assert.deepEqual(advice.findings[0].citations,['story:AC1']);}
  assert.ok(calls.every(call=>!call.includes('private-value')));
  const bad=new ReasoningAgents(new GeminiChat(options,{fetch:async()=>chatResponse({status:'proposed',findings:[{text:'invented',citations:['e99']}],questions:[],workflowProposals:[]})}));
  await assert.rejects(bad.advise('test-planner',{source:'known'}),/structured-output/);
  assert.deepEqual(redactModelValue({password:'secret',nested:{clientId:'consumer'}},[]),{password:'[REDACTED]',nested:{clientId:'[REDACTED]'}});
});
test('Gemini requests are serialized and paced across concurrent callers',async()=>{
  let active=0,maximum=0,time=0;const sleeps:number[]=[];
  const chat=new GeminiChat({...options,minIntervalMs:100},{now:()=>time,sleep:async ms=>{sleeps.push(ms);time+=ms;},fetch:async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;return chatResponse({ok:true});}});
  await Promise.all([1,2].map(()=>chat.generate({system:'s',prompt:'p',schema})));assert.equal(maximum,1);assert.deepEqual(sleeps,[100]);
});
test('spec graph invokes reasoning roles at their stages and never accepts model assertion changes',async()=>{
  await mkdir('.state',{recursive:true});
  const root=await mkdtemp(resolve('.state/gemini-graph-')),history=new History(':memory:'),roles:string[]=[];
  const chat=new GeminiChat(options,{fetch:async(_url,init)=>{
    const body=JSON.parse(String(init?.body)),role=body.systemInstruction.parts[0].text.match(/Salesforce QA ([^.]+)/)![1];roles.push(role);
    return chatResponse({status:'proposed',findings:[{text:'Review evidence',citations:['e1']}],questions:[],workflowProposals:role==='generator'?[{workflowId:'T',criterionId:'AC1',steps:[],assertion:{locator:{by:'testId',value:'status'},text:'weakened'},citations:['e2']}]:[]});
  }});
  try {
    const org=OrgSnapshotSchema.parse({orgAlias:'fixture',source:'fixture',observedAt:'2026-11-14',objects:[]});
    const input=PipelineInputSchema.parse({runId:'model-graph',spec:{id:'S',title:'Explicit',description:'Paid',objects:[],source:'fixture',version:'1',acceptanceCriteria:[{id:'AC1',text:'Paid',expectedText:'Paid'}]},org,orgVersion:snapshotVersion(org),permission:'QA',allowedOrigins:['http://127.0.0.1:8765'],mappings:[{criterionId:'AC1',workflow:{id:'T',criterion:'AC1',source:'fixture',reviewer:'human',origin:'http://127.0.0.1:8765',path:'/',steps:[],assertion:{locator:{by:'testId',value:'status'},text:'Paid'}}}]});
    const result=await createSpecPipeline({history,knowledge:new KnowledgeIndex(history),root,reasoning:new ReasoningAgents(chat,[])}).invoke({input});
    assert.deepEqual(roles,['spec-analyst','test-planner','generator','investigator']);assert.deepEqual(result.modelFailures,['generator']);assert.ok(result.advice['spec-analyst']);assert.equal(result.execution,undefined);assert.equal(history.results().length,0);
    assert.ok(result.files[0].code.includes('toHaveText("Paid")'));assert.ok(!result.files[0].code.includes('weakened'));assert.equal(JSON.parse(await readFile(result.reportPath,'utf8')).modelAdvice['test-planner'].status,'proposed');
  }finally{history.close();await rm(root,{recursive:true,force:true});}
});
