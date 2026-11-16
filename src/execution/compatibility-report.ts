import {mkdir,writeFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import type {CompatibilityAnalysis} from './compatibility-analyzer.js';
import {recommendBrowserPolicy} from './policy-recommendations.js';
import {previewBrowserDebug,DebugManifestSchema} from './browser-debug.js';
import {z} from 'zod';
import {fingerprint} from './browser-policy.js';
const escape=(value:unknown)=>JSON.stringify(value,null,2).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const SideSchema=z.object({manifest:DebugManifestSchema,expectedPolicyHash:z.string().regex(/^[a-f0-9]{64}$/),traceHash:z.string().regex(/^[a-f0-9]{64}$/),consoleCategories:z.record(z.string().regex(/^[a-z-]{1,40}$/),z.number().int().min(0))}).strict();
export const VisualCorrelationSchema=z.object({normal:SideSchema,guarded:SideSchema}).strict();
export function correlateCompatibilityVisuals(analysis:CompatibilityAnalysis,raw?:unknown){
  if(!raw)return{status:'not-provided',temporalCausalityEstablished:false};const data=VisualCorrelationSchema.parse(raw);
  if(data.normal.traceHash!==analysis.sourceHashes[0]||data.guarded.traceHash!==analysis.sourceHashes[1]||(['normal','guarded'] as const).some(side=>data[side].manifest.policyHash!==data[side].expectedPolicyHash))throw Error('Visual manifest policy/trace differs');
  const side=(name:'normal'|'guarded')=>data[name].manifest.entries.map(entry=>({sequence:entry.sequence,reason:entry.reason,status:entry.status,elapsedMs:entry.elapsedMs,diagnostics:entry.diagnostics,blocked:entry.blocked,imageHash:entry.sha256,requestsCompletedByMilestone:analysis.timeline[name].every(e=>e.responseElapsedMs!==undefined)?analysis.timeline[name].filter(e=>e.responseElapsedMs!<=entry.elapsedMs).length:'unknown'}));
  return{status:'local-manifest-correlated',normal:side('normal'),guarded:side('guarded'),console:{normal:data.normal.consoleCategories,guarded:data.guarded.consoleCategories},imagesEmbedded:false,temporalCausalityEstablished:false,warning:'Historical manifest categories can differ from manual visual review; no retrospective relabeling.'};
}
export async function writeCompatibilityReport(analysis:CompatibilityAnalysis,visuals?:unknown){
  const {hash,...source}=analysis;z.string().regex(/^[a-f0-9]{64}$/).parse(hash);if(fingerprint(source)!==hash)throw Error('Compatibility analysis integrity failed');
  const workspace=await realpath('.');let root=workspace;for(const part of ['artifacts','compatibility',analysis.hash]){root=join(root,part);await mkdir(root,{recursive:true});const rel=relative(workspace,await realpath(root));if((await lstat(root)).isSymbolicLink()||!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Compatibility output escaped workspace');}
  const recommendations=recommendBrowserPolicy(analysis),correlation=correlateCompatibilityVisuals(analysis,visuals);let links='';
  if(visuals){const v=VisualCorrelationSchema.parse(visuals);for(const side of ['normal','guarded'] as const){const preview=await previewBrowserDebug(v[side].manifest.runId,v[side].manifest.sessionId);links+=`<p><a href="${relative(root,preview.preview).replaceAll('\\','/')}">${side} local screenshots</a></p>`;}}
  const payload={analysis,recommendations,correlation};
  for(const file of ['report.json','index.html'])if(await lstat(join(root,file)).then(s=>s.isSymbolicLink()).catch(()=>false))throw Error('Compatibility output symlink denied');
  await writeFile(join(root,'report.json'),JSON.stringify(payload,null,2),{mode:0o600});
  const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Lightning compatibility review</title><style>body{font:16px system-ui;margin:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}td,th{border:1px solid #aaa;padding:6px}table{border-collapse:collapse}</style><h1>Lightning compatibility review</h1><p>Suspected dependencies are not proven causes. No recommendation grants permission.</p><p>Analysis: ${analysis.hash}</p><p>Missing evidence: ${escape(analysis.incompleteEvidence)}</p><table><tr><th>Class</th><th>Normal count</th><th>Guarded count</th><th>Review explanation</th></tr>${analysis.findings.filter(f=>f.candidate).map(f=>`<tr><td>${escape(f.classification)}</td><td>${f.normalCount}</td><td>${f.guardedCount}</td><td>${escape(f.explanation)}<br>${f.key}</td></tr>`).join('')}</table><h2>Minimal review change set</h2><pre>${escape(recommendations)}</pre><h2>Visual milestones and console categories</h2><pre>${escape(correlation)}</pre><h2>Source-linked findings</h2><pre>${escape(analysis)}</pre>`;
  await writeFile(join(root,'index.html'),html+links,{mode:0o600});return{report:resolve(root,'index.html'),json:resolve(root,'report.json'),analysisHash:analysis.hash,permissionsGranted:0};
}
