/* DiamondZone monthly pitch-count calendar. Dated TrackMan sessions populate automatically; manual Firestore records override session totals. */
(function(){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const key=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
const monthKey=(y,m)=>y+'-'+pad(m);
function parseMonth(s){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s)))throw Error('Invalid month');return s.split('-').map(Number);}
function moveMonth(s,step){const [y,m]=parseMonth(s),d=new Date(y,m-1+step,1,12);return monthKey(d.getFullYear(),d.getMonth()+1);}
function gridDates(month){
 const [y,m]=parseMonth(month),start=new Date(y,m-1,1,12),shift=(start.getDay()+6)%7;
 const startDay=new Date(y,m-1,1-shift,12),lastDay=new Date(y,m,0,12).getDate(),weeks=Math.ceil((shift+lastDay)/7);
 return Array.from({length:weeks*7},(_,i)=>{const d=new Date(startDay);d.setDate(d.getDate()+i);return key(d.getFullYear(),d.getMonth()+1,d.getDate());});
}
function band(n){return Number.isInteger(n)&&n>=1?(n<=20?'yellow':n<=40?'orange':'red'):'none';}
function validCount(n){return Number.isInteger(n)&&n>=1&&n<=999;}
function autoFromSessions(records,month){
 parseMonth(month);
 const output={};
 for(const session of Array.isArray(records)?records:[]){
   if(!session||session.kind!=='single'||typeof session.date!=='string'||!session.date.startsWith(month+'-'))continue;
   const date=session.date;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
   const dateObj=new Date(date+'T12:00:00');
   if(!Number.isFinite(dateObj.getTime())||
       dateObj.getFullYear()!==Number(date.slice(0,4))||
       dateObj.getMonth()+1!==Number(date.slice(5,7))||
       dateObj.getDate()!==Number(date.slice(8,10)))continue;
   const total=(Array.isArray(session.pitches)?session.pitches:[]).reduce((sum,p)=>{
     return sum+(Number.isSafeInteger(p?.n)&&p.n>0?p.n:0);
   },0);
   if(!Number.isSafeInteger(total)||total<1)continue;
   if(!output[date])output[date]={count:0,sessions:0};
   output[date].count+=total;
   output[date].sessions++;
 }
 return output;
}
function combineCounts(manual,automatic){
 const combined={};
 for(const [date,entry] of Object.entries(automatic||{}))
   if(Number.isSafeInteger(entry?.count)&&entry.count>0)combined[date]=entry.count;
 for(const [date,count] of Object.entries(manual||{}))
   if(validCount(count))combined[date]=count;
 return combined;
}
const helper={parseMonth,moveMonth,gridDates,band,validCount,autoFromSessions,combineCounts};
if(typeof module!=='undefined'&&module.exports)module.exports=helper;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const today=new Date();
const state={playerId:null,month:monthKey(today.getFullYear(),today.getMonth()+1),counts:{},manualCounts:{},autoDetails:{},selected:null,loading:false,saving:false,loaded:false,nonce:0};
const canView=()=>window.DZ_AUTHORIZED===true&&Boolean(state.playerId);
const canEdit=()=>canView()&&window.DZ_EDIT_ENABLED===true;
const collection=()=>window.DZ_SESSIONS_DB.collection('players').doc(state.playerId).collection('pitchCounts');
function message(t,isError=false){const e=$('dz-count-status');e.textContent=t;e.classList.toggle('cloud-error',isError);}
function reset(){
 state.nonce++;state.playerId=null;state.counts={};state.manualCounts={};state.autoDetails={};state.selected=null;state.loaded=false;state.loading=false;state.saving=false;
 const d=new Date();state.month=monthKey(d.getFullYear(),d.getMonth()+1);
 $('dz-count-calendar').replaceChildren();$('dz-count-editor').hidden=true;message('');
}
function render(){
 const [year,month]=parseMonth(state.month);
 $('dz-count-month-title').textContent=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(year,month-1,1,12));
 const cells=$('dz-count-calendar');cells.replaceChildren();
 for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){
   const head=document.createElement('div');head.className='dz-count-day-header';head.textContent=day;cells.append(head);
 }
 const today=new Date(),todayKey=key(today.getFullYear(),today.getMonth()+1,today.getDate());
 for(const date of gridDates(state.month)){
   const sameMonth=date.startsWith(state.month+'-'),count=state.counts[date];
   const tile=document.createElement('button');tile.type='button';
   tile.className='dz-count-day dz-count-'+band(count)+(sameMonth?'':' dz-count-other')+(date===todayKey?' dz-count-today':'')+(date===state.selected?' dz-count-selected':'');
   tile.disabled=!sameMonth||state.loading;
   const isManual=Object.prototype.hasOwnProperty.call(state.manualCounts,date);
   const source=isManual?'manual correction':state.autoDetails[date]?'TrackMan session':'';
   tile.setAttribute('aria-label',date+(count?' · '+count+' pitches'+(source?' · '+source:''):' · no pitch count'));
   const number=document.createElement('span');number.className='dz-count-number';number.textContent=String(Number(date.slice(-2)));tile.append(number);
   if(count){
     const n=document.createElement('strong');n.className='dz-count-value';n.textContent=String(count);tile.append(n);
     const label=document.createElement('small');label.className='dz-count-origin';
     label.textContent=isManual?'Edited':'TrackMan';tile.append(label);
   }
   tile.addEventListener('click',()=>{state.selected=date;render();renderEditor();});cells.append(tile);
 }
 $('dz-count-edit-hint').textContent=canEdit()?'TrackMan sessions populate automatically. Select a date to enter or correct a count.':'Dated TrackMan sessions populate automatically. Pitch counts are view-only for your account.';
}
function renderEditor(){
 const box=$('dz-count-editor');box.hidden=!state.selected||!canEdit();if(box.hidden)return;
 const n=state.counts[state.selected];
 const auto=state.autoDetails[state.selected];
 const isManual=Object.prototype.hasOwnProperty.call(state.manualCounts,state.selected);
 $('dz-count-selected-date').textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(new Date(state.selected+'T12:00:00'));
 $('dz-count-input').value=Number.isSafeInteger(n)&&n>0?String(n):'';
 $('dz-count-source').textContent=isManual
   ? 'Manual correction saved'+(auto?' · TrackMan total: '+auto.count+' pitches from '+auto.sessions+' session(s)':'')
   : auto?'Auto-filled from '+auto.sessions+' TrackMan session(s). Editing saves a manual correction.':'No TrackMan session for this date. Enter a pitch count manually.';
 $('dz-count-delete').textContent=auto?'Use TrackMan count':'Remove';
 $('dz-count-delete').disabled=!isManual||state.saving;
 $('dz-count-input').disabled=state.saving;$('dz-count-save').disabled=state.saving;
}
async function load(){
 if(!canView())return;
 const nonce=++state.nonce,pid=state.playerId,month=state.month;
 state.loading=true;state.loaded=false;state.selected=null;message('Loading pitch counts and dated TrackMan sessions…');$('dz-count-editor').hidden=true;render();
 try{
   // Monthly sessions are the immutable source; manual dates are independent overrides.
   // Querying on one date field avoids a composite Firestore index.
   const [manualSnapshot,sessionSnapshot]=await Promise.all([
     collection().where('month','==',month).get(),
     window.DZ_SESSIONS_DB.collection('players').doc(pid).collection('sessions')
       .where('date','>=',month+'-01').where('date','<=',month+'-31').get()
   ]);
   if(nonce!==state.nonce||pid!==state.playerId||month!==state.month||!canView())return;
   const manual={};manualSnapshot.forEach(doc=>{
     const data=doc.data();
     if(doc.id.startsWith(month+'-')&&data.date===doc.id&&validCount(data.count))manual[doc.id]=data.count;
   });
   const sessions=[];sessionSnapshot.forEach(doc=>sessions.push(doc.data()));
   state.manualCounts=manual;
   state.autoDetails=autoFromSessions(sessions,month);
   state.counts=combineCounts(manual,state.autoDetails);
   state.loaded=true;message('');
 }catch(e){if(nonce===state.nonce){
   state.counts={};state.manualCounts={};state.autoDetails={};
   message('Unable to load pitch counts: '+(e.message||e),true);
 }}
 finally{if(nonce===state.nonce){state.loading=false;render();}}
}
function navigate(step){if(state.saving)return;state.month=moveMonth(state.month,step);state.selected=null;state.counts={};state.manualCounts={};state.autoDetails={};void load();}
async function save(remove=false){
 if(!canEdit()||!state.loaded||!state.selected||state.saving)return;
 const date=state.selected,player=state.playerId,nonce=state.nonce;if(!date.startsWith(state.month+'-'))return;
 const raw=$('dz-count-input').value.trim(),value=Number(raw);
 if(!remove&&(!validCount(value)||!/^([1-9]\d{0,2})$/.test(raw))){message('Enter a whole number between 1 and 999.',true);return;}
 state.saving=true;renderEditor();message(remove?'Removing count…':'Saving count…');
 try{
   const user=firebase.auth().currentUser;if(!user?.email)throw Error('Sign in again before saving.');
   const ref=collection().doc(date);
   if(remove)await ref.delete();
   else await ref.set({date,month:state.month,count:value,updatedBy:user.email.toLowerCase(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
   if(nonce!==state.nonce||player!==state.playerId)return;
   if(remove)delete state.manualCounts[date];else state.manualCounts[date]=value;
   state.counts=combineCounts(state.manualCounts,state.autoDetails);
   message(remove?(state.autoDetails[date]?'Manual correction removed; TrackMan count restored.':'Pitch count removed.'):'Manual pitch count saved.');
 }catch(e){if(nonce===state.nonce)message('Could not save pitch count: '+(e.message||e),true);}
 finally{if(nonce===state.nonce){state.saving=false;render();renderEditor();}}
}
$('dz-count-prev').addEventListener('click',()=>navigate(-1));$('dz-count-next').addEventListener('click',()=>navigate(1));
$('dz-count-save').addEventListener('click',()=>void save(false));$('dz-count-delete').addEventListener('click',()=>void save(true));
$('dz-count-cancel').addEventListener('click',()=>{state.selected=null;render();renderEditor();message('');});
$('dz-count-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void save(false);}});
window.DZ_PITCH_COUNTS_RESET=reset;
window.DZ_PITCH_COUNTS_ON_PLAYER=p=>{if(window.DZ_AUTHORIZED!==true||!p){reset();return;}if(state.playerId!==p.id){reset();state.playerId=p.id;}};
window.DZ_PITCH_COUNTS_OPEN=id=>{if(canView()&&id===state.playerId&&!state.loading&&!state.loaded)void load();};
window.DZ_PITCH_COUNTS_REFRESH=id=>{
 if(canView()&&id===state.playerId&&!state.saving){
   state.loaded=false;
   if(document.getElementById('panel-pitch-counts')?.classList.contains('active'))void load();
 }
};
reset();
})();