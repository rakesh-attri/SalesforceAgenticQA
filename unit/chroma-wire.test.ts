import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ChromaClient } from 'chromadb';
import { SemanticKnowledge } from '../src/knowledge/rag.js';
import { KnowledgeIndex } from '../src/knowledge/index.js';
import { History } from '../src/core/history.js';
test('actual Chroma SDK HTTP retrieval influences ranking only for locally verified current scoped sources',async()=>{
  const requests:Array<{url:string;body:any}>=[];let tamper=false;
  const server=createServer(async(req,res)=>{const buffers=[];for await(const data of req)buffers.push(data);const body=buffers.length?JSON.parse(Buffer.concat(buffers).toString()):undefined;requests.push({url:req.url!,body});res.setHeader('Content-Type','application/json');
    if(req.url==='/api/v2/auth/identity'){res.end(JSON.stringify({user_id:'fixture',tenant:'default_tenant',databases:['default_database']}));return;}
    if(req.url==='/api/v2/pre-flight-checks'){res.end(JSON.stringify({max_batch_size:100,supports_base64_encoding:false}));return;}
    if(req.url?.endsWith('/collections')){res.end(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',name:'sfqa_verified',tenant:'default_tenant',database:'default_database',metadata:null,configuration_json:{},schema:null}));return;}
    if(req.url?.endsWith('/upsert')){res.end('{}');return;}
    if(req.url?.endsWith('/query')){res.end(JSON.stringify({ids:[['chunk-1','injected']],documents:[['reviewed fact','unreviewed remote document']],metadatas:[[{sourceId:'approved',version:'v1',org:tamper?'other-org':'sandbox',permission:'QA',status:'verified'},{sourceId:'not-in-catalog',version:'v1',org:'sandbox',permission:'QA',status:'verified'}]],distances:[[0.01,0.02]],embeddings:null,uris:null,include:['metadatas','documents','distances']}));return;}
    res.writeHead(404);res.end('{}');
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port,h=new History(':memory:');
  try {
    const collection=await new ChromaClient({host:'127.0.0.1',port,ssl:false}).getOrCreateCollection({name:'sfqa_verified',embeddingFunction:null});
    const remote=new SemanticKnowledge(collection,async texts=>texts.map(()=>[0.2,0.4])),index=new KnowledgeIndex(h,undefined,remote);
    await index.ingest({id:'approved',version:'v1',org:'sandbox',permission:'QA',kind:'workflow',status:'verified',reviewer:'fixture-reviewer',text:'reviewed fact',evidence:['fixture:source'],testIds:['T'],capturedAt:new Date().toISOString()});
    const hits=await index.retrieve('unrelated-synonym',{org:'sandbox',permission:'QA'});assert.deepEqual(hits.map(d=>d.id),['approved']);
    const query=requests.find(r=>r.url.endsWith('/query'))!;assert.deepEqual(query.body.where,{$and:[{org:'sandbox'},{permission:'QA'},{version:'v1'},{status:'verified'}]});assert.deepEqual(query.body.query_embeddings,[[0.2,0.4]]);
    assert.ok(requests.some(r=>r.url.endsWith('/upsert')));tamper=true;assert.equal((await index.retrieve('unrelated-synonym',{org:'sandbox',permission:'QA'})).length,0);
    index.invalidate({org:'sandbox',permission:'QA'},'fixture:source');assert.equal((await index.retrieve('unrelated-synonym',{org:'sandbox',permission:'QA'})).length,0);
  }finally{h.close();await new Promise<void>(r=>server.close(()=>r()));}
});
