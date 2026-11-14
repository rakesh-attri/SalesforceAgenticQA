import { request,type APIRequestContext } from '@playwright/test';
import { authorizeStaticReview,matchesStaticReview } from './dedicated-static.js';
import type { EnvironmentIdentity,EnvironmentPolicy } from './environment.js';
export type StaticRequest={url:string;type:string;method:string};
export type StaticResponse={status:number;headers:Record<string,string>;body:Buffer};
export type StaticContextFactory=(options:NonNullable<Parameters<typeof request.newContext>[0]>)=>Promise<Pick<APIRequestContext,'get'|'dispose'>>;
export class StaticTransportError extends Error {
  constructor(readonly code:'static-http'|'static-redirect'|'static-content'|'static-size'|'static-transport'|'static-review-expired'){super(`Reviewed static resource denied: ${code}; provider and request details withheld`);this.name='StaticTransportError';}
}
// Never use browserContext.request: it shares the browser cookie jar. Each exact
// public CDN GET has a new empty jar, no caller headers and no redirect/retry.
export async function fetchReviewedStatic(raw:unknown,policy:EnvironmentPolicy,identity:EnvironmentIdentity,specVersion:string,input:StaticRequest,createContext:StaticContextFactory=options=>request.newContext(options)) : Promise<StaticResponse> {
  const review=authorizeStaticReview(raw,policy,identity,specVersion);
  if(!matchesStaticReview(review,input)||policy.allowedOrigins.includes(new URL(input.url).origin))throw new StaticTransportError('static-content');
  let context:Awaited<ReturnType<StaticContextFactory>>|undefined;
  try {context=await createContext({storageState:{cookies:[],origins:[]},ignoreHTTPSErrors:false});
    if(Math.min(Date.parse(review.approval.expiresAt),Date.parse(policy.approval.expiresAt))<=Date.now())throw new StaticTransportError('static-review-expired');
    const response=await context.get(input.url,{maxRedirects:0,maxRetries:0,timeout:Math.max(1,Math.min(10000,Date.parse(review.approval.expiresAt)-Date.now(),Date.parse(policy.approval.expiresAt)-Date.now()))});
    const status=response.status();if(status>=300&&status<400)throw new StaticTransportError('static-redirect');if(status!==200)throw new StaticTransportError('static-http');
    const headers=response.headers(),contentType=headers['content-type']??'',valid=input.type==='stylesheet'?/^text\/css\b/i.test(contentType):/^(?:application\/(?:javascript|x-javascript)|text\/javascript)\b/i.test(contentType);
    if(!valid)throw new StaticTransportError('static-content');if(Number(headers['content-length']??0)>8*1024*1024)throw new StaticTransportError('static-size');
    const body=await response.body();if(body.length>8*1024*1024)throw new StaticTransportError('static-size');
    if(Math.min(Date.parse(review.approval.expiresAt),Date.parse(policy.approval.expiresAt))<=Date.now())throw new StaticTransportError('static-review-expired');
    // No Set-Cookie, redirects or provider headers enter the browser context.
    return {status:200,body,headers:{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*'}};
  }catch(error){if(error instanceof StaticTransportError)throw error;throw new StaticTransportError('static-transport');}
  finally{await context?.dispose().catch(()=>{});}
}
