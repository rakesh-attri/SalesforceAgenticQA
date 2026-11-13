import 'dotenv/config';
import { StorySchema, OrgSnapshotSchema } from './core/types.js';
import { loadJson,saveJson } from './core/io.js';
import { discoverLiveOrg } from './agents/org-discovery.js';
import { runOfflineWorkflow } from './agents/orchestrator.js';
import { createDraftTestPlan } from './agents/planner.js';
import { proposeDataPlan } from './agents/data-agent.js';
import { SnapshotStore } from './knowledge/snapshots.js';
import { createPlanningGraph } from './agents/graph.js';
const [command,...args]=process.argv.slice(2);
const snapshotPath='.state/org-snapshot.json';
async function loadStory(path:string){return StorySchema.parse(await loadJson(path));}
async function getSnapshot(){try{return OrgSnapshotSchema.parse(await loadJson(snapshotPath));}catch{throw Error('No saved snapshot. First run: npm run discover:fixture');}}
async function main(){
  if(command==='graph-demo') {
    const story=await loadStory('stories/invoice-payment.json'),org=OrgSnapshotSchema.parse(await loadJson('fixtures/org-sample.json'));
    const result=await createPlanningGraph().invoke({story,org},{configurable:{thread_id:`fixture-${Date.now()}`}});
    await saveJson('artifacts/graph-demo.json',result);console.log(JSON.stringify(result,null,2));return;
  }
  if(command==='discover'){
    const live=args.includes('--live');let snap;
    if(live){const names=(process.env.SFQA_OBJECTS||'Account,Contact').split(',').map(s=>s.trim());snap=await discoverLiveOrg(names);}
    else {const p=args[args.indexOf('--fixture')+1]; if(!p)throw Error('Expected --fixture PATH');snap=OrgSnapshotSchema.parse(await loadJson(p));}
    const version=await new SnapshotStore().save(snap);
    await saveJson(snapshotPath,snap);console.log(`Discovered ${snap.objects.length} objects; version ${version}; snapshot saved to ${snapshotPath}`);return;
  }
  if(command==='demo'){const story=await loadStory('stories/invoice-payment.json');const org=OrgSnapshotSchema.parse(await loadJson('fixtures/org-sample.json'));const output=runOfflineWorkflow(story,org);await saveJson('artifacts/offline-demo.json',output);console.log(JSON.stringify(output,null,2));return;}
  if(command==='plan'||command==='data-plan'){
    const story=await loadStory(args[0]||'');const org=await getSnapshot();
    const result=command==='plan'?createDraftTestPlan(story,org):proposeDataPlan(story,org);
    const path=`artifacts/${story.id}/${command}.json`;await saveJson(path,result);console.log(JSON.stringify(result,null,2));console.log(`Saved: ${path}`);return;
  }
  console.log('Usage: npm run demo | npm run discover:fixture | npm run discover:live | npm run plan | npm run data:plan');
}
main().catch(err=>{console.error(err instanceof Error?err.message:String(err));process.exitCode=1;});
