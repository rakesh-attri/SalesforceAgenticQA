import { z } from 'zod';
import { History } from '../core/history.js';
import { redact,type Embed,SemanticKnowledge } from './rag.js';
export const KnowledgeSchema=z.object({id:z.string().min(1),version:z.string().min(1),org:z.string().min(1),permission:z.string().min(1),kind:z.enum(['requirement','org','workflow','defect','lesson']),status:z.enum(['observed','proposed','verified','deprecated']),text:z.string().min(1),evidence:z.array(z.string().min(1)).min(1),testIds:z.array(z.string()).default([]),reviewer:z.string().optional(),capturedAt:z.string().datetime()});
export type Knowledge=z.infer<typeof KnowledgeSchema>;
export type Scope={org:string;permission:string};
export function chunks(text:string,max=1200) {
  if(max<1)throw Error('Invalid chunk size');const out:string[]=[];
  for(const paragraph of text.replace(/\r/g,'').split(/\n\s*\n/).filter(Boolean)) {
    for(let start=0;start<paragraph.length;start+=max)out.push(paragraph.slice(start,start+max));
  }return out;
}
const tokens=(s:string)=>new Set(s.toLowerCase().match(/[a-z0-9_]+/g)??[]);
export class KnowledgeIndex {
  constructor(private history:History,private embed?:Embed,private remote?:SemanticKnowledge) {
    history.db.exec('CREATE TABLE IF NOT EXISTS knowledge(org TEXT,permission TEXT,id TEXT,version TEXT,payload TEXT NOT NULL,vector TEXT,PRIMARY KEY(org,permission,id,version)); CREATE TABLE IF NOT EXISTS knowledge_schema(org TEXT,permission TEXT,version TEXT,PRIMARY KEY(org,permission))');
  }
  async ingest(input:Knowledge) {
    const doc=KnowledgeSchema.parse(input);
    if(doc.status==='verified'&&!doc.reviewer?.trim())throw Error('Verified knowledge requires named review');
    const previous=this.all({org:doc.org,permission:doc.permission}).find(d=>d.id===doc.id&&d.version===doc.version);
    if(previous&&previous.text!==redact(doc.text))throw Error('Source content changed without a new version');
    doc.text=redact(doc.text);const vector=this.embed?(await this.embed([doc.text]))[0]:undefined;
    if(vector&&(!vector.length||vector.some(v=>!Number.isFinite(v))))throw Error('Invalid vector');
    if(this.remote&&doc.status==='verified')await this.remote.ingest({...doc,status:'verified'});
    const db=this.history.db;db.exec('BEGIN IMMEDIATE');
    try {
      for(const old of this.all({org:doc.org,permission:doc.permission}).filter(d=>d.id===doc.id&&d.version!==doc.version&&d.status!=='deprecated'))db.prepare('UPDATE knowledge SET payload=? WHERE org=? AND permission=? AND id=? AND version=?').run(JSON.stringify({...old,status:'deprecated'}),old.org,old.permission,old.id,old.version);
      db.prepare('INSERT OR REPLACE INTO knowledge VALUES(?,?,?,?,?,?)').run(doc.org,doc.permission,doc.id,doc.version,JSON.stringify(doc),vector?JSON.stringify(vector):null);db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  all(scope:Scope):Knowledge[] {if(!scope.org||!scope.permission)throw Error('Explicit org and permission required');return this.history.db.prepare('SELECT payload FROM knowledge WHERE org=? AND permission=?').all(scope.org,scope.permission).map(r=>KnowledgeSchema.parse(JSON.parse(String(r.payload))));}
  async retrieve(text:string,scope:Scope,limit=10) {
    if(limit<1||limit>50)throw Error('Retrieval limit invalid');const query=tokens(text),vector=this.embed?(await this.embed([redact(text)]))[0]:undefined;
    return this.all(scope).filter(d=>d.status==='verified').map(doc=>{
      const words=tokens(doc.text),lexical=[...query].filter(t=>words.has(t)).length/Math.max(query.size,1);
      let semantic=0;
      if(vector){const row=this.history.db.prepare('SELECT vector FROM knowledge WHERE org=? AND permission=? AND id=? AND version=?').get(doc.org,doc.permission,doc.id,doc.version);const stored=row?.vector?JSON.parse(String(row.vector)) as number[]:[];
        if(stored.length===vector.length){const norm=Math.hypot(...stored)*Math.hypot(...vector);semantic=norm?stored.reduce((s,v,i)=>s+v*vector[i],0)/norm:0;}}
      return {...doc,score:lexical+Math.max(0,semantic),citation:`${doc.id}@${doc.version}`};
    }).filter(d=>d.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
  }
  invalidate(scope:Scope,evidence:string) {for(const doc of this.all(scope).filter(d=>d.evidence.includes(evidence)))this.history.db.prepare('UPDATE knowledge SET payload=? WHERE org=? AND permission=? AND id=? AND version=?').run(JSON.stringify({...doc,status:'deprecated'}),doc.org,doc.permission,doc.id,doc.version);}
  bindSchema(scope:Scope,version:string) {
    const previous=this.history.db.prepare('SELECT version FROM knowledge_schema WHERE org=? AND permission=?').get(scope.org,scope.permission),invalidated:string[]=[];
    if(previous&&previous.version!==version)for(const doc of this.all(scope).filter(d=>['org','workflow','lesson','defect'].includes(d.kind)&&d.status!=='deprecated')){
      this.history.db.prepare('UPDATE knowledge SET payload=? WHERE org=? AND permission=? AND id=? AND version=?').run(JSON.stringify({...doc,status:'deprecated'}),doc.org,doc.permission,doc.id,doc.version);invalidated.push(doc.id);
    }
    this.history.db.prepare('INSERT OR REPLACE INTO knowledge_schema VALUES(?,?,?)').run(scope.org,scope.permission,version);return invalidated;
  }
}
export function retrievalMetrics(relevant:string[],retrieved:string[]) {const hits=new Set(retrieved.filter(id=>relevant.includes(id))).size;return {precision:hits/Math.max(retrieved.length,1),recall:hits/Math.max(relevant.length,1)};}
