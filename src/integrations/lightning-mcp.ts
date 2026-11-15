import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {LightningSession} from '../execution/lightning-session.js';
import {WorkflowSchema} from '../agents/workflows.js';

// This gateway never forwards arbitrary native MCP names or arguments. The
// private Playwright MCP connection uses the already guarded BrowserContext.
export function createLightningMcp(session:LightningSession,reviewedWorkflows:unknown[]=[]){
  const workflows=reviewedWorkflows.map(raw=>WorkflowSchema.parse(raw));
  if(new Set(workflows.map(workflow=>workflow.id)).size!==workflows.length)throw Error('Distinct reviewed workflow IDs required');
  const server=new McpServer({name:'sfqa-managed-lightning',version:'1.0.0'});
  const safely=async(action:()=>Promise<unknown>)=>{
    try{return{content:[{type:'text' as const,text:JSON.stringify(await action())}]};}
    catch{return{isError:true,content:[{type:'text' as const,text:'Lightning operation denied or failed; review local approval, identity, budget and contract evidence.'}]};}
  };
  server.registerTool('sfqa_browser_observe_record',{description:'Navigate only an exact approved Account/Contact reference using the private Playwright MCP transport. No arbitrary URL or action.',inputSchema:z.object({object:z.enum(['Account','Contact'])}).strict(),annotations:{readOnlyHint:true,destructiveHint:false}},async({object})=>safely(()=>session.navigate(object,'mcp')));
  server.registerTool('sfqa_browser_reviewed_view',{description:'Observe the locally reviewed source-bound record view through Playwright MCP. Returns booleans/counts, never native snapshots or record values.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,destructiveHint:false}},async()=>safely(()=>session.observe('mcp')));
  server.registerTool('sfqa_browser_discover_view',{description:'Collect bounded role counts and actually observed record-name locator proposals through Playwright MCP. No raw snapshot, record value or invented workflow action.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,destructiveHint:false}},async()=>safely(()=>session.discover('mcp')));
  server.registerTool('sfqa_browser_reviewed_step',{description:'Execute one step of an existing reviewed owned-record workflow. Initialization/observation grants do not authorize steps.',inputSchema:z.object({workflowId:z.string().max(100),step:z.number().int().min(0).max(19)}).strict(),annotations:{readOnlyHint:false,destructiveHint:true}},async({workflowId,step})=>safely(async()=>{const workflow=workflows.find(workflow=>workflow.id===workflowId);if(!workflow)throw Error('Unknown reviewed workflow');return session.execute(workflow,step);}));
  server.registerTool('sfqa_browser_status',{description:'Return safe session status and four capability planes. Exposes no browser handles, state, API transport or business mutation tools.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,destructiveHint:false}},async()=>safely(async()=>session.status()));
  return server;
}
