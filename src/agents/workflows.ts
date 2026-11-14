import { z } from 'zod';
import ts from 'typescript';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
const Locator=z.object({by:z.enum(['role','label','testId']),value:z.string().min(1),name:z.string().optional()});
export const WorkflowSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/),criterion:z.string().min(1),source:z.string().min(1),reviewer:z.string().trim().min(1),origin:z.string().url(),path:z.string().startsWith('/'),steps:z.array(z.object({locator:Locator,action:z.enum(['click','fill']),value:z.string().optional()})),assertion:z.object({locator:Locator,text:z.string().min(1)}),apiAssertions:z.array(z.object({path:z.string().startsWith('/'),source:z.string().min(1),expected:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))})).default([])});
export type Workflow=z.infer<typeof WorkflowSchema>;
function locator(l:z.infer<typeof Locator>) {const q=JSON.stringify;return l.by==='role'?`page.getByRole(${q(l.value)} as any, { name: ${q(l.name??'')}, exact: true })`:l.by==='label'?`page.getByLabel(${q(l.value)}, { exact: true })`:`page.getByTestId(${q(l.value)})`;}
export function generateTest(input:z.input<typeof WorkflowSchema>,allowedOrigins:string[],guard?:{module:string;config:string}) {
  const w=WorkflowSchema.parse(input),url=new URL(w.path,w.origin);
  if(url.origin!==new URL(w.origin).origin||!allowedOrigins.includes(url.origin)) throw Error('Workflow origin denied');
  for(const step of w.steps) if(step.action==='fill'&&step.value===undefined) throw Error('Fill value required');
  for(const api of w.apiAssertions)if(!allowedOrigins.includes(new URL(api.path,w.origin).origin))throw Error('API assertion origin denied');
  const code=`import { test, expect } from '@playwright/test';\n${guard?`import { installDedicatedGuardFile } from ${JSON.stringify(guard.module)};\ntest.beforeEach(async({context})=>{await installDedicatedGuardFile(context,${JSON.stringify(guard.config)});});\n`:''}// Evidence: ${JSON.stringify(w.source)}\n`+
    `test(${JSON.stringify(w.id+': '+w.criterion)}, async ({page,request}) => {\n await page.route('**/*', route => ${JSON.stringify(allowedOrigins)}.includes(new URL(route.request().url()).origin) ? route.${guard?'fallback':'continue'}() : route.abort());\n await page.goto(${JSON.stringify(url.href)});\n`+
    w.steps.map(s=>` await ${locator(s.locator)}.${s.action}(${s.action==='fill'?JSON.stringify(s.value):''});`).join('\n')+
    `\n await expect(${locator(w.assertion.locator)}).toHaveText(${JSON.stringify(w.assertion.text)});\n`+
    w.apiAssertions.map((api,i)=>` const response${i}=await request.get(${JSON.stringify(new URL(api.path,w.origin).href)},{maxRedirects:0});\n expect(response${i}.ok()).toBeTruthy();\n expect(await response${i}.json()).toMatchObject(${JSON.stringify(api.expected)});`).join('\n')+`\n});\n`;
  const result=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.NodeNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error)) throw Error('Generated code validation failed');
  return code;
}
export async function explore(client:Pick<Client,'callTool'>,input:{urls:string[];allowedOrigins:string[];maxPages:number;maxMs:number}) {
  if(input.maxPages<1||input.maxPages>20||input.maxMs<1||input.maxMs>60000) throw Error('Exploration budget invalid');
  const evidence=[],start=Date.now();
  for(const url of input.urls.slice(0,input.maxPages)) {
    if(Date.now()-start>=input.maxMs) break;
    if(!input.allowedOrigins.includes(new URL(url).origin)) throw Error('Navigation boundary denied');
    const nav=await client.callTool({name:'browser_navigate',arguments:{url}},undefined,{timeout:input.maxMs});
    if(nav.isError) throw Error('MCP navigation failed');
    const snapshot=await client.callTool({name:'browser_snapshot',arguments:{}},undefined,{timeout:Math.max(1,input.maxMs-(Date.now()-start))});
    if(snapshot.isError) throw Error('MCP observation failed');
    evidence.push({url,source:'playwright-mcp',observedAt:new Date().toISOString(),snapshot});
  }
  return {evidence,actions:'navigation-and-observation-only',hypotheses:[]};
}
