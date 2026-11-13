import { History } from '../core/history.js';
import { MutationSchema, mutationHash, type Mutation, type Approval } from '../salesforce/approval.js';
export interface DataAdapter {mutate(m:Mutation,a:Approval):Promise<{id:string;success:boolean}|undefined>}
export class DataExecution {
  constructor(private adapter:DataAdapter,private history:History) {
    history.db.exec('CREATE TABLE IF NOT EXISTS mutations(hash TEXT PRIMARY KEY,run TEXT,object TEXT,id TEXT,status TEXT)');
  }
  async execute(input:Mutation,approval:Approval) {
    const m=MutationSchema.parse(input),hash=mutationHash(m),db=this.history.db;
    const existing=db.prepare('SELECT status,id FROM mutations WHERE hash=?').get(hash);
    if(existing) {if(existing.status==='created'||existing.status==='deleted') return existing.id;throw Error('Uncertain prior side effect: reconcile manually before retry');}
    if(m.operation==='delete'&&!db.prepare("SELECT id FROM mutations WHERE run=? AND object=? AND id=? AND status='created'").get(m.runId,m.object,m.id!)) throw Error('Cleanup denied: record is not owned by this run');
    db.prepare('INSERT INTO mutations VALUES(?,?,?,?,?)').run(hash,m.runId,m.object,m.id??null,'pending');
    const result=await this.adapter.mutate(m,approval);
    if(m.operation==='create'&&(!result?.success || !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(result.id))) throw Error('Create response not verified; reconcile before retry');
    db.prepare('UPDATE mutations SET status=?,id=? WHERE hash=?').run(m.operation==='create'?'created':'deleted',result?.id??m.id!,hash);
    if(m.operation==='delete') db.prepare("UPDATE mutations SET status='cleaned' WHERE run=? AND object=? AND id=? AND status='created'").run(m.runId,m.object,m.id!);
    return result?.id??m.id;
  }
}
