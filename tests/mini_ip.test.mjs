import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const mini=require('../mini_ip.js');
const bank={questions:Array.from({length:30},(_,i)=>({index:i+1,area:mini.AREAS[i%6],text:'Test activity '+(i+1)}))};
test('validates exact 30-item RIASEC question bank',()=>{
  assert.equal(mini.validateBank(bank),true);
  assert.equal(mini.validateBank({...bank,questions:bank.questions.slice(1)}),false);
  assert.equal(mini.validateBank({...bank,questions:bank.questions.map(q=>q.index===2?{...q,index:1}:q)}),false);
});
test('scores five 1–5 answers in each area',()=>{
  assert.deepEqual(mini.score(bank,Array(30).fill(5)),Object.fromEntries(mini.AREAS.map(k=>[k,20])));
  assert.deepEqual(mini.score(bank,Array(30).fill(1)),Object.fromEntries(mini.AREAS.map(k=>[k,0])));
});
test('never substitutes missing answers',()=>{
  assert.throws(()=>mini.score(bank,Array(30).fill(null)));
  assert.throws(()=>mini.score(bank,Array(29).fill(5)));
});
