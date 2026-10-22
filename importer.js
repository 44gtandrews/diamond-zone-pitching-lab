(() => {
'use strict';
const $=id=>document.getElementById(id), fields=['n','velo','veloMax','spin','spinMax','ext','ivb','hb','tilt','strike','strikeExt','out','vaa'];
const names={fb:'Fastball',cb:'Curveball',ch:'ChangeUp',sk:'Sinker',sw:'Sweeper',sp:'Splitter',sl:'Slider',ct:'Cutter'};
const aliases={fastball:'fb','four-seam':'fb',curveball:'cb',changeup:'ch',sinker:'sk',sweeper:'sw',splitter:'sp',slider:'sl',cutter:'ct'};
let db,user,mode,id,rows=[],fileName='',fileHash='',pdfText='';
const err=e=>{ $('session-import-status').textContent=String(e?.message||e); };
const num=(s,int=false)=>{if(s===null||s===undefined||String(s).trim()==='')return null;const v=Number(String(s).replace(/,/g,'').replace('%',''));return Number.isFinite(v)?int?Math.round(v):Math.round(v*100)/100:null;};
const key=s=>aliases[String(s||'').toLowerCase().replace(/[ _]/g,'')]||Object.keys(names).find(k=>names[k].toLowerCase()===String(s).toLowerCase())||null;
const empty=k=>({name:names[k],key:k,...Object.fromEntries(fields.map(f=>[f,null]))});
function csv(text){
 const lines=text.trim().split(/\r?\n/).map(s=>s.split(',').map(v=>v.replace(/^"|"$/g,'').trim()));
 const h=lines.shift().map(x=>x.toLowerCase().replace(/[^a-z0-9]/g,''));
 const lookup={name:['pitchtype','taggedpitchtype','pitch','type'],n:['n','count','pitches','pitchcount'],velo:['velo','velocity','avgvelo','relspeed','speed'],veloMax:['maxvelo','maxvelocity'],spin:['spin','spinrate','avgspin'],spinMax:['maxspin'],ext:['ext','extension'],ivb:['ivb','inducedverticalbreak'],hb:['hb','horzbreak','horizontalbreak'],tilt:['tilt'],strike:['strike','strikepct'],strikeExt:['strikeext'],out:['out','outpct'],vaa:['vaa','verticalapproachangle']};
 const ix=Object.fromEntries(Object.entries(lookup).map(([f,a])=>[f,h.findIndex(x=>a.includes(x))]));
 if(ix.name<0)throw Error('Missing Pitch Type column in CSV');
 const data=lines.map(c=>{const k=key(c[ix.name]);if(!k)return null;const r=empty(k);fields.forEach(f=>{if(ix[f]>=0)r[f]=f==='tilt'?c[ix[f]]||null:num(c[ix[f]],['n','spin','spinMax','strike','strikeExt','out'].includes(f));});return r;}).filter(Boolean);
 if(ix.n<0){const g={};data.forEach(r=>(g[r.key]??=[]).push(r));return Object.entries(g).map(([k,rs])=>{const r=empty(k);r.n=rs.length;['velo','spin','ext','ivb','hb','vaa'].forEach(f=>{const a=rs.map(x=>x[f]).filter(x=>x!==null);r[f]=a.length?num(a.reduce((x,y)=>x+y,0)/a.length,f==='spin'):null;});r.veloMax=Math.max(...rs.map(x=>x.velo).filter(x=>x!==null));if(!Number.isFinite(r.veloMax))r.veloMax=null;r.spinMax=Math.max(...rs.map(x=>x.spin).filter(x=>x!==null));if(!Number.isFinite(r.spinMax))r.spinMax=null;return r;});}
 return data;
}
async function pdf(file){
 if(!window.DZ_TRACKMAN_PDF)throw Error('Trackman PDF reader did not load. Refresh the page and try again.');
 const data=await window.DZ_TRACKMAN_PDF.fromFile(file);
 pdfText=data.text||'';
 if(mode==='new' && data.playerName && !$('session-player-name').value.trim()){
  $('session-player-name').value=data.playerName;
 }
 if(mode==='update' && data.playerName && PLAYERS[id]?.name
   && data.playerName.trim().toLowerCase()!==PLAYERS[id].name.trim().toLowerCase()){
  throw Error('The report is for '+data.playerName+', but this is '+PLAYERS[id].name+"'s profile. Open the matching player profile instead.");
 }
 if(mode==='update' && data.selectedSessions>1){
  throw Error('This PDF contains '+data.selectedSessions+' selected sessions. Choose only the NEW session in Trackman before uploading to avoid counting old pitches twice.');
 }
 return data.pitches;
}
function render(){
 const body=$('session-pitch-rows');body.replaceChildren();
 rows.forEach((r,i)=>{const tr=document.createElement('tr'),td=document.createElement('td'),sel=document.createElement('select');sel.className='type-select';Object.entries(names).forEach(([k,n])=>sel.add(new Option(n,k)));sel.value=r.key;sel.onchange=()=>{r.key=sel.value;r.name=names[r.key];};td.append(sel);tr.append(td);
 fields.forEach(f=>{const c=document.createElement('td'),input=document.createElement('input');input.className='session-cell';input.type=f==='tilt'?'text':'number';input.step=['n','spin','spinMax','strike','strikeExt','out'].includes(f)?'1':'0.01';input.value=r[f]??'';input.placeholder='—';input.setAttribute('aria-label',r.name+' '+f);input.oninput=()=>{r[f]=f==='tilt'?input.value.trim()||null:num(input.value,['n','spin','spinMax','strike','strikeExt','out'].includes(f));};c.append(input);tr.append(c);});
 const c=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='Remove';b.onclick=()=>{rows.splice(i,1);render();};c.append(b);tr.append(c);body.append(tr);});
}
function open(m,pid){if(!window.DZ_AUTHORIZED || !window.DZ_CAN_UPLOAD)return;mode=m;id=pid;rows=[];fileHash='';fileName='';pdfText='';$('session-file').value='';if(m==='new'){$('session-player-name').value='';$('session-player-age').value='';$('session-player-affiliation').value='internal';}$('session-review').style.display='none';$('session-import-title').textContent=m==='new'?'Add New Pitcher':'Upload New Session';$('session-new-fields').style.display=m==='new'?'grid':'none';$('session-target').textContent=m==='update'?(PLAYERS[pid]?.name||''):'';$('session-import-overlay').style.display='block';document.body.style.overflow='hidden';err('Choose a Trackman PDF, CSV, or JSON, then review the summary before saving.');}
function close(){$('session-import-overlay').style.display='none';document.body.style.overflow='';}
function weighted(a,b,f){const v=[a,b].filter(x=>x[f]!=null);return v.length?v.reduce((s,x)=>s+x[f]*x.n,0)/v.reduce((s,x)=>s+x.n,0):null;}
function merge(existing,incoming){const map=new Map(existing.map(r=>[r.key,{...r}]));for(const b of incoming){const a=map.get(b.key);if(!a){map.set(b.key,b);continue;}const c={...a,n:a.n+b.n};['velo','ext','ivb','hb','vaa'].forEach(f=>c[f]=num(weighted(a,b,f)));['spin','strike','strikeExt','out'].forEach(f=>c[f]=num(weighted(a,b,f),true));['veloMax','spinMax'].forEach(f=>c[f]=a[f]==null?b[f]:b[f]==null?a[f]:Math.max(a[f],b[f]));c.tilt=a.ivb!=null&&b.ivb==null?a.tilt:b.ivb!=null&&a.ivb==null?b.tilt:a.n>=b.n?a.tilt:b.tilt;map.set(b.key,c);}return [...map.values()].sort((a,b)=>b.n-a.n);}
$('cloud-add-player').onclick=()=>open('new');
$('cloud-update-player').onclick=()=>open('update',window.DZ_CURRENT_PLAYER());
$('session-cancel').onclick=close;
$('session-import-overlay').onclick=e=>{if(e.target===$('session-import-overlay'))close();};
$('session-add-pitch').onclick=()=>{const k=Object.keys(names).find(k=>!rows.some(r=>r.key===k));if(k){rows.push(empty(k));render();$('session-review').style.display='block';}};
$('session-read').onclick=async()=>{
 const file=$('session-file').files[0];if(!file)return err('Select a file first.');if(file.size>5000000)return err('Maximum file size is 5 MB.');fileName=file.name;fileHash='';pdfText='';const b=$('session-read');b.disabled=true;
 try{const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);fileHash=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');const ext=file.name.split('.').pop().toLowerCase();let data=ext==='pdf'?await pdf(file):ext==='csv'?csv(await file.text()):ext==='json'?JSON.parse(await file.text()):null;if(data&& !Array.isArray(data))data=data.pitches;if(!Array.isArray(data))throw Error('Unsupported file format.');const seen=new Set();rows=data.map(r=>{const k=key(r.name||names[r.key]);if(!k)return null;const out=empty(k);fields.forEach(f=>out[f]=f==='tilt'?r[f]||null:num(r[f],['n','spin','spinMax','strike','strikeExt','out'].includes(f)));return out;}).filter(r=>{if(!r||seen.has(r.key))return false;seen.add(r.key);return true;});render();$('session-review').style.display='block';$('session-pdf-text').textContent=pdfText.slice(0,25000);err(rows.length?'Review every field; correct or add missing data before saving.':'No reliable summary found. Add pitch types and enter values manually using the PDF text below.');}
 catch(e){rows=[];render();const why=String(e?.message||e);const unsafe=/The report is for |This PDF contains .* selected sessions/.test(why);if(unsafe){fileHash='';$('session-review').style.display='none';err(why+' No changes were saved.');}else{$('session-review').style.display='block';err('Extraction incomplete: '+why+'. You may add pitch types manually if the report is for the correct player.');}}
 finally{b.disabled=false;}
};
$('session-save').onclick=async()=>{
 try{
 if(!window.DZ_AUTHORIZED||!window.DZ_CAN_UPLOAD)throw Error('Only administrators and pitching coaches can upload Trackman files.');
 if(!fileHash)throw Error('Read a file first.');
 if(!rows.length)throw Error('Add at least one pitch type.');
 const seen=new Set();for(const r of rows){if(seen.has(r.key))throw Error('Duplicate pitch type');seen.add(r.key);if(!Number.isInteger(r.n)||r.n<1)throw Error(r.name+': pitch count must be a positive integer');if(r.velo==null||r.velo<20||r.velo>120)throw Error(r.name+': average velocity must be 20–120 mph');if(r.veloMax!=null&&r.veloMax<r.velo)throw Error(r.name+': max velocity is below average');for(const f of ['strike','strikeExt','out'])if(r[f]!=null&&(r[f]<0||r[f]>100))throw Error(r.name+': invalid '+f);}
 const playerName=$('session-player-name').value.trim(),age=$('session-player-age').value;
 const affiliation=$('session-player-affiliation').value;
 if(mode==='new'&&(!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(playerName)||!age))throw Error('Enter player name and age group.');
 if(mode==='new'&&!['internal','external'].includes(affiliation))throw Error('Choose Internal or External.');
 // New players use opaque internal document keys. Their separate six-digit ID is the permanent share link.
 const pid=mode==='new'?'p-'+crypto.randomUUID().replace(/-/g,''):id;
 const ref=db.collection('players').doc(pid),now=firebase.firestore.FieldValue.serverTimestamp(),incoming=rows.map(r=>({...r,name:names[r.key]})).sort((a,b)=>b.n-a.n);
 const audit={file:fileName,sha256:fileHash,by:user.email,at:new Date().toISOString(),pitchCount:incoming.reduce((s,r)=>s+r.n,0)};
 $('session-save').disabled=true;err('Saving shared player data...');
 if(mode==='new'){
   let created=false;
   for(let attempt=0;attempt<24&&!created;attempt++){
     const random=new Uint32Array(1);crypto.getRandomValues(random);
     const publicId=String(100000+(random[0]%900000));
     const codeRef=db.collection('playerCodes').doc(publicId);
     created=await db.runTransaction(async tx=>{
       const [playerSnap,codeSnap]=await Promise.all([tx.get(ref),tx.get(codeRef)]);
       if(playerSnap.exists)throw Error('Player record already exists. Please retry.');
       if(codeSnap.exists)return false; // reserve a different six-digit number
       tx.set(codeRef,{playerId:pid});
       tx.set(ref,{id:pid,publicId,name:playerName,ageLabel:age==='Coach'?'Coach / Adult':age+'U',ageNum:age==='Coach'?28:Number(age),affiliation,sessions:1,dataType:'aggregate',discardedUndefined:0,pitches:incoming,createdBy:user.email,updatedBy:user.email,updatedAt:now,importHistory:[audit]});
       return true;
     });
   }
   if(!created)throw Error('Unable to reserve a unique six-digit ID. Please try again.');
 }else{
   await db.runTransaction(async tx=>{
     const snap=await tx.get(ref);
     if(!snap.exists)throw Error('Player no longer exists');
     const old=snap.data();
     if(old.inactive===true)throw Error('This player is inactive. An administrator must reactivate the profile before uploading another session.');
     if(old.dataType!=='aggregate')throw Error('Raw pitch-log players cannot yet receive aggregate session uploads.');
     const history=Array.isArray(old.importHistory)?old.importHistory.slice(-49):[];
     if(history.some(h=>h.sha256===fileHash))throw Error('This exact file was already imported for this player.');
     history.push(audit);
     tx.update(ref,{pitches:merge(old.pitches,incoming),sessions:old.sessions+1,updatedBy:user.email,updatedAt:now,importHistory:history});
   });
 }
 await window.DZ_RELOAD_ROSTER();close();if(mode==='new')await window.DZ_OPEN_PLAYER(pid);else await showPlayer(pid);
 }catch(e){err(e);}finally{$('session-save').disabled=false;}
};
window.DZ_IMPORTER_INIT=({firestore,currentUser})=>{db=firestore;user=currentUser;};
})();