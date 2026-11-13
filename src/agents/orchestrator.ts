import type { Story,OrgSnapshot } from '../core/types.js';
import { createDraftTestPlan } from './planner.js';
import { proposeDataPlan } from './data-agent.js';
// Safe deterministic baseline. Future LangGraph nodes invoke these same typed stages.
export function runOfflineWorkflow(story:Story, org:OrgSnapshot) {
  return { runId:`${story.id}-${Date.now()}`, mode:'offline-fixture', plan:createDraftTestPlan(story,org),data:proposeDataPlan(story,org), next:'review required before any Salesforce interaction' };
}
