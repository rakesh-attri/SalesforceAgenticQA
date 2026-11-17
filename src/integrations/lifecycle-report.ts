import {readFile,writeFile,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {reportingOutput} from './reporting-labs-reporter.js';
import {environmentSecrets,redactModelValue} from '../ai/privacy.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const inside=(root:string,path:string)=>{const rel=relative(root,path);return !!rel&&!rel.startsWith('..')&&!isAbsolute(rel);};

// reportingLabs emits its actual Playwright report before owned cleanup runs.
// Add a local framework appendix only AFTER cleanup; never manufacture vendor
// test rows or call an undocumented reporting API. The native report is retained.
export async function appendLifecycleReport(html:string,summary:unknown,evidence:string[]){
 const folder=reportingOutput(resolve(html,'..')),target=await realpath(html),actualFolder=await realpath(folder);
 if(!inside(actualFolder,target)||relative(actualFolder,target)!=='index.html')throw Error('Contained reportingLabs index required');
 const original=await readFile(target,'utf8');if(original.length>25000000)throw Error('Reporting HTML exceeds local limit');
 const safe=redactModelValue(summary,environmentSecrets()),serialized=JSON.stringify(safe,null,2);if(serialized.length>262144)throw Error('Lifecycle summary exceeds local limit');
 const images=[];for(const path of [...new Set(evidence)].filter(p=>/\.png$/i.test(p)).slice(0,16)){
  const image=await realpath(path),roots=await Promise.all(['artifacts','.state'].map(p=>realpath(p)));if(!roots.some(root=>inside(root,image)))throw Error('Screenshot escaped private runtime roots');
  images.push({path:relative(actualFolder,image).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(image)).digest('hex')});
 }
 const payload={version:1,kind:'actual-lifecycle-appendix',nativeHtmlHash:hash(original),summary:safe,images},payloadText=JSON.stringify(payload,null,2),payloadHash=hash(payloadText),end=original.lastIndexOf('</body>');
 if(end<0||original.includes('id="sfqa-lifecycle-evidence"'))throw Error('Expected unmodified reportingLabs document required');
 const section=`<section id="sfqa-lifecycle-evidence" style="margin:2rem;padding:1rem;border:1px solid #888"><h2>SalesforceAgenticQA lifecycle evidence</h2><p>Actual Playwright rows above are distinct from API verification, cleanup and reviewed learning. This local appendix records the completed lifecycle outcome.</p><pre style="white-space:pre-wrap">${escape(serialized)}</pre><p>Evidence hash: ${payloadHash}</p><a href="sfqa-lifecycle.json">Lifecycle evidence JSON</a>${images.map(image=>`<p><a href="${escape(image.path.split('/').map(encodeURIComponent).join('/'))}">Local masked screenshot</a> (${image.sha256})</p>`).join('')}</section>`;
 await writeFile(join(folder,'sfqa-lifecycle.json'),payloadText,{flag:'wx'});await writeFile(target,original.slice(0,end)+section+original.slice(end));
 return{status:'attached' as const,html:target,json:join(folder,'sfqa-lifecycle.json'),hash:payloadHash,nativeHtmlHash:payload.nativeHtmlHash};
}
