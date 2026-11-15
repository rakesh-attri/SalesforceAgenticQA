import { getSalesforceToken } from './jwt.js';
import { authorize, type Mutation, type Approval } from './approval.js';
import { metadataRequest,parseMetadata } from './metadata.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { authorizeEnvironment,type EnvironmentPolicy,type EnvironmentDefinition } from '../execution/environment.js';
import { DedicatedData } from './dedicated-qa.js';
import type { History } from '../core/history.js';
import { uiBridgeFailure,UiBridgeError } from './ui-bridge.js';
import { authorizeDedicatedDiagnostics } from '../execution/diagnostic-review.js';
import { projectSelectedApp } from '../execution/lightning-initialization.js';
import { authorizeBrowserSession, BrowserReviewSchema, resolveBrowserRecords, digest } from '../execution/browser-policy.js';
import { sameSalesforceIdentity } from '../execution/lightning-identity.js';
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
  static async connectReviewedBrowser(parent:unknown,raw:unknown,history?:History) {
    const review=BrowserReviewSchema.parse(raw),client=await this.authenticate(),initial=await client.identity(),build={buildHash:review.plan.buildHash,appHash:review.plan.appHash},authority=authorizeBrowserSession(review,parent,initial,build);
    client.environment={policy:authority.policy,identity:initial};
    return {apiOrigin:client.instance,policy:authority.policy,
      async identity(){const identity=await client.identity();authorizeBrowserSession(review,parent,identity,build);return identity;},
      async preflight(){
        const identity=await client.identity();authorizeBrowserSession(review,parent,identity,build);
        let actor:unknown,selected:unknown;try{actor=await client.get(`/services/data/${client.version}/query?q=${encodeURIComponent(`SELECT Id,IsActive FROM User WHERE Id='${identity.userId}' LIMIT 1`)}`);selected=await client.get(`/services/data/${client.version}/ui-api/apps/selected?formFactor=Large`);}catch{throw Error('Browser actor/app preflight unavailable; provider details withheld');}
        const active=z.object({records:z.array(z.object({Id:z.string(),IsActive:z.literal(true)})).length(1)}).safeParse(actor);
        if(!active.success||active.data.records[0].Id!==identity.userId||projectSelectedApp(selected).appIdHash!==review.plan.selectedAppIdHash)throw Error('Browser actor/app preflight changed');return identity;
      },
      async verifyReferences(){
        const identity=await client.identity();authorizeBrowserSession(review,parent,identity,build);
        const active=z.object({records:z.array(z.object({Id:z.string(),IsActive:z.boolean()})).length(1)}).safeParse(await client.get(`/services/data/${client.version}/query?q=${encodeURIComponent(`SELECT Id,IsActive FROM User WHERE Id='${identity.userId}' LIMIT 1`)}`));
        if(!active.success||!active.data.records[0].IsActive||active.data.records[0].Id!==identity.userId)throw Error('Reviewed browser requires the active exact QA user');
        const references=resolveBrowserRecords(review.plan,history),privateDisplays:Array<{object:'Account'|'Contact';id:string;display:string}>=[],referenceVersions:string[]=[];
        for(const reference of references){authorizeBrowserSession(review,parent,identity,build);const field=reference.object==='Account'?'Name':'LastName';
          let rawRecord:unknown;try{rawRecord=await client.readRequest(`/services/data/${client.version}/query?q=${encodeURIComponent(`SELECT Id,${field},LastModifiedDate FROM ${reference.object} WHERE Id='${reference.id}' LIMIT 1`)}`,undefined,true);}catch{throw Error('Approved browser reference read unavailable; provider details withheld');}
          const record=z.object({records:z.array(z.object({Id:z.string(),Name:z.string().optional(),LastName:z.string().optional(),LastModifiedDate:z.string().min(1)})).length(1)}).safeParse(rawRecord);
          if(!record.success||!sameSalesforceIdentity(record.data.records[0].Id,reference.id)||!record.data.records[0][field])throw Error('Approved browser reference is missing or unreadable');
          privateDisplays.push({object:reference.object,id:reference.id,display:record.data.records[0][field]!});
          referenceVersions.push(digest(JSON.stringify([reference.id,record.data.records[0][field],record.data.records[0].LastModifiedDate])));
        }
        let selected:unknown;try{selected=await client.get(`/services/data/${client.version}/ui-api/apps/selected?formFactor=Large`);}catch{throw Error('Approved app metadata unavailable; provider details withheld');}
        if(projectSelectedApp(selected).appIdHash!==review.plan.selectedAppIdHash)throw Error('Reviewed browser app context changed');
        return {references,privateDisplays,proof:{verifiedAt:new Date().toISOString(),orgHash:digest(identity.Id),userHash:digest(identity.userId),referenceHashes:references.map(record=>digest(record.id)),referenceVersions,recordWrites:0}};
      }
    };
  }
  static async connectDedicatedDiagnostics(parent:unknown,review:unknown) {
    const client=await this.authenticate(),initial=await client.identity(),authority=authorizeDedicatedDiagnostics(review,parent,initial,client.instance);
    client.environment={policy:authority.policy,identity:initial};
    // No client, arbitrary GET, mutation, bridge or metadata SOAP operation is
    // exposed. Absence queries are constructed only from the signed references.
    return {apiOrigin:client.instance,apiVersion:client.version,policy:authority.policy,
      async identity(){const identity=await client.identity();authorizeDedicatedDiagnostics(review,parent,identity,client.instance);return identity;},
      async verifyAbsence(){const identity=await client.identity(),current=authorizeDedicatedDiagnostics(review,parent,identity,client.instance);
        const user=z.object({records:z.array(z.object({Id:z.string(),IsActive:z.boolean()})).length(1)}).parse(await client.get(`/services/data/${client.version}/query?q=${encodeURIComponent(`SELECT Id,IsActive FROM User WHERE Id='${identity.userId}' LIMIT 1`)}`));
        if(user.records[0].Id!==identity.userId||!user.records[0].IsActive)throw Error('Dedicated diagnostic user is not active');
        for(const reference of current.review.plan.references){authorizeDedicatedDiagnostics(review,parent,identity,client.instance);const result=z.object({records:z.array(z.unknown()).max(1)}).parse(await client.readRequest(`/services/data/${client.version}/query?q=${encodeURIComponent(`SELECT Id FROM ${reference.object} WHERE Id='${reference.id}' LIMIT 1`)}`,undefined,true));if(result.records.length)throw Error('A diagnostic reference is present; metadata-only observation denied');}
        return {absent:current.review.plan.references.length,verifiedAt:new Date().toISOString()};},
      async selectedAppMetadata(){
        if(!authority.review.plan.initialization?.selectedAppMetadata)throw Error('Selected-app metadata requires separate exact initialization scope');
        const identity=await client.identity();if(!authorizeDedicatedDiagnostics(review,parent,identity,client.instance).review.plan.initialization?.selectedAppMetadata)throw Error('Selected-app initialization scope was removed');
        const user=z.object({records:z.array(z.object({Id:z.string(),IsActive:z.boolean()})).length(1)}).safeParse(await client.get(`/services/data/${client.version}/query?q=${encodeURIComponent(`SELECT Id,IsActive FROM User WHERE Id='${identity.userId}' LIMIT 1`)}`));
        if(!user.success||user.data.records[0].Id!==identity.userId||!user.data.records[0].IsActive)throw Error('Dedicated initialization user is not active');
        // Salesforce's documented GET is not the PATCH that changes selection.
        // Its projection never contains labels, descriptions, tabs or raw IDs.
        if(!authorizeDedicatedDiagnostics(review,parent,identity,client.instance).review.plan.initialization?.selectedAppMetadata)throw Error('Selected-app initialization scope was removed');
        let result:unknown;try{result=await client.get(`/services/data/${client.version}/ui-api/apps/selected?formFactor=Large`);}catch(error){if(error instanceof Error&&/^Salesforce API GET failed: \d{3}$/.test(error.message))throw Error(error.message);throw Error('Selected-app metadata unavailable; provider details withheld');}
        if(!authorizeDedicatedDiagnostics(review,parent,identity,client.instance).review.plan.initialization?.selectedAppMetadata)throw Error('Selected-app initialization scope was removed');return projectSelectedApp(result);
      }
    };
  }
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
