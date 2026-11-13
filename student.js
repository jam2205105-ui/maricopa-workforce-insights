'use strict';
/* Student flow: official hosted widget + private browser-side exploratory occupational interest comparison. */
(() => {
  const areas = [
    {code:'realistic',label:'Realistic',short:'R',desc:'Hands-on work, tools & practical problems'},
    {code:'investigative',label:'Investigative',short:'I',desc:'Research, data & solving complex problems'},
    {code:'artistic',label:'Artistic',short:'A',desc:'Creating, designing & expressing ideas'},
    {code:'social',label:'Social',short:'S',desc:'Helping, teaching & collaborating'},
    {code:'enterprising',label:'Enterprising',short:'E',desc:'Leading, persuading & starting things'},
    {code:'conventional',label:'Conventional',short:'C',desc:'Organizing, records & structured processes'}
  ];
  const miniState={bank:null,answers:Array(30).fill(null),page:0,loading:false};
  const state = {scores:null,matches:[],matchStatus:'none',mode:null,
    saved:[],profileNote:'',widgetConfigured:false,widgetUrl:null};
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moneyFmt = n => n == null || !Number.isFinite(+n) ? 'Not available' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+n);
  const normalizeKey = code => /^\d\d-\d{4}$/.test(String(code||''))?String(code)+'.00':String(code||'');
  const selectedCareer = key => (catalog.careers || []).find(c => c.key === normalizeKey(key));
  function tryStore(key, value){try{if(value==null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{/* private browsing */}}
  function tryRead(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null}}
  function setTab(tab){
    ['assess','matches','saved'].forEach(n => {
      const panel=byId(`student-panel-${n}`),btn=byId(`step-${n==='matches'?'results':n==='saved'?'saved':'assess'}`);
      panel.hidden=n!==tab;btn.classList.toggle('active',n===tab);btn.setAttribute('aria-pressed',String(n===tab));
    });
    if(tab==='saved') renderShortlist();
    if(tab==='matches') renderProfile();
  }
  function setAssessMode(which){
    const show=which==='native'||which==='widget'||which==='scores';
    byId('widget-area').hidden=!show;
    byId('mini-ip-panel').hidden=which!=='native';
    byId('start-mini-ip').setAttribute('aria-expanded',String(which==='native'));
    if(which==='widget'){
      if(state.widgetConfigured)byId('onet-widget-container').hidden=false;
      else void configureWidget();
    }else{
      byId('onet-widget-container').hidden=true;
      byId('onet-widget-status').textContent='';
    }
  }
  function scoresValid(scores){return areas.every(a=>Number.isInteger(scores[a.code]) && scores[a.code]>=0 && scores[a.code]<=50) &&
    Object.values(scores).some(v=>v>0);}
  function sortedAreas(scores){return [...areas].sort((a,b)=>scores[b.code]-scores[a.code]||areas.indexOf(a)-areas.indexOf(b))}
  function topAreas(scores){return sortedAreas(scores).slice(0,2).map(a=>a.code)}
  function clearProfile(){
    state.scores=null;state.matches=[];state.matchStatus='none';state.mode=null;state.profileNote='';
    byId('remember-profile').checked=false;tryStore('lmi_profile_github_v3',null);
    byId('show-matches-only').checked=false;byId('career-sort').value='title';
    byId('match-toolbar').hidden=true;setTab('assess');setAssessMode(null);
    byId('interest-import-status').textContent='Interest profile cleared.';
    renderCareers();renderProfile();
  }
  function careerMatch(soc){
    if(!state.scores)return null;
    const key=normalizeKey(soc);
    const match=state.matches.find(m=>normalizeKey(m.code)===key);
    if(match)return {fit:match.fit,score:match.score,local:true,official:false};
    if(state.matchStatus==='local')return null;
    // Catalog unavailable: 24 curated fallback theme links, never statistical matches.
    const c=selectedCareer(key);if(!c)return null;
    const tops=topAreas(state.scores);
    const count=tops.filter(t=>(c.interest||'').toLowerCase().includes(t)).length;
    return count ? {fit:count===2?'Two interest themes':'Interest theme',local:false,official:false} : null;
  }
  function matchOrder(soc){
    const m=careerMatch(soc);
    if(!m)return 99;
    return m.local ? 1-(m.score||0) : (m.fit==='Two interest themes'?10:11);
  }
  function recomputeMatches(){
    const available=(catalog.careers||[]).filter(c=>c.interestProfile).length;
    state.matches=available && state.scores ? LmiInterests.findMatches(state.scores,catalog.careers,100) : [];
    state.matchStatus=available ? 'local' : 'editorial';
    state.profileNote=available ? `Based on ${available.toLocaleString()} public O*NET occupational interest profiles; this comparison is exploratory and is not an official O*NET Web Services career-fit rating.` : 'Published occupational interest profiles are not loaded yet. For the full catalog and on-site alignment, run the GitHub Pages deployment workflow. Only the 24 curated interest-theme suggestions are available in the meantime.';
    if(state.scores && !state.matches.length && available)state.profileNote+=' No occupational profiles met the display threshold. Compare the available careers freely.';
  }
  function applyProfile(scores,mode){
    if(!scoresValid(scores))throw new Error('All six scores are required.');
    const vals=areas.map(a=>scores[a.code]);
    if(new Set(vals).size===1)throw new Error('All six scores are identical; an interest-pattern comparison requires variation across the six areas.');
    state.scores=scores;state.mode=mode;
    recomputeMatches();
    byId('career-sort').value='match';byId('show-matches-only').checked=false;
    byId('match-toolbar').hidden=false;
    byId('match-toolbar-title').textContent=state.matchStatus==='local'?'Your interest-aligned careers are ready':'Interest themes are ready';
    byId('match-toolbar-detail').textContent=state.matchStatus==='local' ? 'Exploratory pattern similarity using published O*NET occupational data—not official O*NET fit labels.' : 'Showing curated themes until the public occupational profile data loads.';
    if(byId('remember-profile').checked)saveProfile();else tryStore('lmi_profile_github_v3',null);
    renderCareers();renderProfile();setTab('matches');
  }
  function saveProfile(){
    if(!state.scores)return;
    tryStore('lmi_profile_github_v3',{scores:state.scores,matches:state.matches,matchStatus:state.matchStatus,mode:state.mode,profileNote:state.profileNote});
  }
  function renderScoreInputs(){
    byId('riasec-inputs').innerHTML=areas.map(a=>`<label class="score-field"><span class="score-letter">${a.short}</span><span class="score-label"><strong>${a.label}</strong><small>${esc(a.desc)}</small></span><input aria-label="${a.label} score" id="score-${a.code}" type="number" min="0" max="50" step="1" inputmode="numeric" required placeholder="Score"></label>`).join('');
  }
  function importScores(event){
    event.preventDefault();
    const scores=Object.fromEntries(areas.map(a=>[a.code,Number(byId(`score-${a.code}`).value)]));
    if(areas.some(a=>byId(`score-${a.code}`).value==='') || !scoresValid(scores)){
      byId('interest-import-status').textContent='Enter all six scores as whole numbers from 0 through 50.';return;
    }
    try{
      applyProfile(scores,'Imported O*NET Interest Profiler scores');
      byId('interest-import-status').textContent='Your scores have been applied locally in this browser.';
    }catch(e){byId('interest-import-status').textContent=e.message;}
  }
  function renderProfile(){
    if(!state.scores){
      byId('profile-summary').innerHTML='<div class="empty-state"><strong>No interest profile yet</strong><p>Take the official O*NET profiler and enter your six interest scores.</p></div>';
      byId('personal-results').innerHTML='';byId('download-profile').disabled=true;
      byId('profile-caption').textContent='There is no profile for this session. You can browse careers below any time.';
      return;
    }
    const max=Math.max(1,...Object.values(state.scores));const sorted=sortedAreas(state.scores);
    byId('profile-caption').textContent=`${state.mode||'Interest profile'} · ${state.matchStatus==='local'?'Exploratory match to public O*NET occupational profiles':'Curated interest themes only'}`;
    byId('profile-summary').innerHTML=`<div class="profile-lead"><span>Your strongest areas</span><h4>${sorted.slice(0,2).map(a=>esc(a.label)).join(' + ')}</h4><p>Interests are one piece of a good career choice. Compare the actual work, preparation and pay before deciding.</p></div><div class="interest-bars">${sorted.map(a=>`<div class="interest-row"><div class="interest-bar-label"><span>${esc(a.label)}</span><strong>${state.scores[a.code]}</strong></div><div class="interest-bar-track"><span style="width:${Math.round(state.scores[a.code]/max*100)}%"></span></div></div>`).join('')}</div>`;
    const localMatches=(catalog.careers||[]).map(c=>({c,m:careerMatch(c.key)})).filter(x=>x.m).sort((a,b)=>matchOrder(a.c.key)-matchOrder(b.c.key));
    const outOfCatalog=state.matches.filter(m=>!selectedCareer(m.code)).slice(0,6);
    const section=`<div class="personal-results-header"><h4>Explore your next steps</h4><p>${state.matchStatus==='local' ? `${state.matches.length} career profiles have an aligned interest pattern; ${localMatches.length} are shown in this directory. Rankings are locally calculated and are not official O*NET fit ratings. Only reviewed Maricopa program connections are labeled as potential pathways.` : 'Only the starter catalog interest themes are available until the automated O*NET occupational profile download runs. These are not O*NET fit ratings.'}</p></div>`;
    const matched=localMatches.length ? `<div class="suggestion-grid">${localMatches.slice(0,6).map(({c,m})=>`<article class="suggestion-card"><span class="fit-chip ${m.local?'local':''}">${esc(m.fit)}${m.local?' · profile similarity':''}</span><h5>${esc(c.title)}</h5><p>${esc(c.sector)} · ${moneyFmt(live.occupations?.[c.soc]?.annualMedian)} median annual pay</p><div class="suggestion-actions"><button type="button" data-open-career="${esc(c.key)}">View career</button><button type="button" data-shortlist="${esc(c.key)}">${state.saved.includes(c.key)?'Saved ✓':'Save +'}</button></div></article>`).join('')}</div>`:'<div class="empty-state">No matching careers are currently visible in the loaded directory. You can browse the catalog or open official O*NET profiles below.</div>';
    const offsite=outOfCatalog.length ? `<div class="other-matches"><h5>More O*NET matches to explore</h5><p>These careers are not yet mapped to a Maricopa program in this pilot.</p><div class="external-match-list">${outOfCatalog.map(m=>`<a target="_blank" rel="noopener noreferrer" href="https://www.mynextmove.org/profile/summary/${encodeURIComponent(m.code)}">${esc(m.title)} <small>${esc(m.fit||'O*NET match')}</small> ↗</a>`).join('')}</div></div>`:'';
    byId('personal-results').innerHTML=section+matched+offsite+(state.profileNote?`<p class="profile-warning" role="status">${esc(state.profileNote)}</p>`:'');
    byId('download-profile').disabled=false;
    bindResultActions(byId('personal-results'));
  }
  function bindResultActions(el){
    el.querySelectorAll('[data-open-career]').forEach(button=>button.addEventListener('click',()=>openCareer(button.dataset.openCareer)));
    el.querySelectorAll('[data-shortlist]').forEach(button=>button.addEventListener('click',()=>toggleSaved(button.dataset.shortlist)));
  }
  function toggleSaved(soc){
    const key=normalizeKey(soc);
    if(!selectedCareer(key))return;
    if(state.saved.includes(key))state.saved=state.saved.filter(s=>s!==key);
    else if(state.saved.length<3)state.saved.push(key);
    else {alert('Your shortlist holds up to three careers. Remove one to add another.');setTab('saved');return;}
    tryStore('lmi_saved_careers_v2',state.saved);
    renderCareers();renderShortlist();if(state.scores)renderProfile();
  }
  function renderShortlist(){
    const careers=state.saved.map(selectedCareer).filter(Boolean);
    byId('export-shortlist').disabled=!careers.length;
    if(!careers.length){byId('shortlist-grid').innerHTML='<div class="empty-state"><strong>No saved careers yet</strong><p>Browse below and select “Save” on a career card to start comparing up to three options.</p></div>';return;}
    byId('shortlist-grid').innerHTML=careers.map(c=>{
      const v=live.occupations?.[c.soc]||{};
      return `<article class="shortlist-card"><div><span class="sector-tag">${esc(c.sector)}</span><h4>${esc(c.title)}</h4><p>${esc(c.summary)}</p></div><dl><div><dt>Median annual pay</dt><dd>${moneyFmt(v.annualMedian)}</dd></div><div><dt>10th percentile</dt><dd>${moneyFmt(v.annualP10)}</dd></div><div><dt>90th percentile</dt><dd>${moneyFmt(v.annualP90)}</dd></div><div><dt>Local employment</dt><dd>${v.employment == null?'Not available':new Intl.NumberFormat('en-US').format(v.employment)}</dd></div></dl><div class="shortlist-pathways"><strong>Possible Maricopa pathways</strong><ul>${(c.programs||[]).map(p=>`<li>${esc(p)}</li>`).join('')||'<li>No reviewed link yet — use the official Maricopa program catalog.</li>'}</ul></div><div class="suggestion-actions"><button type="button" data-open-career="${esc(c.key)}">Career details</button><button type="button" data-shortlist="${esc(c.key)}">Remove</button></div></article>`;
    }).join('');bindResultActions(byId('shortlist-grid'));
  }
  function exportText(name, text){
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadProfile(){
    if(!state.scores)return;
    const sorted=sortedAreas(state.scores),top=sorted.slice(0,2);
    const lines=[`Maricopa Workforce Insights · Interest discovery`, `Created ${new Date().toLocaleDateString()}`,`Source: ${state.mode}`,`Top interest areas: ${top.map(a=>a.label).join(' + ')}`,'',...sorted.map(a=>`${a.label}: ${state.scores[a.code]}`),'',`Career match source: ${state.matchStatus==='local'?'Local comparison with O*NET Database interest profiles':'Editorial interest themes only'}`,state.profileNote||'',...state.matches.slice(0,12).map(m=>`${m.title} (${m.code}) — ${m.fit}`),'','Interest results are for exploration, not aptitude or employment predictions.'];
    exportText('my-interest-profile.txt',lines.join('\n'));
  }
  function exportPlan(){
    const lines=['MY CAREER EXPLORATION PLAN','Maricopa Workforce Insights · '+new Date().toLocaleDateString(),`Wage reference: BLS OEWS May ${live.oewsPeriod||'not available'}, Phoenix–Mesa–Chandler MSA`,'',...state.saved.map((soc,i)=>{
      const c=selectedCareer(soc),v=live.occupations?.[c?.soc]||{};
      return `${i+1}. ${c.title} (SOC ${c.soc})\nWhat I would do: ${c.summary}\nMetro median annual pay: ${moneyFmt(v.annualMedian)}\nPossible Maricopa programs (confirm in official catalog): ${c.programs?.join('; ')||'No reviewed connection currently listed'}\nMore career details: https://www.mynextmove.org/profile/summary/${c.key}\n`;
    }),`NEXT STEPS\n1. Research daily tasks and training requirements.\n2. Confirm Maricopa program availability, costs and admission requirements.\n3. Discuss options with an academic or career advisor.\nhttps://www.maricopa.edu/degrees-certificates`,'',`Interest themes: ${state.scores?topAreas(state.scores).join(', '):'Not entered'}`,'Program mappings are editorial exploration links, not approved official CIP–SOC crosswalks.'];
    exportText('my-maricopa-career-plan.txt',lines.join('\n'));
  }

  function makeMiniElement(tag,className,textValue){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(textValue!==undefined)el.textContent=textValue;
    return el;
  }
  function renderMiniPage(){
    if(!miniState.bank)return;
    const page=miniState.page,qs=miniState.bank.questions.slice(page*5,page*5+5);
    const host=byId('mini-ip-questions');host.replaceChildren();
    for(const q of qs){
      const field=makeMiniElement('fieldset','mini-question');
      field.append(makeMiniElement('legend','',q.index+'. '+q.text));
      const options=makeMiniElement('div','mini-choice-grid');
      LmiMiniIP.CHOICES.forEach((choice,i)=>{
        const label=makeMiniElement('label','mini-choice');
        const radio=document.createElement('input');
        radio.type='radio';radio.name='mini-item-'+q.index;radio.value=String(i+1);
        radio.dataset.questionIndex=String(q.index);
        radio.checked=miniState.answers[q.index-1]===i+1;
        label.append(radio,makeMiniElement('span','',choice));
        options.append(label);
      });
      field.append(options);host.append(field);
    }
    byId('mini-ip-previous').disabled=page===0;
    byId('mini-ip-next').textContent=page===5?'See my career matches':'Continue';
    byId('mini-ip-message').textContent='';
    updateMiniProgress();
  }
  function updateMiniProgress(){
    const done=miniState.answers.filter(n=>Number.isInteger(n)).length;
    byId('mini-ip-progress').value=done;
    byId('mini-ip-progress-label').textContent=done+' of 30 answered · Page '+(miniState.page+1)+' of 6';
    const visible=miniState.bank?.questions.slice(miniState.page*5,miniState.page*5+5)||[];
    byId('mini-ip-next').disabled=visible.some(q=>!Number.isInteger(miniState.answers[q.index-1]));
  }
  async function openMiniAssessment(){
    setTab('assess');setAssessMode('native');
    byId('widget-area').scrollIntoView({behavior:'smooth',block:'start'});
    if(miniState.bank){renderMiniPage();return;}
    if(miniState.loading)return;
    miniState.loading=true;
    byId('mini-ip-message').textContent='Loading the 30 assessment questions…';
    try{
      const r=await fetch('data/mini_ip_questions.json',{cache:'no-store'});
      if(!r.ok)throw new Error('Mini-IP data has not yet been published.');
      const bank=await r.json();
      if(!LmiMiniIP.validateBank(bank))throw new Error('The assessment dataset is incomplete.');
      miniState.bank=bank;renderMiniPage();
    }catch{
      byId('mini-ip-message').textContent='The on-site questions are not available yet. An authorized O*NET Web Services API key must be configured for the GitHub refresh. You can still use the official website or import your scores below.';
    }finally{miniState.loading=false;}
  }
  function finishMiniAssessment(){
    try{
      const scores=LmiMiniIP.score(miniState.bank,miniState.answers);
      for(const area of areas)byId('score-'+area.code).value=String(scores[area.code]);
      applyProfile(scores,'On-site O*NET Mini-IP questions · local exploratory scoring');
    }catch(e){
      byId('mini-ip-message').textContent=e.message;
    }
  }
  function advanceMiniPage(){
    if(byId('mini-ip-next').disabled)return;
    if(miniState.page<5){miniState.page++;renderMiniPage();byId('mini-ip-panel').scrollIntoView({behavior:'smooth',block:'start'});}
    else finishMiniAssessment();
  }
  function restartMini(){
    miniState.answers=Array(30).fill(null);
    miniState.page=0;
    if(miniState.bank)renderMiniPage();
  }

  let widgetLoadStarted=false;
  async function configureWidget(){
    if(widgetLoadStarted)return;
    widgetLoadStarted=true;
    const container=byId('onet-widget-container');
    const status=byId('onet-widget-status');
    const help=byId('onet-widget-help').querySelector('strong');
    status.textContent='Loading the embedded O*NET Interest Profiler…';
    try{
      const response=await fetch('data/student_config.json',{cache:'no-store'});
      if(!response.ok)throw new Error('Widget configuration unavailable');
      const cfg=await response.json();
      const scriptUrl=String(cfg.onetWidgetScriptSrc||'').trim();
      const iframeUrl=String(cfg.onetWidgetIframeSrc||'').trim();
      const url=scriptUrl||iframeUrl;
      if(!url)throw new Error('Widget not configured');
      const parsed=new URL(url),h=parsed.hostname.toLowerCase();
      if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.hash)throw new Error('Invalid widget source');
      if(scriptUrl){
        if(h!=='services.onetcenter.org' || parsed.pathname!=='/embed/onet-ip.js' || !parsed.searchParams.get('x-api-key'))throw new Error('Unrecognized widget script');
        // Make the target visible before executing the official O*NET loader.
        const target=document.createElement('div');target.className='embed-onet-ip';
        container.replaceChildren(target);
        container.hidden=false;
        const script=document.createElement('script');script.src=url;script.async=true;
        script.addEventListener('load',()=>{status.textContent='O*NET assessment loaded. After completing it, apply your six scores below.';});
        script.addEventListener('error',()=>{
          container.hidden=true;
          status.textContent='The embedded assessment did not load. Use the backup O*NET link below.';
          help.textContent='The embedded assessment is unavailable right now.';
        });
        container.appendChild(script);
      }else{
        if(!['onetcenter.org','onetinterestprofiler.org','mynextmove.org'].some(d=>h===d||h.endsWith('.'+d)))throw new Error('Unrecognized widget host');
        const frame=document.createElement('iframe');frame.src=url;
        frame.title='Official O*NET Interest Profiler';frame.loading='eager';
        frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('allowfullscreen','');
        container.replaceChildren(frame);container.hidden=false;
        status.textContent='The embedded assessment is displayed above. Apply your six scores below when finished.';
      }
      state.widgetConfigured=true;state.widgetUrl=url;
      help.textContent='Take the official profiler here, then apply your six scores below.';
    }catch{
      container.hidden=true;
      status.textContent='The embedded assessment is not available. Use the backup O*NET link below, then enter your scores.';
      help.textContent='The embedded assessment is unavailable right now.';
    }
  }
  function init(){
    renderScoreInputs();
    const saved=tryRead('lmi_saved_careers_v2');state.saved=Array.isArray(saved)?saved.map(normalizeKey).filter(x=>/^\d\d-\d{4}\.\d{2}$/.test(x)).slice(0,3):[];
    const remembered=tryRead('lmi_profile_github_v3');
    if(remembered?.scores && scoresValid(remembered.scores)){
      byId('remember-profile').checked=true;
      state.scores=remembered.scores;state.matches=[];
      state.matchStatus='editorial';state.mode=remembered.mode||'Restored profile';state.profileNote=remembered.profileNote||'';
      byId('match-toolbar').hidden=false;
      byId('match-toolbar-title').textContent='Your saved interest profile';
      byId('match-toolbar-detail').textContent='Results restored from this device.';
    }
    document.querySelectorAll('[data-student-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.studentTab)));
    byId('show-widget').addEventListener('click',()=>{setTab('assess');setAssessMode('scores');byId('interest-import-form').scrollIntoView({behavior:'smooth',block:'nearest'});});
    byId('start-mini-ip').addEventListener('click',openMiniAssessment);
    byId('show-hosted-profiler').addEventListener('click',()=>{setTab('assess');setAssessMode('widget');byId('widget-area').scrollIntoView({behavior:'smooth',block:'start'});});
    byId('mini-ip-questions').addEventListener('change',event=>{
      const input=event.target.closest('input[data-question-index]');
      if(!input)return;
      miniState.answers[Number(input.dataset.questionIndex)-1]=Number(input.value);
      updateMiniProgress();
    });
    byId('mini-ip-previous').addEventListener('click',()=>{if(miniState.page>0){miniState.page--;renderMiniPage();}});
    byId('mini-ip-next').addEventListener('click',advanceMiniPage);
    byId('mini-ip-restart').addEventListener('click',restartMini);
    byId('interest-import-form').addEventListener('submit',importScores);
    byId('clear-profile').addEventListener('click',clearProfile);
    byId('edit-interests').addEventListener('click',()=>setTab('assess'));
    byId('profile-to-careers').addEventListener('click',()=>byId('career-search').scrollIntoView({behavior:'smooth',block:'center'}));
    byId('remember-profile').addEventListener('change',()=>{if(byId('remember-profile').checked)saveProfile();else tryStore('lmi_profile_github_v3',null);});
    byId('download-profile').addEventListener('click',downloadProfile);
    byId('export-shortlist').addEventListener('click',exportPlan);
    byId('show-matches-only').addEventListener('change',renderCareers);
    byId('reset-matches').addEventListener('click',()=>{byId('show-matches-only').checked=false;byId('career-sort').value='title';renderCareers();});
    renderProfile();renderShortlist();renderCareers();
    byId('mini-ip-status').textContent='On-site 30-question activity assessment · browser-only responses';
  }
  window.studentHub={matchForSoc:careerMatch,matchOrder,hasProfile:()=>!!state.scores,toggleSaved,
    isSaved:soc=>state.saved.includes(soc),isMatchOnly:()=>!!byId('show-matches-only')?.checked,
    getProfile:()=>({scores:state.scores,matches:state.matches,matchStatus:state.matchStatus}),
    onCatalogReady:()=>{if(state.scores){recomputeMatches();if(byId('remember-profile').checked)saveProfile();}renderProfile();renderShortlist();renderCareers();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
