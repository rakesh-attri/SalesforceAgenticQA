import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { discoverLiveOrg } from '../agents/org-discovery.js';
import { OrgSnapshotSchema, type OrgSnapshot } from '../core/types.js';

// Deliberately excludes arbitrary SOQL, HTTP paths, Apex, writes and financial actions.
export function createSalesforceMcp(discover:(names:string[])=>Promise<OrgSnapshot>=discoverLiveOrg) {
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
  return server;
}
