import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {merge,filter}=require('../catalog.js');
const onet=[{key:'15-2051.00',soc:'15-2051',title:'Data Scientists',summary:'Analyze data',sector:'Technology & Data',jobZone:4,aliases:['Machine Learning Scientist']},{key:'15-2051.01',soc:'15-2051',title:'Clinical Data Scientist',summary:'Research clinical data',sector:'Technology & Data',jobZone:4}];
const curated=[{soc:'15-2051',title:'Data Scientists',sector:'Technology',summary:'Curated',programs:['Data Analytics (AAS)'],interest:'Investigative'}];
test('full catalog retains exact O*NET occupation identities; editorial pathway linked to base only',()=>{
  const rows=merge(onet,curated);assert.equal(rows.length,2);
  assert.equal(rows.find(c=>c.key==='15-2051.00').hasProgramMapping,true);
  assert.equal(rows.find(c=>c.key==='15-2051.01').hasProgramMapping,false);
  assert.equal(rows.find(c=>c.key==='15-2051.01').soc,'15-2051');
});
test('alternate job title, program and SOC search with filters',()=>{
  const rows=merge(onet,curated);
  assert.equal(filter(rows,{query:'learning scientist'}).length,1);
  assert.equal(filter(rows,{query:'15-2051.01'}).length,1);
  assert.equal(filter(rows,{programsOnly:true}).length,1);
  assert.equal(filter(rows,{zone:'3'}).length,0);
  assert.equal(filter(rows,{query:'data',zone:'4'}).length,2);
  assert.equal(filter(rows,{wageOnly:true,hasWage:code=>code==='15-2051'}).length,2);
});
test('deduplicates identical full O*NET codes',()=>{
  assert.equal(merge([...onet,onet[0]],curated).length,2);
});
