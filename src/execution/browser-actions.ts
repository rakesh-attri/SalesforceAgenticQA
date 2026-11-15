import type { History } from '../core/history.js';
import { WorkflowSchema } from '../agents/workflows.js';
import type { EnvironmentIdentity } from './environment.js';
import { authorizeBrowserSession, browserDocument, fingerprint, resolveBrowserRecords, type BrowserReview } from './browser-policy.js';
import { BrowserBudget } from './browser-resources.js';
import { DedicatedPlanSchema, dedicatedPlanHash } from '../salesforce/dedicated-qa.js';

// Initialization never calls this broker. A reviewed workflow step is a separate
// one-use agent permission; pending/uncertain attempts cannot be replayed.
export class BrowserActionBroker {
  constructor(private history: History, private review: BrowserReview, private parent: unknown, private identity: EnvironmentIdentity, private build: { buildHash: string; appHash: string }, private budget: BrowserBudget) {
    history.db.exec('CREATE TABLE IF NOT EXISTS browser_agent_actions(org TEXT,user TEXT,run TEXT,hash TEXT,status TEXT,PRIMARY KEY(org,user,run,hash))');
  }
  async execute(workflowRaw: unknown, step: number, action: () => Promise<unknown>) {
    authorizeBrowserSession(this.review, this.parent, this.identity, this.build, this.budget.now());
    const workflow = WorkflowSchema.parse(workflowRaw), plan = this.review.plan, records = resolveBrowserRecords(plan, this.history);
    let workflowHash=fingerprint(workflow);
    if(plan.ownedDataPlanHash&&!plan.agentWorkflowHashes.includes(workflowHash)){
      const row=this.history.db.prepare('SELECT plan FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(plan.orgId,plan.userId,plan.runId),data=DedicatedPlanSchema.parse(JSON.parse(String(row?.plan)));
      if(dedicatedPlanHash(data)!==plan.ownedDataPlanHash)throw Error('Workflow template requires its exact reviewed factory source');
      // Resolve the same closed placeholders as the lifecycle. This permits
      // review before Salesforce assigns IDs; it changes no assertion outcome.
      let canonical=JSON.stringify(workflow);
      for(const record of records)canonical=canonical.replaceAll(record.id,`{{record:${record.object}}}`);
      for(const [value,placeholder] of [[data.creates.Account.Name,'{{synthetic:Account.Name}}'],[data.creates.Contact.LastName,'{{synthetic:Contact.LastName}}']]){if(!value)throw Error('Reviewed synthetic value cannot be empty');canonical=canonical.replaceAll(JSON.stringify(value).slice(1,-1),placeholder);}
      workflowHash=fingerprint(WorkflowSchema.parse(JSON.parse(canonical)));
    }
    if (!plan.ownedDataPlanHash || !plan.agentWorkflowHashes.includes(workflowHash) || !Number.isInteger(step) || step < 0 || step >= workflow.steps.length || workflow.reviewer !== this.review.approval.operator || !browserDocument(plan, new URL(workflow.path, workflow.origin).href, records) || /delete|pay|purchase|refund|transfer|permission|admin|submit|save/i.test(JSON.stringify(workflow.steps[step].locator))) throw Error('Separate reviewed owned-record agent action required');
    this.budget.action(); const hash = fingerprint([plan.ownedDataPlanHash, workflowHash, step]), key = [plan.orgId, plan.userId, plan.runId, hash];
    this.history.db.prepare("INSERT INTO browser_agent_actions VALUES(?,?,?,?,'pending')").run(...key);
    try { const result = await action(); this.history.db.prepare("UPDATE browser_agent_actions SET status='complete' WHERE org=? AND user=? AND run=? AND hash=?").run(...key); return result; }
    catch { this.history.db.prepare("UPDATE browser_agent_actions SET status='uncertain' WHERE org=? AND user=? AND run=? AND hash=?").run(...key); throw Error('Agent action failed; replay denied pending review'); }
  }
}
