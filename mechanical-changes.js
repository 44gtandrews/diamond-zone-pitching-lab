/* Diamond Zone CT: mechanical goals, completion history and backwards
   compatible Firestore section values. Existing notes and permissions remain. */
(function(){
'use strict';
const SECTIONS=['positives','negatives'];
function text(value){return typeof value==='string'?value:'';}
function normalize(saved){
 const data=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
 const cleanNotes=k=>(Array.isArray(data[k])?data[k]:[]).filter(v=>typeof v==='string').slice(0,150);
 const completed=(Array.isArray(data.completed)?data.completed:[]).slice(0,250)
   .map(v=>typeof v==='string'?{text:v,from:'negatives',completedAt:null}:v)
   .filter(v=>v&&typeof v==='object'&&typeof v.text==='string')
   .map(v=>({text:v.text,from:SECTIONS.includes(v.from)?v.from:'negatives',
     completedAt:typeof v.completedAt==='string'?v.completedAt:null}));
 return {positives:cleanNotes('positives'),negatives:cleanNotes('negatives'),completed};
}
function complete(data,from,index,now){
 const next=normalize(data);
 if(!SECTIONS.includes(from)||!Number.isInteger(index)||index<0||index>=next[from].length)return next;
 const item=next[from][index].trim();
 if(!item)return next;
 next[from].splice(index,1);
 next.completed.push({text:item,from,completedAt:typeof now==='string'?now:new Date().toISOString()});
 return next;
}
function reopen(data,index){
 const next=normalize(data);
 if(!Number.isInteger(index)||index<0||index>=next.completed.length)return next;
 const [item]=next.completed.splice(index,1);
 if(item.text.trim())next[item.from].push(item.text);
 return next;
}
const helpers={normalize,complete,reopen};
if(typeof module!=='undefined'&&module.exports)module.exports=helpers;
if(typeof document==='undefined')return;

function createBoard(initial){
 const readonly=!window.DZ_EDIT_ENABLED;
 let current=normalize(initial);
 const containers={
   positives:document.getElementById('mech-pos-list'),
   negatives:document.getElementById('mech-neg-list'),
   completed:document.getElementById('mech-completed-list')
 };
 const addButtons={
   positives:document.getElementById('mech-pos-add'),
   negatives:document.getElementById('mech-neg-add')
 };
 const status=document.getElementById('status-mechanics');
 function markUnsaved(){
   if(readonly)return;
   status.textContent='Unsaved changes — select Save changes';
   status.classList.add('show');
 }
 function capture(){
   for(const group of SECTIONS){
     const textareas=containers[group].querySelectorAll('textarea[data-mech-index]');
     textareas.forEach(ta=>{
       const i=Number(ta.dataset.mechIndex);
       if(Number.isInteger(i)&&i>=0&&i<current[group].length)current[group][i]=ta.value;
     });
   }
 }
 function makeButton(label,css,handler){
   const btn=document.createElement('button');btn.type='button';btn.className=css;
   btn.textContent=label;btn.addEventListener('click',handler);return btn;
 }
 function renderGroup(group){
   const list=containers[group];list.replaceChildren();
   const values=current[group];
   if(!values.length){
     const p=document.createElement('p');p.className='mech-empty';
     p.textContent=readonly?'No current mechanical notes.':'Nothing currently listed.';
     list.append(p);
   }
   values.forEach((value,i)=>{
     const entry=document.createElement('div');entry.className='mech-entry';
     const ta=document.createElement('textarea');
     ta.className='note-textarea mech-textarea';ta.dataset.mechIndex=String(i);
     ta.value=value;ta.rows=3;ta.placeholder='Describe the mechanical change…';
     if(readonly)ta.readOnly=true;
     else ta.addEventListener('input',()=>{current[group][i]=ta.value;markUnsaved();});
     entry.append(ta);
     if(!readonly){
       const toolbar=document.createElement('div');toolbar.className='mech-entry-actions';
       const completionLabel=document.createElement('label');
       completionLabel.className='mech-complete-control';
       const completionBox=document.createElement('input');
       completionBox.type='checkbox';
       completionBox.setAttribute('aria-label','Mark '+group+' mechanical note '+(i+1)+' complete');
       completionBox.addEventListener('change',()=>{
         capture();
         if(!current[group][i].trim()){completionBox.checked=false;ta.focus();return;}
         current=complete(current,group,i);
         render();markUnsaved();
       });
       completionLabel.append(completionBox,document.createTextNode('Complete'));
       const remove=makeButton('Remove','mech-remove-btn',()=>{
         capture();current[group].splice(i,1);render();markUnsaved();
       });
       remove.setAttribute('aria-label','Remove '+group+' mechanical note '+(i+1));
       toolbar.append(completionLabel,remove);entry.append(toolbar);
     }
     list.append(entry);
   });
 }
 function renderCompleted(){
   const list=containers.completed;list.replaceChildren();
   if(!current.completed.length){
     const p=document.createElement('p');p.className='mech-empty';
     p.textContent='Completed mechanical changes appear here.';
     list.append(p);return;
   }
   current.completed.forEach((item,i)=>{
     const entry=document.createElement('div');entry.className='mech-done-entry';
     const title=document.createElement('div');title.className='mech-done-text';title.textContent=item.text;
     entry.append(title);
     const row=document.createElement('div');row.className='mech-done-meta';
     const from=document.createElement('span');
     from.textContent=item.from==='positives'?'From Positives':'From Areas to Work On';
     row.append(from);
     if(item.completedAt&&!Number.isNaN(Date.parse(item.completedAt))){
       const time=document.createElement('time');time.dateTime=item.completedAt;
       time.textContent='Completed '+new Date(item.completedAt).toLocaleDateString();
       row.append(time);
     }
     if(!readonly){
       const undo=makeButton('↶ Reopen','mech-reopen-btn',()=>{
         capture();current=reopen(current,i);render();markUnsaved();
       });
       undo.setAttribute('aria-label','Reopen completed mechanical note '+(i+1));
       row.append(undo);
     }
     entry.append(row);list.append(entry);
   });
 }
 function render(){
   for(const group of SECTIONS)renderGroup(group);
   renderCompleted();
 }
 for(const group of SECTIONS){
   addButtons[group].style.display=readonly?'none':'';
   addButtons[group].onclick=()=>{
     if(readonly)return;
     capture();current[group].push('');render();markUnsaved();
     const areas=containers[group].querySelectorAll('textarea');
     areas[areas.length-1]?.focus();
   };
 }
 render();
 return {getValues(){
   capture();
   const result=normalize(current);
   for(const group of SECTIONS)result[group]=result[group].map(t=>t.trim()).filter(Boolean);
   result.completed=result.completed.map(item=>({...item,text:item.text.trim()})).filter(item=>item.text);
   return result;
 }};
}
window.DZ_CREATE_MECHANICAL_BOARD=createBoard;
})();