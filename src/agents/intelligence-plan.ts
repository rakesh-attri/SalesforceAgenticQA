import type { Story,OrgSnapshot } from '../core/types.js';
import type { OrgIntelligence } from './org-intelligence.js';
import { createDraftTestPlan } from './planner.js';
import { proposeDataPlan } from './data-agent.js';
export function planFromOrgIntelligence(story:Story,intelligence:OrgIntelligence) {
  const names=intelligence.snapshot.objects.map(o=>o.name),resolved={...story,objects:[...new Set([...story.objects,...names])]};
  const relationshipRequirements=proposeStoryRelationships(story,intelligence.snapshot);
  const plan=createDraftTestPlan(resolved,intelligence.snapshot),data=proposeDataPlan(resolved,intelligence.snapshot,relationshipRequirements);
  for(const scenario of plan.scenarios)scenario.evidence.push(...intelligence.snapshot.coverage!.filter(c=>c.status==='observed').map(c=>c.source));
  plan.warnings.push(...intelligence.unknowns);
  return {mode:'read-only-org-intelligence',storyId:story.id,source:story,resolvedStory:resolved,proposedObjects:intelligence.selection,relationshipRequirements,plan,data,readiness:{executable:false,reasons:['Browser authentication/persona and workflow steps require independent review.','Data proposals do not authorize record creation or prove business-valid factories.',...intelligence.unknowns]}};
}
export function proposeStoryRelationships(story:Story,org:OrgSnapshot) {
  const names=org.objects.map(o=>o.name);
  const text=`${story.title} ${story.description} ${story.acceptanceCriteria.map(a=>a.text).join(' ')}`.toLowerCase();
  return org.objects.flatMap(object=>object.fields.filter(f=>f.createable&&f.type==='reference'&&f.referenceTo?.length===1&&f.referenceTo[0]!==object.name&&names.includes(f.referenceTo[0])&&text.includes(object.name.toLowerCase())&&text.includes(f.referenceTo[0].toLowerCase())&&/associated|related|references|linked/.test(text)).map(field=>({object:object.name,field:field.name,parent:field.referenceTo![0],evidence:[`story:${story.id}`,`describe:${object.name}.${field.name}`]})));
}
