import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSalesforceMcp } from './salesforce-mcp.js';
await createSalesforceMcp().connect(new StdioServerTransport());
