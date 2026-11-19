import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import { History } from '../src/core/history.js';
import { browserFixture } from './support/browser-policy.js';
import { prepareDedicatedChromeReview } from '../src/execution/dedicated-chrome-review.js';
import { LightningViewSchema, lightningViewHash } from '../src/execution/lightning-view.js';
import { recordLightningReadiness, requireLightningReadiness } from '../src/execution/lightning-proof.js';
import { browserPlanHash, fingerprint, digest } from '../src/execution/browser-policy.js';
import { prepareLifecycleReview, auditLifecycleReview, type LifecycleSource } from '../src/execution/lifecycle-review.js';
import { runLifecycleReviewCommand } from '../src/execution/lifecycle-review-cli.js';
import { dedicatedUiHash } from '../src/execution/dedicated-browser.js';
import { installDedicatedGuardFile } from '../src/execution/browser-guard.js';

function fixture(h = new History(':memory:')) {
  const b = browserFixture(h), sources: LifecycleSource[] = [];
  for (const object of ['Account','Contact'] as const) {
    const view = LightningViewSchema.parse({ version:1,object,sourceVersion:b.plan.sourceVersion,buildHash:b.plan.buildHash,appHash:b.plan.appHash,reviewer:b.f.policy.approval.operator,evidenceHash:digest('fixture-reviewed-'+object),recordName:object==='Account'?{by:'role',value:'heading',name:'{{record-name}}'}:{by:'text',value:'{{record-name}}'},content:['Related','Details'].map(name=>({by:'role',value:'tab',name})),busy:[],faults:[],stableMs:1000 });
    const base = b.approve(); base.plan = structuredClone(base.plan); base.plan.records=[{object,id:object==='Account'?b.recordId:'003000000000001',purpose:'observation-only'}];base.plan.objects=[object];if(object==='Contact')base.plan.referenceDisplayFields={Contact:'Name'};base.approval.hash=browserPlanHash(base.plan);
    const {review}=prepareDedicatedChromeReview(base,{runId:'historical-'+object,stateHash:b.plan.sessionStateHash,view});review.approval.operator=b.f.policy.approval.operator;
    const proof = recordLightningReadiness(h,review,{status:'rendered-reviewed-view',object,nativeDocumentVerified:true,independentReferenceUnchanged:true,validation:'offline-mocked-salesforce',measuredAt:new Date().toISOString(),profileVerified:true});
    const row=h.db.prepare('SELECT payload FROM lightning_readiness WHERE hash=?').get(proof.hash)!;
    const stale=JSON.parse(String(row.payload));stale.measuredAt=new Date(Date.now()-86400000).toISOString();stale.expiresAt=new Date(Date.now()-85500000).toISOString();const hash=fingerprint(stale);
    h.db.prepare('UPDATE lightning_readiness SET hash=?,payload=? WHERE hash=?').run(hash,JSON.stringify(stale),proof.hash);
    sources.push({review,view,report:{policyHash:review.approval.hash,readinessProof:{hash},referenceUnchanged:true,validation:'offline-mocked-salesforce'},journal:h});
  }
  const input={runId:'fresh-review-'+randomUUID(),operator:b.f.policy.approval.operator,stateHash:b.plan.sessionStateHash,policy:b.f.policy,org:b.f.org,spec:b.f.input.spec,guardModule:resolve('src/execution/browser-guard.ts').replaceAll('\\','/'),guardConfig:resolve('.state/unapproved-lifecycle-guard.json').replaceAll('\\','/')};
  return {b,h,input,sources};
}

test('inactive review uses journal-backed stale provenance but copies no runtime authority or ownership',()=>{
  const f=fixture();try{const bundle=prepareLifecycleReview(f.input,f.sources,f.h),audit=auditLifecycleReview(bundle,f.input,f.sources,f.h);
    assert.equal(audit.status,'PASS');assert.equal(audit.execution,'BLOCKED');assert.equal(audit.runtimeReadinessEstablished,false);assert.equal(bundle.browser.plan.liveReadinessProofHash,undefined);assert.deepEqual(bundle.browser.plan.records,[]);assert.equal(bundle.execution.ui.plan.publishVerifiedExecutionLesson,false);assert.equal(bundle.execution.ui.plan.contactDisplay,'name-equals-synthetic-lastname');assert.equal(bundle.browser.plan.budgets.sessions,4);assert.equal(f.b.f.writes.length,0);assert.equal(f.h.db.prepare('SELECT COUNT(*) AS n FROM dedicated_runs').get()!.n,0);
    const account=bundle.execution.ui.plan.workflows.find(w=>w.path.includes('/Account/'))!,contact=bundle.execution.ui.plan.workflows.find(w=>w.path.includes('/Contact/'))!;
    assert.equal(account.assertion.text,'{{synthetic:Account.Name}}');assert.equal(contact.assertion.text,'{{synthetic:Contact.LastName}}');assert.equal(contact.assertion.locator.by,'text');assert.ok(bundle.proposals.every(p=>p.code.includes('toHaveCount(1)')&&p.code.includes('toBeVisible()')&&!p.code.includes('.click(')));
    assert.throws(()=>requireLightningReadiness(f.h,{...bundle.browser,approval:{...bundle.browser.approval,operator:f.input.operator}},'offline-mocked-salesforce'),/prior rendered Account proof/);
    const stale=(f.sources[0].report as any).readinessProof.hash;assert.throws(()=>requireLightningReadiness(f.h,{...bundle.browser,plan:{...bundle.browser.plan,liveReadinessProofHash:stale},approval:{...bundle.browser.approval,operator:f.input.operator}},'offline-mocked-salesforce'),/expired/);
    bundle.manifest.operations.push('delete-existing-records');assert.throws(()=>auditLifecycleReview(bundle,f.input,f.sources,f.h),/Unsupported operation/);assert.ok(!prepareLifecycleReview(f.input,f.sources,f.h).manifest.operations.includes('delete-existing-records'));
  }finally{f.h.close();}
});
test('all ordinary modes, another org/user and missing journal evidence are rejected before preparation',()=>{
  const f=fixture();try{for(const mode of ['SANDBOX_QA','PRODUCTION_READ_ONLY_QA','PRODUCTION_CONTROLLED_QA'] as const)assert.throws(()=>prepareLifecycleReview({...f.input,policy:{...f.input.policy,mode}},f.sources,f.h));
    for(const key of ['orgId','userId'] as const){const sources=f.sources.map(s=>({...s,review:structuredClone(s.review)}));(sources[0].review as any).plan[key]=key==='orgId'?'00D999999999999':'005999999999999';assert.throws(()=>prepareLifecycleReview(f.input,sources,f.h));}
    assert.throws(()=>prepareLifecycleReview(f.input,[{...f.sources[0],report:{}},f.sources[1]],f.h),/Journaled/);
    assert.throws(()=>prepareLifecycleReview(f.input,[f.sources[0],f.sources[0]],f.h),/one Contact|Account and one Contact/i);
  }finally{f.h.close();}
});
test('changed synthetic payloads, original expectations, locators, source provenance and proposal code cannot pass audit',()=>{
  const f=fixture();try{const bundle=prepareLifecycleReview(f.input,f.sources,f.h);
    const alterations=[(p:typeof bundle)=>{p.execution.data.plan.creates.Account.Name='foreign';},(p:typeof bundle)=>{p.execution.ui.plan.workflows[1].assertion.text='different expectation';p.execution.ui.approval.hash=dedicatedUiHash(p.execution.ui.plan);},(p:typeof bundle)=>{p.execution.ui.plan.workflows[1].assertion.locator={by:'role',value:'heading'};},(p:typeof bundle)=>{p.proposals[0].code=p.proposals[0].code.replace('toHaveText','toContainText');p.manifest.hashes.proposals[0].hash=digest(p.proposals[0].code);},(p:typeof bundle)=>{p.provenance[0].runtimeAuthority=true as false;p.manifest.hashes.provenance=fingerprint(p.provenance);},(p:typeof bundle)=>{p.browser.plan.records=[{object:'Account',id:f.b.recordId,purpose:'owned-run'}];},(p:typeof bundle)=>{p.browser.plan.budgets.actions=1;},(p:typeof bundle)=>{p.profile.approval.operator=f.input.operator;},(p:typeof bundle)=>{p.manifest.originalDraftExpiry=new Date(Date.parse(p.manifest.originalDraftExpiry)+3600000).toISOString();}];
    for(const change of alterations){const copy=structuredClone(bundle);change(copy);assert.throws(()=>auditLifecycleReview(copy,f.input,f.sources,f.h));}
    for(const key of ['reviewer','content-source']){const copy=structuredClone(bundle);if(key==='reviewer')copy.execution.ui.plan.workflows[0].reviewer='foreign-reviewer';else copy.execution.ui.plan.workflows[0].contentAssertions![0].source='unverified-source';copy.execution.ui.approval.hash=dedicatedUiHash(copy.execution.ui.plan);assert.throws(()=>auditLifecycleReview(copy,f.input,f.sources,f.h),/reviewer or content evidence/);}
  }finally{f.h.close();}
});
test('unknown required fields, changed relationships and reserved run IDs prevent a new factory review',()=>{
  const f=fixture();try{const required=structuredClone(f.input);required.org.objects[0].fields.push({name:'BusinessRequired__c',type:'string',createable:true,nillable:false});assert.throws(()=>prepareLifecycleReview(required,f.sources,f.h),/saved automation\/source binding/);
    const relationship=structuredClone(f.input);relationship.org.objects.find(o=>o.name==='Contact')!.fields.find(v=>v.name==='AccountId')!.referenceTo=['Opportunity'];assert.throws(()=>prepareLifecycleReview(relationship,f.sources,f.h));
    const plan=f.b.f.input.data.plan;f.h.db.prepare('INSERT INTO dedicated_runs VALUES(?,?,?,?,?,?,?)').run(plan.orgId,plan.userId,f.input.runId,JSON.stringify(plan),digest('prior'),'complete',Date.now());assert.throws(()=>prepareLifecycleReview(f.input,f.sources,f.h),/reserved/);
  }finally{f.h.close();}
});
test('generated inactive guard rejects before journal access, JWT, browser or provider traffic',async()=>{
  await mkdir('.state',{recursive:true});const root=await mkdtemp(resolve('.state/unapproved-review-')),f=fixture(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No external calls permitted');};
  try{const bundle=prepareLifecycleReview(f.input,f.sources,f.h),file=join(root,'guard.json');await writeFile(file,JSON.stringify({review:bundle.browser,parent:bundle.policy,statePath:'.auth/not-opened.json',ownershipJournal:join(root,'must-not-open.sqlite')}));await assert.rejects(installDedicatedGuardFile({} as BrowserContext,file),/Exact named/);assert.equal(calls,0);await assert.rejects(readFile(join(root,'must-not-open.sqlite')),/ENOENT/);
  }finally{globalThis.fetch=original;f.h.close();const rel=relative(resolve('.state'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
test('CLI preparation reopens and hashes actual proposal artifacts, never activates or renews the same package',async()=>{
  await mkdir('.state',{recursive:true});await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.state/lifecycle-input-')),auth=await mkdtemp(resolve('.auth/lifecycle-input-')),journal=join(root,'history.sqlite'),f=fixture(new History(journal)),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Offline only');};
  let packageRoot='';try{const save=async(name:string,value:unknown)=>{const path=join(root,name+'.json');await writeFile(path,JSON.stringify(value));return path;};const sources=[];for(const [i,s]of f.sources.entries())sources.push({review:await save('review'+i,s.review),view:await save('view'+i,s.view),report:await save('report'+i,s.report),journal});
    const statePath=join(auth,'state.json');await writeFile(statePath,JSON.stringify({cookies:[],origins:[]}));const config=await save('input',{runId:f.input.runId,operator:f.input.operator,policy:await save('policy',f.input.policy),org:await save('org',f.input.org),spec:await save('spec',f.input.spec),statePath,ownershipJournal:journal,sources});
    const prepared=await runLifecycleReviewCommand('prepare',config);packageRoot=prepared.root;assert.equal(prepared.execution,'BLOCKED');assert.equal(prepared.newServiceCalls,0);const checked=await runLifecycleReviewCommand('check',config);assert.equal('status'in checked?checked.status:undefined,'PASS');assert.equal(calls,0);await assert.rejects(runLifecycleReviewCommand('prepare',config),/EEXIST/);
    const proposal=join(packageRoot,'dedicated-contact-view.proposal.spec.ts');await writeFile(proposal,(await readFile(proposal,'utf8')).replace('toHaveText','toContainText'));await assert.rejects(runLifecycleReviewCommand('check',config),/artifact changed/);
  }finally{globalThis.fetch=original;f.h.close();if(packageRoot){const integrity=resolve(packageRoot+'.integrity.json'),rel=relative(resolve('.state'),integrity);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(integrity,{force:true});}for(const [parent,path]of [[resolve('.state'),root],[resolve('.auth'),auth],...(packageRoot?[[resolve('.state'),resolve(packageRoot)]]:[])]){const rel=relative(parent,path);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(path,{recursive:true,force:true,maxRetries:8,retryDelay:100});}}
});
