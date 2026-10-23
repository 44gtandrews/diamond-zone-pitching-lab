/* Session-aware player profile controls. Does not alter coach notes or grades. */
(() => {
'use strict';
let state={id:null,records:[],mode:'auto',comparing:false,earlier:null,later:null},version=0;
const $=id=>document.getElementById(id);
const math=()=>window.DZ_HISTORY_MATH;
function today(){
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
const total=record=>(record.pitches||[]).reduce((sum,p)=>sum+(p.n||0),0);
function chooseOptions(select,records){
 select.replaceChildren();
 for(const row of records){
  const o=document.createElement('option');
  o.value=row.id;
  o.textContent=(row.kind==='baseline'?'Fall 2026 Baseline':
   row.kind==='historical'?'Historical summary':math().textDate(row.date))+
   ' · '+total(row)+' pitches';
  select.appendChild(o);
 }
}
function initSelects(){
 const entries=math().normalizedSessions(state.records);
 const period=$('dz-session-period');
 while(period.options.length>5)period.remove(5);
 for(const entry of entries){
  if(entry.kind==='baseline')continue;
  const o=document.createElement('option');o.value=entry.id;
  o.textContent=(entry.kind==='historical'?'Historical multi-session summary (undated)':math().textDate(entry.date))+' · '+total(entry)+' pitches';
  period.appendChild(o);
 }
 const baseline=period.querySelector('option[value="baseline"]');
 baseline.disabled=!entries.some(e=>e.kind==='baseline');
 chooseOptions($('dz-compare-a'),entries);
 chooseOptions($('dz-compare-b'),entries);
 if(entries.length){
  state.earlier=entries[entries.length-1].id;
  state.later=entries[0].id;
  $('dz-compare-a').value=state.earlier;
  $('dz-compare-b').value=state.later;
 }
 $('dz-session-compare').disabled=entries.length<2;
}
function renderHistory(player){
 const rows=math().normalizedSessions(state.records);
 $('dz-session-history').style.display='';
 let html='<thead><tr><th>Date / period</th><th>Pitches</th><th>FB avg</th><th>FB max</th><th>View</th></tr></thead><tbody>';
 for(const row of rows){
  const pitch=(row.pitches||[]).find(p=>p.key==='fb');
  const label=row.kind==='baseline'?'Fall 2026 Baseline':
    row.kind==='historical'?'Historical summary (undated)':math().textDate(row.date);
  html+='<tr><td>'+dzEscapeText(label)+(row.kind==='single'?'':'<div class="dz-source-note">Combined historical aggregate · not one session</div>')+'</td>'+
   '<td>'+(total(row)||'—')+'</td><td>'+fmt(pitch?.velo)+'</td><td>'+fmt(pitch?.veloMax)+'</td>'+
   '<td><button data-session-id="'+dzEscapeText(row.id)+'" type="button">View</button></td></tr>';
 }
 $('dz-session-history-table').innerHTML=html+'</tbody>';
 $('dz-session-history-table').querySelectorAll('button[data-session-id]').forEach(btn=>{
  btn.addEventListener('click',()=>{
   const entry=rows.find(row=>row.id===btn.dataset.sessionId);
   $('dz-session-period').value=entry?.kind==='baseline'?'baseline':btn.dataset.sessionId;
   refresh(player);
   $('dz-session-controls').scrollIntoView({behavior:'smooth',block:'start'});
  });
 });
}
const fmtNum=(p,f)=>p&&typeof p[f]==='number'&&Number.isFinite(p[f])?
 p[f].toFixed(f==='spin'?0:2):'—';
const delta=(a,b,f)=>a&&b&&Number.isFinite(a[f])&&Number.isFinite(b[f])?
 ((b[f]-a[f])>0?'+':'')+(b[f]-a[f]).toFixed(f==='spin'?0:2):'—';
function renderCompare(player){
 const panel=$('dz-session-comparison');
 panel.style.display=state.comparing?'block':'none';
 if(!state.comparing)return;
 const older=math().selection(state.records,player,state.earlier,today());
 const newer=math().selection(state.records,player,state.later,today());
 const a=new Map(older.pitches.map(p=>[p.key,p]));
 const b=new Map(newer.pitches.map(p=>[p.key,p]));
 const all=new Set([...a.keys(),...b.keys()]);
 let html='<thead><tr><th>Pitch / metric</th><th>Earlier</th><th>Later</th><th>Change</th></tr></thead><tbody>';
 const points=[],connectors=[];
 for(const key of all){
  const left=a.get(key),right=b.get(key),name=dzEscapeText(left?.name||right?.name||key);
  for(const [field,label] of [['velo','Avg velocity'],['veloMax','Max velocity'],['ivb','IVB'],['hb','Horizontal break'],['spin','Spin']]){
   if((left?.[field]??null)===null&&(right?.[field]??null)===null)continue;
   html+='<tr><td>'+name+' · '+label+'</td><td>'+fmtNum(left,field)+'</td><td>'+fmtNum(right,field)+'</td><td>'+delta(left,right,field)+'</td></tr>';
  }
  const color=cssColor(key);
  if(left?.ivb!=null&&left?.hb!=null){
   points.push({x:left.hb,y:left.ivb,color,outline:true,tooltip:'<strong>'+name+' · Earlier</strong> IVB '+fmt(left.ivb)+'" · HB '+fmt(left.hb)+'"'});
  }
  if(right?.ivb!=null&&right?.hb!=null){
   points.push({x:right.hb,y:right.ivb,color,tooltip:'<strong>'+name+' · Later</strong> IVB '+fmt(right.ivb)+'" · HB '+fmt(right.hb)+'"'});
  }
  if(left?.ivb!=null&&left?.hb!=null&&right?.ivb!=null&&right?.hb!=null){
   connectors.push({x1:left.hb,y1:left.ivb,x2:right.hb,y2:right.ivb,color});
  }
 }
 $('dz-compare-table').innerHTML=html+'</tbody>';
 if(points.length){
  scatterChart('chart-move',points,'Horz. break (in) →','↑ IVB (in)',false,connectors);
  $('move-caption').textContent='Comparison: hollow circles = earlier · solid circles = later · dashed lines connect pitch types.';
 }
}
function refresh(player){
 if(player.id!==state.id)return;
 state.mode=$('dz-session-period').value;
 const view=math().selection(state.records,player,state.mode,today());
 player._periodView=view;
 const n=view.pitches.reduce((sum,p)=>sum+(p.n||0),0);
 const isLifetime=view.mode==='lifetime';
 $('dz-session-status').textContent=(state.mode==='auto'?'Auto · ':'')+view.label+
   ' · '+(isLifetime?'Career aggregate':view.sessions.length+' session'+(view.sessions.length===1?'':'s'))+
   ' · '+n+' pitches'+(view.mode==='baseline'?' · undated historical data':'');
 renderOverview(player);
 renderCompare(player);
}
async function load(player){
 const nonce=++version;
 $('dz-session-controls').style.display=player.dataType==='aggregate'?'':'none';
 $('dz-session-history').style.display='none';
 delete player._periodView;
 if(player.dataType!=='aggregate')return;
 state={id:player.id,records:[],mode:'auto',comparing:false,earlier:null,later:null};
 $('dz-session-status').textContent='Loading session history...';
 $('dz-session-period').value='auto';
 $('dz-session-comparison').style.display='none';
 $('dz-session-compare').textContent='Compare sessions';
 try{
  if(!window.DZ_SESSIONS_DB)throw Error('Session database not connected');
  const snapshot=await window.DZ_SESSIONS_DB.collection('players').doc(player.id).collection('sessions').get();
  if(nonce!==version||currentPlayerId!==player.id)return;
  state.records=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
  // Undated pre-upgrade player aggregate is visible as an in-memory baseline.
  // Never manufacture individual historical sessions or dates.
  if(!state.records.length&&(player.pitches||[]).length){
   state.records=[{id:'fall-2026-baseline',kind:'baseline',date:null,
    label:'Fall 2026 Baseline',pitches:player.pitches,sourceSessionCount:player.sessions}];
  }
  initSelects();renderHistory(player);refresh(player);
 }catch(e){
  if(nonce!==version)return;
  console.warn('Session history read failed; using original aggregate',e);
  $('dz-session-status').textContent='Lifetime aggregate · session history temporarily unavailable';
  $('dz-session-compare').disabled=true;
  renderOverview(player);
 }
}
$('dz-session-period').addEventListener('change',()=>{const player=PLAYERS[currentPlayerId];if(player)refresh(player);});
$('dz-session-compare').addEventListener('click',()=>{
 const player=PLAYERS[currentPlayerId];if(!player||state.id!==player.id)return;
 state.comparing=!state.comparing;
 $('dz-session-compare').textContent=state.comparing?'Close comparison':'Compare sessions';
 refresh(player);
});
for(const [side,id] of [['earlier','dz-compare-a'],['later','dz-compare-b']]){
 $(id).addEventListener('change',e=>{
  const player=PLAYERS[currentPlayerId];if(!player)return;
  state[side]=e.target.value;refresh(player);
 });
}
window.DZ_LOAD_SESSION_PROFILE=load;
})();