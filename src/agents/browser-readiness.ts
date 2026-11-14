import type { OrgIntelligence } from './org-intelligence.js';
import { checkSessionReceipt } from '../integrations/session-gate.js';
export async function prepareBrowserDiscovery(org:OrgIntelligence,input:{origin?:string;persona?:string;receiptPath?:string}={}) {
  const reasons:string[]=[];
  if(!org.identity.IsSandbox)reasons.push('Configured API identity reports IsSandbox=false; no sandbox UI testing is authorized.');
  let origin:string|undefined;
  try {if(input.origin){const url=new URL(input.origin);if(url.protocol==='https:'&&url.origin===input.origin)origin=url.origin;else reasons.push('Browser origin must be an explicitly approved canonical HTTPS origin.');}}catch{reasons.push('Browser origin is invalid; value withheld.');}
  if(!origin)reasons.push('No approved browser origin established. API JWT/instance URL does not establish browser login or Lightning/Experience site origin.');
  if(!input.persona||!input.receiptPath)reasons.push('A separately authenticated, reviewed persona and private state receipt are required.');
  if(!reasons.length&&origin&&input.persona&&input.receiptPath)try{await checkSessionReceipt(input.receiptPath,{orgId:org.identity.Id,userId:org.identity.userId,persona:input.persona},[origin]);}catch{reasons.push('Private browser session receipt could not be verified; no UI actions authorized.');}
  return {status:reasons.length?'blocked':'requires-fresh-browser-probe',execute:false,allowedTools:['browser_navigate','browser_snapshot'],prohibitedActions:['record creation','record updates','record deletion','financial actions'],objects:org.snapshot.objects.map(o=>o.name),reasons,next:'Review the browser authenticator and identity probe, verify the sandbox/session independently, then invoke bounded headless MCP observation. No workflow steps or locators have been inferred.'};
}
