import type { Story,OrgSnapshot,DataPlan,DataStep } from '../core/types.js';
// Construct a conservative proposal, not a blind execution plan.
export function proposeDataPlan(story:Story,org:OrgSnapshot,relationships:Array<{object:string;field:string;parent:string;evidence:string[]}>=[]):DataPlan {
  const seen=new Set<string>(),steps:DataStep[]=[],warnings:string[]=[];
  for(const objectName of story.objects){
    const obj=org.objects.find(o=>o.name===objectName);
    if(!obj){warnings.push(`${objectName}: no metadata found; creation blocked`);continue;}
    const required=obj.fields.filter(f=>f.createable && !f.nillable && !f.defaultedOnCreate);
    const references=required.filter(f=>f.type==='reference');
    const ambiguous=references.filter(f=>(f.referenceTo?.length??0)!==1);
    const requested=relationships.filter(r=>r.object===objectName);
    const invalid=requested.some(r=>!r.evidence.length||!obj.fields.some(f=>f.name===r.field&&f.createable&&f.type==='reference'&&f.referenceTo?.includes(r.parent)));
    const deps=[...new Set([...references.filter(f=>f.referenceTo?.length===1).flatMap(f=>f.referenceTo??[]),...requested.map(r=>r.parent)])];
    const unknown=deps.filter(d=>!story.objects.includes(d));
    if(seen.has(objectName)) continue;
    const blocked=!obj.createable || unknown.length>0 || ambiguous.length>0||invalid;
    steps.push({object:objectName,operation:'create',requiredFields:required.map(f=>f.name),dependsOn:deps,mode:'api',status:blocked?'blocked':'proposed',reason:!obj.createable?'Object not creatable':invalid?'Unverified business relationship field/target':ambiguous.length?`Unresolved reference target: ${ambiguous.map(f=>f.name).join(', ')}`:unknown.length?`Unresolved parents: ${unknown.join(', ')}`:undefined});
    seen.add(objectName);
  }
  // Check that required reference parents can be topologically ordered; do not execute cyclic graphs.
  const pending=new Map(steps.map(s=>[s.object,s]));const sorted:DataStep[]=[];
  while(pending.size){
    const ready=[...pending.values()].filter(s=>s.dependsOn.every(d=>!pending.has(d)));
    if(!ready.length){warnings.push('Dependency cycle: requires approved business-service or UI workflow');for(const s of pending.values()){s.status='blocked';sorted.push(s);}break;}
    for(const s of ready){
      const blockedParents=s.dependsOn.filter(d=>!sorted.some(parent=>parent.object===d && parent.status==='proposed'));
      if(blockedParents.length){s.status='blocked';s.reason=`Unavailable parents: ${blockedParents.join(', ')}`;}
      sorted.push(s);pending.delete(s.object);
    }
  }
  warnings.push('Metadata is insufficient to prove business-valid test data. Validate flows, triggers, record types, validation rules and factory recipes.');
  warnings.push('Proposal only: API writes are never executed from this command.');
  return {storyId:story.id,steps:sorted,warnings,approved:false};
}
