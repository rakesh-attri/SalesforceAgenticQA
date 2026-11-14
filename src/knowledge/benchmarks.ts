import { z } from 'zod';
import { KnowledgeIndex } from './index.js';
export const RetrievalCaseSchema=z.object({id:z.string().min(1),query:z.string().min(1),scope:z.object({org:z.string().min(1),permission:z.string().min(1)}),relevant:z.array(z.string()).min(1)});
export async function benchmarkRetrieval(index:KnowledgeIndex,raw:unknown,k=3) {
  const cases=z.array(RetrievalCaseSchema).min(1).max(20).parse(raw);if(!Number.isInteger(k)||k<1||k>20)throw Error('Benchmark cutoff invalid');
  const results:Array<{id:string;retrieved:string[];precision:number;recall:number;reciprocalRank:number;ndcg:number}>=[];
  for(const c of cases){const hits=await index.retrieve(c.query,c.scope,k),ids=hits.map(d=>d.citation),relevant=new Set(c.relevant),binary=ids.map<number>(id=>relevant.has(id)?1:0),rank=binary.indexOf(1),dcg=binary.reduce((s,v,i)=>s+v/Math.log2(i+2),0),ideal=Array.from({length:Math.min(k,relevant.size)},(_,i)=>1/Math.log2(i+2)).reduce((s,n)=>s+n,0);
    results.push({id:c.id,retrieved:ids,precision:binary.reduce((s,n)=>s+n,0)/k,recall:binary.reduce((s,n)=>s+n,0)/relevant.size,reciprocalRank:rank<0?0:1/(rank+1),ndcg:ideal?dcg/ideal:0});
  }
  const mean=(key:'precision'|'recall'|'reciprocalRank'|'ndcg')=>results.reduce((s,r)=>s+r[key],0)/results.length;
  return {kind:'source-judged-retrieval-benchmark',k,cases:results,mean:{precision:mean('precision'),recall:mean('recall'),mrr:mean('reciprocalRank'),ndcg:mean('ndcg')},limitations:'Judged retrieval relevance only; not a model judge or business correctness proof.'};
}
