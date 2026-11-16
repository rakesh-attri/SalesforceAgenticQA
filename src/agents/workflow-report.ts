import {mkdir,writeFile,realpath,lstat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {fingerprint} from '../execution/browser-policy.js';
import {validateJourney} from './workflow-models.js';
import type {planWorkflowJourney} from './workflow-planning.js';
const esc=(v:unknown)=>JSON.stringify(v,null,2).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function writeWorkflowReport(raw:unknown,plan:Awaited<ReturnType<typeof planWorkflowJourney>>){
  const model=validateJourney(raw);if(plan.modelVersion!==model.version)throw Error('Workflow report model differs');let root=await realpath('.');const workspace=root;
  for(const part of ['artifacts','workflow-intelligence',model.version]){root=join(root,part);await mkdir(root,{recursive:true});const rel=relative(workspace,await realpath(root));if((await lstat(root)).isSymbolicLink()||!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Workflow output path denied');}
  const files={json:join(root,'report.json'),html:join(root,'index.html')};for(const file of Object.values(files))if(await lstat(file).then(s=>s.isSymbolicLink()).catch(()=>false))throw Error('Workflow output symlink denied');
  await writeFile(files.json,JSON.stringify({model,plan},null,2),{mode:0o600});await writeFile(files.html,`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Salesforce workflow review</title><style>body{font:16px system-ui;margin:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Workflow evidence and coverage review</h1><p>Proposals only. No execution, data or browser approval granted.</p><h2>Model</h2><pre>${esc({id:model.id,version:model.version,scope:model.scope,objects:model.objects,unknowns:model.unknowns})}</pre><h2>Impact and scenarios</h2><pre>${esc(plan.scenarios)}</pre><h2>Requirement coverage gaps</h2><pre>${esc(plan.gaps)}</pre><h2>Source traceability</h2><pre>${esc(plan.traceability)}</pre>`,{mode:0o600});return{...files,hash:fingerprint(plan),executionAuthorized:false};
}
