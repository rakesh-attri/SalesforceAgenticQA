import {mkdir,writeFile,realpath,lstat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {fingerprint} from '../execution/browser-policy.js';
import type {TestDesign} from './test-design.js';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function writeTestDesignReport(design:TestDesign&{ai?:unknown}){
 const workspace=await realpath('.'),hash=fingerprint(design);let root=workspace;
 for(const part of ['artifacts','test-design',hash]){root=join(root,part);await mkdir(root,{recursive:true});const rel=relative(workspace,await realpath(root));if((await lstat(root)).isSymbolicLink()||!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Design output escaped workspace');}
 const files={json:join(root,'report.json'),html:join(root,'index.html')},outputs=[...Object.values(files),...design.files.map(f=>join(root,`${f.id}.${f.kind==='playwright-typescript'?'proposal.spec.ts':'api.proposal.ts'}`))];
 if(design.files.some(f=>!/^[A-Za-z0-9_-]{1,180}$/.test(f.id)))throw Error('Invalid proposal filename');
 for(const file of outputs)if(await lstat(file).then(s=>s.isSymbolicLink()).catch(()=>false))throw Error('Design output symlink denied');
 const rows=design.scenarios.map(s=>`<tr><td>${esc(s.id)}</td><td>${esc(s.kind)}</td><td>${s.score}${s.mandatory?' / confirmed-history':''}</td><td>${esc(s.status)}</td><td>${esc(s.expected)}</td><td>${esc(s.prerequisites.join('; '))}</td><td>${esc(s.reasons.join('; '))}</td></tr>`).join(''),section=(title:string,value:unknown)=>`<h2>${title}</h2><pre>${esc(JSON.stringify(value,null,2))}</pre>`;
 await writeFile(files.json,JSON.stringify(design,null,2),{mode:0o600});
 await writeFile(files.html,`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Salesforce test design</title><style>body{font:15px system-ui;margin:24px}td,th{border:1px solid #bbb;padding:8px;vertical-align:top}table{border-collapse:collapse;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Salesforce autonomous test-design review</h1><p>Local proposals only. No live Salesforce operations, execution, data, browser or policy permission granted.</p>${section('Requirement coverage',design.coverage)}<h2>Risk-ranked scenarios</h2><table><thead><tr><th>Test</th><th>Kind</th><th>Risk</th><th>Review status</th><th>Expected result</th><th>Prerequisites</th><th>Review questions</th></tr></thead><tbody>${rows}</tbody></table>${section('Business conditions and actors',design.analysis)}${section('Impact paths and uncertainty',design.impact)}${section('Contradictions',design.contradictions)}${section('Missing business evidence',design.questions)}${section('Traceability and test data requirements',design.traceability)}${section('Scoped retrieval and confirmed history',design.retrieval)}${section('Proposed AI advice',design.ai??{status:'not-requested'})+section('Application component evidence',design.application)}`,{mode:0o600});
 for(const file of design.files)await writeFile(join(root,`${file.id}.${file.kind==='playwright-typescript'?'proposal.spec.ts':'api.proposal.ts'}`),file.code,{mode:0o600});
 return{...files,hash,proposals:design.files.length,executionAuthorized:false};
}
