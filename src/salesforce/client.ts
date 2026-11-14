import { getSalesforceToken } from './jwt.js';
import { authorize, type Mutation, type Approval } from './approval.js';
import { metadataRequest,parseMetadata } from './metadata.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { authorizeEnvironment,type EnvironmentPolicy,type EnvironmentDefinition } from '../execution/environment.js';
import { DedicatedData } from './dedicated-qa.js';
import type { History } from '../core/history.js';
import { uiBridgeFailure,UiBridgeError } from './ui-bridge.js';
export class SalesforceClient {
  private environment?:{policy:EnvironmentPolicy;identity:{Id:string;IsSandbox:boolean;userId:string};policyPath?:string};
  private constructor(private instance:string,private token:string, private version:string) {}
  private static async authenticate() {
    const token=await getSalesforceToken();
    const u=new URL(token.instance_url);
    if (u.protocol!=='https:' || u.username || u.password || u.port || u.pathname!=='/' || u.search || u.hash || (!u.hostname.endsWith('.salesforce.com') && !u.hostname.endsWith('.force.com'))) throw Error('Untrusted OAuth instance URL');
    if(!/^v\d+\.\d+$/.test(process.env.SF_API_VERSION || 'v62.0')) throw Error('Invalid Salesforce API version');
    return new SalesforceClient(u.origin,token.access_token,process.env.SF_API_VERSION || 'v62.0');
  }
  static async reviewIdentity() {const client=await this.authenticate();return {identity:await client.identity(),origin:client.instance};}
  static async connect(policyPath?:string) {
    const client=await this.authenticate(),identity=await client.identity();
    if(!identity.IsSandbox||process.env.SFQA_ENVIRONMENT_POLICY||policyPath) {
      let policy:EnvironmentPolicy;
      const path=policyPath||process.env.SFQA_ENVIRONMENT_POLICY||'.state/environment-policy.json';
      try {policy=JSON.parse(await readFile(path,'utf8'));}
      catch {throw Error('Named environment approval required. Prepare and review an exact org/persona/origin policy before production reads.');}
      authorizeEnvironment(policy,identity,'metadata',client.instance);
      client.environment={policy,identity,policyPath:path};
    }
    return client;
  }
  private approveRead(capability:'metadata'|'soql') {if(this.environment)authorizeEnvironment(this.environment.policy,this.environment.identity,capability,this.instance);}
  async authorizeCapability(capability:EnvironmentDefinition['capabilities'][number],origin=this.instance) {
    const identity=await this.identity();
    if(this.environment)authorizeEnvironment(this.environment.policy,identity,capability,origin);
    else if(!identity.IsSandbox)throw Error('Production capability requires an explicit environment policy');
    return identity;
  }
  async get<T>(path:string):Promise<T> { return this.request<T>('GET',path); }
  async request<T>(method:'GET'|'POST',path:string,body?:unknown):Promise<T> {
    if(!path.startsWith('/services/data/')) throw Error('Only Salesforce data API paths are supported');
    if(method!=='GET') throw Error('Writes are disabled: verified sandbox identity and reviewed business factories are not implemented');
    return this.readRequest(path,body);
  }
  private async readRequest<T>(path:string,body?:unknown,ownedVerification=false):Promise<T> {
    this.approveRead(path.includes('/query')?'soql':'metadata');
    const target=new URL(path,this.instance);
    if(target.origin!==this.instance || !target.pathname.startsWith('/services/data/') || path.includes('..') || path.includes('\\')) throw Error('Invalid Salesforce API path');
    if(this.environment?.policy.mode==='DEDICATED_QA_ORG'&&!ownedVerification){
      const decoded=decodeURIComponent(path),table=/\bFROM\s+([A-Za-z][A-Za-z0-9_]*)/i.exec(decoded)?.[1],metadataTables=['Organization','User','RecordType','ValidationRule','MetadataComponentDependency','ObjectPermissions','FieldPermissions','ApexClass','ApexTrigger','FlowDefinition','Flow','LightningComponentBundle','PermissionSetAssignment','PermissionSet','PermissionSetGroup','PermissionSetGroupComponent','MutingPermissionSet'];
      if((path.includes('/query')&&(!table||!metadataTables.includes(table)))||/\/sobjects\/[A-Za-z0-9_]+\/[A-Za-z0-9]{15,18}(?:$|\?)/.test(path)||/\/ui-api\/records\//.test(path))throw Error('Dedicated business-record reads require the run-owned verification service');
      if(table==='User'&&!decoded.includes(`Id='${this.environment.identity.userId}'`))throw Error('Dedicated user metadata must be scoped to the approved test user');
    }
    const response=await fetch(target,{method:'GET', redirect:'error', signal:AbortSignal.timeout(30000), headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:body ? JSON.stringify(body):undefined});
    if(!response.ok) throw Error(`Salesforce API GET failed: ${response.status}`);
    return await response.json() as T;
  }
  get apiVersion(){return this.version;}
  get apiOrigin(){return this.instance;}
  async dedicatedBrowserBridge() {
    if(this.environment?.policy.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated browser bridge requires explicit dedicated QA authorization');
    await this.authorizeCapability('dedicated-ui');
    let response:Response;
    try {response=await fetch(`${this.instance}/services/oauth2/singleaccess?redirect_uri=${encodeURIComponent('lightning/page/home')}`,{method:'GET',headers:{Authorization:`Bearer ${this.token}`},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new UiBridgeError('Transport_Error',0);}
    if(!response.ok)throw await uiBridgeFailure(response);
    let raw:unknown;try{raw=await response.json();}catch{throw Error('Dedicated browser bridge response invalid; details withheld');}
    const parsed=z.object({frontdoor_uri:z.string().url()}).safeParse(raw);if(!parsed.success)throw Error('Dedicated browser bridge response invalid; details withheld');
    const target=new URL(parsed.data.frontdoor_uri);if(target.protocol!=='https:'||!this.environment.policy.allowedOrigins.includes(target.origin)||target.pathname!=='/secur/frontdoor.jsp'||target.username||target.password||!target.searchParams.has('otp')||target.searchParams.has('sid')||target.searchParams.has('access_token'))throw Error('Dedicated browser bridge origin/one-time URL denied');
    return parsed.data.frontdoor_uri; // Credential-bearing one-time URL: consume in memory only, never report or trace.
  }
  dedicatedData(history:History) {
    if(this.environment?.policy.mode!=='DEDICATED_QA_ORG')throw Error('Dedicated transport requires an explicitly connected dedicated QA policy');
    const environment=this.environment;
    return new DedicatedData(history,{origin:this.instance,apiVersion:this.version,identity:()=>this.identity(),get:<T>(path:string)=>this.readRequest<T>(path,undefined,true),policy:async()=>environment.policyPath?JSON.parse(await readFile(environment.policyPath,'utf8')):environment.policy,dispatch:async m=>{
      // There is no public generic write transport. DedicatedData authorizes/journals each exact operation first.
      if(!['Account','Contact'].includes(m.object))throw Error('Dedicated object denied');
      const target=`${this.instance}/services/data/${this.version}/sobjects/${m.object}${m.operation==='delete'?'/'+m.id:''}`;
      const response=await fetch(target,{method:m.operation==='create'?'POST':'DELETE',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:m.operation==='create'?JSON.stringify(m.values):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Dedicated mutation failed (${response.status}); reconcile local ownership journal before retry`);
      return m.operation==='create'?await response.json() as {id:string;success:boolean}:undefined;
    }});
  }
  async identity() {
    const response=await fetch(`${this.instance}/services/oauth2/userinfo`,{headers:{Authorization:`Bearer ${this.token}`},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`OAuth identity unavailable (${response.status})`);
    const user=z.object({organization_id:z.string(),user_id:z.string()}).parse(await response.json());
    const org=z.object({records:z.array(z.object({Id:z.string(),IsSandbox:z.boolean()})).length(1)}).parse(await this.get(`/services/data/${this.version}/query?q=${encodeURIComponent('SELECT Id,IsSandbox FROM Organization LIMIT 1')}`));
    if(org.records[0].Id!==user.organization_id)throw Error('OAuth organization identity mismatch');
    return {...org.records[0],userId:user.user_id};
  }
  async readMetadata(type:string,names:string[]) {
    this.approveRead('metadata');
    const body=metadataRequest(type,names,this.token);
    const response=await fetch(`${this.instance}/services/Soap/m/${this.version.slice(1)}`,{method:'POST',body,headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'readMetadata'},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error(`Read-only Metadata API failed (${response.status})`);
    return {type,names,source:`metadata:readMetadata:${this.version}`,observedAt:new Date().toISOString(),metadata:parseMetadata(await response.text())};
  }
  async mutate(input:Mutation,approval:Approval) {
    if(this.environment)authorizeEnvironment(this.environment.policy,this.environment.identity,'sandbox-data',this.instance);
    const identity=await this.get<{records:Array<{Id:string;IsSandbox:boolean}>}>(`/services/data/${this.version}/query?q=${encodeURIComponent('SELECT Id,IsSandbox FROM Organization LIMIT 1')}`);
    if(identity.records.length!==1) throw Error('Organization identity unavailable');
    const m=authorize(input,approval,identity.records[0],(process.env.SFQA_WRITE_OBJECTS||'').split(',').filter(Boolean));
    const path=`${this.instance}/services/data/${this.version}/sobjects/${m.object}${m.operation==='delete'?'/'+m.id:''}`;
    const response=await fetch(path,{method:m.operation==='create'?'POST':'DELETE',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:m.operation==='create'?JSON.stringify(m.values):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error(`Approved mutation failed (${response.status})`);
    return m.operation==='create'?await response.json() as {id:string;success:boolean}:undefined;
  }
}
