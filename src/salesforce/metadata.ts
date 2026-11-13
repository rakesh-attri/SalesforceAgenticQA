import { XMLParser,XMLValidator } from 'fast-xml-parser';
export function metadataRequest(type:string,names:string[],token:string) {
  if(!['CustomObject','Flow','ApexClass','PermissionSet','Profile','Layout'].includes(type)||!names.length||names.length>10||names.some(n=>!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(n))) throw Error('Explicit bounded metadata names and supported type required');
  const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="http://soap.sforce.com/2006/04/metadata"><s:Header><m:SessionHeader><m:sessionId>${escape(token)}</m:sessionId></m:SessionHeader></s:Header><s:Body><m:readMetadata><m:type>${type}</m:type>${names.map(n=>`<m:fullNames>${escape(n)}</m:fullNames>`).join('')}</m:readMetadata></s:Body></s:Envelope>`;
}
export function parseMetadata(xml:string) {
  if(xml.length>5_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true) throw Error('Unsafe or invalid metadata XML');
  const document=new XMLParser({removeNSPrefix:true,ignoreAttributes:false,parseTagValue:false}).parse(xml);
  const body=document?.Envelope?.Body;
  if(!body||body.Fault||!body.readMetadataResponse?.result) throw Error('Metadata read failed or response malformed');
  return body.readMetadataResponse.result as Record<string,unknown>;
}
