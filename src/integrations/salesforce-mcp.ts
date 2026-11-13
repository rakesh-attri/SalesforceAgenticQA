import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { discoverLiveOrg } from '../agents/org-discovery.js';
import { OrgSnapshotSchema, type OrgSnapshot } from '../core/types.js';

// Deliberately excludes arbitrary SOQL, HTTP paths, Apex, writes and financial actions.
export function createSalesforceMcp(discover:(names:string[])=>Promise<OrgSnapshot>=discoverLiveOrg,approvedOperations?:{execute:(approvalId:string)=>Promise<unknown>}) {
  const server=new McpServer({name:'salesforce-agentic-qa',version:'0.1.0'});
  server.registerTool('discover_schema',{
    description:'Read Describe schema for 1–50 explicitly named authorized Salesforce objects. Unknown business workflows stay unknown.',
    inputSchema:{objects:z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).min(1).max(50)},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},
  },async({objects})=>{
    try {
      const snapshot=OrgSnapshotSchema.parse(await discover(objects));
      return {content:[{type:'text' as const,text:JSON.stringify(snapshot)}]};
    } catch {
      // Provider errors may include private org details; expose a bounded diagnostic.
      return {isError:true,content:[{type:'text' as const,text:'Schema discovery failed. Verify local credentials, authorization and response schema. No writes were performed.'}]};
    }
  });
  if(approvedOperations) server.registerTool('execute_reviewed_data',{
    description:'Execute a locally reviewed, hash-bound sandbox data operation. Cannot submit payloads or grant approval through MCP.',
    inputSchema:{approvalId:z.string().regex(/^[A-Za-z0-9_-]+$/)},
    annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true},
  },async({approvalId})=>{
    try {const result=await approvedOperations.execute(approvalId);return {content:[{type:'text' as const,text:JSON.stringify({status:'executed',reference:result})}]};}
    catch{return {isError:true,content:[{type:'text' as const,text:'Operation denied or failed. Reconcile local journal before retry.'}]};}
  });
  return server;
}
