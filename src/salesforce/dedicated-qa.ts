import { createHash } from 'node:crypto';
import { z } from 'zod';
import { History } from '../core/history.js';
import { OrgSnapshotSchema,type OrgSnapshot } from '../core/types.js';
import { snapshotVersion,knowledgeFingerprint } from '../knowledge/snapshots.js';
import { EnvironmentPolicySchema,authorizeEnvironment,environmentHash,type EnvironmentIdentity,type EnvironmentPolicy } from '../execution/environment.js';
import { MutationSchema,mutationHash,ApprovalSchema,type Mutation,type Approval } from './approval.js';
const Id=z.string().regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/),Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const DedicatedPlanSchema=z.object({mode:z.literal('DEDICATED_QA_ORG'),runId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),orgId:Id,userId:Id,policyHash:Hash,sourceVersion:Hash,automationVersion:Hash,marker:z.string().min(1),creates:z.object({Account:z.object({Name:z.string(),Description:z.string()}).strict(),Contact:z.object({LastName:z.string(),Description:z.string(),AccountId:z.literal('{{owned:Account}}')}).strict()}).strict(),cleanup:z.object({approved:z.literal(true),ownedOnly:z.literal(true),maxRecords:z.literal(2),nonFinancial:z.literal(true)}).strict()}).strict();
export type DedicatedPlan=z.infer<typeof DedicatedPlanSchema>;
export const DedicatedRunSchema=z.object({plan:DedicatedPlanSchema,approval:z.object({operator:z.string().trim().min(1),planHash:Hash,expiresAt:z.string().datetime()}).strict()}).strict();
export type DedicatedRun=z.infer<typeof DedicatedRunSchema>;
export function dedicatedPlanHash(plan:DedicatedPlan) {return createHash('sha256').update(JSON.stringify(DedicatedPlanSchema.parse(plan))).digest('hex');}
export function proposeDedicatedPlan(snapshot:OrgSnapshot,identity:EnvironmentIdentity,rawPolicy:unknown,runId:string):DedicatedPlan {
  const policy=EnvironmentPolicySchema.parse(rawPolicy);if(policy.mode!=='DEDICATED_QA_ORG'||!policy.dedicatedQa)throw Error('Explicit dedicated QA policy required');
  if(!['Account','Contact'].every(o=>policy.dedicatedQa!.objects.some(v=>v===o))||policy.dedicatedQa.maxRecordsPerRun!==2||!['create','read-owned','delete-owned'].every(a=>policy.dedicatedQa!.actions.some(v=>v===a)))throw Error('Account/Contact plan requires explicit two-record factory and owned cleanup permissions');
  const org=OrgSnapshotSchema.parse(snapshot),seed=(object:string)=>createHash('sha256').update(`${identity.Id}:${identity.userId}:${runId}:${object}`).digest('hex').slice(0,16),marker=`sfqa:${runId}:${seed('ownership')}`;
  for(const [name,fields] of [['Account',['Name','Description']],['Contact',['LastName','Description','AccountId']]] as const){const object=org.objects.find(o=>o.name===name);if(!object?.createable||fields.some(f=>!object.fields.some(v=>v.name===f&&v.createable)))throw Error('Required dedicated QA fields are not observed/createable');if(object.fields.some(f=>f.createable&&!f.nillable&&!f.defaultedOnCreate&&!fields.includes(f.name as never)))throw Error('Additional business-required fields require a separately reviewed factory');}
  const account=org.objects.find(o=>o.name==='Account')!,contact=org.objects.find(o=>o.name==='Contact')!,parent=contact.fields.find(f=>f.name==='AccountId')!;
  if(account.fields.find(f=>f.name==='Name')!.type!=='string'||contact.fields.find(f=>f.name==='LastName')!.type!=='string'||parent.type!=='reference'||!parent.referenceTo?.includes('Account')||[account,contact].some(o=>!['string','textarea'].includes(o.fields.find(f=>f.name==='Description')!.type)))throw Error('Dedicated field types/Account relationship are not established by Describe');
  return DedicatedPlanSchema.parse({mode:'DEDICATED_QA_ORG',runId,orgId:identity.Id,userId:identity.userId,policyHash:environmentHash(policy),sourceVersion:snapshotVersion(org),automationVersion:knowledgeFingerprint(org),marker,creates:{Account:{Name:`sfqa-${seed('Account')}`,Description:marker},Contact:{LastName:`sfqa-${seed('Contact')}`,Description:marker,AccountId:'{{owned:Account}}'}},cleanup:{approved:true,ownedOnly:true,maxRecords:2,nonFinancial:true}});
}
export interface DedicatedApi {
  origin:string;apiVersion:string;identity():Promise<EnvironmentIdentity>;policy():Promise<unknown>;
  get<T>(path:string):Promise<T>;dispatch(m:Mutation):Promise<{id:string;success:boolean}|undefined>;
}
export class DedicatedCleanupError extends Error {
  constructor(readonly code:'cleanup-schema-unknown'|'cleanup-read-denied'|'cleanup-dependent-present'|'cleanup-visibility-unknown',readonly source:string){super(`${code}: ${source}. No cascade deletion is permitted.`);this.name='DedicatedCleanupError';}
}
export class DedicatedData {
  constructor(private history:History,private api:DedicatedApi) {
    history.db.exec(`CREATE TABLE IF NOT EXISTS dedicated_runs(org TEXT,user TEXT,run TEXT,plan TEXT,hash TEXT,status TEXT,started REAL,PRIMARY KEY(org,user,run));
      CREATE TABLE IF NOT EXISTS dedicated_records(org TEXT,user TEXT,run TEXT,object TEXT,id TEXT,values_json TEXT,status TEXT,PRIMARY KEY(org,user,run,object),UNIQUE(org,id));
      CREATE TABLE IF NOT EXISTS dedicated_mutations(org TEXT,user TEXT,run TEXT,hash TEXT,object TEXT,operation TEXT,id TEXT,status TEXT,PRIMARY KEY(org,user,run,hash));`);
  }
  async check(raw:unknown,capability:'dedicated-data'|'dedicated-ui'|'dedicated-explore'='dedicated-data') {
    const run=DedicatedRunSchema.parse(raw),identity=await this.api.identity(),policy=EnvironmentPolicySchema.parse(await this.api.policy());
    if(policy.mode!=='DEDICATED_QA_ORG')throw Error('Normal Production/sandbox modes cannot use dedicated QA execution');
    authorizeEnvironment(policy,identity,capability,this.api.origin,policy.dedicatedQa?.persona);
    if(run.plan.orgId!==identity.Id||run.plan.userId!==identity.userId||run.plan.policyHash!==environmentHash(policy)||run.approval.operator!==policy.approval.operator||run.approval.planHash!==dedicatedPlanHash(run.plan)||Date.parse(run.approval.expiresAt)<=Date.now())throw Error('Dedicated run requires current exact org/user/plan/operator approval');
    if(policy.dedicatedQa!.automationReview.sourceVersion!==run.plan.automationVersion)throw Error('Dedicated automation/source review is stale');
    const user=z.object({records:z.array(z.object({Id,IsActive:z.boolean()})).length(1)}).parse(await this.api.get(this.query(`SELECT Id,IsActive FROM User WHERE Id='${identity.userId}' LIMIT 1`)));
    if(user.records.length!==1||user.records[0].Id!==identity.userId||!user.records[0].IsActive)throw Error('Dedicated QA test user is not active/verified');
    return {run,identity,policy};
  }
  private query(soql:string){return `/services/data/${this.api.apiVersion}/query?q=${encodeURIComponent(soql)}`;}
  async open(raw:unknown,snapshot:OrgSnapshot) {
    const {run,identity,policy}=await this.check(raw),expected=proposeDedicatedPlan(snapshot,identity,policy,run.plan.runId);
    if(dedicatedPlanHash(expected)!==dedicatedPlanHash(run.plan))throw Error('Dedicated plan differs from reviewed deterministic factory/snapshot');
    // Prove cascade inspection is accessible before creating anything. These are valid, non-existent sentinel IDs.
    await this.preflightCleanup(run);
    const db=this.history.db;db.exec('BEGIN IMMEDIATE');try{const prior=db.prepare('SELECT hash FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(run.plan.orgId,run.plan.userId,run.plan.runId);if(prior)throw Error('Dedicated run ID already reserved; use recovery rather than replay');
      if(db.prepare("SELECT run FROM dedicated_runs WHERE org=? AND status='open'").get(run.plan.orgId))throw Error('A prior dedicated run requires reconciliation/cleanup');
      const start=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'),count=db.prepare('SELECT COUNT(*) AS count FROM dedicated_runs WHERE org=? AND started>=?').get(run.plan.orgId,start);if(Number(count?.count)>=policy.dedicatedQa!.maxRunsPerDay)throw Error('Dedicated daily run quota reached');
      db.prepare('INSERT INTO dedicated_runs VALUES(?,?,?,?,?,?,?)').run(run.plan.orgId,run.plan.userId,run.plan.runId,JSON.stringify(run.plan),dedicatedPlanHash(run.plan),'open',Date.now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    return run;
  }
  private registered(run:DedicatedRun) {const row=this.history.db.prepare('SELECT hash,status FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(run.plan.orgId,run.plan.userId,run.plan.runId);if(!row||row.hash!==dedicatedPlanHash(run.plan)||row.status==='complete')throw Error('Dedicated run is absent, complete or differs from approved plan');}
  owned(run:DedicatedRun) {return this.history.db.prepare("SELECT object,id,status FROM dedicated_records WHERE org=? AND user=? AND run=? AND status<>'deleted' ORDER BY rowid").all(run.plan.orgId,run.plan.userId,run.plan.runId).map(r=>({object:String(r.object),id:String(r.id),status:String(r.status)}));}
  summary(run:DedicatedRun) {const rows=this.history.db.prepare('SELECT status FROM dedicated_records WHERE org=? AND user=? AND run=?').all(run.plan.orgId,run.plan.userId,run.plan.runId),pending=this.history.db.prepare("SELECT hash FROM dedicated_mutations WHERE org=? AND user=? AND run=? AND status='pending'").all(run.plan.orgId,run.plan.userId,run.plan.runId);return {knownCreated:rows.length,deleted:rows.filter(r=>r.status==='deleted').length,active:rows.filter(r=>r.status!=='deleted').length,uncertainEffects:pending.length};}
  private expected(run:DedicatedRun,object:string):Mutation['values'] {
    if(object==='Account')return {...run.plan.creates.Account};
    if(object!=='Contact')throw Error('Only reviewed Account/Contact factories are supported');
    const parent=this.owned(run).find(r=>r.object==='Account'&&r.status==='verified');if(!parent)throw Error('Contact requires a verified Account owned by the same run');
    return {...run.plan.creates.Contact,AccountId:parent.id};
  }
  approval(run:DedicatedRun,m:Mutation):Approval {return {orgId:run.plan.orgId,reviewer:run.approval.operator,expiresAt:run.approval.expiresAt,hash:mutationHash(m),nonFinancialReviewed:true};}
  async verifyOwned(raw:unknown,object:string,id:string) {
    const {run,policy}=await this.check(raw);this.registered(run);Id.parse(id);
    if(!policy.dedicatedQa!.actions.includes('read-owned'))throw Error('Owned-record verification is not approved');
    const row=this.history.db.prepare("SELECT values_json,status FROM dedicated_records WHERE org=? AND user=? AND run=? AND object=? AND id=? AND status<>'deleted'").get(run.plan.orgId,run.plan.userId,run.plan.runId,object,id);
    if(!row)throw Error('Record is outside the framework run ownership boundary');
    const values=JSON.parse(String(row.values_json)) as Mutation['values'],fields=[...new Set(['Id','CreatedById','Description',...Object.keys(values)])],result=await this.api.get<{records:Record<string,unknown>[]}>(this.query(`SELECT ${fields.join(',')} FROM ${object} WHERE Id='${id}' LIMIT 1`));
    const record=result.records[0];if(result.records.length!==1||record.Id!==id||record.CreatedById!==run.plan.userId||record.Description!==run.plan.marker||Object.entries(values).some(([k,v])=>record[k]!==v))throw Error('Owned record identity, creator, marker or payload changed; manual reconciliation required');
    return {id,object,verified:true};
  }
  private async noForeignCascade(run:DedicatedRun,object:string,id:string) {
    const parsed=z.object({name:z.string(),childRelationships:z.array(z.object({childSObject:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),field:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),relationshipName:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).nullable().optional(),cascadeDelete:z.boolean()})).max(1000)}).safeParse(await this.api.get(`/services/data/${this.api.apiVersion}/sobjects/${object}/describe`));if(!parsed.success)throw new DedicatedCleanupError('cleanup-schema-unknown',object);const described=parsed.data;
    if(described.name!==object)throw Error('Cleanup Describe identity mismatch');
    for(const child of described.childRelationships.filter(c=>c.cascadeDelete)){let count:number;try{
      if(child.relationshipName){
        // Virtual child objects such as ActivityHistory require a relationship subquery.
        const result=z.object({records:z.array(z.record(z.string(),z.unknown())).max(1)}).parse(await this.api.get(this.query(`SELECT Id,(SELECT Id FROM ${child.relationshipName} LIMIT 2) FROM ${object} WHERE Id='${id}' LIMIT 1`)));
        if(result.records.length&&result.records[0].Id!==id)throw Error('parent mismatch');
        // REST represents an empty child relationship as explicit null. Missing or
        // malformed fields still fail closed; populated child pages always block.
        const value=result.records[0]?.[child.relationshipName];count=!result.records.length||value===null?0:z.object({records:z.array(z.object({Id})).max(2)}).parse(value).records.length;
      }else {const result=z.object({records:z.array(z.object({Id})).max(2)}).parse(await this.api.get(this.query(`SELECT Id FROM ${child.childSObject} WHERE ${child.field}='${id}' LIMIT 2`)));count=result.records.length;}
    }catch{throw new DedicatedCleanupError('cleanup-read-denied',`${child.childSObject}.${child.field}`);}
      // Delete children explicitly first; even owned cascade effects are never implicitly authorized.
      if(count)throw new DedicatedCleanupError('cleanup-dependent-present',`${child.childSObject}.${child.field}`);}
  }
  private async cleanupVisibility(run:DedicatedRun){
    const observed=await this.api.get<{records:Array<{Profile?:{PermissionsViewAllData?:boolean;PermissionsModifyAllData?:boolean}}> }>(this.query(`SELECT Profile.PermissionsViewAllData,Profile.PermissionsModifyAllData FROM User WHERE Id='${run.plan.userId}' LIMIT 1`));
    if(observed.records.length!==1||!(observed.records[0].Profile?.PermissionsViewAllData===true||observed.records[0].Profile?.PermissionsModifyAllData===true))throw new DedicatedCleanupError('cleanup-visibility-unknown','current-user-record-visibility');
  }
  async preflightCleanup(raw:unknown){const {run}=await this.check(raw);await this.cleanupVisibility(run);await this.noForeignCascade(run,'Account','001000000000000AAA');await this.noForeignCascade(run,'Contact','003000000000000AAA');return {status:'passed' as const,recordsCreated:0,runReserved:false};}
  async inspectOwnedRelationship(raw:unknown,object:string,id:string,relationship:string){
    await this.verifyOwned(raw,object,id);if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(relationship))throw new DedicatedCleanupError('cleanup-schema-unknown',object);
    const described=z.object({childRelationships:z.array(z.object({childSObject:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),field:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),relationshipName:z.string().nullable().optional(),cascadeDelete:z.boolean()}))}).parse(await this.api.get(`/services/data/${this.api.apiVersion}/sobjects/${object}/describe`));
    const child=described.childRelationships.find(c=>c.cascadeDelete&&c.relationshipName===relationship);if(!child)throw new DedicatedCleanupError('cleanup-schema-unknown',object);
    const response=z.object({records:z.array(z.record(z.string(),z.unknown())).max(1)}).parse(await this.api.get(this.query(`SELECT Id,(SELECT Id FROM ${relationship} LIMIT 2) FROM ${object} WHERE Id='${id}' LIMIT 1`))),value=response.records[0]?.[relationship];
    let directChildRows:number|undefined;try{directChildRows=z.object({records:z.array(z.object({Id})).max(2)}).parse(await this.api.get(this.query(`SELECT Id FROM ${child.childSObject} WHERE ${child.field}='${id}' LIMIT 2`))).records.length;}catch{/* Virtual children can be inspected only by their supported parent relationship. */}
    return {parentRows:response.records.length,shape:value===null?'null':value===undefined?'missing':Array.isArray(value)?'array':typeof value,childRows:value&&typeof value==='object'&&'records' in value&&Array.isArray(value.records)?value.records.length:undefined,directChildRows};
  }
  async execute(raw:unknown,input:Mutation,approval:Approval) {
    const {run,policy}=await this.check(raw);this.registered(run);const m=MutationSchema.parse(input),a=ApprovalSchema.parse(approval),qa=policy.dedicatedQa!,db=this.history.db;
    if(m.runId!==run.plan.runId||!qa.objects.some(o=>o===m.object)||a.hash!==mutationHash(m)||a.orgId!==run.plan.orgId||a.reviewer!==run.approval.operator||Date.parse(a.expiresAt)<=Date.now())throw Error('Dedicated mutation scope/exact approval denied');
    const existing=db.prepare('SELECT status,id FROM dedicated_mutations WHERE org=? AND user=? AND run=? AND hash=?').get(run.plan.orgId,run.plan.userId,run.plan.runId,mutationHash(m));
    if(existing){if(existing.status==='verified'){await this.verifyOwned(run,m.object,String(existing.id));return String(existing.id);}if(existing.status==='deleted')return String(existing.id);throw Error('Uncertain dedicated side effect; no automatic replay');}
    if(m.operation==='create'){
      if(!qa.actions.includes('create')||m.id||this.owned(run).length>=qa.maxRecordsPerRun||this.owned(run).some(r=>r.object===m.object))throw Error('Dedicated create action/count/ownership limit denied');
      if(JSON.stringify(Object.fromEntries(Object.entries(m.values).sort()))!==JSON.stringify(Object.fromEntries(Object.entries(this.expected(run,m.object)).sort())))throw Error('Dedicated create payload differs from approved deterministic synthetic factory');
      if(m.object==='Contact'){const parent=this.owned(run).find(r=>r.object==='Account')!;await this.verifyOwned(run,'Account',parent.id);}
    }else {
      if(!qa.actions.includes('delete-owned')||!m.id||Object.keys(m.values).length)throw Error('Exact owned cleanup approval required');
      await this.verifyOwned(run,m.object,m.id);await this.cleanupVisibility(run);await this.noForeignCascade(run,m.object,m.id);
    }
    db.prepare('INSERT INTO dedicated_mutations VALUES(?,?,?,?,?,?,?,?)').run(run.plan.orgId,run.plan.userId,run.plan.runId,mutationHash(m),m.object,m.operation,m.id??null,'pending');
    const result=await this.api.dispatch(m);
    if(m.operation==='create'){
      if(!result?.success||!Id.safeParse(result.id).success||!result.id.startsWith(m.object==='Account'?'001':'003'))throw Error('Dedicated create response uncertain; reconciliation required');
      db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO dedicated_records VALUES(?,?,?,?,?,?,?)').run(run.plan.orgId,run.plan.userId,run.plan.runId,m.object,result.id,JSON.stringify(m.values),'created-unverified');db.prepare('UPDATE dedicated_mutations SET id=? WHERE org=? AND user=? AND run=? AND hash=?').run(result.id,run.plan.orgId,run.plan.userId,run.plan.runId,mutationHash(m));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      await this.verifyOwned(run,m.object,result.id);db.prepare("UPDATE dedicated_records SET status='verified' WHERE org=? AND user=? AND run=? AND object=?").run(run.plan.orgId,run.plan.userId,run.plan.runId,m.object);db.prepare("UPDATE dedicated_mutations SET status='verified' WHERE org=? AND user=? AND run=? AND hash=?").run(run.plan.orgId,run.plan.userId,run.plan.runId,mutationHash(m));return result.id;
    }
    const absent=await this.api.get<{records:unknown[]}>(this.query(`SELECT Id FROM ${m.object} WHERE Id='${m.id}' LIMIT 1`));if(absent.records.length)throw Error('Cleanup absence verification failed; reconcile before retry');this.markDeleted(run,m.object,m.id!);return m.id!;
  }
  private markDeleted(run:DedicatedRun,object:string,id:string) {const db=this.history.db;db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE dedicated_records SET status='deleted' WHERE org=? AND user=? AND run=? AND object=? AND id=?").run(run.plan.orgId,run.plan.userId,run.plan.runId,object,id);db.prepare("UPDATE dedicated_mutations SET status='deleted' WHERE org=? AND user=? AND run=? AND object=? AND operation='delete' AND id=?").run(run.plan.orgId,run.plan.userId,run.plan.runId,object,id);db.prepare("UPDATE dedicated_mutations SET status='cleaned' WHERE org=? AND user=? AND run=? AND object=? AND operation='create' AND id=?").run(run.plan.orgId,run.plan.userId,run.plan.runId,object,id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  async setup(run:DedicatedRun){const created=[];for(const object of ['Account','Contact']){const m:Mutation={runId:run.plan.runId,object,operation:'create',values:this.expected(run,object)},id=await this.execute(run,m,this.approval(run,m));created.push({object,id});}return created;}
  async cleanup(run:DedicatedRun){const deleted=[];for(const record of this.owned(run).reverse()){const m:Mutation={runId:run.plan.runId,object:record.object,id:record.id,operation:'delete',values:{}};await this.execute(run,m,this.approval(run,m));deleted.push(record.id);}return deleted;}
  async recoverCleanup(raw:unknown){const {run}=await this.check(raw);const status=this.history.db.prepare('SELECT hash,status FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(run.plan.orgId,run.plan.userId,run.plan.runId);if(status?.status==='complete'&&status.hash===dedicatedPlanHash(run.plan)&&this.summary(run).active===0)return [];this.registered(run);for(const record of this.owned(run)){const pending=this.history.db.prepare("SELECT hash FROM dedicated_mutations WHERE org=? AND user=? AND run=? AND object=? AND operation='delete' AND id=? AND status='pending'").get(run.plan.orgId,run.plan.userId,run.plan.runId,record.object,record.id);if(pending){const page=await this.api.get<{records:unknown[]}>(this.query(`SELECT Id FROM ${record.object} WHERE Id='${record.id}' LIMIT 1`));if(page.records.length)throw Error('Uncertain delete still present; operator reconciliation required');this.markDeleted(run,record.object,record.id);}}
    return this.cleanup(run);
  }
  async verifyCleanup(raw:unknown){const {run,policy}=await this.check(raw),registered=this.history.db.prepare('SELECT hash FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(run.plan.orgId,run.plan.userId,run.plan.runId);
    if(registered?.hash!==dedicatedPlanHash(run.plan)||!policy.dedicatedQa!.actions.includes('read-owned')||this.summary(run).active||this.summary(run).uncertainEffects)throw Error('Known owned cleanup must be complete and certain before verification');
    const rows=this.history.db.prepare('SELECT object,id,status FROM dedicated_records WHERE org=? AND user=? AND run=?').all(run.plan.orgId,run.plan.userId,run.plan.runId);
    for(const rawRow of rows){const row=z.object({object:z.enum(['Account','Contact']),id:Id,status:z.literal('deleted')}).parse(rawRow),result=z.object({records:z.array(z.unknown()).max(1)}).parse(await this.api.get(this.query(`SELECT Id FROM ${row.object} WHERE Id='${row.id}' LIMIT 1`)));if(result.records.length)throw Error('A known owned record is still present; cleanup verification failed');}
    return {knownRecords:rows.length,absent:rows.length,verifiedAt:new Date().toISOString()};
  }
  async cleanedMetadataReferences(raw:unknown){const {run}=await this.check(raw,'dedicated-ui');await this.verifyCleanup(run);return this.history.db.prepare("SELECT object,id FROM dedicated_records WHERE org=? AND user=? AND run=? AND status='deleted'").all(run.plan.orgId,run.plan.userId,run.plan.runId).map(r=>z.object({object:z.enum(['Account','Contact']),id:Id}).parse(r));}
  finish(run:DedicatedRun){const row=this.history.db.prepare('SELECT hash FROM dedicated_runs WHERE org=? AND user=? AND run=?').get(run.plan.orgId,run.plan.userId,run.plan.runId);if(row?.hash!==dedicatedPlanHash(run.plan))throw Error('Dedicated completion requires an existing exact run');if(this.summary(run).active||this.summary(run).uncertainEffects)throw Error('Cannot complete dedicated run with retained or uncertain records');this.history.db.prepare("UPDATE dedicated_runs SET status='complete' WHERE org=? AND user=? AND run=?").run(run.plan.orgId,run.plan.userId,run.plan.runId);}
}
