import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { randomUUID } from 'node:crypto';
import { History } from '../core/history.js';
export default class HistoryReporter implements Reporter {
  private history?:History;private run=randomUUID();
  onBegin(){this.history=new History();}
  onTestEnd(test:TestCase,result:TestResult) {
    this.history!.record({runId:`${this.run}:${result.retry}`,testId:test.titlePath().join(' > '),status:result.status==='passed'?'passed':result.status==='skipped'?'skipped':'failed',durationMs:result.duration,components:[test.location.file],evidence:result.attachments.map(a=>a.path??a.name),at:new Date().toISOString()});
  }
  onEnd(){this.history?.close();}
}
