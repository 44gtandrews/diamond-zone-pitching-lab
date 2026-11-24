/* Private movement-screening prototype. Versioned row order is permanent:
 * example-v1 = Shoulder 1–3, T-Spine 4–6, Hips 7–9.
 * Never reinterpret saved example-v1 scores under a future template.
 */
(function(){
'use strict';
const TEMPLATE_ID='example-v1';
const GROUPS=[{name:'Shoulder',start:0},{name:'T-Spine',start:3},{name:'Hips',start:6}];
const ROW_COUNT=9;
const choices=[[null,'— Not tested'],[2,'2 · Pass'],[1,'1 · Limited'],[0,'0 · Fail'],['P','P · Pain']];
const allowedRole=role=>role==='admin'||role==='pitching_coach';
const validScore=value=>value===null||value===0||value===1||value===2||value==='P';
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
const validScores=scores=>Array.isArray(scores)&&scores.length===ROW_COUNT&&scores.every(validScore);
function blank(date){if(!validDate(date))throw Error('Enter a valid screening date.');return {date,templateId:TEMPLATE_ID,scores:Array(ROW_COUNT).fill(null),revision:0};}
function totals(scores,start,count){
 const selected=scores.slice(start,start+count);
 const numeric=selected.filter(v=>v===0||v===1||v===2);
 return {points:numeric.reduce((a,b)=>a+b,0),max:2*count,scored:numeric.length,count,pain:selected.filter(v=>v==='P').length,complete:numeric.length===count};
}
function validRecord(d,id){
 return !!d&&d.date===id&&validDate(id)&&d.templateId===TEMPLATE_ID&&validScores(d.scores)&&Number.isInteger(d.revision)&&d.revision>=1;
}
const api={TEMPLATE_ID,GROUPS,ROW_COUNT,allowedRole,validScore,validDate,validScores,blank,totals,validRecord};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof window==='undefined'||typeof document==='undefined')return;
window.DZ_MOVEMENT_SCREENING=api;
const $=id=>document.getElementById(id);
const root=$('dz-screening');
if(!root)return;
const list=$('dz-screening-matrix'),status=$('dz-screening-status'),dateInput=$('dz-screening-date'),addButton=$('dz-screening-add');
const permitted=()=>window.DZ_AUTHORIZED===true&&allowedRole(window.DZ_ROLE)&&!!window.DZ_SESSIONS_DB;
let state={id:null,loaded:false,loading:false,columns:[],generation:0};
function localDate(){
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function node(tag,cls,text){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;
 return el;
}
function message(text,error=false){status.textContent=text;status.classList.toggle('dz-screening-error',error);}
function reset(){
 state={id:null,loaded:false,loading:false,columns:[],generation:state.generation+1};
 root.hidden=true;list.replaceChildren();message('');
 addButton.disabled=true;dateInput.value=localDate();
}
function onPlayer(player){
 reset();
 if(!permitted()||!player||player.inactive===true)return;
 state.id=player.id;root.hidden=false;
 message('Open this tab to load private screening history.');
}
function current(id,gen){return permitted()&&state.id===id&&state.generation===gen;}
function ref(id){return window.DZ_SESSIONS_DB.collection('players').doc(id).collection('movementScreens');}
function applyColor(select,score){select.dataset.score=score===null?'blank':String(score);}
function formatTotal(t){
 if(!t.scored&&!t.pain)return '—';
 const base=t.points+' / '+t.max;
 return t.complete?base:base+' · '+t.scored+'/'+t.count+' scored'+(t.pain?' · '+t.pain+' pain':'');
}
function paintTotal(el,t){
 el.textContent=formatTotal(t);
 el.dataset.total=t.pain?'pain':!t.complete?'partial':t.points===t.max?'pass':t.points>=t.max/2?'limited':'fail';
 el.title=t.complete?'All tests scored':'Incomplete: blank and pain tests are not counted as failures';
}
function render(){
 if(!permitted()||!state.id){reset();return;}
 list.replaceChildren();
 if(!state.columns.length){list.append(node('p','dz-screening-empty','No screenings yet. Select a date and add the first screening.'));return;}
 state.columns.sort((a,b)=>a.date.localeCompare(b.date));
 const table=node('table','dz-screening-table');
 const thead=node('thead'),header=node('tr');
 const testHeader=node('th','dz-screening-label','Movement test');testHeader.scope='col';header.append(testHeader);
 const colCells=[];
 for(const [index,col] of state.columns.entries()){
  const th=node('th','dz-screening-assessment');th.scope='col';
  th.append(node('span','dz-screening-date-label',col.date),node('small','dz-screening-period',index===0?'Initial screening':'Reassessment '+index));
  const label=node('small','dz-screening-save-state',col.saving?'Saving…':col.dirty?'Unsaved':col.revision?'Saved':'Not saved');
  const actions=node('div','dz-screening-col-actions');
  const save=node('button','dz-screening-action','Save');save.type='button';save.disabled=col.saving||(!col.dirty&&col.revision>0);
  save.setAttribute('aria-label','Save screening '+col.date);
  save.addEventListener('click',()=>void saveColumn(col));
  actions.append(save);
  if(!col.revision){
   const discard=node('button','dz-screening-action dz-screening-discard','Discard');discard.type='button';discard.disabled=col.saving;
   discard.setAttribute('aria-label','Discard unsaved screening '+col.date);
   discard.addEventListener('click',()=>{if(!permitted()||col.saving)return;if(col.dirty&&!window.confirm('Discard unsaved scores for '+col.date+'?'))return;state.columns=state.columns.filter(c=>c!==col);render();});
   actions.append(discard);
  }
  th.append(label,actions);header.append(th);
  colCells.push({col,save,label,totals:[]});
 }
 thead.append(header);table.append(thead);
 const tbody=node('tbody');
 for(const group of GROUPS){
  const groupRow=node('tr','dz-screening-group'),groupLabel=node('th','dz-screening-label',group.name);
  groupLabel.scope='row';groupRow.append(groupLabel);
  for(const c of colCells)groupRow.append(node('td'));
  tbody.append(groupRow);
  for(let i=0;i<3;i++){
   const rowIndex=group.start+i,row=node('tr');
   const label=node('th','dz-screening-label','Example '+(rowIndex+1));label.scope='row';row.append(label);
   for(const cell of colCells){
    const td=node('td','dz-screening-score-cell'),select=node('select','dz-screening-score');
    select.setAttribute('aria-label',group.name+' Example '+(rowIndex+1)+' on '+cell.col.date);
    for(const [value,label] of choices){
     const option=node('option','',label);option.value=value===null?'':String(value);select.append(option);
    }
    select.value=cell.col.scores[rowIndex]===null?'':String(cell.col.scores[rowIndex]);
    select.disabled=cell.col.saving;applyColor(select,cell.col.scores[rowIndex]);
    select.addEventListener('change',()=>{
     if(!permitted()||cell.col.saving)return;
     const value=select.value===''?null:select.value==='P'?'P':Number(select.value);
     if(!validScore(value))return;
     cell.col.scores[rowIndex]=value;cell.col.dirty=true;applyColor(select,value);
     cell.label.textContent='Unsaved';cell.save.disabled=false;
     for(const entry of cell.totals)paintTotal(entry.el,totals(cell.col.scores,entry.start,entry.count));
    });
    td.append(select);row.append(td);
   }
   tbody.append(row);
  }
  const totalRow=node('tr','dz-screening-total'),totalLabel=node('th','dz-screening-label',group.name+' total');
  totalLabel.scope='row';totalRow.append(totalLabel);
  for(const cell of colCells){
   const td=node('td','dz-screening-total-value');paintTotal(td,totals(cell.col.scores,group.start,3));
   cell.totals.push({el:td,start:group.start,count:3});totalRow.append(td);
  }
  tbody.append(totalRow);
 }
 const overall=node('tr','dz-screening-overall'),overallLabel=node('th','dz-screening-label','Overall total');
 overallLabel.scope='row';overall.append(overallLabel);
 for(const cell of colCells){
  const td=node('td','dz-screening-total-value');paintTotal(td,totals(cell.col.scores,0,ROW_COUNT));
  cell.totals.push({el:td,start:0,count:ROW_COUNT});overall.append(td);
 }
 tbody.append(overall);table.append(tbody);list.append(table);
}
async function open(id){
 if(!permitted()||!id){reset();return;}
 if(state.id!==id){reset();state.id=id;}
 root.hidden=false;
 if(state.loaded||state.loading)return;
 const gen=state.generation;state.loading=true;addButton.disabled=true;message('Loading private screenings…');
 try{
  const snap=await ref(id).get();
  if(!current(id,gen))return;
  const columns=[];
  snap.forEach(doc=>{
   const data=doc.data();
   if(validRecord(data,doc.id))columns.push({...data,scores:data.scores.slice(),dirty:false,saving:false});
   else throw Error('Unexpected screening template or invalid saved record. Contact an administrator.');
  });
  state.columns=columns;
  // No fake screening values are ever created for real athletes.
  if(!columns.length)state.columns.push({...blank(localDate()),dirty:false,saving:false});
  state.loaded=true;addButton.disabled=false;render();
  message('Private to administrators and pitching coaches. Save each assessment column to retain its scores.');
 }catch(error){
  if(current(id,gen)){message('Unable to load screenings. Reopen this tab to retry. '+String(error.message||error),true);list.replaceChildren();}
 }finally{if(current(id,gen))state.loading=false;}
}
async function saveColumn(col){
 if(!permitted()||!state.loaded||col.saving||!validScores(col.scores)||!validDate(col.date))return;
 const id=state.id,gen=state.generation;
 const email=window.firebase?.auth().currentUser?.email;
 if(!email){message('Sign in again before saving.',true);return;}
 const target=ref(id).doc(col.date);
 const previous=col.revision,scores=col.scores.slice();col.saving=true;render();
 try{
  await window.DZ_SESSIONS_DB.runTransaction(async tx=>{
   const snap=await tx.get(target);
   if((snap.exists?snap.data().revision:0)!==previous)throw Error('This screening changed in another session. Reopen the player to reload before saving.');
   tx.set(target,{date:col.date,templateId:TEMPLATE_ID,scores,revision:previous+1,
    updatedBy:email.toLowerCase(),updatedAt:window.firebase.firestore.FieldValue.serverTimestamp()});
  });
  if(!current(id,gen))return;
  col.revision=previous+1;col.dirty=false;message('Saved screening for '+col.date+'.');
 }catch(error){if(current(id,gen))message('Not saved: '+String(error.message||error),true);}
 finally{if(current(id,gen)){col.saving=false;render();}}
}
addButton.addEventListener('click',()=>{
 if(!permitted()||!state.loaded)return;
 const date=dateInput.value;
 if(!validDate(date)){message('Choose a valid screening date.',true);return;}
 if(state.columns.some(c=>c.date===date)){message('A screening column already exists for '+date+'.');return;}
 state.columns.push({...blank(date),dirty:false,saving:false});render();message('Added '+date+'. Enter scores and save the column.');
});
window.DZ_SCREENING_RESET=reset;
window.DZ_SCREENING_ON_PLAYER=onPlayer;
window.DZ_SCREENING_OPEN=open;
reset();
})();
