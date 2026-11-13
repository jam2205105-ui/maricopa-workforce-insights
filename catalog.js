'use strict';
/* Catalog logic is deliberately separate from UI and testable with Node. */
(function(root){
  const GROUPS={11:'Management',13:'Business & Finance',15:'Technology & Data',17:'Engineering & Architecture',19:'Science & Research',21:'Community & Social Services',23:'Legal',25:'Education & Library',27:'Arts, Media & Design',29:'Healthcare',31:'Healthcare Support',33:'Public Safety',35:'Food & Hospitality',37:'Cleaning & Grounds',39:'Personal Care & Services',41:'Sales',43:'Office & Administration',45:'Agriculture & Natural Resources',47:'Construction & Trades',49:'Installation & Repair',51:'Manufacturing & Production',53:'Transportation & Logistics',55:'Military'};
  const codeOf=c=>String(c?.key||c?.onetSoc||(/^\d\d-\d{4}$/.test(c?.soc||'')?c.soc+'.00':'')).trim();
  const blsSoc=c=>String(c?.soc||'').match(/^\d\d-\d{4}/)?.[0]||codeOf(c).slice(0,7);
  function merge(official,curated){
    const curr=Array.isArray(curated)?curated:[];
    const maps=new Map(curr.map(c=>[c.soc,c]));
    const output=[];const used=new Set();
    for(const source of official){
      const key=codeOf(source);if(!/^\d{2}-\d{4}\.\d{2}$/.test(key)||used.has(key))continue;
      used.add(key);const soc=blsSoc(source),m=key.endsWith('.00')?maps.get(soc):undefined;
      output.push({key,soc,title:String(source.title||m?.title||''),summary:String(source.summary||m?.summary||''),
        sector:String(source.sector||GROUPS[soc.slice(0,2)]||'Other occupations'),
        jobZone:[1,2,3,4,5].includes(+source.jobZone)?+source.jobZone:null,
        aliases:Array.isArray(source.aliases)?source.aliases.slice(0,16):[],
        interest:m?.interest||'',interestProfile:source.interestProfile||null,programs:m?.programs||[],hasProgramMapping:!!(m?.programs?.length),isSpecialization:!key.endsWith('.00'),origin:'O*NET'});
    }
    // Keep curated programs available if a future O*NET release retires an occupation.
    // They remain visibly tagged as curated rather than being misrepresented as O*NET data.
    for(const c of curr){
      const key=codeOf(c);if(used.has(key))continue;
      output.push({...c,key,soc:blsSoc(c),hasProgramMapping:!!c.programs?.length,isSpecialization:false,jobZone:null,aliases:[],origin:'Curated starter'});
    }
    output.sort((a,b)=>a.title.localeCompare(b.title)||a.key.localeCompare(b.key));
    return output;
  }
  function filter(careers,{query='',sector='',zone='',programsOnly=false,wageOnly=false,matchOnly=false,match=()=>false,hasWage=()=>false}={}){
    const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return careers.filter(c=>{
      if(sector && c.sector!==sector)return false;
      if(zone && String(c.jobZone)!==String(zone))return false;
      if(programsOnly && !c.hasProgramMapping)return false;
      if(wageOnly && !hasWage(c.soc))return false;
      if(matchOnly && !match(c.key))return false;
      if(!terms.length)return true;
      const haystack=[c.title,c.summary,c.soc,c.key,c.sector,...(c.aliases||[]),...(c.programs||[])].join(' ').toLocaleLowerCase();
      return terms.every(t=>haystack.includes(t));
    });
  }
  const api={GROUPS,codeOf,blsSoc,merge,filter};
  root.LmiCatalog=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
