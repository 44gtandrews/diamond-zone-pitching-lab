/* Diamond Zone monthly pitch-count calendar — separate manual Firestore data. */
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
const helper={parseMonth,moveMonth,gridDates,band,validCount};
if(typeof module!=='undefined'&&module.exports)module.exports=helper;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const today=new Date();
const state={playerId:null,month:monthKey(today.getFullYear(),today.getMonth()+1),counts:{},selected:null,loading:false,saving:false,loaded:false,nonce:0};
const canView=()=>window.DZ_AUTHORIZED===true&&Boolean(state.playerId);
const canEdit=()=>canView()&&window.DZ_EDIT_ENABLED===true;
const collection=()=>window.DZ_SESSIONS_DB.collection('players').doc(state.playerId).collection('pitchCounts');
function message(t,isError=false){const e=$('dz-count-status');e.textContent=t;e.classList.toggle('cloud-error',isError);}
function reset(){
 state.nonce++;state.playerId=null;state.counts={};state.selected=null;state.loaded=false;state.loading=false;state.saving=false;
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
   tile.setAttribute('aria-label',date+(count?' · '+count+' pitches':' · no pitch count'));
   const number=document.createElement('span');number.className='dz-count-number';number.textContent=String(Number(date.slice(-2)));tile.append(number);
   if(count){const n=document.createElement('strong');n.className='dz-count-value';n.textContent=String(count);tile.append(n);}
   tile.addEventListener('click',()=>{state.selected=date;render();renderEditor();});cells.append(tile);
 }
 $('dz-count-edit-hint').textContent=canEdit()?'Select a date to enter or change its pitch count.':'Pitch counts are view-only for your account.';
}
function renderEditor(){
 const box=$('dz-count-editor');box.hidden=!state.selected||!canEdit();if(box.hidden)return;
 const n=state.counts[state.selected];
 $('dz-count-selected-date').textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(new Date(state.selected+'T12:00:00'));
 $('dz-count-input').value=validCount(n)?String(n):'';
 $('dz-count-delete').disabled=!validCount(n)||state.saving;
 $('dz-count-input').disabled=state.saving;$('dz-count-save').disabled=state.saving;
}
async function load(){
 if(!canView()||state.loading)return;
 const nonce=++state.nonce,pid=state.playerId,month=state.month;
 state.loading=true;state.loaded=false;state.selected=null;message('Loading saved pitch counts…');$('dz-count-editor').hidden=true;render();
 try{
   const query=await collection().where('month','==',month).get();
   if(nonce!==state.nonce||pid!==state.playerId||month!==state.month||!canView())return;
   const counts={};query.forEach(doc=>{const data=doc.data();if(doc.id.startsWith(month+'-')&&data.date===doc.id&&validCount(data.count))counts[doc.id]=data.count;});
   state.counts=counts;state.loaded=true;message('');
 }catch(e){if(nonce===state.nonce){state.counts={};message('Unable to load pitch counts: '+(e.message||e),true);}}
 finally{if(nonce===state.nonce){state.loading=false;render();}}
}
function navigate(step){if(state.saving)return;state.month=moveMonth(state.month,step);state.selected=null;state.counts={};void load();}
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
   if(remove)delete state.counts[date];else state.counts[date]=value;
   message(remove?'Pitch count removed.':'Pitch count saved.');
 }catch(e){if(nonce===state.nonce)message('Could not save pitch count: '+(e.message||e),true);}
 finally{if(nonce===state.nonce){state.saving=false;render();renderEditor();}}
}
$('dz-count-prev').addEventListener('click',()=>navigate(-1));$('dz-count-next').addEventListener('click',()=>navigate(1));
$('dz-count-save').addEventListener('click',()=>void save(false));$('dz-count-delete').addEventListener('click',()=>void save(true));
$('dz-count-cancel').addEventListener('click',()=>{state.selected=null;render();renderEditor();message('');});
$('dz-count-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void save(false);}});
window.DZ_PITCH_COUNTS_RESET=reset;
window.DZ_PITCH_COUNTS_ON_PLAYER=p=>{if(!canView()||!p){reset();return;}if(state.playerId!==p.id){reset();state.playerId=p.id;}};
window.DZ_PITCH_COUNTS_OPEN=id=>{if(canView()&&id===state.playerId&&!state.loading&&!state.loaded)void load();};
reset();
})();