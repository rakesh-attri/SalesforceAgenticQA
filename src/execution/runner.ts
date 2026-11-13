import { spawn } from 'node:child_process';
import { resolve,join } from 'node:path';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ResultSchema,type Result } from '../core/history.js';
const ReportSchema=z.object({suites:z.array(z.unknown()),errors:z.array(z.unknown()).optional()});
export async function executeGenerated(root:string,runId:string,files:Array<{id:string;code:string}>,timeoutMs=120000) {
  if(!files.length||new Set(files.map(f=>f.id)).size!==files.length)throw Error('Distinct generated tests required');
  root=resolve(root);await mkdir(root,{recursive:true});
  for(const file of files){if(!/^[A-Za-z0-9_-]+$/.test(file.id))throw Error('Invalid generated test ID');await writeFile(join(root,`${file.id}.spec.ts`),file.code);}
  const report=join(root,'results.json'),config=join(root,'playwright.config.ts');
  await writeFile(config,`import { defineConfig } from '@playwright/test'; export default defineConfig(${JSON.stringify({testDir:root,testMatch:files.map(f=>`${f.id}.spec.ts`),workers:1,retries:0,timeout:10000,outputDir:join(root,'evidence'),use:{headless:true,trace:'on',screenshot:'only-on-failure'},reporter:[['json',{outputFile:report}],['html',{outputFolder:join(root,'html'),open:'never'}],['junit',{outputFile:join(root,'junit.xml')}]]})});`);
  const exitCode=await new Promise<number>((resolveExit,reject)=>{
    const child=spawn(process.execPath,[resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{shell:false,windowsHide:true,env:{...process.env,PWDEBUG:'0',PLAYWRIGHT_HTML_OPEN:'never'}});
    let output='';child.stdout.on('data',d=>{output=(output+d).slice(-20000);});child.stderr.on('data',d=>{output=(output+d).slice(-20000);});
    const timer=setTimeout(()=>{child.kill();reject(Error('Execution budget exceeded; no passing result inferred'));},timeoutMs);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);if(code===null)reject(Error('Runner terminated'));else resolveExit(code);});
  });
  const raw=ReportSchema.parse(JSON.parse(await readFile(report,'utf8'))),results:Result[]=[],failures:Array<{testId:string;message:string;evidence:string[]}>=[];
  function walk(suites:unknown[]) {
    for(const rawSuite of suites){const suite=z.object({suites:z.array(z.unknown()).default([]),specs:z.array(z.object({file:z.string(),tests:z.array(z.object({results:z.array(z.object({status:z.string(),duration:z.number(),attachments:z.array(z.object({path:z.string().optional(),name:z.string()})).default([]),error:z.object({message:z.string().optional()}).optional()}))}))})).default([])}).parse(rawSuite);
      for(const spec of suite.specs){const id=files.find(f=>spec.file.replace(/\\/g,'/').endsWith(`${f.id}.spec.ts`))?.id;if(!id)throw Error('Unknown executed test file');
        for(const test of spec.tests)for(const r of test.results){const evidence=r.attachments.map(a=>a.path??a.name);const result=ResultSchema.parse({runId,testId:id,status:r.status==='passed'?'passed':r.status==='skipped'?'skipped':'failed',durationMs:r.duration,components:[join(root,`${id}.spec.ts`)],evidence,at:new Date().toISOString()});results.push(result);if(result.status==='failed')failures.push({testId:id,message:r.error?.message??r.status,evidence});}}
      walk(suite.suites);
    }
  }walk(raw.suites);
  if(results.length!==files.length||new Set(results.map(r=>r.testId)).size!==files.length)throw Error('Incomplete/duplicated execution report; no passing result inferred');
  if(exitCode!==0&&results.every(r=>r.status==='passed'))throw Error('Runner failed despite passing test rows');
  return {exitCode,results,failures,report,runnerErrors:raw.errors??[]};
}
