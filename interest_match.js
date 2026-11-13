/* Local, exploratory RIASEC profile comparison on O*NET public occupational data.
 * Not an implementation of official O*NET Web Services fit ratings or questionnaire.
 * Inspired by pattern comparison documented in the O*NET Interest Profiler Manual.
 */
'use strict';
(function(root){
  const AREAS=['realistic','investigative','artistic','social','enterprising','conventional'];
  function correlation(person, occupation){
    const p=AREAS.map(k=>Number(person?.[k])), o=AREAS.map(k=>Number(occupation?.[k]));
    if(p.some(x=>!Number.isFinite(x)||x<0||x>50) || o.some(x=>!Number.isFinite(x)||x<1||x>7)) return null;
    const mp=p.reduce((a,b)=>a+b,0)/6, mo=o.reduce((a,b)=>a+b,0)/6;
    const cp=p.map(x=>x-mp), co=o.map(x=>x-mo);
    const xp=cp.reduce((a,b)=>a+b*b,0), xo=co.reduce((a,b)=>a+b*b,0);
    if(xp<1e-9||xo<1e-9)return null;
    const value=cp.reduce((a,b,i)=>a+b*co[i],0)/Math.sqrt(xp*xo);
    return Math.max(-1,Math.min(1,value));
  }
  function labelFor(score){return score>=.80?'High alignment':score>=.60?'Moderate alignment':'Some alignment';}
  function findMatches(person, careers, limit=100){
    if(!Array.isArray(careers))return [];
    return careers.map(c=>({code:c.key,title:c.title,score:correlation(person,c.interestProfile)}))
      .filter(m=>typeof m.score==='number' && m.score>=.35 && m.code && m.title)
      .sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title))
      .slice(0,limit).map(m=>({...m,fit:labelFor(m.score)}));
  }
  const api={AREAS,correlation,labelFor,findMatches};
  root.LmiInterests=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
