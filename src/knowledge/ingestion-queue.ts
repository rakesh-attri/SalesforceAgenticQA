import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { History } from '../core/history.js';
import { KnowledgeIndex,type Knowledge } from './index.js';
import { authorizeAI,reviewedDocuments,type ReviewBundle } from './reviewed.js';
import type { Embed } from './rag.js';
import { ModelProviderError } from '../ai/gemini.js';
export const IngestionPolicySchema=z.object({batchSize:z.number().int().min(1).max(100).default(5),maxRequestsPerRun:z.number().int().min(1).max(100).default(5),maxTextsPerDay:z.number().int().min(1).max(100000).default(100),maxRequestsPerDay:z.number().int().min(1).max(10000).default(30),minIntervalMs:z.number().int().min(0).max(3600000).default(1000)});
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
// Provenance changes need new review, but do not change the meaning embedded for structural facts.
export function embeddingContent(doc:Knowledge) {
  if(doc.id.startsWith('field:')){try{const value=JSON.parse(doc.text);if(value.id===doc.id&&typeof value.object==='string'&&typeof value.field==='string'){const {source,...content}=value;return JSON.stringify(content);}}catch{/* Other source formats use their exact reviewed text. */}}
  return doc.text;
}
export class IngestionQueue {
  constructor(private history:History,private index:KnowledgeIndex,private embed:Embed,private space:string,private now=Date.now) {
    history.db.exec(`CREATE TABLE IF NOT EXISTS ingest_sources(org TEXT,permission TEXT,version TEXT,captured TEXT,PRIMARY KEY(org,permission));
      CREATE TABLE IF NOT EXISTS ingest_jobs(key TEXT PRIMARY KEY,org TEXT,permission TEXT,source TEXT,space TEXT,hash TEXT,document TEXT,status TEXT,attempts INTEGER,nextAt REAL,vector TEXT,code TEXT);
      CREATE TABLE IF NOT EXISTS embed_cache(org TEXT,permission TEXT,space TEXT,hash TEXT,vector TEXT,PRIMARY KEY(org,permission,space,hash));
      CREATE TABLE IF NOT EXISTS ingest_budget(space TEXT,day TEXT,requests INTEGER,texts INTEGER,nextAt REAL,PRIMARY KEY(space,day));
      CREATE TABLE IF NOT EXISTS ingest_lock(space TEXT PRIMARY KEY,owner TEXT,expires REAL);`);
  }
  enqueue(bundle:ReviewBundle,review:unknown) {
    const operator=authorizeAI(bundle,review,'gemini-embeddings').operator,docs=reviewedDocuments(bundle,operator).map(d=>this.index.validateDocument(d)),db=this.history.db;
    if(docs.some(d=>d.org!==bundle.org||d.permission!==bundle.permission||d.status!=='verified'))throw Error('Queue documents must match reviewed org/permission and verified status');
    db.exec('BEGIN IMMEDIATE');
    try {
      const source=db.prepare('SELECT version,captured FROM ingest_sources WHERE org=? AND permission=?').get(bundle.org,bundle.permission);
      if(source&&source.version!==(bundle.knowledgeVersion??bundle.sourceVersion)&&String(source.captured)>=bundle.capturedAt)throw Error('Cannot replace current queue source with stale or ambiguous capture');
      db.prepare('INSERT OR REPLACE INTO ingest_sources VALUES(?,?,?,?)').run(bundle.org,bundle.permission,(bundle.knowledgeVersion??bundle.sourceVersion),bundle.capturedAt);
      db.prepare("UPDATE ingest_jobs SET status='superseded' WHERE org=? AND permission=? AND source<>?").run(bundle.org,bundle.permission,(bundle.knowledgeVersion??bundle.sourceVersion));
      for(const doc of docs){const contentHash=hash(embeddingContent(doc)),key=hash(JSON.stringify([doc.org,doc.permission,doc.id,doc.version,(bundle.knowledgeVersion??bundle.sourceVersion),this.space])),existing=db.prepare('SELECT hash,status FROM ingest_jobs WHERE key=?').get(key);
        if(existing&&existing.hash!==contentHash)throw Error('Queue source changed without version change');
        db.prepare("INSERT OR IGNORE INTO ingest_jobs VALUES(?,?,?,?,?,?,?,'pending',0,0,NULL,NULL)").run(key,doc.org,doc.permission,(bundle.knowledgeVersion??bundle.sourceVersion),this.space,contentHash,JSON.stringify(doc));
        const vector=embeddingContent(doc)===doc.text?this.index.vectorFor(doc):undefined;if(vector)db.prepare('INSERT OR IGNORE INTO embed_cache VALUES(?,?,?,?,?)').run(doc.org,doc.permission,this.space,contentHash,JSON.stringify(vector));
      }this.index.bindSchema(bundle,(bundle.knowledgeVersion??bundle.sourceVersion));db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return this.status(bundle);
  }
  status(bundle:ReviewBundle) {return this.history.db.prepare('SELECT status,COUNT(*) AS count FROM ingest_jobs WHERE org=? AND permission=? AND source=? AND space=? GROUP BY status').all(bundle.org,bundle.permission,(bundle.knowledgeVersion??bundle.sourceVersion),this.space).map(r=>({status:String(r.status),count:Number(r.count)}));}
  retryBlocked(bundle:ReviewBundle,review:unknown) {authorizeAI(bundle,review,'gemini-embeddings');const current=this.history.db.prepare('SELECT version FROM ingest_sources WHERE org=? AND permission=?').get(bundle.org,bundle.permission);if(current?.version!==(bundle.knowledgeVersion??bundle.sourceVersion))throw Error('Queue source is no longer current');return this.history.db.prepare("UPDATE ingest_jobs SET status='pending',nextAt=0,code=NULL WHERE org=? AND permission=? AND source=? AND space=? AND status='blocked'").run(bundle.org,bundle.permission,(bundle.knowledgeVersion??bundle.sourceVersion),this.space).changes;}
  async drain(bundle:ReviewBundle,review:unknown,rawPolicy:unknown={}) {
    const policy=IngestionPolicySchema.parse(rawPolicy),db=this.history.db,owner=randomUUID();authorizeAI(bundle,review,'gemini-embeddings');
    const source=db.prepare('SELECT version FROM ingest_sources WHERE org=? AND permission=?').get(bundle.org,bundle.permission);
    if(source?.version!==(bundle.knowledgeVersion??bundle.sourceVersion))throw Error('Queue source is no longer current');
    db.exec('BEGIN IMMEDIATE');
    try {db.prepare('DELETE FROM ingest_lock WHERE expires<=?').run(this.now());const lock=db.prepare('SELECT owner FROM ingest_lock WHERE space=?').get(this.space);if(lock){db.exec('COMMIT');return {requests:0,deferred:true,status:this.status(bundle)};}db.prepare('INSERT INTO ingest_lock VALUES(?,?,?)').run(this.space,owner,this.now()+600000);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    let requests=0,deferredUntil:number|undefined;
    try {
      for(;;){authorizeAI(bundle,review,'gemini-embeddings');
        const jobs=db.prepare("SELECT * FROM ingest_jobs WHERE org=? AND permission=? AND source=? AND space=? AND status='pending' ORDER BY rowid").all(bundle.org,bundle.permission,(bundle.knowledgeVersion??bundle.sourceVersion),this.space);
        if(!jobs.length)break;
        // Materialize durable cached vectors before spending any request quota.
        for(const job of jobs){const cache=job.vector?{vector:job.vector}:db.prepare('SELECT vector FROM embed_cache WHERE org=? AND permission=? AND space=? AND hash=?').get(bundle.org,bundle.permission,this.space,String(job.hash));
          if(cache?.vector){await this.index.ingestVector(JSON.parse(String(job.document)),JSON.parse(String(cache.vector)));db.prepare("UPDATE ingest_jobs SET status='complete',vector=?,code=NULL WHERE key=?").run(String(cache.vector),String(job.key));}}
        const remaining=db.prepare("SELECT * FROM ingest_jobs WHERE org=? AND permission=? AND source=? AND space=? AND status='pending' ORDER BY rowid").all(bundle.org,bundle.permission,(bundle.knowledgeVersion??bundle.sourceVersion),this.space);if(!remaining.length)break;
        const now=this.now(),due=remaining.filter(j=>Number(j.nextAt)<=now);
        if(!due.length){deferredUntil=Math.min(...remaining.map(j=>Number(j.nextAt)));break;}
        let unique=[...new Map(due.map(j=>[String(j.hash),j])).values()].slice(0,policy.batchSize);
        if(requests>=policy.maxRequestsPerRun)break;
        const day=new Date(now).toISOString().slice(0,10);db.exec('BEGIN IMMEDIATE');
        try {db.prepare('INSERT OR IGNORE INTO ingest_budget VALUES(?,?,0,0,0)').run(this.space,day);const budget=db.prepare('SELECT * FROM ingest_budget WHERE space=? AND day=?').get(this.space,day)!;
          if(Number(budget.nextAt)>now||Number(budget.requests)>=policy.maxRequestsPerDay||Number(budget.texts)>=policy.maxTextsPerDay){deferredUntil=Number(budget.nextAt)>now?Number(budget.nextAt):Date.parse(`${day}T00:00:00Z`)+86400000;db.exec('COMMIT');break;}
          unique=unique.slice(0,policy.maxTextsPerDay-Number(budget.texts));
          db.prepare('UPDATE ingest_budget SET requests=requests+1,texts=texts+?,nextAt=? WHERE space=? AND day=?').run(unique.length,now+policy.minIntervalMs,this.space,day);
          db.prepare('UPDATE ingest_lock SET expires=? WHERE space=? AND owner=?').run(now+600000,this.space,owner);db.exec('COMMIT');
        }catch(e){db.exec('ROLLBACK');throw e;}
        requests++;
        try {
          const vectors=await this.embed(unique.map(j=>embeddingContent(JSON.parse(String(j.document)))));
          if(vectors.length!==unique.length||vectors.some(v=>!v.length||v.some(n=>!Number.isFinite(n))))throw new ModelProviderError('response');
          // Commit all received vectors before index/remote materialization, so index failure does not re-upload.
          db.exec('BEGIN IMMEDIATE');try{for(let i=0;i<unique.length;i++)db.prepare('INSERT OR REPLACE INTO embed_cache VALUES(?,?,?,?,?)').run(bundle.org,bundle.permission,this.space,String(unique[i].hash),JSON.stringify(vectors[i]));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
        }catch(error){const provider=error instanceof ModelProviderError?error:undefined,delay=Math.max(1000,provider?.retryAfterMs??Math.min(3600000,1000*2**Math.min(12,Number(unique[0].attempts))));
          const permanent=provider&&(provider.code==='configuration'||provider.code==='response'||provider.code==='blocked'||(provider.code==='http'&&Number(provider.status)<500));
          deferredUntil=now+delay;for(const job of due)db.prepare('UPDATE ingest_jobs SET status=?,attempts=attempts+1,nextAt=?,code=? WHERE key=?').run(permanent?'blocked':'pending',deferredUntil,provider?.code??'provider-failure',String(job.key));
          db.prepare('UPDATE ingest_budget SET nextAt=MAX(nextAt,?) WHERE space=? AND day=?').run(deferredUntil,this.space,day);break;
        }
      }
      return {requests,deferredUntil,status:this.status(bundle)};
    }finally{db.prepare('DELETE FROM ingest_lock WHERE space=? AND owner=?').run(this.space,owner);}
  }
}
