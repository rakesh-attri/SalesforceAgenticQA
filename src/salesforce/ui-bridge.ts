import { createHash } from 'node:crypto';
import type { History } from '../core/history.js';
const guidance={
  Cached_One_Time_Url:'This one-use URL was already attempted locally. Salesforce may cache it for one minute; wait for a fresh URL instead of replaying it.',
  Transport_Error:'UI Bridge could not complete over the approved HTTPS connection; network/proxy details withheld to protect credentials.',
  Invalid_Scope:'The issuing External Client App and effective token need web scope (full is broader and unnecessary). An administrator must review authorization; no app permissions were changed.',
  Bad_OAuth_Token:'The session token was rejected. Obtain a fresh token and have the administrator confirm that this dedicated user has UI access and does not have API Only User. The provider did not distinguish those causes.',
  Missing_OAuth_Token:'Salesforce did not accept the Authorization header. Check the approved endpoint/proxy; never put the token in a URL.',
  Invalid_Param:'Salesforce rejected the relative redirect path. Use only the fixed reviewed Lightning landing path.',
  No_Access:'UI Bridge requires the approved My Domain or Experience Cloud origin, not login.salesforce.com or test.salesforce.com.',
  Wrong_Org:'The token and target domain do not identify the same org. Re-verify the exact org and approved origin.',
  Unrecognized:'UI Bridge failed; provider details withheld. Check approved app scopes, user UI access and My Domain configuration.',
} as const;
export type UiBridgeCode=keyof typeof guidance;
export class UiBridgeError extends Error {
  constructor(readonly code:UiBridgeCode,readonly httpStatus:number){super(`Salesforce UI Bridge failed (HTTP ${httpStatus}): ${code}. ${guidance[code]}`);this.name='UiBridgeError';}
}
export async function uiBridgeFailure(response:Response) {
  // Provider text can echo credentials. Only emit a finite, locally authored classification.
  const body=await response.text().catch(()=>''),code=(Object.keys(guidance) as UiBridgeCode[]).find(c=>c!=='Unrecognized'&&new RegExp(`\\b${c}\\b`,'i').test(body))??'Unrecognized';
  return new UiBridgeError(code,response.status);
}
export function claimBridgeUse(history:History,url:string,now=Date.now()) {
  const hash=createHash('sha256').update(url).digest('hex');
  history.db.exec('CREATE TABLE IF NOT EXISTS dedicated_bridge_uses(hash TEXT PRIMARY KEY,attempted REAL)');
  try{history.db.prepare('INSERT INTO dedicated_bridge_uses VALUES(?,?)').run(hash,now);}catch{throw new UiBridgeError('Cached_One_Time_Url',0);}
}
