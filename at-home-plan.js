/* Diamond Zone · administrator-only reusable training days and weekly calendar.
   Templates: players/{id}/atHomeDays/library
   Calendar:  players/{id}/atHomePlans/{Monday ISO date}
   Legacy weekly exercise rows remain intact in the original calendar document. */
(function(){
'use strict';
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const CATEGORIES=['Throwing','Strength','Mobility','Recovery','Other'];
const COLORS=['#61DD4D','#F8AD38','#50A3F8','#F9EA59','#9D83EF','#E96D55','#66CDB7','#879CA8'];
const MAX_TEMPLATES=40,MAX_ROWS=35;
function pad(n){return String(n).padStart(2,'0');}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parseDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))throw Error('Invalid date');const a=s.split('-').map(Number),d=new Date(a[0],a[1]-1,a[2],12);if(key(d)!==s)throw Error('Invalid date');return d;}
function monday(v){const d=v instanceof Date?new Date(v.getFullYear(),v.getMonth(),v.getDate(),12):parseDate(v);d.setDate(d.getDate()-(d.getDay()+6)%7);return key(d);}
function shiftWeek(s,n){const d=parseDate(monday(s));d.setDate(d.getDate()+7*n);return key(d);}
function weekDates(s){const d=parseDate(monday(s));return DAYS.map((_,i)=>{const x=new Date(d);x.setDate(x.getDate()+i);return key(x);});}
function newRow(){return {category:'Throwing',exercise:'',notes:'',resource:''};}
function cleanRow(r){
 r=r&&typeof r==='object'?r:{};
 return {category:CATEGORIES.includes(r.category)?r.category:'Other',exercise:String(r.exercise||''),notes:String(r.notes||''),resource:String(r.resource||'')};
}
function cleanTemplate(t){t=t&&typeof t==='object'?t:{};return {id:String(t.id||''),name:String(t.name||''),color:COLORS.includes(t.color)?t.color:COLORS[0],rows:(Array.isArray(t.rows)?t.rows:[]).slice(0,MAX_ROWS).map(cleanRow)};}
function emptySchedule(){return DAYS.map(()=>[]);}
function cleanSchedule(v){return DAYS.map((_,i)=>(Array.isArray(v&&v[i])?v[i]:[]).filter(x=>typeof x==='string').slice(0,4));}
function validResource(v){if(!v)return true;try{return new URL(v).protocol==='https:';}catch(_){return false;}}
function legacyToDraft(rows,week){
 const result={templates:[],schedule:emptySchedule()};
 DAYS.forEach((day,i)=>{
  const mine=(Array.isArray(rows)?rows:[]).filter(r=>r&&r.day===day);
  if(!mine.length)return;
  const t={id:'legacy-'+week+'-'+i,name:day+' · Previous Plan',color:COLORS[i%COLORS.length],rows:mine.map(r=>{
    const prescription=String(r.prescription||'').trim(),notes=String(r.notes||'').trim();
    return cleanRow({category:r.category,exercise:r.exercise,notes:prescription?('Prescription: '+prescription+(notes?' · '+notes:'')):notes,resource:r.resource});
  }).slice(0,MAX_ROWS)};
  result.templates.push(t);result.schedule[i]=[t.id];
 });
 return result;
}
const helpers={monday,shiftWeek,weekDates,cleanSchedule,cleanTemplate,validResource,legacyToDraft};
if(typeof module!=='undefined'&&module.exports)module.exports=helpers;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const state={playerId:null,week:monday(new Date()),library:[],schedule:emptySchedule(),title:'',notes:'',legacyRows:[],libraryRev:0,weekRev:0,loaded:false,loading:false,saving:false,libraryDirty:false,weekDirty:false,nonce:0,selectedId:null};
function admin(){return window.DZ_AUTHORIZED===true&&window.DZ_IS_ADMIN===true&&window.DZ_ROLE==='admin';}
function dirty(){return state.libraryDirty||state.weekDirty;}
function status(msg,error){const el=$('dz-plan-status');if(el){el.textContent=msg;el.classList.toggle('cloud-error',!!error);}}
function caution(){return !dirty()||!admin()||window.confirm('Discard unsaved changes to the at-home training plan?');}
function setBusy(b){
 ['dz-plan-prev','dz-plan-next','dz-plan-week','dz-plan-copy','dz-plan-save','dz-day-new','dz-day-duplicate','dz-day-delete','dz-day-add-row','dz-day-name','dz-day-color','dz-plan-title','dz-plan-notes'].forEach(id=>{if($(id))$(id).disabled=b;});
 $('panel-at-home').querySelectorAll('.dz-calendar-cell select,.dz-calendar-cell button,#dz-plan-rows input,#dz-plan-rows select,#dz-plan-rows button').forEach(el=>el.disabled=b);
}
function markLibrary(){state.libraryDirty=true;status('Unsaved changes · select Save.',false);}
function markWeek(){state.weekDirty=true;status('Unsaved changes · select Save.',false);}
function libraryRef(){if(!admin()||!state.playerId)throw Error('Administrator required');return window.DZ_SESSIONS_DB.collection('players').doc(state.playerId).collection('atHomeDays').doc('library');}
function weekRef(week=state.week){if(!admin()||!state.playerId)throw Error('Administrator required');return window.DZ_SESSIONS_DB.collection('players').doc(state.playerId).collection('atHomePlans').doc(week);}
function el(tag,cls,text){
 const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a;
}
function option(select,value,label){const o=el('option',null,label);o.value=value;select.append(o);}
function addCell(tr,child){const td=el('td');td.append(child);tr.append(td);return td;}
function selected(){return state.library.find(t=>t.id===state.selectedId)||null;}
function renderDates(){
 const dates=weekDates(state.week);
 $('dz-plan-week').value=state.week;
 const first=parseDate(dates[0]),last=parseDate(dates[6]);
 const fmt=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});
 $('dz-plan-date-range').textContent=fmt.format(first)+' – '+fmt.format(last)+', '+last.getFullYear();
 const root=$('dz-plan-calendar');root.replaceChildren();
 DAYS.forEach((day,i)=>{
  const cell=el('div','dz-calendar-cell');
  const head=el('div','dz-calendar-head');
  head.append(el('strong',null,day.slice(0,3)),el('span',null,new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(parseDate(dates[i]))));
  cell.append(head);
  const cards=el('div','dz-calendar-assignments');
  state.schedule[i].forEach((id,index)=>{
   const t=state.library.find(x=>x.id===id);
   const card=el('div','dz-calendar-block');
   card.style.backgroundColor=t?t.color:'#667D85';
   const label=el('button','dz-calendar-block-name',t?t.name:'Deleted day');
   label.type='button';label.title='Edit this day';label.addEventListener('click',()=>{if(t){state.selectedId=id;renderLibrary();renderEditor();$('dz-day-editor').scrollIntoView({block:'nearest',behavior:'smooth'});}});
   const remove=el('button','dz-calendar-remove','×');remove.type='button';remove.title='Remove from '+day;
   remove.setAttribute('aria-label','Remove '+(t?t.name:'assignment')+' from '+day);
   remove.addEventListener('click',()=>{state.schedule[i].splice(index,1);renderDates();markWeek();});
   card.append(label,remove);cards.append(card);
  });
  cell.append(cards);
  const chooser=el('select','dz-calendar-picker');
  chooser.setAttribute('aria-label','Assign a saved training day to '+day);
  option(chooser,'','+ Assign day');
  state.library.forEach(t=>option(chooser,t.id,t.name));
  chooser.value='';
  chooser.addEventListener('change',()=>{
   const id=chooser.value;chooser.value='';
   if(!id)return;
   if(state.schedule[i].length>=4){status('Maximum four training days per calendar date.',true);return;}
   if(!state.schedule[i].includes(id)){state.schedule[i].push(id);renderDates();markWeek();}
   else status('That training day is already assigned to '+day+'.',true);
  });
  cell.append(chooser);root.append(cell);
 });
}
function renderLibrary(){
 const list=$('dz-day-list');list.replaceChildren();
 if(!state.library.length){list.append(el('p','dz-plan-hint','No saved training days yet. Create a day, add exercises, then assign it to the calendar.'));return;}
 state.library.forEach(t=>{
  const btn=el('button','dz-library-item'+(t.id===state.selectedId?' selected':''));
  btn.type='button';
  const dot=el('span','dz-library-dot');dot.style.backgroundColor=t.color;
  btn.append(dot,el('span',null,t.name||'Untitled Day'));
  btn.addEventListener('click',()=>{state.selectedId=t.id;renderLibrary();renderEditor();});
  list.append(btn);
 });
}
function editField(row,index,field,max){
 const input=el('input','dz-plan-cell');input.type='text';input.value=row[field];input.maxLength=max;
 input.setAttribute('aria-label',field+' row '+(index+1));
 input.addEventListener('input',()=>{row[field]=input.value;markLibrary();});
 return input;
}
function renderEditor(){
 const t=selected(),root=$('dz-day-editor');
 root.style.display=t?'':'none';
 if(!t)return;
 $('dz-day-name').value=t.name;
 $('dz-day-color').value=t.color;
 $('dz-day-label').textContent=t.name||'New Training Day';
 const body=$('dz-plan-rows');body.replaceChildren();
 t.rows.forEach((r,i)=>{
  const tr=el('tr');
  const category=el('select','dz-plan-cell');
  CATEGORIES.forEach(c=>option(category,c,c));category.value=r.category;
  category.addEventListener('change',()=>{r.category=category.value;markLibrary();});
  addCell(tr,category);
  addCell(tr,editField(r,i,'exercise',160));
  addCell(tr,editField(r,i,'notes',1000));
  const linkcell=addCell(tr,editField(r,i,'resource',700));
  if(validResource(r.resource)&&r.resource){
   const link=el('a','dz-plan-resource-link','Open');link.href=r.resource;link.target='_blank';link.rel='noopener noreferrer';linkcell.append(link);
  }
  const remove=el('button','dz-plan-remove','Remove');remove.type='button';
  remove.addEventListener('click',()=>{t.rows.splice(i,1);renderEditor();markLibrary();});
  addCell(tr,remove);body.append(tr);
 });
 $('dz-plan-empty').style.display=t.rows.length?'none':'';
}
function render(){
 $('dz-plan-title').value=state.title;
 $('dz-plan-notes').value=state.notes;
 renderDates();renderLibrary();renderEditor();
}
function reset(){
 ++state.nonce;Object.assign(state,{playerId:null,library:[],schedule:emptySchedule(),title:'',notes:'',legacyRows:[],libraryRev:0,weekRev:0,loaded:false,loading:false,saving:false,libraryDirty:false,weekDirty:false,selectedId:null,week:monday(new Date())});
 $('dz-plan-calendar').replaceChildren();$('dz-day-list').replaceChildren();$('dz-plan-rows').replaceChildren();
 $('dz-day-editor').style.display='none';$('dz-plan-title').value='';$('dz-plan-notes').value='';
 status('',false);setBusy(false);
}
async function load(){
 if(!admin()||!state.playerId)return;
 const nonce=++state.nonce,pid=state.playerId,week=state.week;
 state.loaded=false;state.loading=true;state.libraryDirty=false;state.weekDirty=false;
 setBusy(true);status('Loading training days and calendar…',false);
 try{
  const snapshots=await Promise.all([libraryRef().get(),weekRef().get()]);
  if(nonce!==state.nonce||pid!==state.playerId||week!==state.week||!admin())return;
  const library=snapshots[0].exists?snapshots[0].data():{};
  const saved=snapshots[1].exists?snapshots[1].data():{};
  state.library=(Array.isArray(library.templates)?library.templates:[]).map(cleanTemplate);
  state.libraryRev=Number.isInteger(library.revision)?library.revision:0;
  state.weekRev=Number.isInteger(saved.revision)?saved.revision:0;
  state.schedule=cleanSchedule(saved.schedule);
  state.title=String(saved.title||'');state.notes=String(saved.notes||'');
  state.legacyRows=Array.isArray(saved.rows)?saved.rows:[];
  state.selectedId=state.library[0]?.id||null;
  state.loaded=true;
  if(!Array.isArray(saved.schedule)&&state.legacyRows.length){
   const imported=legacyToDraft(state.legacyRows,week);
   const novel=imported.templates.filter(t=>!state.library.some(x=>x.id===t.id));
   if(state.library.length+novel.length<=MAX_TEMPLATES){
    state.library.push(...novel);state.schedule=imported.schedule;
    state.libraryDirty=novel.length>0;state.weekDirty=imported.templates.length>0;
    if(novel.length)state.selectedId=novel[0].id;
    status('Previous weekly exercises loaded as editable training days. Select Save to keep the new calendar. Original entries remain preserved.',false);
   }else status('Previous spreadsheet plan preserved. Day Library is full; free up a slot before importing.',true);
  }else status(snapshots[1].exists?'Calendar loaded.':'New week ready — assign saved training days.',false);
  render();
 }catch(e){
  if(nonce===state.nonce){state.loaded=false;status('Unable to load: '+(e.message||e),true);}
 }finally{if(nonce===state.nonce){state.loading=false;setBusy(false);}}
}
function validate(){
 if(!state.loaded)throw Error('Load a player’s plan before saving');
 if(state.library.length>MAX_TEMPLATES)throw Error('Maximum 40 training days');
 if(state.title.length>120||state.notes.length>3000)throw Error('Weekly title or notes are too long');
 const ids=new Set();
 for(const t of state.library){
  if(!/^[a-zA-Z0-9_-]{1,70}$/.test(t.id)||ids.has(t.id))throw Error('Invalid or repeated training day ID');
  ids.add(t.id);
  if(!t.name.trim()||t.name.length>80)throw Error('Give each training day a name (maximum 80 characters)');
  if(!COLORS.includes(t.color)||t.rows.length>MAX_ROWS)throw Error('Invalid day color or too many exercises');
  for(const r of t.rows){
   if(!CATEGORIES.includes(r.category)||!r.exercise.trim()||r.exercise.length>160||r.notes.length>1000||r.resource.length>700||!validResource(r.resource.trim()))
    throw Error('Check exercises and HTTPS links in '+t.name);
  }
 }
 for(const day of state.schedule){
  if(day.length>4||new Set(day).size!==day.length||day.some(id=>!ids.has(id)))throw Error('Calendar contains an invalid training day assignment');
 }
}
async function save(){
 if(!admin()||state.saving||state.loading||!dirty())return;
 try{validate();}catch(e){status(e.message,true);return;}
 const nonce=state.nonce,revL=state.libraryRev,revW=state.weekRev,saveL=state.libraryDirty,saveW=state.weekDirty;
 const library=state.library.map(t=>({id:t.id,name:t.name.trim(),color:t.color,rows:t.rows.map(r=>({category:r.category,exercise:r.exercise.trim(),notes:r.notes.trim(),resource:r.resource.trim()}))}));
 const schedule=cleanSchedule(state.schedule),title=state.title.trim(),notes=state.notes.trim(),rows=state.legacyRows;
 state.saving=true;setBusy(true);status('Saving…',false);
 try {
  const user=firebase.auth().currentUser;if(!user?.email)throw Error('Sign in again');
  const by=user.email.toLowerCase(),ts=firebase.firestore.FieldValue.serverTimestamp();
  const libDoc=libraryRef(),weekDoc=weekRef();
  await window.DZ_SESSIONS_DB.runTransaction(async tx=>{
   const [a,b]=await Promise.all([tx.get(libDoc),tx.get(weekDoc)]);
   const rl=a.exists?(a.data().revision||0):0,rw=b.exists?(b.data().revision||0):0;
   if((saveL&&rl!==revL)||(saveW&&rw!==revW))throw Error('Another administrator changed this plan. Reload to avoid overwriting their work.');
   if(saveL)tx.set(libDoc,{templates:library,revision:rl+1,updatedBy:by,updatedAt:ts});
   if(saveW)tx.set(weekDoc,{weekStart:state.week,title,notes,rows:rows,assignmentsVersion:1,schedule,revision:rw+1,updatedBy:by,updatedAt:ts});
  });
  if(nonce!==state.nonce||!admin())return;
  if(saveL)state.libraryRev++;if(saveW)state.weekRev++;
  state.libraryDirty=false;state.weekDirty=false;
  status('Saved. Only administrators can view these programs.',false);
 }catch(e){if(nonce===state.nonce)status('Save failed: '+(e.message||e),true);}
 finally{state.saving=false;if(nonce===state.nonce)setBusy(false);}
}
async function chooseWeek(v){
 if(!admin()||state.saving||state.loading||!caution())return;
 let next;try{next=monday(v);}catch(e){status(e.message,true);return;}
 if(next===state.week)return;
 state.week=next;await load();
}
async function copyPrevious(){
 if(!admin()||state.saving||state.loading||!state.loaded||!caution())return;
 const nonce=state.nonce,prev=shiftWeek(state.week,-1);setBusy(true);
 try{
  const snap=await weekRef(prev).get();
  if(nonce!==state.nonce||!admin())return;
  if(!snap.exists){status('No previous week found.',true);return;}
  const prevData=snap.data();
  if(!Array.isArray(prevData.schedule)){status('Previous week uses the old spreadsheet format. Open that week to convert its entries first.',true);return;}
  state.schedule=cleanSchedule(prevData.schedule).map(day=>day.filter(id=>state.library.some(t=>t.id===id)));
  state.weekDirty=true;renderDates();markWeek();
 }catch(e){if(nonce===state.nonce)status('Copy failed: '+(e.message||e),true);}
 finally{if(nonce===state.nonce)setBusy(false);}
}
function idNew(){return 'day-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
function newDay(copy){
 if(!admin()||!state.loaded)return;
 if(state.library.length>=MAX_TEMPLATES){status('Day Library limit reached (40).',true);return;}
 const t=copy?{...cleanTemplate(copy),id:idNew(),name:copy.name+' Copy',rows:copy.rows.map(cleanRow)}:{id:idNew(),name:'New Training Day',color:COLORS[state.library.length%COLORS.length],rows:[newRow()]};
 state.library.push(t);state.selectedId=t.id;renderLibrary();renderEditor();renderDates();markLibrary();
 $('dz-day-name').focus();$('dz-day-name').select();
}
$('dz-day-new').addEventListener('click',()=>newDay(null));
$('dz-day-duplicate').addEventListener('click',()=>{if(selected())newDay(selected());});
$('dz-day-delete').addEventListener('click',()=>{
 const t=selected();if(!t||!window.confirm('Delete '+t.name+' from the Day Library and remove its calendar assignments?'))return;
 state.library=state.library.filter(x=>x.id!==t.id);state.schedule=state.schedule.map(a=>a.filter(id=>id!==t.id));
 state.selectedId=state.library[0]?.id||null;markLibrary();markWeek();render();
});
$('dz-day-name').addEventListener('input',function(){const t=selected();if(!t)return;t.name=this.value;$('dz-day-label').textContent=this.value||'New Training Day';renderLibrary();renderDates();markLibrary();});
$('dz-day-color').addEventListener('change',function(){const t=selected();if(!t)return;t.color=this.value;renderLibrary();renderDates();markLibrary();});
$('dz-day-add-row').addEventListener('click',()=>{const t=selected();if(!t)return;if(t.rows.length>=MAX_ROWS){status('Maximum 35 exercises per training day.',true);return;}t.rows.push(newRow());renderEditor();markLibrary();});
$('dz-plan-title').addEventListener('input',function(){state.title=this.value;markWeek();});
$('dz-plan-notes').addEventListener('input',function(){state.notes=this.value;markWeek();});
$('dz-plan-save').addEventListener('click',save);
$('dz-plan-copy').addEventListener('click',copyPrevious);
$('dz-plan-week').addEventListener('change',function(){const v=this.value;this.value=state.week;void chooseWeek(v);});
$('dz-plan-prev').addEventListener('click',()=>void chooseWeek(shiftWeek(state.week,-1)));
$('dz-plan-next').addEventListener('click',()=>void chooseWeek(shiftWeek(state.week,1)));
window.addEventListener('beforeunload',e=>{if(dirty()&&admin()){e.preventDefault();e.returnValue='';}});
window.DZ_AT_HOME_RESET=reset;window.DZ_AT_HOME_CONFIRM_EXIT=caution;
window.DZ_AT_HOME_ON_PLAYER=function(p){if(!admin()||!p){reset();return;}if(state.playerId===p.id)return;reset();state.playerId=p.id;status('Open At-Home Plan to load this player’s calendar and day library.',false);};
window.DZ_AT_HOME_OPEN=function(id){if(admin()&&id===state.playerId&&!state.loaded&&!state.loading)void load();};
reset();
})();