import { ReportingLabsReporter,type ReportingLabsOptions } from 'reporting-labs';
import type { Reporter,FullConfig,FullResult,Suite,TestCase,TestError } from '@playwright/test/reporter';
import { existsSync,realpathSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,relative,isAbsolute,dirname,basename,join } from 'node:path';
import { z } from 'zod';
import { environmentSecrets,redactModelText,redactModelValue } from '../ai/privacy.js';
export const ReportingScopeSchema=z.enum(['local-fixture','offline-mocked-salesforce','live-salesforce','unclassified-generated']);
const OptionsSchema=z.object({outputFolder:z.string().min(1),validation:ReportingScopeSchema}).strict();
export type SafeReportingLabsOptions=z.infer<typeof OptionsSchema>;
function contained(root:string,target:string){const path=relative(root,target);return path!==''&&!path.startsWith('..')&&!isAbsolute(path);}
export function reportingOutput(raw:string){
  const output=resolve(raw),workspace=realpathSync('.');
  if(basename(output)!=='reporting-labs'||![resolve('artifacts'),resolve('.state'),resolve('test-results')].some(root=>contained(root,output)))throw Error('Reporting output must be a reporting-labs folder inside an ignored runtime directory');
  let existing=output;while(!existsSync(existing))existing=dirname(existing);
  if(!contained(workspace,realpathSync(existing))&&realpathSync(existing)!==workspace)throw Error('Reporting output escaped the workspace');
  const assets=join(output,'assets');if(existsSync(assets)&&!contained(existsSync(output)?realpathSync(output):output,realpathSync(assets)))throw Error('Reporting assets escaped their output directory');
  return output;
}
// Delegate to the real supported npm Reporter API. Secrets are supplied privately
// here, never serialized in Playwright's config/JSON reporter options. No /auto
// import, API capture, hosted service, browser auto-open or PDF process is enabled.
export default class SafeReportingLabsReporter implements Reporter {
  private delegate:ReportingLabsReporter;private options:SafeReportingLabsOptions;private secrets=environmentSecrets();private suite?:Suite;
  constructor(raw:unknown){
    // Playwright injects these runner fields in addition to public options.
    const parsed=OptionsSchema.extend({configDir:z.string().optional(),_mode:z.unknown().optional(),_commandHash:z.unknown().optional()}).parse(raw);
    this.options={outputFolder:parsed.outputFolder,validation:parsed.validation};this.options.outputFolder=reportingOutput(this.options.outputFolder);
    const options:ReportingLabsOptions={title:'SalesforceAgenticQA execution report',outputFolder:this.options.outputFolder,open:'never',pdf:false,emitJson:true,announce:false,warnMissingMeta:false,commentMeta:false,editorLinks:false,embedFonts:true,maskFromEnv:true,maskValues:this.secrets,maskKeys:['sid','sessionId','assertion','authorization','consumerKey','client_id','private_key','storageState'],metadata:{framework:'SalesforceAgenticQA',validation:this.options.validation,lifecycle:'See the separate lifecycle report; test rows do not establish cleanup or learning'},history:{enabled:true,file:join(this.options.outputFolder,'history.json'),keep:30}};
    // Vendor overrides can otherwise redirect reports outside ignored output or
    // auto-open a browser. Keep framework paths/options authoritative; restore env.
    const overrides=Object.entries(process.env).filter(([key])=>key.startsWith('REPORTING_LABS_'));for(const [key] of overrides)delete process.env[key];
    try{this.delegate=new ReportingLabsReporter(options);}finally{for(const [key,value] of overrides)process.env[key]=value;}
  }
  printsToStdio(){return false;}
  onBegin(config:FullConfig,suite:Suite){reportingOutput(this.options.outputFolder);this.suite=suite;this.delegate.onBegin(config,suite);}
  onStdOut(chunk:string|Buffer,test?:TestCase|void){this.delegate.onStdOut(redactModelText(chunk.toString(),this.secrets),test);}
  onStdErr(chunk:string|Buffer,test?:TestCase|void){this.delegate.onStdErr(redactModelText(chunk.toString(),this.secrets),test);}
  onError(error:TestError){this.delegate.onError(redactModelValue(error,this.secrets) as TestError);}
  async onEnd(result:FullResult){
    reportingOutput(this.options.outputFolder);await this.delegate.onEnd(result);
    const attempts=this.suite?.allTests().flatMap(test=>test.results)??[];
    await mkdir(this.options.outputFolder,{recursive:true});await writeFile(join(this.options.outputFolder,'sfqa-validation.json'),JSON.stringify({kind:'actual-playwright-report',validation:this.options.validation,runStatus:result.status,attempts:attempts.length,passed:attempts.filter(r=>r.status==='passed').length,failed:attempts.filter(r=>!['passed','skipped'].includes(r.status)).length,skipped:attempts.filter(r=>r.status==='skipped').length,apiAutoCapture:false,hostedUpload:false,lifecycleSuccessInferred:false,verifiedLearningInferred:false},null,2));
  }
}
