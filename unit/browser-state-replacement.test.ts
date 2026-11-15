import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserFixture} from './support/browser-policy.js';
import {browserPlanHash,digest,registerBrowserStateReplacement,reserveBrowserSession} from '../src/execution/browser-policy.js';

test('explicit observation-state replacement retires old source, preserves expiry and shares remaining sessions across hashes',()=>{
 const b=browserFixture();try{
  const previous=structuredClone(b.approve()),replacement=structuredClone(previous);replacement.plan.sessionStateHash=digest('fresh independently approved state');replacement.approval.hash=browserPlanHash(replacement.plan);
  reserveBrowserSession(previous,b.history,'first-source-session');
  const report=registerBrowserStateReplacement(previous,replacement,b.history,b.f.policy,b.f.identity,b.build);
  assert.equal(report.remainingSessions,1);assert.equal(report.permissionsChanged,false);assert.equal(report.expiresAt,previous.approval.expiresAt);
  assert.throws(()=>reserveBrowserSession(previous,b.history,'old-replay'),/superseded/);
  reserveBrowserSession(replacement,b.history,'replacement-session');assert.throws(()=>reserveBrowserSession(replacement,b.history,'extra-session'),/budget exhausted/);
  assert.throws(()=>registerBrowserStateReplacement(previous,replacement,b.history,b.f.policy,b.f.identity,b.build),/replay|budget/);
  assert.equal(b.history.db.prepare('SELECT COUNT(*) AS count FROM browser_execution_sessions').get()?.count,2);
 }finally{b.history.close();}
});

test('replacement cannot renew expiry, widen resources/records/actions, change operator, use another org or bypass named approval',()=>{
 const b=browserFixture();try{
  const previous=structuredClone(b.approve()),replacement=structuredClone(previous);replacement.plan.sessionStateHash=digest('fresh source');replacement.approval.hash=browserPlanHash(replacement.plan);
  for(const change of [
   (r:typeof replacement)=>{r.approval.expiresAt=new Date(Date.parse(r.approval.expiresAt)+1000).toISOString();},
   (r:typeof replacement)=>{r.approval.operator='REVIEW_REQUIRED';},
   (r:typeof replacement)=>{r.plan.resources[0].queryKeys.push('newPermission');r.approval.hash=browserPlanHash(r.plan);},
   (r:typeof replacement)=>{r.plan.records[0].id='001999999999999';r.approval.hash=browserPlanHash(r.plan);},
   (r:typeof replacement)=>{r.plan.budgets.sessions++;r.approval.hash=browserPlanHash(r.plan);},
   (r:typeof replacement)=>{r.plan.budgets.actions++;r.approval.hash=browserPlanHash(r.plan);},
  ]){const changed=structuredClone(replacement);change(changed);assert.throws(()=>registerBrowserStateReplacement(previous,changed,b.history,b.f.policy,b.f.identity,b.build));}
  assert.throws(()=>registerBrowserStateReplacement(previous,replacement,b.history,b.f.policy,{...b.f.identity,Id:'00D999999999999'},b.build));
  const report=registerBrowserStateReplacement(previous,replacement,b.history,b.f.policy,b.f.identity,b.build);assert.equal(report.remainingSessions,2);
 }finally{b.history.close();}
});

test('pre-lineage session history is counted and successive state refreshes cannot reset two-session authorization',()=>{
 const b=browserFixture();try{
  const first=structuredClone(b.approve()),second=structuredClone(first),third=structuredClone(first);
  second.plan.sessionStateHash=digest('second state');second.approval.hash=browserPlanHash(second.plan);third.plan.sessionStateHash=digest('third state');third.approval.hash=browserPlanHash(third.plan);
  b.history.db.exec('CREATE TABLE browser_execution_sessions(policy TEXT,nonce TEXT UNIQUE,status TEXT,PRIMARY KEY(policy,nonce))');
  b.history.db.prepare("INSERT INTO browser_execution_sessions VALUES(?,?,'observed')").run(browserPlanHash(first.plan),'legacy-session');
  registerBrowserStateReplacement(first,second,b.history,b.f.policy,b.f.identity,b.build);
  assert.equal(registerBrowserStateReplacement(second,third,b.history,b.f.policy,b.f.identity,b.build).remainingSessions,1);
  reserveBrowserSession(third,b.history,'last-session');assert.throws(()=>reserveBrowserSession(third,b.history,'over-budget'),/exhausted/);
  assert.throws(()=>reserveBrowserSession(second,b.history,'retired-second'),/superseded/);
 }finally{b.history.close();}
});
