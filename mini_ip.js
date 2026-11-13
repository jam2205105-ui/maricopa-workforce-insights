/* Local Mini-IP activity scoring. Questions come from O*NET Web Services.
 * Scores are exploratory local totals, not official O*NET Web Services fit ratings.
 */
'use strict';
(function(root){
  const AREAS=['realistic','investigative','artistic','social','enterprising','conventional'];
  const CHOICES=['Strongly dislike','Dislike','Unsure','Like','Strongly like'];
  function validateBank(bank){
    if(!bank||!Array.isArray(bank.questions)||bank.questions.length!==30)return false;
    const counts=Object.fromEntries(AREAS.map(k=>[k,0])),indices=new Set();
    for(const q of bank.questions){
      if(!Number.isInteger(q.index)||q.index<1||q.index>30||indices.has(q.index)||!AREAS.includes(q.area)||typeof q.text!=='string'||!q.text.trim())return false;
      counts[q.area]++;indices.add(q.index);
    }
    return AREAS.every(k=>counts[k]===5);
  }
  function score(bank,answers){
    if(!validateBank(bank)||!Array.isArray(answers)||answers.length!==30)throw new Error('A complete 30-question assessment is required.');
    const scores=Object.fromEntries(AREAS.map(k=>[k,0]));
    for(const q of bank.questions){
      const n=answers[q.index-1];
      if(!Number.isInteger(n)||n<1||n>5)throw new Error('Answer all 30 questions to see results.');
      scores[q.area]+=n-1;
    }
    return scores;
  }
  const api={AREAS,CHOICES,validateBank,score};
  root.LmiMiniIP=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
