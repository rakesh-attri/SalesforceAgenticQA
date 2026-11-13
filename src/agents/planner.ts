import type { Story,OrgSnapshot,TestPlan } from '../core/types.js';
export function createDraftTestPlan(story:Story,org:OrgSnapshot): TestPlan {
  const known=new Set(org.objects.map(o=>o.name));
  const missing=story.objects.filter(o=>!known.has(o));
  const warnings=missing.map(o=>`Object ${o} not discovered. Do not generate field-dependent actions.`);
  const scenarios=story.acceptanceCriteria.map(ac=>({id:`${story.id}-${ac.id}`,title:`Validate ${ac.id}: ${ac.text}`, expected:ac.text, evidence:[`story:${story.id}:${ac.id}`]}));
  warnings.push('Draft only. No UI steps or expected results beyond acceptance criteria have been inferred.');
  return {storyId:story.id,status:'draft',scenarios,warnings};
}
