/* DiamondZone player directory: seven calendar days of recorded pitch counts.
 * Staff-only directory. Uses the same TrackMan/manual precedence as Pitch Counts.
 */
(function(){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function recentDays(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Invalid reference date');
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  return Array.from({length:7},(_,i)=>{
    const day=new Date(today);
    day.setDate(today.getDate()-6+i);
    return {date:day.getFullYear()+'-'+pad(day.getMonth()+1)+'-'+pad(day.getDate()),
      label:weekdays[day.getDay()]+' '+day.getDate()};
  });
}
function weekSummary(days,sessions,manualDocs,utils){
  if(!Array.isArray(days)||days.length!==7)throw Error('Seven calendar days required');
  const validDates=new Set(days.map(d=>d.date));
  const months=[...new Set(days.map(d=>d.date.slice(0,7)))];
  const automatic={};
  for(const month of months)Object.assign(automatic,utils.autoFromSessions(sessions,month));
  const manual={},types={};
  for(const doc of manualDocs||[]){
    const d=doc?.data;
    if(!d||!validDates.has(doc.id)||d.date!==doc.id||!utils.validCount(d.count))continue;
    manual[doc.id]=d.count;
    if(utils.validType(d.type))types[doc.id]=d.type;
  }
  const combined=utils.combineCounts(manual,automatic);
  const daily=days.map(({date,label})=>{
    const manualEntry=Object.prototype.hasOwnProperty.call(manual,date);
    const autoEntry=Boolean(automatic[date]);
    const count=Number(combined[date]||0);
    return {date,label,count,hasEntry:manualEntry||autoEntry,
      source:manualEntry?'manual':autoEntry?'trackman':'none',
      type:manualEntry?(types[date]||null):null};
  });
  return {daily,total:daily.reduce((sum,d)=>sum+d.count,0),
    hasEntries:daily.some(d=>d.hasEntry)};
}
async function loadPlayerWeek(db,id,days,utils){
  const start=days[0].date,end=days[days.length-1].date;
  const ref=db.collection('players').doc(id);
  const [sessionsSnapshot,manualSnapshot]=await Promise.all([
    ref.collection('sessions').where('date','>=',start).where('date','<=',end).get(),
    ref.collection('pitchCounts').where('date','>=',start).where('date','<=',end).get()
  ]);
  const sessions=[],manual=[];
  sessionsSnapshot.forEach(doc=>sessions.push(doc.data()));
  manualSnapshot.forEach(doc=>manual.push({id:doc.id,data:doc.data()}));
  return weekSummary(days,sessions,manual,utils);
}
const api={recentDays,weekSummary,loadPlayerWeek};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document==='undefined')return;

const $=id=>document.getElementById(id);
const arsenalBtn=$('dz-directory-arsenal-view');
const weeklyBtn=$('dz-directory-weekly-view');
if(!arsenalBtn||!weeklyBtn)return;
const state={mode:'arsenal',generation:0,arsenal:new Map(),cache:new Map(),weekKey:null};
const rows=()=>Array.from(document.querySelectorAll('#dz-roster-results a.player-row[data-player-id]'));
const isStaff=()=>window.DZ_AUTHORIZED===true&&['admin','pitching_coach','coach'].includes(window.DZ_ROLE);
const esc=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function status(t){
  const el=$('dz-weekly-status');
  el.hidden=!t;el.textContent=t;
}
function updateControls(days){
  const weekly=state.mode==='weekly';
  arsenalBtn.classList.toggle('active',!weekly);weeklyBtn.classList.toggle('active',weekly);
  arsenalBtn.setAttribute('aria-pressed',String(!weekly));
  weeklyBtn.setAttribute('aria-pressed',String(weekly));
  $('dz-directory-order-text').textContent=weekly
    ?'Daily pitches · '+days[0].date+' to '+days[6].date
    :'Pitches ranked by usage · Grades relative to age';
  $('dz-weekly-legend').hidden=!weekly;
  $('dz-scouting-key').hidden=weekly;
  $('dz-directory-footnote').textContent=weekly
    ?'Last seven calendar days, including today. Dated TrackMan sessions are summed by day; manual calendar corrections take priority. — means no recorded pitches, not necessarily a rest day.'
    :'Scouting grades are saved by coaches, relative to each pitcher’s age group. Select a pitcher to open the full profile.';
  $('dz-directory-week-range').textContent=days[0].label+' – '+days[6].label;
  $('dz-scroll-scale').textContent=weekly?'Workload key ↗':'20–80 scale ↗';
  document.querySelectorAll('#dz-roster-results .dz-roster-columns').forEach(head=>{
    const columns=head.children;
    if(columns.length>1)columns[1].textContent=weekly
      ?'Last 7 days · Daily pitches + total':'Pitch arsenal · ranked by usage';
  });
}
function captureArsenal(){
  state.arsenal.clear();
  for(const row of rows()){
    const el=row.querySelector('.dz-pitch-usage');
    if(el)state.arsenal.set(row.dataset.playerId,
      {nodes:Array.from(el.childNodes).map(node=>node.cloneNode(true)),
       label:el.getAttribute('aria-label')});
  }
}
function restoreArsenal(){
  for(const row of rows()){
    const el=row.querySelector('.dz-pitch-usage');
    const saved=state.arsenal.get(row.dataset.playerId);
    if(!saved||!el)continue;
    el.replaceChildren(...saved.nodes.map(node=>node.cloneNode(true)));
    if(saved.label)el.setAttribute('aria-label',saved.label);
    else el.removeAttribute('aria-label');
  }
}
function renderWeek(summary,days){
  if(!summary)return '<div class="dz-week-placeholder" role="status">Loading pitch counts…</div>';
  if(summary.error)return '<div class="dz-week-error">Counts unavailable · try switching views</div>';
  const cells=summary.daily.map(d=>{
    const band=d.count>0?(d.count<=20?'yellow':d.count<=40?'orange':'red'):'none';
    const title=d.date+': '+(d.hasEntry?d.count+' pitches'+
      (d.source==='manual'?' · '+(d.type==='game'?'Game':d.type==='bullpen'?'Bullpen':'Edited'):' · TrackMan'):'no recorded pitches');
    return '<span class="dz-week-cell dz-week-'+band+'" title="'+esc(title)+'" aria-label="'+esc(title)+'">'+
      '<small>'+esc(d.label)+'</small><strong>'+(d.hasEntry?d.count:'—')+'</strong></span>';
  }).join('');
  return '<div class="dz-week-count-grid" aria-label="Daily pitch counts from '+days[0].date+' through '+days[6].date+'">'+
    cells+'<span class="dz-week-total" title="Recorded pitches over the last seven days">'+
    '<small>Total</small><strong>'+(summary.hasEntries?summary.total:'—')+'</strong></span></div>';
}
function putRow(row,summary,days){
  const el=row?.querySelector('.dz-pitch-usage');
  if(!el)return;
  el.classList.add('dz-week-data');
  el.innerHTML=renderWeek(summary,days);
  el.setAttribute('aria-label','Seven-day pitch counts, '+days[0].date+' through '+days[6].date);
}
async function loadWeek(days,token){
  if(!isStaff())return;
  const db=window.DZ_SESSIONS_DB,utils=window.DZ_PITCH_COUNT_UTILS;
  if(!db||!utils){status('Pitch counts unavailable. Reload the page and try again.');return;}
  const list=rows();
  const pending=list.filter(row=>!state.cache.has(row.dataset.playerId));
  for(const row of list)putRow(row,state.cache.get(row.dataset.playerId),days);
  if(!pending.length){status('');return;}
  let next=0,done=0,failed=0;
  status('Loading pitch counts · 0 / '+pending.length+' players');
  const worker=async()=>{
    while(next<pending.length && token===state.generation && state.mode==='weekly'){
      const row=pending[next++],id=row.dataset.playerId;
      let result;
      try{result=await loadPlayerWeek(db,id,days,utils);}
      catch(error){
        console.warn('Unable to load seven-day counts for a player',error);
        result={error:true};failed++;
      }
      if(token!==state.generation||state.mode!=='weekly'||!isStaff())return;
      state.cache.set(id,result);
      if(row.isConnected)putRow(row,result,days);
      done++;
      status(done<pending.length
        ?'Loading pitch counts · '+done+' / '+pending.length+' players'
        :failed?failed+' player'+(failed===1?'':'s')+' unavailable · Switch views to retry':'');
    }
  };
  await Promise.all(Array.from({length:Math.min(6,pending.length)},()=>worker()));
}
function display(mode,{fresh=false}={}){
  if(!isStaff())return;
  state.mode=mode==='weekly'?'weekly':'arsenal';
  const days=recentDays(),stamp=days[6].date;
  const token=++state.generation;
  if(stamp!==state.weekKey||fresh){state.cache.clear();state.weekKey=stamp;}
  updateControls(days);
  if(state.mode==='arsenal'){
    restoreArsenal();
    document.querySelectorAll('#dz-roster-results .dz-pitch-usage').forEach(el=>el.classList.remove('dz-week-data'));
    status('');
    return;
  }
  void loadWeek(days,token);
}
arsenalBtn.addEventListener('click',()=>display('arsenal'));
weeklyBtn.addEventListener('click',()=>display('weekly',{fresh:true}));
window.DZ_WEEKLY_DIRECTORY_ON_RENDER=()=>{
  state.generation++;
  state.cache.clear();
  captureArsenal();
  display(state.mode);
};
window.DZ_WEEKLY_DIRECTORY_RESET=()=>{
  state.generation++;
  state.cache.clear();
};
})();