import type {History} from '../core/history.js';
import {ContractSchema,CompatibilityScopeSchema,type PlatformContract,type CompatibilityScope} from './compatibility-types.js';
import {fingerprint,digest,authorizeBrowserSession,resourceRule,type BrowserReview} from './browser-policy.js';
import {browserNetworkDecision,type BrowserRequestInput} from './browser-network.js';
import type {EnvironmentIdentity} from './environment.js';
import {summarizeBrowserExchange} from './browser-trace.js';
import {verifyLightningEngine} from './lightning-engine.js';

export function contractDefinition(raw:unknown){const {review,...definition}=ContractSchema.parse(raw);return fingerprint(definition);}
export class PlatformContractRegistry{
  constructor(private history:History){history.db.exec('CREATE TABLE IF NOT EXISTS platform_contracts(id TEXT,version INTEGER,hash TEXT,payload TEXT,PRIMARY KEY(id,version)); CREATE TABLE IF NOT EXISTS platform_contract_source_invalidations(scope TEXT,source TEXT,evidence TEXT,PRIMARY KEY(scope,source))');}
  put(raw:unknown){const contract=ContractSchema.parse(raw),hash=fingerprint(contract),previous=this.history.db.prepare('SELECT hash FROM platform_contracts WHERE id=? AND version=?').get(contract.id,contract.version);
    if(previous&&previous.hash!==hash)throw Error('Contract versions are immutable; append a new version');
    if(contract.status==='reviewed'&&(!contract.review||contract.review.operator==='REVIEW_REQUIRED'||contract.review.definitionHash!==contractDefinition(contract)||Date.parse(contract.review.expiresAt)<=Date.now()||contract.effects!=='reviewed-nonmutating'||contract.response==='unknown'||contract.risk==='reject'||!contract.runtimeBindingHash||!contract.sources.some(s=>s.kind==='official-doc'||s.kind==='client-source'||s.kind==='fixture')))throw Error('Reviewed contract needs named exact source/effect/response/runtime review');
    if(contract.dependencies.includes(contract.id))throw Error('Contract cannot depend on itself');
    this.history.db.prepare('INSERT OR IGNORE INTO platform_contracts VALUES(?,?,?,?)').run(contract.id,contract.version,hash,JSON.stringify(contract));return{hash,executionPermissionsGranted:0};
  }
  list(rawScope:CompatibilityScope){const scope=CompatibilityScopeSchema.parse(rawScope),rows=this.history.db.prepare('SELECT payload,hash FROM platform_contracts ORDER BY id,version').all();const latest=new Map<string,PlatformContract>();for(const row of rows){const contract=ContractSchema.parse(JSON.parse(String(row.payload)));if(fingerprint(contract)!==row.hash)throw Error('Contract journal integrity failed');latest.set(contract.id,contract);}return[...latest.values()].filter(c=>fingerprint(c.scope)===fingerprint(scope));}
  invalidateSource(scope:CompatibilityScope,source:string,evidence:string){if(!/^[a-f0-9]{64}$/.test(evidence)||!this.list(scope).some(c=>c.sources.some(s=>s.hash===source)))throw Error('Scoped known source and evidence hash required');this.history.db.prepare('INSERT OR REPLACE INTO platform_contract_source_invalidations VALUES(?,?,?)').run(fingerprint(scope),source,evidence);return{requiresReReview:true,permissionsGranted:0};}
  usable(scope:CompatibilityScope){const all=this.list(scope),byId=new Map(all.map(c=>[c.id,c])),invalid=new Set(this.history.db.prepare('SELECT source FROM platform_contract_source_invalidations WHERE scope=?').all(fingerprint(scope)).map(r=>String(r.source)));const visit=(c:PlatformContract,path:Set<string>):boolean=>{if(path.has(c.id)||c.sources.some(s=>invalid.has(s.hash))||c.status!=='reviewed'||!c.review||c.review.definitionHash!==contractDefinition(c)||Date.parse(c.review.expiresAt)<=Date.now())return false;return c.dependencies.every(id=>{const d=byId.get(id);return!!d&&visit(d,new Set([...path,c.id]));});};return all.filter(c=>visit(c,new Set()));}
  // Registry review never replaces the existing exact environment/browser gate.
  evaluate(id:string,scope:CompatibilityScope,input:{review:BrowserReview;parent:unknown;identity:EnvironmentIdentity;request:BrowserRequestInput}){
    const {review}=authorizeBrowserSession(input.review,input.parent,input.identity,input.review.plan),contract=this.usable(scope).find(c=>c.id===id);
    verifyLightningEngine(review.plan.engineProfileHash);
    if(!contract||scope.org!==digest(review.plan.orgId)||scope.user!==digest(review.plan.userId)||scope.permission!==digest(review.plan.persona)||scope.build!==review.plan.buildHash||scope.app!==review.plan.appHash||scope.engine!==review.plan.engineProfileHash||fingerprint(scope.records)!==fingerprint(review.plan.records.map(r=>digest(r.id)).sort()))throw Error('Contract scope/review incompatible');
    if(input.request.method!==contract.method||summarizeBrowserExchange(input.request,0).requestShapeHash!==contract.requestShapeHash)return{allow:false,reason:'contract-request-shape-mismatch'};
    const definition=resourceRule(review.plan,input.request)??review.plan.contracts.find(c=>digest(c.descriptor)===contract.operationHash);
    if(!definition||fingerprint(definition)!==contract.runtimeBindingHash)return{allow:false,reason:'runtime-binding-not-in-approved-policy'};
    const decision=resourceRule(review.plan,input.request)?{allow:true,reason:'existing-reviewed-resource'}:browserNetworkDecision(review.plan,review.plan.records,input.request,{policy:input.parent as never,identity:input.identity});return{allow:decision.allow,reason:decision.reason,registryAddsAuthority:false};
  }
}
