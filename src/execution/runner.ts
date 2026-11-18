import { spawn } from 'node:child_process';
import { resolve,join } from 'node:path';
import { mkdir,writeFile,readFile,access,rm,lstat } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { z } from 'zod';
import { ResultSchema,type Result } from '../core/history.js';
import {localLaunchOptions} from './local-browser.js';
const ReportSchema=z.object({suites:z.array(z.unknown()),errors:z.array(z.unknown()).optional()});
export async function executeGenerated(root:string,runId:string,files:Array<{id:string;code:string}>,timeoutMs=120000,session?:{storageState?:string;trace?:'off';testTimeoutMs?:number;validation?:'local-fixture'|'offline-mocked-salesforce'|'live-salesforce'|'unclassified-generated'}) {
  if(!files.length||new Set(files.map(f=>f.id)).size!==files.length)throw Error('Distinct generated tests required');
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(runId)||files.some(f=>!/^[A-Za-z0-9_-]+$/.test(f.id)))throw Error('Valid execution run and test IDs required');
  const testTimeout=z.number().int().min(1000).max(180000).parse(session?.testTimeoutMs??10000),launchOptions=localLaunchOptions();
  root=resolve(root);await mkdir(root,{recursive:true});
  const intents=join(root,'.sfqa-runs');await mkdir(intents,{recursive:true});
  if((await lstat(intents)).isSymbolicLink())throw Error('Execution reservation symlink denied');
  const intent=join(intents,runId+'.json'),startedAt=new Date().toISOString();
  try{await writeFile(intent,JSON.stringify({runId,status:'pending',startedAt,sources:files.map(f=>({id:f.id,hash:createHash('sha256').update(f.code).digest('hex')}))}),{flag:'wx'});}catch{throw Error('Execution run already reserved or unavailable; inspect its durable result. Use a separately reviewed fresh run, never replay an uncertain action.');}
  // A new explicit run may reuse the reporter history, but never old reports.
  for(const path of [join(root,'results.json'),...['index.html','report.json','sfqa-validation.json'].map(file=>join(root,'reporting-labs',file))])await rm(path,{force:true});
  for(const file of files){if(!/^[A-Za-z0-9_-]+$/.test(file.id))throw Error('Invalid generated test ID');await writeFile(join(root,`${file.id}.spec.ts`),file.code);}
  const report=join(root,'results.json'),config=join(root,'playwright.config.ts');
  const reportingEnabled=process.env.SFQA_REPORTING_LABS!=='0',reportingFolder=join(root,'reporting-labs'),validation=session?.validation??'unclassified-generated';
  await writeFile(config,`import { defineConfig } from '@playwright/test'; export default defineConfig(${JSON.stringify({testDir:root,testMatch:files.map(f=>`${f.id}.spec.ts`),workers:1,retries:0,timeout:testTimeout,outputDir:join(root,'evidence'),use:{headless:true,launchOptions,serviceWorkers:'block',storageState:session?.storageState,trace:session?.trace??'on',screenshot:validation==='live-salesforce'?'off':'only-on-failure'},reporter:[['json',{outputFile:report}],['html',{outputFolder:join(root,'html'),open:'never'}],['junit',{outputFile:join(root,'junit.xml')}],...(reportingEnabled?[[resolve('src/integrations/reporting-labs-reporter.ts'),{outputFolder:reportingFolder,validation}]]:[])]})});`);
  const exitCode=await new Promise<number>((resolveExit,reject)=>{
    const child=spawn(process.execPath,[resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{shell:false,windowsHide:true,env:{...process.env,PWDEBUG:'0',PLAYWRIGHT_HTML_OPEN:'never'}});
    let output='';child.stdout.on('data',d=>{output=(output+d).slice(-20000);});child.stderr.on('data',d=>{output=(output+d).slice(-20000);});
    const timer=setTimeout(()=>{child.kill();reject(Error('Execution budget exceeded; no passing result inferred'));},timeoutMs);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);if(code===null)reject(Error('Runner terminated'));else resolveExit(code);});
  });
  const raw=ReportSchema.parse(JSON.parse(await readFile(report,'utf8'))),results:Result[]=[],failures:Array<{testId:string;message:string;evidence:string[]}>=[];
  if(raw.errors?.length)throw Error('Execution report contains runner errors; no passing lifecycle may be inferred');
  function walk(suites:unknown[]) {
    for(const rawSuite of suites){const suite=z.object({suites:z.array(z.unknown()).default([]),specs:z.array(z.object({file:z.string(),tests:z.array(z.object({results:z.array(z.object({status:z.string(),duration:z.number(),attachments:z.array(z.object({path:z.string().optional(),name:z.string()})).default([]),error:z.object({message:z.string().optional()}).optional()}))}))})).default([])}).parse(rawSuite);
      for(const spec of suite.specs){const id=files.find(f=>spec.file.replace(/\\/g,'/').endsWith(`${f.id}.spec.ts`))?.id;if(!id)throw Error('Unknown executed test file');
        for(const test of spec.tests)for(const r of test.results){const evidence=r.attachments.map(a=>a.path??a.name);const result=ResultSchema.parse({runId,testId:id,status:r.status==='passed'?'passed':r.status==='skipped'?'skipped':'failed',durationMs:r.duration,components:[join(root,`${id}.spec.ts`)],evidence,at:new Date().toISOString()});results.push(result);if(result.status==='failed')failures.push({testId:id,message:r.error?.message??r.status,evidence});}}
      walk(suite.suites);
    }
  }walk(raw.suites);
  if(results.length!==files.length||new Set(results.map(r=>r.testId)).size!==files.length)throw Error('Incomplete/duplicated execution report; no passing result inferred');
  if(exitCode!==0&&results.every(r=>r.status==='passed'))throw Error('Runner failed despite passing test rows');
  const reportingLabs=reportingEnabled?{status:'generated' as const,html:join(reportingFolder,'index.html'),json:join(reportingFolder,'report.json'),validation}:{status:'disabled' as const};
  if(reportingEnabled)await verifyGeneratedReports(reportingFolder,validation,results);
  await writeFile(intent,JSON.stringify({runId,status:'complete',startedAt,completedAt:new Date().toISOString(),exitCode,results:results.map(r=>({testId:r.testId,status:r.status})),report}));
  return {exitCode,results,failures,report,runnerErrors:raw.errors??[],reportingLabs};
}
export async function verifyGeneratedReports(folder:string,validation:string,results:Result[]){
  await access(join(folder,'index.html'));
  const stats=z.object({stats:z.object({passed:z.number().int(),failed:z.number().int(),skipped:z.number().int()})}).parse(JSON.parse(await readFile(join(folder,'report.json'),'utf8'))).stats;
  const receipt=z.object({kind:z.literal('actual-playwright-report'),validation:z.string(),attempts:z.number().int(),passed:z.number().int(),failed:z.number().int(),skipped:z.number().int(),lifecycleSuccessInferred:z.literal(false),verifiedLearningInferred:z.literal(false)}).parse(JSON.parse(await readFile(join(folder,'sfqa-validation.json'),'utf8')));
  const expected={passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,skipped:results.filter(r=>r.status==='skipped').length};
  if(receipt.validation!==validation||receipt.attempts!==results.length||Object.entries(expected).some(([key,value])=>stats[key as keyof typeof expected]!==value||receipt[key as keyof typeof expected]!==value))throw Error('Reporting output is incomplete, stale or inconsistent with actual execution');
  return{status:'verified',...expected};
}
