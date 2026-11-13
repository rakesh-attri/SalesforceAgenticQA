import { Annotation, StateGraph, START, END, MemorySaver, interrupt } from '@langchain/langgraph';
import { StorySchema, OrgSnapshotSchema, TestPlanSchema, DataPlanSchema, type Story, type OrgSnapshot, type TestPlan, type DataPlan } from '../core/types.js';
import { createDraftTestPlan } from './planner.js';
import { proposeDataPlan } from './data-agent.js';

const State=Annotation.Root({
  story:Annotation<Story>(),org:Annotation<OrgSnapshot>(),
  plan:Annotation<TestPlan>(),data:Annotation<DataPlan>(),
  decisions:Annotation<string[]>({reducer:(a,b)=>a.concat(b),default:()=>[]}),
  status:Annotation<'review-required'>(),
});
// This graph only drafts proposals. It has no browser or Salesforce write tools.
// MemorySaver supports same-process checkpoint inspection; it is not durable storage.
export function createPlanningGraph(checkpointer=new MemorySaver(),requireReview=false) {
  return new StateGraph(State)
    .addNode('validate',state=>({story:StorySchema.parse(state.story),org:OrgSnapshotSchema.parse(state.org)}))
    .addNode('draft_plan',state=>({plan:TestPlanSchema.parse(createDraftTestPlan(state.story,state.org)),decisions:[`story:${state.story.id}: acceptance criteria retained without inferred outcomes`]}))
    .addNode('propose_data',state=>({data:DataPlanSchema.parse(proposeDataPlan(state.story,state.org)),decisions:[`org:${state.org.orgAlias}:${state.org.observedAt}: schema-only dependency proposal`]}))
    .addNode('review',()=>{
      if(requireReview) {const review=interrupt({kind:'plan-review',message:'Review proposals; this approval does not permit Salesforce writes.'});if(review?.approved!==true || typeof review?.reviewer!=='string' || !review.reviewer.trim()) throw Error('Named human approval required');}
      return {status:'review-required' as const,decisions:['Execution unavailable: no reviewed business workflow or factory approval']};
    })
    .addEdge(START,'validate').addEdge('validate','draft_plan').addEdge('draft_plan','propose_data').addEdge('propose_data','review').addEdge('review',END)
    .compile({checkpointer});
}
