import ts from 'typescript';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { InitializationScopeSchema } from './diagnostic-review.js';

export const currentAppAction='serviceComponent://ui.global.components.one.one.controller.OneController/ACTION$getCurrentApp';
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export function classifyInitializationError(error:{name:string;message:string}){
  const message=error.message.slice(0,4096),category=/^(?:No (?:COMPONENT|MODULE|CONTROLLER) named|Unable to find (?:component|module)|Unknown component|Cannot find (?:component|module))/i.test(message)?'component-resolution-pattern':/^(?:Assertion Failed|Assert Failed)/i.test(message)?'assertion-pattern':/^(?:Failed to fetch dynamically imported module|Failed to load (?:script|resource|module)|Loading (?:chunk|CSS chunk))/i.test(message)?'resource-load-pattern':['TypeError','ReferenceError','SyntaxError','RangeError'].includes(error.name)?'javascript-runtime':'unclassified';
  return {name:['Error','TypeError','ReferenceError','SyntaxError','RangeError','AuraError'].includes(error.name)?error.name:'other',category,messageFingerprint:digest(error.name+'\0'+message),messageTruncated:error.message.length>4096,serverErrorEstablished:false,causalProof:false};
}
export const SelectedAppSchema=z.object({appIdHash:Hash,developerNameHash:Hash,source:z.literal('documented-ui-api-selected-app'),observedAt:z.string().datetime()}).strict();
export function projectSelectedApp(raw:unknown){
  const parsed=z.object({appId:z.string().regex(/^06m[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/),developerName:z.string().max(120).regex(/^[A-Za-z][A-Za-z0-9_]*$/)}).safeParse(raw);
  if(!parsed.success)throw Error('Selected-app metadata shape is unsupported; response withheld');
  return SelectedAppSchema.parse({appIdHash:digest(parsed.data.appId),developerNameHash:digest(parsed.data.developerName),source:'documented-ui-api-selected-app',observedAt:new Date().toISOString()});
}
export function inspectCurrentAppRequest(input:{url:string;method:string;type:string;body?:string|null},origins:string[]){
  try{
    const url=new URL(input.url);
    if(!origins.includes(url.origin)||url.pathname!=='/aura'||url.username||url.password||input.method!=='POST'||!['xhr','fetch'].includes(input.type)||!input.body||input.body.length>262144)return;
    const envelope=new URLSearchParams(input.body);if(envelope.getAll('message').length!==1)return;
    const message=JSON.parse(envelope.get('message')!);if(!Array.isArray(message?.actions)||message.actions.length>10)return;
    const actions=message.actions.filter((action:{descriptor?:unknown})=>action?.descriptor===currentAppAction);
    if(actions.length!==1)return;
    const params=actions[0].params,object=!!params&&typeof params==='object'&&!Array.isArray(params),keys=object?Object.keys(params):[],value=object?params.appContextIdOrName:undefined;
    const contextKind=typeof value!=='string'?'not-a-string':value===''?'empty':/^06m[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(value)?'application-id':/^[A-Za-z][A-Za-z0-9_]{0,119}$/.test(value)?'developer-name':'unrecognized';
    const knownEnvelope=['message','aura.context','aura.pageURI','aura.token'],envelopeKeys=[...new Set(envelope.keys())];
    let context:unknown;try{context=JSON.parse(envelope.get('aura.context')??'null');}catch{}
    const shape=context&&typeof context==='object'&&!Array.isArray(context)?context as Record<string,unknown>:undefined;
    return {actionHash:digest(currentAppAction),requestUrlHash:digest(input.url),batchActions:message.actions.length,exactSingleAction:message.actions.length===1,query:{keys:[...url.searchParams.keys()].slice(0,20).map(key=>key==='r'?'r':'unrecognized'),count:[...url.searchParams.keys()].length,duplicateKeys:[...new Set(url.searchParams.keys())].some(key=>url.searchParams.getAll(key).length!==1),fingerprint:digest(url.search)},envelope:{recognizedKeys:envelopeKeys.filter(key=>knownEnvelope.includes(key)),unknownKeys:envelopeKeys.filter(key=>!knownEnvelope.includes(key)).length,duplicateKeys:envelopeKeys.some(key=>envelope.getAll(key).length!==1)},parameters:{exactKeys:object&&keys.length===1&&keys[0]==='appContextIdOrName',unknownKeys:keys.filter(key=>key!=='appContextIdOrName').length,contextKind,...(typeof value==='string'?{valueHash:digest(value)}:{})},context:{object:!!shape,...(typeof shape?.app==='string'?{appHash:digest(shape.app)}:{}),...(typeof shape?.fwuid==='string'?{frameworkHash:digest(shape.fwuid)}:{})},requestExecuted:false,serverEffects:'unknown' as const,responseRequirements:'unknown' as const};
  }catch{return;}
}

const callsAllowed=new Set(['get','setParams','setCallback','getState','getReturnValue','getError','enqueueAction','set','fire','then']);
const responseKeys=new Set(['appId','developerName','appContextId','navItems','formFactors','url','tabs','label','navigationType']);
// Parse first-party client source as data after the browser closes. Never eval,
// rewrite Salesforce responses or infer server effects from a client-side name.
export function inspectCurrentAppSource(bytes:Buffer,urlHash:string){
  const base={urlHash,sourceHash:digest(bytes),bytes:bytes.length,anchors:0,handlerScopes:0,traversalLimited:false,observedCalls:[] as string[],parameterKeys:[] as string[],observedResponsePropertyReads:[] as string[],serverEffectsEstablished:false,responseSchemaEstablished:false};
  const text=bytes.toString('utf8');if(!text.includes('getCurrentApp'))return {...base,status:'no-anchor' as const};
  const ast=ts.createSourceFile('reviewed-client.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),scopes=new Set<ts.Node>(),calls=new Set<string>(),parameters=new Set<string>(),reads=new Set<string>();
  const walk=(root:ts.Node,visit:(node:ts.Node)=>void)=>{const pending=[root];let count=0;while(pending.length&&count++<200000){const node=pending.pop()!;visit(node);ts.forEachChild(node,child=>{pending.push(child);});}if(pending.length)base.traversalLimited=true;};
  walk(ast,node=>{if((ts.isStringLiteral(node)&&['c.getCurrentApp',currentAppAction,'getCurrentApp'].includes(node.text))||(ts.isIdentifier(node)&&node.text==='getCurrentApp'&&ts.isPropertyAssignment(node.parent)&&node.parent.name===node)){
    base.anchors++;let parent:ts.Node|undefined=node.parent;for(let depth=0;parent&&depth<16;depth++,parent=parent.parent)if(ts.isFunctionLike(parent)&&parent.end-parent.pos<=20000){scopes.add(parent);break;}
  }});
  for(const scope of [...scopes].slice(0,12))walk(scope,node=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
      const name=node.expression.name.text;if(callsAllowed.has(name))calls.add(name);
      if(name==='setParams'&&node.arguments[0]&&ts.isObjectLiteralExpression(node.arguments[0]))for(const p of node.arguments[0].properties)if(ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&p.name.text==='appContextIdOrName')parameters.add(p.name.text);
    }
    if(ts.isPropertyAccessExpression(node)&&ts.isCallExpression(node.expression)&&ts.isPropertyAccessExpression(node.expression.expression)&&node.expression.expression.name.text==='getReturnValue'&&responseKeys.has(node.name.text))reads.add(node.name.text);
  });
  return {...base,status:base.anchors?'client-anchor-observed' as const:'no-anchor' as const,handlerScopes:scopes.size,observedCalls:[...calls].sort(),parameterKeys:[...parameters].sort(),observedResponsePropertyReads:[...reads].sort()};
}
export function collectInitializationSources(raw:unknown){
  const scope=InitializationScopeSchema.parse(raw),sources:Array<{urlHash:string;body:Buffer}>=[],seen=new Set<string>();let total=0,oversized=0,limited=0,closed=false;
  return {capture(url:string,type:string,body:Buffer){if(closed||type!=='script')return;const key=digest(url);if(seen.has(key))return;seen.add(key);if(body.length>scope.maxSourceBytes){oversized++;return;}if(sources.length>=scope.maxSources||total+body.length>scope.maxTotalSourceBytes){limited++;return;}total+=body.length;sources.push({urlHash:key,body});},finish(){closed=true;return {sources:sources.map(source=>inspectCurrentAppSource(source.body,source.urlHash)),oversizedSources:oversized,limitedSources:limited,totalBytes:total,serverEffects:'unknown' as const,internalBootstrapAllowed:false as const};}};
}
