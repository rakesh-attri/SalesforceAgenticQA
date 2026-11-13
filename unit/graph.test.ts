import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlanningGraph } from '../src/agents/graph.js';
import { OrgSnapshotSchema, StorySchema } from '../src/core/types.js';
import { loadJson } from '../src/core/io.js';
test('LangGraph preserves criterion evidence and checkpoints a non-executable review result',async()=>{
  const graph=createPlanningGraph(),config={configurable:{thread_id:'unit-fixture'}};
  const story=StorySchema.parse(await loadJson('stories/invoice-payment.json'));
  const org=OrgSnapshotSchema.parse(await loadJson('fixtures/org-sample.json'));
  const result=await graph.invoke({story,org},config);
  assert.equal(result.status,'review-required');
  assert.equal(result.data.approved,false);
  assert.deepEqual(result.plan.scenarios.map(s=>s.expected),story.acceptanceCriteria.map(ac=>ac.text));
  assert.equal((await graph.getState(config)).values.status,'review-required');
  assert.equal(result.decisions.length,3);
});
