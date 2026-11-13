import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
export const ResultSchema=z.object({runId:z.string().min(1),testId:z.string().min(1),status:z.enum(['passed','failed','skipped']),durationMs:z.number().nonnegative(),components:z.array(z.string()),evidence:z.array(z.string()),at:z.string().datetime()});
export type Result=z.infer<typeof ResultSchema>;
export class History {
  readonly db:DatabaseSync;
  constructor(path='.state/history.sqlite') {
    mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS results(run TEXT,test TEXT,payload TEXT NOT NULL,PRIMARY KEY(run,test)); CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
  }
  record(input:unknown) {const r=ResultSchema.parse(input);this.db.prepare('INSERT INTO results VALUES(?,?,?)').run(r.runId,r.testId,JSON.stringify(r));}
  results():Result[] {return this.db.prepare('SELECT payload FROM results ORDER BY rowid').all().map(r=>ResultSchema.parse(JSON.parse(String(r.payload))));}
  learn(input:unknown) {
    const lesson=z.object({id:z.string().min(1),testId:z.string().min(1),reviewer:z.string().min(1),rootCause:z.string().min(1),evidence:z.array(z.string()).min(1),regressionRun:z.string().min(1)}).parse(input);
    if(!this.results().some(r=>r.runId===lesson.regressionRun && r.testId===lesson.testId && r.status==='passed')) throw Error('Passing regression evidence required');
    this.db.prepare('INSERT INTO lessons VALUES(?,?)').run(lesson.id,JSON.stringify(lesson));
  }
  lessons() {return this.db.prepare('SELECT payload FROM lessons ORDER BY id').all().map(r=>JSON.parse(String(r.payload)) as {id:string;testId:string;rootCause:string;evidence:string[]});}
  metrics() {
    const rows=this.results(),ids=[...new Set(rows.map(r=>r.testId))];
    return {executed:rows.filter(r=>r.status!=='skipped').length,passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,skipped:rows.filter(r=>r.status==='skipped').length,durationMs:rows.reduce((s,r)=>s+r.durationMs,0),unstableTests:ids.filter(id=>rows.some(r=>r.testId===id&&r.status==='failed')&&rows.some(r=>r.testId===id&&r.status==='passed'))};
  }
  close(){this.db.close();}
}
