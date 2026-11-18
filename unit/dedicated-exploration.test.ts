import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { History } from '../src/core/history.js';
import { dedicatedFixture } from './support/dedicated.js';
import { exploreDedicatedOwned,geminiExplorationChooser,type DedicatedGuard } from '../src/execution/dedicated-browser.js';
import { GeminiChat } from '../src/ai/gemini.js';
test('bounded AI chooser receives opaque IDs only and explores verified owned pages under the real browser boundary',async()=>{
  await mkdir('.auth',{recursive:true});const root=await mkdtemp(resolve('.auth/dedicated-explore-')),state=join(root,'state.json'),h=new History(':memory:'),f=dedicatedFixture(h,'explore-owned');await writeFile(state,JSON.stringify({cookies:[],origins:[]}));
  try {await f.data.open(f.input.data,f.org);await f.data.setup(f.input.data);const owned=f.data.owned(f.input.data),workflows=f.input.ui.plan.workflows.map(raw=>{const w=structuredClone(raw),name=w.criterion==='AC-ACCOUNT'?f.input.data.plan.creates.Account.Name:f.input.data.plan.creates.Contact.LastName,id=owned.find(r=>r.object===(w.criterion==='AC-ACCOUNT'?'Account':'Contact'))!.id;w.path=w.path.replace(/\{\{record:(?:Account|Contact)\}\}/,id);w.assertion.text=name;w.assertion.locator.name=name;return w;});
    const guard:DedicatedGuard={policy:f.policy,identity:f.identity,origins:[f.browserOrigin],documents:workflows.map(w=>new URL(w.path,w.origin).href),owned:owned.map(r=>({id:r.id,object:r.object as 'Account'|'Contact'})),expiresAt:new Date(Date.now()+60000).toISOString()};let calls=0,verifications=0;
    const chooser=geminiExplorationChooser(new GeminiChat({apiKey:'mock-api-key',model:'mock-chat',retries:0},{fetch:async(_u,init)=>{calls++;const payload=JSON.parse(String(init?.body)),state=JSON.parse(payload.contents[0].parts[0].text);assert.ok(!JSON.stringify(payload).includes(f.identity.Id));assert.ok(!JSON.stringify(payload).includes(f.input.data.plan.creates.Account.Name));return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({actionId:state.availableActionIds.at(-1)})}]}}]}));}}));
    const report=await exploreDedicatedOwned({guard,workflows,statePath:state,maxSteps:2,maxActions:2,maxMs:20000,choose:chooser,verify:async(object,id)=>{verifications++;return f.data.verifyOwned(f.input.data,object,id);},prepareContext:async context=>{await context.route('**/*',route=>{const w=workflows.find(w=>new URL(w.path,w.origin).href===route.request().url());return w?route.fulfill({status:200,contentType:'text/html',body:`<h1>${w.assertion.text}</h1>`}):route.abort();});}});
    assert.equal(report.status,'passed');assert.equal(report.actions,2);assert.equal(calls,2);assert.equal(verifications,4);assert.deepEqual(report.observations.map(o=>o.actionId),['action-1','action-0']);assert.equal(f.writes.length,2);
    // Context/guard setup must finish before this negative test can exercise the
    // chooser. A one-second fixture budget sometimes skipped that branch entirely.
    // Keep the rejection assertion and runtime action/session limits unchanged.
    await assert.rejects(exploreDedicatedOwned({guard,workflows,statePath:state,maxSteps:1,maxActions:1,maxMs:20000,choose:async()=> 'delete-all-records',verify:async()=>{throw Error('must not verify unapproved action');}}),/unapproved/);
    await f.data.cleanup(f.input.data);f.data.finish(f.input.data);
  }finally{h.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
