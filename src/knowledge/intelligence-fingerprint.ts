import { createHash } from 'node:crypto';
import type { OrgIntelligence } from '../agents/org-intelligence.js';
import { schemaFingerprint } from './snapshots.js';
function stable(value:unknown):unknown {
  if(Array.isArray(value))return value.map(stable); // Order within Flow assignments/conditions is meaningful.
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['observedAt','capturedAt','attributes'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,stable(v)]));
  return value;
}
export function intelligenceFingerprint(intel:OrgIntelligence) {
  const sections=intel.sections.map(s=>({area:s.area,status:s.status,source:s.source,records:s.records.map(stable).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash('sha256').update(JSON.stringify({schema:schemaFingerprint(intel.snapshot),sections})).digest('hex');
}
