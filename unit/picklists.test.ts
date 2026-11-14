import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRecordTypePicklists } from '../src/salesforce/picklists.js';
test('UI API picklists retain exact record type, source, controllers and dependent values without global fallbacks',async()=>{
  const paths:string[]=[],client={apiVersion:'v62.0',async get<T>(path:string){paths.push(path);return {picklistFieldValues:{Industry:{controllerValues:{Business:0},defaultValue:null,values:[{label:'Technology',value:'Technology',validFor:[0]}]}}} as T;}};
  const result=await readRecordTypePicklists(client,'Account','012000000000001');assert.equal(result.object,'Account');assert.equal(result.recordTypeId,'012000000000001');assert.deepEqual(result.picklistFieldValues.Industry.values[0].validFor,[0]);assert.equal(paths[0],result.source);assert.ok(paths[0].includes('/ui-api/object-info/Account/picklist-values/012000000000001'));
  for(const [object,id] of [['Account;delete','012000000000001'],['Account','001000000000001'],['Account','../012000000000001']])await assert.rejects(readRecordTypePicklists(client,object,id));assert.equal(paths.length,1);
});
test('denied and malformed record-type picklists remain unknown to callers',async()=>{
  await assert.rejects(readRecordTypePicklists({apiVersion:'v62.0',async get(){throw Error('denied');}},'Account','012000000000001'));
  await assert.rejects(readRecordTypePicklists({apiVersion:'v62.0',async get<T>(){return {picklistFieldValues:{Industry:{controllerValues:{},values:[{label:'Bad',value:1}]}}} as T;}},'Account','012000000000001'));
});
