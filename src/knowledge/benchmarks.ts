import { z } from 'zod';
import { KnowledgeIndex } from './index.js';
import {ModelProviderError} from '../ai/gemini.js';
type RetrievalResult={id:string;retrieved:string[];precision:number;recall:number;reciprocalRank:number;ndcg:number};
export class RetrievalBenchmarkError extends Error {
  constructor(readonly report:{kind:'incomplete-retrieval-benchmark';status:'FAIL'|'BLOCKED';completed:RetrievalResult[];failedCase:{id:string;category:string;httpStatus?:number};unexecuted:string[]}){super('Retrieval benchmark incomplete; no full benchmark success inferred. Provider text withheld.');this.name='RetrievalBenchmarkError';}
}
export const RetrievalCaseSchema=z.object({id:z.string().min(1),query:z.string().min(1),scope:z.object({org:z.string().min(1),permission:z.string().min(1)}),relevant:z.array(z.string()).min(1)});
export async function benchmarkRetrieval(index:KnowledgeIndex,raw:unknown,k=3) {
  const cases=z.array(RetrievalCaseSchema).min(1).max(20).parse(raw);if(!Number.isInteger(k)||k<1||k>20)throw Error('Benchmark cutoff invalid');
  const results:RetrievalResult[]=[];
  for(const [position,c] of cases.entries()){let hits:Awaited<ReturnType<KnowledgeIndex['retrieve']>>;try{hits=await index.retrieve(c.query,c.scope,k);}catch(error){const code=error instanceof ModelProviderError?z.enum(['configuration','transport','rate-limit','http','response','structured-output','blocked']).safeParse(error.code):undefined,category=code?.success?code.data:'retrieval-failed',status=error instanceof ModelProviderError&&Number.isInteger(error.status)&&Number(error.status)>=100&&Number(error.status)<=599?error.status:undefined;throw new RetrievalBenchmarkError({kind:'incomplete-retrieval-benchmark',status:category==='rate-limit'||category==='blocked'?'BLOCKED':'FAIL',completed:results,failedCase:{id:c.id,category,httpStatus:status},unexecuted:cases.slice(position+1).map(c=>c.id)});}
    const ids=hits.map(d=>d.citation),relevant=new Set(c.relevant),binary=ids.map<number>(id=>relevant.has(id)?1:0),rank=binary.indexOf(1),dcg=binary.reduce((s,v,i)=>s+v/Math.log2(i+2),0),ideal=Array.from({length:Math.min(k,relevant.size)},(_,i)=>1/Math.log2(i+2)).reduce((s,n)=>s+n,0);
    results.push({id:c.id,retrieved:ids,precision:binary.reduce((s,n)=>s+n,0)/k,recall:binary.reduce((s,n)=>s+n,0)/relevant.size,reciprocalRank:rank<0?0:1/(rank+1),ndcg:ideal?dcg/ideal:0});
  }
  const mean=(key:'precision'|'recall'|'reciprocalRank'|'ndcg')=>results.reduce((s,r)=>s+r[key],0)/results.length;
  return {kind:'source-judged-retrieval-benchmark',k,cases:results,mean:{precision:mean('precision'),recall:mean('recall'),mrr:mean('reciprocalRank'),ndcg:mean('ndcg')},limitations:'Judged retrieval relevance only; not a model judge or business correctness proof.'};
}
