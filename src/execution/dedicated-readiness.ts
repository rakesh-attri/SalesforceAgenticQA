import { createHash } from 'node:crypto';
import { DedicatedExecutionSchema,type DedicatedExecutionServices } from './dedicated-pipeline.js';
import { EnvironmentPolicySchema } from './environment.js';
import { checkedDedicatedSession,reviewDedicatedUi,DedicatedSessionError } from './dedicated-browser.js';
import { schemaFingerprint } from '../knowledge/snapshots.js';
import { proposeDedicatedPlan,dedicatedPlanHash } from '../salesforce/dedicated-qa.js';
type Services=Pick<DedicatedExecutionServices,'data'|'identity'|'policy'|'discover'|'apiOrigin'|'session'>;
export async function checkDedicatedReadiness(raw:unknown,s:Services) {
  const gates:Array<{gate:string;status:'passed'|'blocked';reason?:string}>=[];let gate='exact-reviewed-run';
  try {const input=DedicatedExecutionSchema.parse(raw),policy=EnvironmentPolicySchema.parse(await s.policy()),identity=await s.identity(),ui=reviewDedicatedUi(input.ui,policy,identity);
    if(input.org.orgIdentityHash!==createHash('sha256').update(identity.Id).digest('hex')||input.org.source!=='salesforce-api'||ui.plan.dataPlanHash!==dedicatedPlanHash(input.data.plan)||ui.plan.runId!==input.data.plan.runId||ui.plan.sourceVersion!==input.spec.version)throw Error('binding');
    gates.push({gate,status:'passed'});gate='fresh-api-identity-and-active-dedicated-user';await s.data.check(input.data,'dedicated-ui');gates.push({gate,status:'passed'});
    gate='fresh-schema-and-deterministic-factory';const fresh=await s.discover();if(schemaFingerprint({...fresh,orgAlias:input.org.orgAlias,orgIdentityHash:input.org.orgIdentityHash})!==schemaFingerprint(input.org)||dedicatedPlanHash(proposeDedicatedPlan(input.org,identity,policy,input.data.plan.runId))!==dedicatedPlanHash(input.data.plan))throw Error('schema or factory');gates.push({gate,status:'passed'});
    gate='independently-verified-browser-session';await(s.session??checkedDedicatedSession)(ui.plan.sessionReceipt,policy,identity,s.apiOrigin);gates.push({gate,status:'passed'});
    gate='owned-cleanup-access';await s.data.preflightCleanup(input.data);gates.push({gate,status:'passed'});
    return {status:'ready-for-owned-ui-discovery' as const,gates,recordsCreated:0,runReserved:false,selectorsObserved:false,liveWorkflowPassed:false};
  }catch(error){gates.push({gate,status:'blocked',reason:error instanceof DedicatedSessionError?error.code:'prerequisite-failed'});return {status:'blocked' as const,gates,recordsCreated:0,runReserved:false,selectorsObserved:false,liveWorkflowPassed:false};}
}
