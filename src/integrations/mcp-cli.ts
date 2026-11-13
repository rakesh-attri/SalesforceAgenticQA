import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSalesforceMcp } from './salesforce-mcp.js';
import { loadJson } from '../core/io.js';
import { z } from 'zod';
import { ApprovalSchema,MutationSchema } from '../salesforce/approval.js';
import { SalesforceClient } from '../salesforce/client.js';
import { History } from '../core/history.js';
import { DataExecution } from '../agents/data-execution.js';
let operations;
if(process.env.SFQA_ENABLE_APPROVED_TOOLS==='true') {
  // This file is an operator-controlled approval boundary. Never expose a tool that writes it.
  const approved=z.record(z.string(),z.object({mutation:MutationSchema,approval:ApprovalSchema})).parse(await loadJson('.state/reviewed-mutations.json'));
  const executor=new DataExecution(await SalesforceClient.connect(),new History());
  operations={async execute(id:string){const record=approved[id];if(!record) throw Error('Unknown local approval');return executor.execute(record.mutation,record.approval);}};
}
await createSalesforceMcp(undefined,operations).connect(new StdioServerTransport());
