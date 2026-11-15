import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserFixture} from './support/browser-policy.js';
import {digest} from '../src/execution/browser-policy.js';
import {BrowserTraceSchema,browserTraceScope,summarizeBrowserExchange} from '../src/execution/browser-trace.js';
import {correlateBrowserSources,reviewCachedBrowserSources} from '../src/execution/browser-source-review.js';

function fixture(){const b=browserFixture(),descriptor='serviceComponent://ui.force.components.controllers.recordGlobalValueProvider.RecordGvpController/ACTION$getRecord',entry=summarizeBrowserExchange({url:b.f.browserOrigin+'/aura',method:'POST',type:'xhr',body:b.body([{id:'1',descriptor,params:{recordDescriptor:'PRIVATE_RECORD_CANARY'}}])},0,undefined,{allow:false,kind:'denied',contracts:[],reason:'unknown-action-or-query'}),trace=BrowserTraceSchema.parse({version:1,scope:browserTraceScope(b.plan,b.plan.records),provenance:'framework-controlled',sourceHash:digest('fixture-trace'),identityVerified:true,entries:[entry],truncated:false,rawValuesRetained:false});return{b,descriptor,trace};}

test('source-backed blocked descriptor correlation never establishes parameter semantics, effects, causality or execution permission',()=>{
 const {b,descriptor,trace}=fixture();try{const body=Buffer.from(JSON.stringify({descriptor})),source={body,hash:digest(body),mime:'application/javascript'},report=correlateBrowserSources(b.approve(),trace,[source]);
  assert.equal(report.candidates.length,1);assert.equal(report.candidates[0].existingValidatorDescriptor,true);assert.equal(report.candidates[0].parameterShapeEstablished,false);assert.equal(report.candidates[0].serverEffects,'unknown');assert.equal(report.permissionsGranted,0);assert.equal(report.causalProof,false);assert.equal(report.externalAIRequests,0);assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
  assert.throws(()=>correlateBrowserSources(b.approve(),{...trace,scope:{...trace.scope,user:digest('other-user')}},[source]),/exact verified/);
  assert.throws(()=>correlateBrowserSources(b.approve(),trace,[{...source,hash:digest('tampered')}]),/integrity/);
  assert.throws(()=>reviewCachedBrowserSources(b.history,b.approve(),trace),/No reviewed/);
 }finally{b.history.close();}
});

test('bounded prefix review marks incomplete sources and cannot match descriptors beyond the approved inspection range',()=>{
 const {b,descriptor,trace}=fixture();try{b.plan.budgets.maxResourceBytes=8388608;const beyond=Buffer.from(' '.repeat(2000000)+JSON.stringify({descriptor})),report=correlateBrowserSources(b.approve(),trace,[{body:beyond,hash:digest(beyond),mime:'application/javascript'}]);assert.equal(report.inspectedBytes,2000000);assert.equal(report.partialSources,1);assert.equal(report.candidates.length,0);assert.equal(report.unresolvedActionHashes.length,1);
  const sources=Array.from({length:5},(_,n)=>{const body=Buffer.from(JSON.stringify({descriptor,n})+' '.repeat(2000000));return{body,hash:digest(body),mime:'application/javascript'};}),limited=correlateBrowserSources(b.approve(),trace,sources);assert.equal(limited.inspectedSources,4);assert.equal(limited.inspectedBytes,8000000);assert.equal(limited.skippedSources,1);assert.equal(limited.candidates[0].serverEffects,'unknown');
 }finally{b.history.close();}
});
