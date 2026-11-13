'use strict';

const REGISTRY = [
  {id:'bls_lau',name:'BLS · Local Area Unemployment Statistics',use:'Maricopa County unemployment rate, not seasonally adjusted.',cadence:'Monthly',url:'https://www.bls.gov/lau/'},
  {id:'bls_ces',name:'BLS · Current Employment Statistics',use:'Phoenix–Mesa–Chandler metro payroll jobs, seasonally adjusted.',cadence:'Monthly',url:'https://www.bls.gov/sae/'},
  {id:'bls_industry',name:'BLS · Metro Industry Employment',use:'Monthly payroll jobs across six selected Phoenix metro industry groups, not seasonally adjusted.',cadence:'Monthly',url:'https://www.bls.gov/sae/additional-resources/list-of-published-state-and-metropolitan-area-series/arizona.htm'},
  {id:'bls_oews',name:'BLS · Occupational Employment & Wage Statistics',use:'Phoenix metro occupations, 10th/median/90th percentile pay and occupational employment.',cadence:'Annual',url:'https://www.bls.gov/oes/tables.htm'},
  {id:'census',name:'U.S. Census · ACS',use:'County population and household income, if an API key is configured.',cadence:'Annual',url:'https://api.census.gov/data.html'}
];
const money = n => Number.isFinite(Number(n)) && n != null ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n) : 'Not available';
const number = n => Number.isFinite(Number(n)) && n != null ? new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n) : 'Not available';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $ = id => document.getElementById(id);
const fmtPeriod = v => v || 'Source period not available';
let catalog = {careers:[],programCatalogUrl:'https://www.maricopa.edu/degrees-certificates'};
let live = {metrics:{},trends:{},occupations:{},sources:{}};
let lastScan = null;
let careerPage = 1;
const PAGE_SIZE = 24;
const getCareer = key => catalog.careers.find(c=>c.key===key||c.soc===key);
const cardWages = c => live.occupations?.[c.soc]||{};

async function readJSON(url) {
  const res = await fetch(url,{cache:'no-store'});
  if(!res.ok) throw new Error(`File unavailable: ${url} (${res.status})`);
  return res.json();
}

async function initialize() {
  try { catalog = await readJSON('data/catalog.json'); }
  catch(e) { $('career-count').textContent = 'Could not load career catalog'; $('data-banner').textContent = `Catalog unavailable: ${e.message}`; }
  try { live = await readJSON(`data/current.json?nocache=${Math.floor(Date.now()/60000)}`); }
  catch(e) { live.sources={}; live.metrics={}; live.trends={}; live.occupations={}; $('data-banner').textContent = `Data file unavailable: ${e.message}`; }
  catalog.careers=LmiCatalog.merge([],catalog.careers);
  fillFilters(); renderMetrics(); renderCareers(); renderSources(); renderSectorSummary(); renderIndustrySummary(); renderCharts();
  loadFullCatalog();
  $('career-search').addEventListener('input',resetPageAndRender);
  for(const id of ['sector-filter','zone-filter','career-sort','programs-only','wages-only'])$(id).addEventListener('change',resetPageAndRender);
  $('clear-career-filters').addEventListener('click',()=>{for(const id of ['career-search','sector-filter','zone-filter'])$(id).value='';for(const id of ['programs-only','wages-only','show-matches-only'])$(id).checked=false;$('career-sort').value='title';resetPageAndRender();});
  $('load-more-careers').addEventListener('click',()=>{careerPage++;renderCareers();});
  $('export-catalog').addEventListener('click',exportCareerCatalog);
  $('scan-occupation-search').addEventListener('input',fillScanOptions);
  $('scan-occupation').addEventListener('change',()=> {lastScan=null;$('download-scan').disabled=true;});
  $('build-scan').addEventListener('click',buildScan);
  $('download-scan').addEventListener('click',()=>lastScan && downloadText(`program-scan-${lastScan.soc}.html`,buildReportDocument(lastScan),'text/html;charset=utf-8'));
  $('export-trends').addEventListener('click',exportTrends);
  $('download-brief').addEventListener('click',()=>downloadText('regional-workforce-brief.html',regionalBriefHTML(),'text/html;charset=utf-8'));
  $('close-dialog').addEventListener('click',()=>$('career-dialog').close());
  $('career-dialog').addEventListener('click',event=>{if(event.target.id==='career-dialog')$('career-dialog').close();});
}
async function loadFullCatalog(){
  const status=$('catalog-status');let loaded=null;let origin='';
  for(const [url,label] of [['data/occupations.json','automated official dataset']]){
    try{
      const payload=await readJSON(url);
      if(!Array.isArray(payload.occupations)||payload.occupations.length<950||!payload.occupations.every(c=>/^\d\d-\d{4}\.\d{2}$/.test(c.key)))throw new Error('Incomplete directory');
      loaded=payload;origin=label;break;
    }catch{/* The next validated source may still be available. */}
  }
  if(!loaded){status.dataset.level='warning';status.textContent=`Showing ${catalog.careers.length} curated starter careers. Run the GitHub Actions deployment workflow to load the full O*NET occupation directory.`;return;}
  // Reuse only approved local editorial connections; never infer MCCCD programs from a SOC prefix.
  const curated=await readJSON('data/catalog.json').catch(()=>({careers:[]}));
  catalog.careers=LmiCatalog.merge(loaded.occupations,curated.careers||[]);
  catalog.release=loaded.release;
  status.dataset.level='ok';status.textContent=`${catalog.careers.length.toLocaleString()} occupations · ${escapeHtml(loaded.source||'O*NET Database')} ${escapeHtml(loaded.release||'')} · ${origin}. Wages and programs are shown only where linked source data are available.`;
  fillFilters();resetPageAndRender();renderSectorSummary();
  window.studentHub?.onCatalogReady?.();
}
function fillScanOptions(){
  const needle=$('scan-occupation-search').value.trim().toLowerCase();
  const select=$('scan-occupation'),selected=select.value;
  const options=catalog.careers.filter(c=>!needle||[c.title,c.soc,c.key,...(c.aliases||[])].join(' ').toLowerCase().includes(needle)).slice(0,200);
  select.innerHTML=options.map(c=>`<option value="${escapeHtml(c.key)}">${escapeHtml(c.title)} · ${escapeHtml(c.key)}</option>`).join('');
  if(options.some(c=>c.key===selected))select.value=selected;
  if(!options.length)select.innerHTML='<option value="">No occupations match</option>';
}
function fillFilters(){
  const previous=$('sector-filter').value;
  const sectors=[...new Set((catalog.careers||[]).map(c=>c.sector))].sort();
  $('sector-filter').innerHTML='<option value="">All career areas</option>'+sectors.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if(sectors.includes(previous))$('sector-filter').value=previous;
  fillScanOptions();
}
function resetPageAndRender(){careerPage=1;renderCareers();}
function renderMetrics(){
  const metrics=live.metrics||{};
  const u=metrics.unemployment, jobs=metrics.jobs, all=live.occupations?.['00-0000'];
  $('unemployment-rate').textContent=u?.value!=null ? `${Number(u.value).toFixed(1)}%` : '—';
  $('unemployment-date').textContent=u?.periodLabel ? `${u.periodLabel} · BLS, unadjusted` : 'BLS LAU · awaiting refresh';
  $('metro-jobs').textContent=jobs?.value!=null ? `${(Number(jobs.value)/1000).toFixed(2)}M` : '—';
  $('metro-jobs-date').textContent=jobs?.periodLabel ? `${jobs.periodLabel} · BLS, seasonally adjusted` : 'BLS CES · awaiting refresh';
  $('metro-wage').textContent=all?.annualMedian!=null ? money(all.annualMedian) : '—';
  $('metro-wage-date').textContent=live.oewsPeriod ? `May ${live.oewsPeriod} · BLS OEWS` : 'BLS OEWS · awaiting refresh';
  const statuses=Object.values(live.sources||{}).map(s=>s.status);
  const success=statuses.filter(s=>s==='ok').length;
  const total=statuses.filter(s=>s!=='skipped').length;
  $('update-status').textContent=!live.generatedAt ? 'Not initialized' : success===total ? 'Current' : `${success}/${total} feeds`;
  $('update-time').textContent=live.generatedAt ? `Checked ${new Date(live.generatedAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}` : 'No verified fetch has run';
  const problems=Object.entries(live.sources||{}).filter(([,s])=>s.status!=='ok' && s.status!=='skipped');
  const banner=$('data-banner');
  if(!live.generatedAt){banner.dataset.level='warning';banner.textContent='Initial source refresh has not run. Career exploration and program links work, but unavailable wage and jobs statistics are intentionally blank.';}
  else if(problems.length){banner.dataset.level='warning';banner.textContent=`Latest pipeline check: ${new Date(live.generatedAt).toLocaleString()}. ${problems.length} source${problems.length===1?'':'s'} unavailable or pending. Previously validated data are retained where available; check source statuses below.`;}
  else {banner.dataset.level='ok';banner.textContent=`Published-source snapshot checked ${new Date(live.generatedAt).toLocaleString()}. The original source period, not the website refresh date, determines how recent each metric is.`;}
}
function careerRows(){
  const rows=LmiCatalog.filter(catalog.careers,{
    query:$('career-search').value,sector:$('sector-filter').value,zone:$('zone-filter').value,
    programsOnly:$('programs-only').checked,wageOnly:$('wages-only').checked,
    matchOnly:!!window.studentHub?.isMatchOnly?.(),
    match:key=>!!window.studentHub?.matchForSoc?.(key),
    hasWage:soc=>live.occupations?.[soc]?.annualMedian!=null
  });
  const sort=$('career-sort').value;
  const score=(c,k)=>{const n=cardWages(c)[k];return n==null?-1:Number(n)};
  rows.sort((a,b)=>sort==='match'?(window.studentHub?.matchOrder?.(a.key)??99)-(window.studentHub?.matchOrder?.(b.key)??99)||a.title.localeCompare(b.title):sort==='wage'?score(b,'annualMedian')-score(a,'annualMedian')||a.title.localeCompare(b.title):sort==='employment'?score(b,'employment')-score(a,'employment')||a.title.localeCompare(b.title):a.title.localeCompare(b.title));
  return rows;
}
function exportCareerCatalog(){
  const headings=['O*NET-SOC','BLS SOC','Occupation title','Career area','Job Zone','Phoenix metro median annual wage','OEWS year','Editorial Maricopa pathway names','Source'];
  const rows=[headings,...catalog.careers.map(c=>[c.key,c.soc,c.title,c.sector,c.jobZone||'',cardWages(c).annualMedian??'',live.oewsPeriod||'',(c.programs||[]).join('; '),c.origin||'O*NET'])];
  downloadText('maricopa-career-catalog.csv',rows.map(row=>row.map(escapeCSV).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function renderCareers(){
  const rows=careerRows(),view=rows.slice(0,careerPage*PAGE_SIZE);
  $('career-count').textContent=`${rows.length.toLocaleString()} matching careers · ${(catalog.careers.length).toLocaleString()} in the directory${live.oewsPeriod?` · wages from May ${live.oewsPeriod}`:' · wage feed pending'}`;
  $('load-more-careers').hidden=view.length>=rows.length;
  $('load-more-careers').textContent=`Show more careers (${(rows.length-view.length).toLocaleString()} remaining)`;
  if(!rows.length){$('career-results').innerHTML='<div class="empty-state">No matches. Try clearing a filter, searching for another job title, or selecting a different preparation level.</div>';return;}
  $('career-results').innerHTML=view.map(c=>{
    const v=cardWages(c);
    const fit=window.studentHub?.matchForSoc?.(c.key),saved=window.studentHub?.isSaved?.(c.key);
    const fitTag=fit?`<span class="fit-chip ${fit.official?'official':''}">${escapeHtml(fit.fit)}${fit.official?' · O*NET':' · editorial'}</span>`:'';
    const zone=c.jobZone?` · Preparation zone ${c.jobZone}`:'';
    const wages=c.isSpecialization&&v.annualMedian!=null?'<small class="wage-caveat">Broader SOC wage</small>':'';
    const paths=c.hasProgramMapping?`<span class="path-chip">Potential Maricopa pathway</span>`:'';
    return `<article class="career-card"><div class="career-card-top"><div class="sector-tag">${escapeHtml(c.sector)} · ${escapeHtml(c.key)}${zone}</div>${fitTag}</div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml((c.summary||'').slice(0,210))}${(c.summary||'').length>210?'…':''}</p>${paths}<div class="careers-stats"><div class="stat-mini"><strong>${v.annualMedian!=null?money(v.annualMedian):'—'}</strong><span>Metro median annual pay</span>${wages}</div><div class="stat-mini"><strong>${v.employment!=null?number(v.employment):'—'}</strong><span>Metro employment</span></div></div><div class="career-actions"><button class="text-action" type="button" data-key="${escapeHtml(c.key)}">View career →</button><button class="save-action ${saved?'saved':''}" type="button" data-save-key="${escapeHtml(c.key)}" aria-label="${saved?'Remove':'Save'} ${escapeHtml(c.title)} ${saved?'from':'to'} shortlist">${saved?'✓ Saved':'+ Save'}</button></div></article>`;
  }).join('');
  $('career-results').querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>openCareer(b.dataset.key)));
  $('career-results').querySelectorAll('[data-save-key]').forEach(b=>b.addEventListener('click',()=>window.studentHub?.toggleSaved?.(b.dataset.saveKey)));
}
function openCareer(key){
  const c=getCareer(key);if(!c)return;
  const v=cardWages(c);
  const link=`https://www.onetonline.org/link/summary/${encodeURIComponent(c.key)}`;
  const src=live.oewsPeriod?`BLS OEWS May ${live.oewsPeriod}, Phoenix–Mesa–Chandler MSA`:'BLS OEWS feed pending';
  const fit=window.studentHub?.matchForSoc?.(c.key);
  const fitContext=fit?`<p class="detail-fit">${fit.local?'Exploratory interest alignment':'Editorial interest theme'}: <strong>${escapeHtml(fit.fit)}</strong>. Interests suggest options; they do not guarantee suitability or employment.</p>`:'';
  const programs=c.hasProgramMapping?`<ul>${c.programs.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul><p class="small-note">These program connections are provisional/editorial, not approved CIP–SOC mappings.</p>`:`<p>There is no reviewed Maricopa program link for this occupation yet. This does not mean Maricopa has no related pathway.</p>`;
  const parents=c.isSpecialization?`<p class="report-warning">The wage and employment estimates below belong to broader BLS SOC <strong>${escapeHtml(c.soc)}</strong>. They do not independently measure this O*NET specialization.</p>`:'';
  const aliases=c.aliases?.length?`<div class="detail-section"><h3>Other job titles to search for</h3><p>${c.aliases.slice(0,8).map(escapeHtml).join(' · ')}</p></div>`:'';
  $('career-detail').innerHTML=`<div class="sector-tag">${escapeHtml(c.sector)} · O*NET-SOC ${escapeHtml(c.key)}</div><h2 id="career-detail-title">${escapeHtml(c.title)}</h2><p class="detail-summary">${escapeHtml(c.summary)}</p>${fitContext}${parents}<div class="detail-stats"><div><strong>${v.annualP10!=null?money(v.annualP10):'—'}</strong><small>10th percentile pay</small></div><div><strong>${v.annualMedian!=null?money(v.annualMedian):'—'}</strong><small>Median annual pay</small></div><div><strong>${v.annualP90!=null?money(v.annualP90):'—'}</strong><small>90th percentile pay</small></div></div><p><strong>Estimated regional employment:</strong> ${v.employment!=null?number(v.employment):'Not available'} · <strong>Median hourly pay:</strong> ${v.hourlyMedian!=null?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v.hourlyMedian):'Not available'}</p><div class="detail-section"><h3>Explore a Maricopa pathway</h3>${programs}<p><a href="${escapeHtml(catalog.programCatalogUrl)}" target="_blank" rel="noopener noreferrer">Check current MCCCD degrees &amp; certificates ↗</a></p><button class="button light" id="detail-save" type="button">${window.studentHub?.isSaved?.(c.key)?'Remove from my shortlist':'Save career to my shortlist'}</button></div><div class="detail-section"><h3>Learn about this occupation</h3><p><strong>Preparation:</strong> ${c.jobZone?`O*NET Job Zone ${c.jobZone} (typical preparation varies)`:'No O*NET Job Zone available'}</p><p><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View tasks, skills &amp; work context at O*NET ↗</a> · <a href="https://onetinterestprofiler.org/" target="_blank" rel="noopener noreferrer">Interest Profiler ↗</a></p></div>${aliases}<p class="detail-foot">${escapeHtml(src)}. Wages vary by role, experience and employer. Official O*NET occupational definitions © attributed under CC BY 4.0.</p>`;
  $('career-dialog').showModal();
  $('detail-save').addEventListener('click',()=>{window.studentHub?.toggleSaved?.(c.key);$('detail-save').textContent=window.studentHub?.isSaved?.(c.key)?'Remove from my shortlist':'Save career to my shortlist';});
}
function buildScan(){
  const soc=$('scan-occupation').value;
  const c=getCareer(soc);if(!c)return;
  lastScan={...c,wage:cardWages(c),notes:$('scan-notes').value.trim(),oewsPeriod:live.oewsPeriod||null,generatedAt:new Date().toISOString()};
  $('scan-preview').innerHTML=scanFragment(lastScan);
  $('download-scan').disabled=false;
}
function scanFragment(s){
  const v=s.wage||{};
  return `<div class="report-meta">LABOR MARKET ENVIRONMENTAL SCAN · ${escapeHtml(new Date(s.generatedAt).toLocaleDateString())}</div><h3>${escapeHtml(s.title)}</h3><p class="report-meta">SOC ${escapeHtml(s.key||s.soc)} · Phoenix–Mesa–Chandler, AZ MSA · BLS OEWS May ${escapeHtml(s.oewsPeriod||'not loaded')}</p><table><tbody><tr><th>Estimated employed workers</th><td>${v.employment!=null?number(v.employment):'Unavailable'}</td></tr><tr><th>10th percentile annual wage</th><td>${v.annualP10!=null?money(v.annualP10):'Unavailable'}</td></tr><tr><th>Median annual wage</th><td>${v.annualMedian!=null?money(v.annualMedian):'Unavailable'}</td></tr><tr><th>90th percentile annual wage</th><td>${v.annualP90!=null?money(v.annualP90):'Unavailable'}</td></tr></tbody></table><h3>Potential academic connections</h3><ul>${(s.programs||[]).map(p=>`<li>${escapeHtml(p)}</li>`).join('')||'<li>No reviewed link available; consult the MCCCD program catalog.</li>'}</ul>${s.notes?`<h3>Local planning context</h3><p>${escapeHtml(s.notes).replace(/\n/g,'<br>')}</p>`:''}${s.isSpecialization?`<p class="report-warning">BLS wage/employment figures are for broader SOC ${escapeHtml(s.soc)}, not a specialization-specific estimate.</p>`:''}<p class="report-warning"><strong>Not a viability score.</strong> Occupational employment is not openings. Labor demand, regional awards supply, postings, program enrollment, persistence, completions, equity analysis and employer validation are not included in this snapshot.</p><p class="report-meta">Source: <a href="https://www.bls.gov/oes/tables.htm">BLS OEWS</a>; program connections are editorial suggestions linked to <a href="https://www.maricopa.edu/degrees-certificates">MCCCD catalog</a>. Published area includes Maricopa and Pinal counties.</p>`;
}
function buildReportDocument(s){return reportShell(`Program scan · ${s.title}`,`<h1>Program demand scan</h1>${scanFragment(s)}`);}
function reportShell(title,inner){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:15px/1.5 Arial,sans-serif;color:#17232d;max-width:850px;margin:36px auto;padding:0 22px}h1,h2,h3{color:#123b46}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border-bottom:1px solid #ddd;padding:9px;text-align:left}th{width:52%}.report-meta,.report-warning{font-size:13px;color:#566676}.report-warning{background:#fff4e5;padding:12px}a{color:#005b65}@media print{body{margin:6mm auto}}</style></head><body>${inner}<hr><small>Maricopa Workforce Insights — demonstration build, not an official MCCCD report.</small><p><button onclick="window.print()">Print / Save as PDF</button></p></body></html>`;}
function downloadText(filename,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function escapeCSV(v){let text=String(v??'');if(/^[=+@\t\r]/.test(text) || (/^-/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text)))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;}
function exportTrends(){const rows=[['series','geography','adjustment','period','value','unit','source'],...['unemployment','jobs'].flatMap(k=>(live.trends?.[k]||[]).map(x=>[k,k==='unemployment'?'Maricopa County':'Phoenix–Mesa–Chandler MSA',k==='unemployment'?'Not seasonally adjusted':'Seasonally adjusted',x.period,x.value,k==='unemployment'?'percent':'thousands','BLS']))];downloadText('maricopa-lmi-monthly-trends.csv',rows.map(r=>r.map(escapeCSV).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
function regionalBriefHTML(){const u=live.metrics?.unemployment,j=live.metrics?.jobs;return reportShell('Regional workforce pulse',`<h1>Regional workforce pulse</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p><h2>Published labor indicators</h2><table><tr><th>Maricopa County unemployment rate</th><td>${u?.value!=null?Number(u.value).toFixed(1)+'%':'Unavailable'} · ${escapeHtml(fmtPeriod(u?.periodLabel))} · not seasonally adjusted</td></tr><tr><th>Phoenix–Mesa–Chandler metro jobs</th><td>${j?.value!=null?number(Number(j.value)*1000):'Unavailable'} · ${escapeHtml(fmtPeriod(j?.periodLabel))} · seasonally adjusted</td></tr><tr><th>All occupation median annual wage</th><td>${live.occupations?.['00-0000']?.annualMedian!=null?money(live.occupations['00-0000'].annualMedian):'Unavailable'} · May ${escapeHtml(live.oewsPeriod||'period pending')}</td></tr></table><h2>Interpretation notes</h2><p>Payroll job estimates cover the metro area, which includes Maricopa and Pinal counties. The unemployment figure is county-level. These metrics cannot be combined as if they describe identical populations. Labor market series have release lags and may be revised.</p><p>Sources: <a href="https://www.bls.gov/lau/">BLS LAU</a>, <a href="https://www.bls.gov/sae/">BLS CES</a>, <a href="https://www.bls.gov/oes/tables.htm">BLS OEWS</a>. Feed checked ${escapeHtml(live.generatedAt||'not yet refreshed')}.</p>`);}
function renderSources(){
  $('source-grid').innerHTML=REGISTRY.map(s=>{const entry=live.sources?.[s.id]||{status:'pending',note:'No update record'};const status=entry.status||'pending';const label={ok:'Loaded',error:'Refresh error',pending:'Pending',skipped:'Not configured'}[status]||status;return `<article class="source-card"><strong>${escapeHtml(s.name)}</strong><span class="source-status ${status==='ok'?'ok':status==='error'?'warning':''}">${label}</span><p>${escapeHtml(s.use)}</p><p>${escapeHtml(s.cadence)} · ${escapeHtml(entry.period||'No reporting period')}</p><p>${escapeHtml(entry.note||'')}</p><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">Source documentation ↗</a></article>`;}).join('');
}
function renderSectorSummary(){
  const group={};
  (catalog.careers||[]).forEach(c=>{
    group[c.sector]??={name:c.sector,items:0,socs:new Set(),loaded:0};
    const g=group[c.sector];g.items++;g.socs.add(c.soc);
  });
  $('sector-summary').innerHTML=Object.values(group).sort((a,b)=>a.name.localeCompare(b.name)).map(g=>{
    const wageCount=[...g.socs].filter(soc=>live.occupations?.[soc]?.annualMedian!=null).length;
    return `<article class="sector-stat"><h3>${escapeHtml(g.name)}</h3><strong>${number(g.items)}</strong><p>O*NET occupations · ${number(wageCount)} of ${number(g.socs.size)} distinct BLS SOC codes with published metro wage data. Occupations are not industry employment totals.</p></article>`;
  }).join('');
}
function renderIndustrySummary(){
  const rows=Object.entries(live.industryMetrics||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  $('industry-summary').innerHTML=rows.length ? rows.map(([name,r])=>`<article class="sector-stat"><h3>${escapeHtml(name)}</h3><strong>${r.value!=null?number(r.value):'—'}k</strong><p>${escapeHtml(r.periodLabel||r.period||'Source period unknown')} · ${r.yoyPercent!=null ? `${Number(r.yoyPercent)>0?'+':''}${r.yoyPercent}% year over year` : 'Year-over-year comparison unavailable'}</p></article>`).join('') : '<div class="empty-state">Published industry employment will appear here after the first successful BLS refresh.</div>';
  const c=live.census||{};
  if(c.population!=null && c.medianHouseholdIncome!=null){$('census-summary').hidden=false;$('census-summary').innerHTML=`<strong>Maricopa County population (${escapeHtml(c.year)} ACS):</strong> ${number(c.population)} · <strong>Median household income:</strong> ${money(c.medianHouseholdIncome)} <span>(ACS 1-year estimates, not earnings per worker)</span>`;}
}
function renderCharts(){
  drawChart('unemployment-chart',live.trends?.unemployment||[],'unemployment-caption','%',v=>v.toFixed(1));
  drawChart('jobs-chart',live.trends?.jobs||[],'jobs-caption','k',v=>number(v));
}
function drawChart(svgId,points,captionId,unit,formatter){
  const svg=$(svgId);const label=$(captionId);svg.replaceChildren();
  const clean=points.filter(p=>Number.isFinite(Number(p.value))).map(p=>({value:Number(p.value),period:String(p.period)}));
  if(!clean.length){const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x','18');t.setAttribute('y','115');t.textContent='No verified data available';svg.appendChild(t);label.textContent='A successful scheduled BLS refresh is required.';return;}
  const W=560,H=228,x0=45,x1=548,y0=17,y1=185;const vals=clean.map(x=>x.value);let lo=Math.min(...vals),hi=Math.max(...vals);let pad=(hi-lo)*.20||Math.max(Math.abs(hi)*.04,1);lo-=pad;hi+=pad;
  const x=i=>x0+(clean.length===1?.5:i/(clean.length-1))*(x1-x0);
  const y=v=>y1-(v-lo)/(hi-lo)*(y1-y0);
  const ns='http://www.w3.org/2000/svg';const element=(tag,attrs={},content=null)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(content!=null)el.textContent=content;svg.appendChild(el);return el;};
  for(let i=0;i<4;i++){const v=lo+(hi-lo)*i/3,yy=y(v);element('line',{x1:x0,y1:yy,x2:x1,y2:yy,class:'gridline'});element('text',{x:38,y:yy+4,'text-anchor':'end'},formatter(v)+unit);}
  const path=clean.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');element('path',{d:path,class:'series-line'});
  const last=clean[clean.length-1];element('circle',{cx:x(clean.length-1),cy:y(last.value),r:4.5,class:'dot'});
  const labels=[0,Math.floor((clean.length-1)/2),clean.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  for(const i of labels){element('text',{x:x(i),y:211,'text-anchor':i===0?'start':i===clean.length-1?'end':'middle'},clean[i].period);}
  label.textContent=`${clean[0].period} – ${last.period} · Last observed: ${formatter(last.value)}${unit} · ${clean.length} published months`;
}
initialize();
