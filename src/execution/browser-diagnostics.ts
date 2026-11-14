import { createHash } from 'node:crypto';
import { z } from 'zod';
export const DeniedRequestSchema=z.object({method:z.string(),resource:z.string(),route:z.enum(['aura','ui-api','static','lightning','other']),pathHash:z.string(),descriptors:z.array(z.string()),parameterNames:z.array(z.string()),unknownDescriptors:z.number().int(),unknownParameters:z.number().int()}).strict();
// Diagnostics have their own closed vocabulary. A familiar controller suffix
// must never cause arbitrary namespaces/action strings from a request to be logged.
const descriptorsAllowed=new Set(['aura://RecordUiController/ACTION$getRecord','aura://RecordUiController/ACTION$getRecordWithFields','aura://RecordUiController/ACTION$getObjectInfo','aura://RecordUiController/ACTION$getLayout','aura://RecordUiController/ACTION$getRecordLayout','serviceComponent://ui.force.components.controllers.recordGlobalValueProvider.RecordGvpController/ACTION$getRecord']);
const parameterNames=new Set(['recordId','recordIds','fields','optionalFields','layoutTypes','modes','mode','formFactor','objectApiName','objectApiNames','descriptor','attributes','context','screenSize','pageURI','recordDescriptor']);
export function summarizeDeniedRequest(input:{url:string;method:string;type:string;body?:string|null}) {
  const u=new URL(input.url),descriptors:string[]=[],names=new Set<string>();let unknownDescriptors=0,unknownParameters=0;
  if(u.pathname==='/aura')try{const message=JSON.parse(new URLSearchParams(input.body??'').get('message')??'null');if(Array.isArray(message?.actions))for(const action of message.actions.slice(0,10)){
    const descriptor=typeof action.descriptor==='string'?action.descriptor:'';
    if(descriptorsAllowed.has(descriptor))descriptors.push(descriptor);else unknownDescriptors++;
    if(action.params&&typeof action.params==='object'&&!Array.isArray(action.params))for(const name of Object.keys(action.params)){if(parameterNames.has(name))names.add(name);else unknownParameters++;}
  }}catch{/* Only structural counters, never raw body/values. */}
  return DeniedRequestSchema.parse({method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(input.method)?input.method:'other',resource:['document','script','stylesheet','image','font','xhr','fetch'].includes(input.type)?input.type:'other',route:u.pathname==='/aura'?'aura':u.pathname.includes('/ui-api/')?'ui-api':/^\/(?:auraFW|resource|assets|static|fonts|jslibrary)\//.test(u.pathname)?'static':u.pathname.startsWith('/lightning')?'lightning':'other',pathHash:createHash('sha256').update(u.pathname).digest('hex'),descriptors,parameterNames:[...names].sort(),unknownDescriptors,unknownParameters});
}
