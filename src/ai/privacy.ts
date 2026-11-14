export function redactModelText(text:string,secrets:string[]=[]) {
  for(const secret of secrets.filter(Boolean).sort((a,b)=>b.length-a.length))text=text.split(secret).join('[REDACTED]');
  return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[PRIVATE-KEY]')
    .replace(/\b(password|api[-_ ]?key|consumer[-_ ]?key|client[-_ ]?(?:id|secret)|username|access[-_ ]?token|refresh[-_ ]?token|assertion)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[JWT]')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g,'[API-KEY]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[EMAIL]')
    .replace(/\b00[A-Za-z0-9]{13}(?:[A-Za-z0-9]{3})?\b/g,'[RECORD-ID]');
}
export function environmentSecrets(env:NodeJS.ProcessEnv=process.env) {return Object.entries(env).filter(([key,value])=>value&&/(?:KEY|TOKEN|SECRET|PASSWORD|SF_USERNAME|SF_CLIENT_ID)/i.test(key)).map(([,value])=>value!);}
export function redactModelValue(value:unknown,secrets:string[]):unknown {
  if(typeof value==='string')return redactModelText(value,secrets);
  if(Array.isArray(value))return value.map(v=>redactModelValue(v,secrets));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/(?:api.?key|access.?token|refresh.?token|private.?key|password|assertion|authorization|consumer.?key|client.?(?:secret|id)|username)/i.test(key)?'[REDACTED]':redactModelValue(v,secrets)]));
  return value;
}
