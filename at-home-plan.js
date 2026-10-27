/* Diamond Zone CT — admin-only weekly at-home plans.
   Data lives in players/{playerId}/atHomePlans/{Monday YYYY-MM-DD}.
   UI gating is supplemental; firestore.rules is the authorization boundary. */
(function () {
  'use strict';

  var DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var CATEGORIES=['Throwing','Strength','Mobility','Recovery','Other'];
  function pad(n){return String(n).padStart(2,'0');}
  function localDate(y,m,d){return new Date(y,m-1,d,12,0,0,0);}
  function dateKey(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function parseDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))throw Error('Select a valid date');
    var p=value.split('-').map(Number),d=localDate(p[0],p[1],p[2]);
    if(dateKey(d)!==value)throw Error('Invalid calendar date');
    return d;
  }
  function monday(value){
    var d=value instanceof Date?new Date(value.getFullYear(),value.getMonth(),value.getDate(),12):parseDate(value);
    d.setDate(d.getDate()-((d.getDay()+6)%7));
    return dateKey(d);
  }
  function shiftWeek(key,count){
    var d=parseDate(monday(key));d.setDate(d.getDate()+7*count);return dateKey(d);
  }
  function emptyRow(day){
    return {day:day||'Monday',category:'Throwing',exercise:'',prescription:'',notes:'',resource:''};
  }
  function normalizeRows(rows){
    return (Array.isArray(rows)?rows:[]).slice(0,80).map(function(row){
      row=row&&typeof row==='object'?row:{};
      var result=emptyRow();
      Object.keys(result).forEach(function(k){if(k in row)result[k]=String(row[k]||'');});
      if(DAYS.indexOf(result.day)<0)result.day='Monday';
      if(CATEGORIES.indexOf(result.category)<0)result.category='Other';
      return result;
    });
  }
  function validResource(link){
    if(!link)return true;
    try { var u=new URL(link);return u.protocol==='https:'; } catch(e){return false;}
  }
  var math={monday:monday,shiftWeek:shiftWeek,normalizeRows:normalizeRows,validResource:validResource};
  if(typeof module!=='undefined'&&module.exports)module.exports=math;
  if(typeof document==='undefined')return;

  var $=function(id){return document.getElementById(id);};
  var state={playerId:null,week:monday(new Date()),title:'',notes:'',rows:[],revision:0,dirty:false,saving:false,loading:false,nonce:0,loadedKey:null};

  function authorized(){return window.DZ_AUTHORIZED===true&&window.DZ_IS_ADMIN===true&&window.DZ_ROLE==='admin';}
  function setMessage(message,error){
    var target=$('dz-plan-status');
    if(!target)return;
    target.textContent=message;
    target.classList.toggle('cloud-error',!!error);
  }
  function controlsBusy(busy){
    ['dz-plan-week','dz-plan-prev','dz-plan-next','dz-plan-copy','dz-plan-add','dz-plan-save',
     'dz-plan-title','dz-plan-notes'].forEach(function(id){if($(id))$(id).disabled=busy;});
    $('dz-plan-rows').querySelectorAll('input,select,button').forEach(function(el){el.disabled=busy;});
  }
  function dirty(){state.dirty=true;setMessage('Unsaved changes — select Save Plan to publish.',false);}
  function canDiscard(){return !state.dirty||window.confirm('Discard unsaved changes to this at-home plan?');}
  function reset(){
    ++state.nonce;
    state.playerId=null;state.loadedKey=null;state.rows=[];state.revision=0;
    state.dirty=false;state.loading=false;state.saving=false;
    state.title='';state.notes='';
    if($('dz-plan-rows'))$('dz-plan-rows').replaceChildren();
    if($('dz-plan-title'))$('dz-plan-title').value='';
    if($('dz-plan-notes'))$('dz-plan-notes').value='';
    if($('dz-plan-status'))setMessage('',false);
    if($('dz-plan-week'))$('dz-plan-week').value=state.week;
    controlsBusy(false);
  }
  function createField(row,index,key,tag,options,maxLen,placeholder){
    var el=document.createElement(tag||'input');
    el.setAttribute('aria-label',key+' for exercise '+(index+1));
    el.className='dz-plan-cell';
    if(tag==='select'){
      options.forEach(function(v){var opt=document.createElement('option');opt.value=v;opt.textContent=v;el.appendChild(opt);});
      el.value=row[key];
      el.addEventListener('change',function(){row[key]=el.value;dirty();});
    }else{
      el.type='text';el.maxLength=maxLen||180;
      if(placeholder)el.placeholder=placeholder;
      el.value=row[key];
      el.addEventListener('input',function(){row[key]=el.value;dirty();});
    }
    return el;
  }
  function renderRows(){
    var body=$('dz-plan-rows');
    body.replaceChildren();
    state.rows.forEach(function(row,i){
      var tr=document.createElement('tr');
      [['day','select',DAYS,0],['category','select',CATEGORIES,0],
       ['exercise','input',null,160],['prescription','input',null,180],
       ['notes','input',null,500],['resource','input',null,700]].forEach(function(def){
        var td=document.createElement('td'),el=createField(row,i,def[0],def[1],def[2],def[3]);
        td.appendChild(el);
        if(def[0]==='resource'&&validResource(row.resource)&&row.resource){
          var a=document.createElement('a');
          a.href=row.resource;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open';
          a.className='dz-plan-resource-link';td.appendChild(a);
        }
        tr.appendChild(td);
      });
      var actionTd=document.createElement('td'),remove=document.createElement('button');
      remove.type='button';remove.className='dz-plan-remove';remove.textContent='Remove';
      remove.setAttribute('aria-label','Remove exercise '+(i+1));
      remove.addEventListener('click',function(){state.rows.splice(i,1);renderRows();dirty();});
      actionTd.appendChild(remove);tr.appendChild(actionTd);body.appendChild(tr);
    });
    $('dz-plan-empty').style.display=state.rows.length?'none':'';
  }
  function syncInputs(){
    $('dz-plan-title').value=state.title;
    $('dz-plan-notes').value=state.notes;
    $('dz-plan-week').value=state.week;
    $('dz-plan-date-range').textContent='Week of '+new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(parseDate(state.week));
    renderRows();
  }
  function ref(){
    if(!authorized()||!state.playerId)throw Error('Administrator account and player required');
    return window.DZ_SESSIONS_DB.collection('players').doc(state.playerId).collection('atHomePlans').doc(state.week);
  }
  async function load(){
    if(!authorized()||!state.playerId)return;
    var nonce=++state.nonce,playerId=state.playerId,week=state.week;
    state.loading=true;state.dirty=false;controlsBusy(true);
    setMessage('Loading weekly plan from Firebase…',false);
    try {
      var snap=await ref().get();
      if(nonce!==state.nonce||playerId!==state.playerId||week!==state.week||!authorized())return;
      var data=snap.exists?snap.data():{};
      state.title=typeof data.title==='string'?data.title:'';
      state.notes=typeof data.notes==='string'?data.notes:'';
      state.rows=normalizeRows(data.rows);
      state.revision=Number.isInteger(data.revision)?data.revision:0;
      state.loadedKey=playerId+'/'+week;
      syncInputs();
      setMessage(snap.exists?'Plan loaded. '+state.rows.length+' exercise(s).':'No plan saved for this week. Add exercises to start.',false);
    } catch(e) {
      if(nonce===state.nonce){
        state.loadedKey=null;state.rows=[];state.revision=0;renderRows();
        setMessage('Could not load the plan: '+(e.message||e),true);
      }
    } finally {
      if(nonce===state.nonce){state.loading=false;controlsBusy(false);}
    }
  }
  async function chooseWeek(value){
    if(!authorized()||state.saving||state.loading||!canDiscard())return;
    var next;
    try{next=monday(value);}catch(e){setMessage(e.message,true);return;}
    if(next===state.week){$('dz-plan-week').value=next;return;}
    state.week=next;
    await load();
  }
  function validate(){
    if(state.title.length>120||state.notes.length>3000)throw Error('Title or plan notes are too long');
    if(state.rows.length>80)throw Error('Maximum 80 exercise rows per week');
    state.rows.forEach(function(row,i){
      if(!row.exercise.trim())throw Error('Row '+(i+1)+': enter an exercise or remove the row');
      if(row.exercise.length>160||row.prescription.length>180||row.notes.length>500||row.resource.length>700)
        throw Error('Row '+(i+1)+': one or more fields are too long');
      if(!validResource(row.resource.trim()))throw Error('Row '+(i+1)+': resource link must begin with https://');
    });
  }
  async function save(){
    if(!authorized()||state.saving||state.loading||!state.playerId||state.loadedKey!==state.playerId+'/'+state.week)return;
    try{validate();}catch(e){setMessage(e.message,true);return;}
    var nonce=state.nonce,playerId=state.playerId,week=state.week,version=state.revision;
    var title=state.title.trim(),notes=state.notes.trim();
    var rows=normalizeRows(state.rows).map(function(row){
      Object.keys(row).forEach(function(k){row[k]=row[k].trim();});return row;
    });
    state.saving=true;controlsBusy(true);setMessage('Saving securely to Firebase…',false);
    try {
      var me=firebase.auth().currentUser;
      if(!me||!me.email)throw Error('Sign in again to save.');
      var doc=ref();
      await window.DZ_SESSIONS_DB.runTransaction(async function(tx){
        var existing=await tx.get(doc);
        var remote=existing.exists?existing.data():null;
        var remoteRevision=remote&&Number.isInteger(remote.revision)?remote.revision:0;
        if(remoteRevision!==version)throw Error('This plan was changed in another session. Reload the week before saving to avoid overwriting it.');
        tx.set(doc,{
          weekStart:week,title:title,notes:notes,rows:rows,revision:version+1,
          updatedBy:me.email.toLowerCase(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      if(nonce!==state.nonce||state.playerId!==playerId||state.week!==week)return;
      state.revision=version+1;state.rows=rows;state.title=title;state.notes=notes;
      state.dirty=false;syncInputs();setMessage('Saved to Firebase. Only administrators can access this plan.',false);
    }catch(e){if(nonce===state.nonce)setMessage('Save failed: '+(e.message||e),true);}
    finally{state.saving=false;if(nonce===state.nonce)controlsBusy(false);}
  }
  async function copyPrevious(){
    if(!authorized()||state.saving||state.loading||!canDiscard())return;
    var oldWeek=shiftWeek(state.week,-1),nonce=state.nonce;
    setMessage('Loading previous week…',false);controlsBusy(true);
    try{
      var snap=await window.DZ_SESSIONS_DB.collection('players').doc(state.playerId).collection('atHomePlans').doc(oldWeek).get();
      if(nonce!==state.nonce||!authorized())return;
      if(!snap.exists){setMessage('No plan exists for the previous week.',true);return;}
      var d=snap.data();
      state.title=String(d.title||'');state.notes=String(d.notes||'');
      state.rows=normalizeRows(d.rows);syncInputs();dirty();
    }catch(e){if(nonce===state.nonce)setMessage('Could not copy: '+(e.message||e),true);}
    finally{if(nonce===state.nonce)controlsBusy(false);}
  }

  $('dz-plan-title').addEventListener('input',function(){state.title=this.value;dirty();});
  $('dz-plan-notes').addEventListener('input',function(){state.notes=this.value;dirty();});
  $('dz-plan-add').addEventListener('click',function(){
    if(!authorized()||state.loadedKey!==state.playerId+'/'+state.week)return;
    if(state.rows.length>=80){setMessage('Maximum 80 exercises per week.',true);return;}
    state.rows.push(emptyRow());renderRows();dirty();
  });
  $('dz-plan-save').addEventListener('click',save);
  $('dz-plan-copy').addEventListener('click',copyPrevious);
  $('dz-plan-week').addEventListener('change',function(){var v=this.value;this.value=state.week;void chooseWeek(v);});
  $('dz-plan-prev').addEventListener('click',function(){void chooseWeek(shiftWeek(state.week,-1));});
  $('dz-plan-next').addEventListener('click',function(){void chooseWeek(shiftWeek(state.week,1));});
  window.addEventListener('beforeunload',function(e){if(state.dirty&&authorized()){e.preventDefault();e.returnValue='';}});
  window.DZ_AT_HOME_RESET=reset;
  window.DZ_AT_HOME_CONFIRM_EXIT=canDiscard;
  window.DZ_AT_HOME_ON_PLAYER=function(player){
    if(!authorized()||!player){reset();return;}
    if(state.playerId===player.id)return;
    reset();state.playerId=player.id;state.week=monday(new Date());$('dz-plan-week').value=state.week;
    setMessage('Select At-Home Plan to load this player’s weekly program.',false);
  };
  window.DZ_AT_HOME_OPEN=function(playerId){
    if(!authorized()||!playerId||playerId!==state.playerId)return;
    if(state.loadedKey!==state.playerId+'/'+state.week)void load();
  };
  reset();
})();