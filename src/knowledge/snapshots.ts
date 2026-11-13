import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OrgSnapshotSchema, type OrgSnapshot } from '../core/types.js';
export function snapshotVersion(snapshot:OrgSnapshot):string {
  return createHash('sha256').update(JSON.stringify(OrgSnapshotSchema.parse(snapshot))).digest('hex');
}
export function schemaFingerprint(snapshot:OrgSnapshot):string {
  const parsed=OrgSnapshotSchema.parse(snapshot);
  const objects=[...parsed.objects].sort((a,b)=>a.name.localeCompare(b.name)).map(o=>({...o,fields:[...o.fields].sort((a,b)=>a.name.localeCompare(b.name))}));
  return createHash('sha256').update(JSON.stringify({orgAlias:parsed.orgAlias,source:parsed.source,objects})).digest('hex');
}
export function diffSnapshots(before:OrgSnapshot,after:OrgSnapshot) {
  if(before.orgAlias!==after.orgAlias || before.source!==after.source) throw Error('Cannot compare snapshots across orgs or source types');
  const left=new Map(before.objects.map(o=>[o.name,o]));
  const right=new Map(after.objects.map(o=>[o.name,o]));
  return {before:snapshotVersion(before),after:snapshotVersion(after),
    added:[...right.keys()].filter(n=>!left.has(n)).sort(),
    removed:[...left.keys()].filter(n=>!right.has(n)).sort(),
    changed:[...left.keys()].filter(n=>right.has(n) && JSON.stringify(left.get(n))!==JSON.stringify(right.get(n))).sort()};
}
export class SnapshotStore {
  constructor(private root='.state/snapshots'){}
  async save(value:OrgSnapshot) {
    const snapshot=OrgSnapshotSchema.parse(value),version=snapshotVersion(snapshot);
    await mkdir(this.root,{recursive:true});
    await writeFile(join(this.root,`${version}.json`),JSON.stringify(snapshot,null,2),{flag:'wx'}).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='EEXIST') throw e;});
    return version;
  }
  async read(version:string) {
    if(!/^[a-f0-9]{64}$/.test(version)) throw Error('Invalid snapshot version');
    const snapshot=OrgSnapshotSchema.parse(JSON.parse(await readFile(join(this.root,`${version}.json`),'utf8')));
    if(snapshotVersion(snapshot)!==version) throw Error('Snapshot integrity failure');
    return snapshot;
  }
}
