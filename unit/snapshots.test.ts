import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SnapshotStore, diffSnapshots,schemaFingerprint } from '../src/knowledge/snapshots.js';
import type { OrgSnapshot } from '../src/core/types.js';
test('versioned snapshots roundtrip, detect tampering and reject traversal',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sfqa-'));
  try {
    const store=new SnapshotStore(root),snap:OrgSnapshot={orgAlias:'fixture',observedAt:'2026-11-13',source:'fixture',objects:[]};
    const version=await store.save(snap);
    assert.equal(await store.save(snap),version);
    assert.deepEqual(await store.read(version),snap);
    await assert.rejects(store.read('../secret'));
    await writeFile(join(root,`${version}.json`),JSON.stringify({...snap,orgAlias:'other'}));
    await assert.rejects(store.read(version),/integrity/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('snapshot differences identify changed objects and reject cross-org comparisons',()=>{
  const snap:OrgSnapshot={orgAlias:'fixture',observedAt:'2026-11-13',source:'fixture',objects:[]};
  assert.deepEqual(diffSnapshots(snap,{...snap,objects:[{name:'Account',label:'Account',createable:true,fields:[]}]}).added,['Account']);
  assert.throws(()=>diffSnapshots(snap,{...snap,orgAlias:'another'}));
});
test('knowledge schema fingerprints ignore capture time but detect actual field changes',()=>{
  const snap:OrgSnapshot={orgAlias:'fixture',source:'fixture',observedAt:'first',objects:[{name:'Account',label:'Account',createable:true,fields:[]}]};
  assert.equal(schemaFingerprint(snap),schemaFingerprint({...snap,observedAt:'later'}));
  assert.notEqual(schemaFingerprint(snap),schemaFingerprint({...snap,objects:[]}));
});
