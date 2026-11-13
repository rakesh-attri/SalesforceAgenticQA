import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecipeRegistry } from '../src/agents/recipe-registry.js';
import type { OrgSnapshot } from '../src/core/types.js';
import { snapshotVersion } from '../src/knowledge/snapshots.js';
const org:OrgSnapshot={orgAlias:'fixture',source:'fixture',observedAt:'2026-11-13',objects:[{name:'Account',label:'Account',createable:true,fields:[{name:'Name',type:'string',createable:true,nillable:false}]}]};
const version=snapshotVersion(org);
const recipe={id:'account-v1',object:'Account',version:'1',orgAlias:'fixture',sourceVersion:version,reviewedBy:'fixture-reviewer',evidence:['fixture:Account'],mode:'api',fields:{Name:{kind:'synthetic',type:'string'}}};
test('recipes bind review provenance to a discovered org version without authorizing writes',()=>{
  const registry=new RecipeRegistry();registry.register(recipe);
  assert.equal(registry.propose(recipe.id,org,version).status,'proposed');
  assert.equal(registry.propose(recipe.id,org,version).approved,false);
  assert.equal(registry.propose(recipe.id,org,'a'.repeat(64)).status,'blocked');
  assert.equal(registry.propose(recipe.id,{...org,observedAt:'later'},version).status,'blocked');
  assert.throws(()=>registry.register(recipe),/Duplicate/);
});
test('recipes reject missing required values, fabricated fields and mismatched types',()=>{
  for(const fields of [{},{Name:{kind:'synthetic',type:'boolean'}},{Fake:{kind:'synthetic',type:'string'}}]) {
    const registry=new RecipeRegistry();registry.register({...recipe,fields});
    assert.equal(registry.propose(recipe.id,org,version).status,'blocked');
  }
});
