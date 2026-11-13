import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const {correlation, findMatches, labelFor}=require('../interest_match.js');
const person={realistic:10,investigative:29,artistic:23,social:4,enterprising:9,conventional:12};
const similar={realistic:2,investigative:7,artistic:5,social:1,enterprising:2,conventional:3};
const unlike={realistic:7,investigative:1,artistic:2,social:5,enterprising:7,conventional:4};
test('matching identical six-area shape yields correlation near one',()=>{
  assert.ok(correlation(person,similar)>.95);
});
test('reversed interests score lower',()=>{
  assert.ok(correlation(person,similar)>correlation(person,unlike));
});
test('missing or constant profiles are never treated as matches',()=>{
  assert.equal(correlation(person,{realistic:4}),null);
  assert.equal(correlation({realistic:3,investigative:3,artistic:3,social:3,enterprising:3,conventional:3},similar),null);
  assert.equal(correlation(person,Object.fromEntries(Object.keys(person).map(k=>[k,5]))),null);
});
test('scores cannot bypass validation',()=>{
  assert.equal(correlation({...person,artistic:999},similar),null);
});
test('locally ranked matches are stable, and missing occupational interest data are not inferred',()=>{
  const careers=[{key:'15-2051.00',title:'Data Scientists',interestProfile:similar},
    {key:'11-1011.00',title:'Chief Executives',interestProfile:unlike},
    {key:'17-1022.00',title:'Other occupation without profile'}];
  const matches=findMatches(person,careers);
  assert.equal(matches[0].code,'15-2051.00');
  assert.ok(matches.every(m=>m.code!=='17-1022.00'));
  assert.equal(matches[0].fit,labelFor(matches[0].score));
});
