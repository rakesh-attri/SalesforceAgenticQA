import { getSalesforceToken } from './jwt.js';
export class SalesforceClient {
  private constructor(private instance:string,private token:string, private version:string) {}
  static async connect() {
    const token=await getSalesforceToken();
    const u=new URL(token.instance_url);
    if (u.protocol!=='https:' || u.username || u.password || u.port || u.pathname!=='/' || u.search || u.hash || (!u.hostname.endsWith('.salesforce.com') && !u.hostname.endsWith('.force.com'))) throw Error('Untrusted OAuth instance URL');
    if(!/^v\d+\.\d+$/.test(process.env.SF_API_VERSION || 'v62.0')) throw Error('Invalid Salesforce API version');
    return new SalesforceClient(u.origin,token.access_token,process.env.SF_API_VERSION || 'v62.0');
  }
  async get<T>(path:string):Promise<T> { return this.request<T>('GET',path); }
  async request<T>(method:'GET'|'POST',path:string,body?:unknown):Promise<T> {
    if(!path.startsWith('/services/data/')) throw Error('Only Salesforce data API paths are supported');
    if(method!=='GET') throw Error('Writes are disabled: verified sandbox identity and reviewed business factories are not implemented');
    const target=new URL(path,this.instance);
    if(target.origin!==this.instance || !target.pathname.startsWith('/services/data/') || path.includes('..') || path.includes('\\')) throw Error('Invalid Salesforce API path');
    const response=await fetch(target,{method, redirect:'error', signal:AbortSignal.timeout(30000), headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:body ? JSON.stringify(body):undefined});
    if(!response.ok) throw Error(`Salesforce API ${method} failed: ${response.status}`);
    return await response.json() as T;
  }
  get apiVersion(){return this.version;}
}
