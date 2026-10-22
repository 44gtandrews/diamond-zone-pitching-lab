/* Diamond Zone CT — authenticated, shared Firestore storage */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const authScreen = $('cloud-auth-screen');
  const loginForm = $('cloud-login-form');
  const loginActions = $('cloud-auth-actions');
  const verifyActions = $('cloud-verification-actions');
  const status = $('cloud-auth-status');
  let auth, db, activeUser=null, staff=null;
  let accessVersion=0;
  window.DZ_AUTHORIZED = false;
  window.DZ_IS_ADMIN = false;

  function showAuth(title, description, mode='login', message='') {
    window.DZ_AUTHORIZED=false;
    window.DZ_IS_ADMIN=false;
    authScreen.style.display='block';
    $('cloud-bar').style.display='none';
    $('view-home').style.display='none';
    $('view-player').style.display='none';
    $('view-admin').style.display='none';
    $('cloud-auth-title').textContent=title;
    $('cloud-auth-description').textContent=description;
    loginForm.style.display=mode==='login'?'grid':'none';
    loginActions.style.display=mode==='login'?'flex':'none';
    verifyActions.style.display=mode==='verify'?'flex':'none';
    status.textContent=message;
  }
  const emailKey=s=>String(s||'').trim().toLowerCase();
  function friendly(e) {
    const msg=String(e?.message||e);
    if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/.test(msg)) return 'Email or password not accepted.';
    if (/auth\/email-already-in-use/.test(msg)) return 'Account exists. Sign in instead.';
    if (/auth\/weak-password/.test(msg)) return 'Choose a password with at least six characters.';
    if (/permission-denied|Missing or insufficient permissions/.test(msg)) return 'Access denied. Check coach approval and Firestore rules.';
    return msg.replace(/^Firebase:\s*/,'');
  }
  function notify(element,text,error=false) {
    element.textContent=text;
    element.classList.toggle('cloud-error',error);
  }
  window.DZ_SAVE_ERROR=e=>{console.error('Shared save failed',e);alert('Shared save failed: '+friendly(e));};

  function installStorage() {
    function section(key) {
      const m=/^([a-z0-9-]{1,65}):(notes|mechanics|strength|grades|type-overrides)$/.exec(key);
      if (!m) throw Error('Invalid storage key');
      return db.collection('playerEdits').doc(m[1]).collection('sections').doc(m[2]);
    }
    window.storage={
      async get(key) {
        if(!window.DZ_AUTHORIZED) throw Error('Sign in required');
        const doc=await section(key).get();
        return doc.exists ? {value:doc.data().value}:null;
      },
      async set(key,value) {
        if(!window.DZ_AUTHORIZED) throw Error('Sign in required');
        if(typeof value!=='string') throw Error('Invalid value');
        await section(key).set({value,editedBy:activeUser.email,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        return {key,value};
      },
      async delete(key) {
        if(!window.DZ_AUTHORIZED) throw Error('Sign in required');
        await section(key).delete();return {key,deleted:true};
      }
    };
  }

  function sortGroups() {
    const coachGroup=$('roster-coach').closest('.group');
    const groupIds=new Set(ROSTER_GROUPS.map(g=>g.containerId));
    for(const p of Object.values(PLAYERS)){
      const id='roster-'+p.ageNum+'u';
      if(p.ageNum===28||groupIds.has(id))continue;
      const section=document.createElement('div');section.className='group';
      const title=document.createElement('p');title.className='group-title';title.append(document.createTextNode(p.ageNum+'U '));
      const count=document.createElement('span');count.className='group-count';title.append(count);
      const roster=document.createElement('div');roster.className='roster';roster.id=id;section.append(title,roster);coachGroup.before(section);
      ROSTER_GROUPS.splice(ROSTER_GROUPS.length-1,0,{containerId:id,ids:[]});groupIds.add(id);
    }
    const seen=new Set();
    for(const group of ROSTER_GROUPS) {
      group.ids=group.ids.filter(id=>PLAYERS[id] && !seen.has(id) && seen.add(id));
    }
    for(const p of Object.values(PLAYERS)) {
      if(seen.has(p.id)) continue;
      const slug=/coach|adult/i.test(p.ageLabel) ? 'coach' : p.ageNum+'u';
      const group=ROSTER_GROUPS.find(g=>g.containerId==='roster-'+slug);
      if(group) group.ids.push(p.id);
    }
    for(const group of ROSTER_GROUPS) {
      const n=group.ids.length;
      $(group.containerId).closest('.group').querySelector('.group-count').textContent=n+' pitcher'+(n===1?'':'s');
    }
    const count=Object.keys(PLAYERS).length;
    document.querySelector('#view-home .page-sub').textContent=count+' pitchers tracked · sorted by age group';
    $('cloud-empty').style.display=count?'none':'block';
  }
  async function loadPlayers() {
    const snapshot=await db.collection('players').get();
    for(const k of Object.keys(PLAYERS)) delete PLAYERS[k];
    snapshot.forEach(doc=>{
      const p=doc.data();
      if(!p || p.id!==doc.id || !p.name || !(Array.isArray(p.pitches)||Array.isArray(p.rawPitches))) return;
      if(p.dataType==='raw') {
        p.typeOverrides=p.typeOverrides||{};
        p.logSortBy=p.logSortBy||'no';
        p.rawPitches.forEach(pitch=>{if(!pitch.autoType) pitch.autoType=classify(pitch);});
      }
      PLAYERS[doc.id]=p;
    });
    sortGroups();
  }
  const hasPublicId=p=>/^[1-9][0-9]{5}$/.test(String(p.publicId||''));
  function makePublicId() {
    const a=new Uint32Array(1);
    crypto.getRandomValues(a);
    return String(100000+(a[0]%900000));
  }
  // One-time, admin-only migration: reserve each six-digit ID atomically.
  // Keep the original /players/{id} document ID unchanged so prior notes/grades survive.
  async function assignMissingPublicIds() {
    if(staff?.role!=='admin')return 0;
    let assigned=0;
    for(const p of Object.values(PLAYERS).filter(p=>!hasPublicId(p))) {
      const playerRef=db.collection('players').doc(p.id);
      let success=false;
      for(let attempt=0;attempt<24 && !success;attempt++) {
        const code=makePublicId(),codeRef=db.collection('playerCodes').doc(code);
        success=await db.runTransaction(async tx=>{
          const [playerSnap,reservedSnap]=await Promise.all([tx.get(playerRef),tx.get(codeRef)]);
          if(!playerSnap.exists)return true;
          if(hasPublicId(playerSnap.data()))return true;
          if(reservedSnap.exists)return false;
          tx.set(codeRef,{playerId:p.id});
          tx.update(playerRef,{publicId:code});
          return true;
        });
      }
      if(!success)throw Error('Unable to reserve a unique six-digit ID for '+p.name);
      assigned++;
    }
    return assigned;
  }
  window.DZ_ASSIGN_PUBLIC_IDS=async()=>{
    if(staff?.role!=='admin')throw Error('Administrator required');
    const count=await assignMissingPublicIds();
    await loadPlayers();
    if(window.DZ_OPEN_CURRENT_URL) await window.DZ_OPEN_CURRENT_URL();
    return count;
  };
  async function showAllowed() {
    window.DZ_AUTHORIZED=true;
    window.DZ_IS_ADMIN=staff?.role==='admin';
    installStorage();
    authScreen.style.display='none';
    $('cloud-bar').style.display='block';
    $('cloud-identity').textContent=activeUser.email+' · '+(staff.role==='admin'?'Administrator':'Coach');
    $('cloud-admin-nav').style.display=window.DZ_IS_ADMIN?'':'none';
    await loadPlayers();
    if(staff.role==='admin' && Object.values(PLAYERS).some(p=>!hasPublicId(p))){
      try {
        await assignMissingPublicIds();
        await loadPlayers();
      } catch(e) {
        console.warn('Public player ID assignment pending:', e);
        notify($('cloud-import-status'),'Player ID assignment pending: '+friendly(e)+'. Publish the updated Firestore rules, then reload.',true);
      }
    }
    await window.DZ_OPEN_CURRENT_URL();
    window.DZ_IMPORTER_INIT({firestore:db,currentUser:activeUser});
    if(staff.role==='admin') await listCoaches();
  }
  window.DZ_RELOAD_ROSTER=async()=>{await loadPlayers();};
  window.DZ_CURRENT_PLAYER=()=>currentPlayerId;
  async function checkAccess(user) {
    const version=++accessVersion;
    activeUser=user;staff=null;
    if(!user) {
      showAuth('Coach sign in','Approved Diamond Zone coaches can access secure profiles and shared notes.');
      return;
    }
    if(!user.emailVerified) {
      showAuth('Verify your email','Open your Firebase verification email and confirm your address before entering the portal.','verify');
      return;
    }
    showAuth('Checking coach approval','Verifying your permission to access the roster.','loading');
    try {
      await user.getIdToken(true);
      const doc=await db.collection('allowlist').doc(emailKey(user.email)).get();
      if(version!==accessVersion) return;
      if(!doc.exists||doc.data().active!==true){
        // An authenticated, email-verified coach may create ONE pending request.
        // Firestore denies all roster reads until a separate admin approval.
        const requestRef=db.collection('coachRequests').doc(user.uid);
        let request;
        try {
          request=await requestRef.get();
          if(!request.exists){
            await requestRef.set({
              uid:user.uid,
              email:emailKey(user.email),
              status:'pending',
              requestedAt:firebase.firestore.FieldValue.serverTimestamp()
            });
            request=await requestRef.get();
          }
        }catch(e){
          if(version===accessVersion){
            showAuth('Approval request unavailable','Your account is verified, but the access request could not be submitted. Please try again after the latest Firestore rules are published.','verify',friendly(e));
          }
          return;
        }
        if(version!==accessVersion)return;
        const state=request.data()?.status;
        if(state==='denied'){
          showAuth('Access request denied','The administrator has declined access for this account. Contact Diamond Zone if you believe this was a mistake.','verify');
        }else if(state==='approved'){
          showAuth('Approval processing','Your request has been approved. Sign in again shortly; contact the administrator if your roster access is not enabled.','verify');
        }else{
          showAuth('Access request pending','Your verified account has been submitted to Diamond Zone for review. You cannot access player data until the administrator approves it.','verify');
        }
        return;
      }
      staff=doc.data();
      await showAllowed();
    }catch(e) {
      if(version===accessVersion) showAuth('Cloud connection error','Check the Firebase setup and Firestore rules.','verify',friendly(e));
    }
  }

  loginForm.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('cloud-login-button');
    btn.disabled=true;notify(status,'Signing in...');
    try {await auth.signInWithEmailAndPassword(emailKey($('cloud-email').value),$('cloud-password').value);}
    catch(err){notify(status,friendly(err),true);}
    finally{btn.disabled=false;}
  });
  $('cloud-signup').addEventListener('click',async()=>{
    const email=emailKey($('cloud-email').value),password=$('cloud-password').value;
    if(!email||password.length<6){notify(status,'Enter a valid email and password (at least six characters).',true);return;}
    try{
      const result=await auth.createUserWithEmailAndPassword(email,password);
      await result.user.sendEmailVerification();
      showAuth('Verification sent','Check your email and confirm your address. An admin must separately approve your email.','verify','Verification sent to '+email);
    }catch(e){notify(status,friendly(e),true);}
  });
  $('cloud-reset').addEventListener('click',async()=>{
    const email=emailKey($('cloud-email').value);
    if(!email){notify(status,'Enter your email first.',true);return;}
    try{await auth.sendPasswordResetEmail(email);notify(status,'If an account exists, password reset instructions have been emailed.');}
    catch(e){notify(status,friendly(e),true);}
  });
  $('cloud-recheck').addEventListener('click',async()=>{
    try{
      if(!auth.currentUser){showAuth('Coach sign in','Sign in to continue.');return;}
      await auth.currentUser.reload();await auth.currentUser.getIdToken(true);await checkAccess(auth.currentUser);
    }catch(e){notify(status,friendly(e),true);}
  });
  $('cloud-resend').addEventListener('click',async()=>{
    try{
      if(!auth.currentUser)throw Error('Sign in first');
      await auth.currentUser.sendEmailVerification();notify(status,'Verification message sent. Check your inbox and spam folder.');
    }catch(e){notify(status,friendly(e),true);}
  });
  $('cloud-verify-signout').addEventListener('click',()=>auth.signOut());
  $('cloud-signout').addEventListener('click',()=>auth.signOut());

  function validPlayer(p) {
    if(!p||typeof p!=='object'||!/^[a-z0-9-]{1,65}$/.test(p.id||'')||typeof p.name!=='string'||
       p.name.length>140||typeof p.ageLabel!=='string'||!Number.isInteger(p.ageNum)||
       !Number.isInteger(p.sessions)||p.sessions<1||!['aggregate','raw'].includes(p.dataType)||
       !(Array.isArray(p.pitches)||Array.isArray(p.rawPitches))) throw Error('Invalid player: '+String(p&&p.id));
    if(p.dataType==='raw'&&(!Array.isArray(p.rawPitches)||!p.rawPitches.length))throw Error('Raw pitch list missing: '+p.name);
    if(p.dataType==='aggregate'&&(!Array.isArray(p.pitches)||!p.pitches.length))throw Error('Pitch summaries missing: '+p.name);
  }
  $('cloud-import').addEventListener('click',async()=>{
    if(staff?.role!=='admin')return;
    const msg=$('cloud-import-status'),file=$('cloud-roster-file').files[0];
    if(!file){notify(msg,'Choose the private roster JSON first.',true);return;}
    if(file.size>3_000_000){notify(msg,'Roster must be under 3 MB.',true);return;}
    $('cloud-import').disabled=true;
    try{
      const data=JSON.parse(await file.text());
      const players=Array.isArray(data)?data:data.players;
      if(!Array.isArray(players)||players.length<1||players.length>500)throw Error('Expected between 1 and 500 players.');
      const ids=new Set();
      players.forEach(p=>{validPlayer(p);if(ids.has(p.id))throw Error('Duplicate ID: '+p.id);ids.add(p.id);});
      notify(msg,'Importing '+players.length+' player records...');
      for(let i=0;i<players.length;i+=300){
        const batch=db.batch();
        for(const p of players.slice(i,i+300)){
          const {publicId,...safe}=p; // Never overwrite an assigned ID from a roster JSON.
          batch.set(db.collection('players').doc(p.id),safe,{merge:true});
        }
        await batch.commit();
      }
      await loadPlayers();
      const count=await assignMissingPublicIds();
      await loadPlayers();window.DZ_GO_HOME();
      notify(msg,'Imported '+players.length+' players; assigned '+count+' new six-digit IDs. Existing notes, grades and public IDs were preserved.');
    }catch(e){notify(msg,'Import failed: '+friendly(e),true);}
    finally{$('cloud-import').disabled=false;}
  });
  $('cloud-backup').addEventListener('click',()=>{
    if(staff?.role!=='admin')return;
    const blob=new Blob([JSON.stringify({schemaVersion:1,players:Object.values(PLAYERS)},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='diamond-zone-roster-backup.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

  function coachCard(email, meta, actions) {
    const li=document.createElement('li');
    const detail=document.createElement('div');detail.className='dz-coach-detail';
    const address=document.createElement('div');address.className='dz-coach-email';address.textContent=email;
    const description=document.createElement('div');description.className='dz-coach-meta';description.textContent=meta;
    detail.append(address,description);li.appendChild(detail);
    if(actions.length) {
      const buttons=document.createElement('div');buttons.className='dz-coach-actions';
      for(const entry of actions){
        const btn=document.createElement('button');
        btn.type='button';btn.className='cloud-button'+(entry.secondary?' secondary':'');
        btn.textContent=entry.label;
        btn.addEventListener('click',async()=>{
          btn.disabled=true;
          try{await entry.run();await listCoaches();}
          catch(e){notify($('cloud-request-status'),friendly(e),true);}
          finally{btn.disabled=false;}
        });
        buttons.appendChild(btn);
      }
      li.appendChild(buttons);
    }
    return li;
  }
  function emptyCoachRow(message){
    const li=document.createElement('li');li.className='dz-empty-requests';
    li.textContent=message;return li;
  }
  const requestDate=d=>d?.requestedAt?.toDate?.().toLocaleString?.()||'Recently submitted';
  async function decideRequest(doc,decision){
    if(staff?.role!=='admin')throw Error('Administrator required');
    const data=doc.data(),email=emailKey(data.email);
    if(email===emailKey(activeUser.email))throw Error('Cannot modify your own administrator access');
    if(!['approved','denied','pending'].includes(decision))throw Error('Unknown decision');
    const allowRef=db.collection('allowlist').doc(email);
    const current=await allowRef.get();
    if(current.exists && current.data().role==='admin')
      throw Error('Another administrator account cannot be changed from the request queue');
    const batch=db.batch(),stamp=firebase.firestore.FieldValue.serverTimestamp();
    if(decision==='approved'){
      batch.set(allowRef,{
        active:true,role:'coach',approvedBy:activeUser.email,updatedAt:stamp
      },{merge:true});
    }else if(current.exists){
      batch.update(allowRef,{active:false,updatedAt:stamp});
    }
    batch.update(doc.ref,{status:decision,reviewedAt:stamp,reviewedBy:activeUser.email});
    await batch.commit();
    notify($('cloud-request-status'),
      email+' — '+(decision==='approved'?'approved':decision==='denied'?'denied':'moved back to pending')+'.');
  }
  async function listCoaches() {
    if(staff?.role!=='admin')return;
    const pending=$('cloud-pending-requests'),denied=$('cloud-denied-requests'),list=$('cloud-allowlist');
    pending.replaceChildren();denied.replaceChildren();list.replaceChildren();
    notify($('cloud-request-status'),'Loading coach access requests...');
    try {
      const [allowlist,requests]=await Promise.all([
        db.collection('allowlist').get(),
        db.collection('coachRequests').get()
      ]);
      let pendingCount=0,deniedCount=0;
      const entries=Array.from(requests.docs)
        .sort((a,b)=>(b.data().requestedAt?.toMillis?.()||0)-(a.data().requestedAt?.toMillis?.()||0));
      for(const request of entries){
        const d=request.data(),email=emailKey(d.email);
        if(!email||!d.uid)continue;
        const meta=requestDate(d)+' · Email verified';
        if(d.status==='pending'){
          pendingCount++;
          pending.appendChild(coachCard(email,meta,[
            {label:'Approve',run:()=>decideRequest(request,'approved')},
            {label:'Deny',secondary:true,run:()=>decideRequest(request,'denied')}
          ]));
        }else if(d.status==='denied'){
          deniedCount++;
          denied.appendChild(coachCard(email,'Denied · '+meta,[
            {label:'Approve',run:()=>decideRequest(request,'approved')},
            {label:'Reconsider',secondary:true,run:()=>decideRequest(request,'pending')}
          ]));
        }
      }
      if(!pendingCount)pending.appendChild(emptyCoachRow('No pending requests.'));
      if(!deniedCount)denied.appendChild(emptyCoachRow('No denied requests.'));
      $('cloud-pending-count').textContent=String(pendingCount);
      $('cloud-pending-badge').textContent=String(pendingCount);
      $('cloud-pending-badge').style.display=pendingCount?'inline-block':'none';

      const approved=[];
      allowlist.forEach(doc=>approved.push(doc));
      approved.sort((a,b)=>a.id.localeCompare(b.id));
      for(const doc of approved){
        const d=doc.data(),mine=doc.id===emailKey(activeUser.email);
        const statusText=d.active?'Approved':'Disabled';
        const actions=mine?[]:[{
          label:d.active?'Disable access':'Reinstate',
          secondary:!!d.active,
          run:async()=>{
            await doc.ref.update({
              active:!d.active,
              updatedAt:firebase.firestore.FieldValue.serverTimestamp()
            });
            notify($('cloud-request-status'),doc.id+(d.active?' disabled.':' reinstated.'));
          }
        }];
        list.appendChild(coachCard(doc.id,d.role+' · '+statusText+(mine?' · You':''),actions));
      }
      if(!approved.length)list.appendChild(emptyCoachRow('No approved coaches yet.'));
      notify($('cloud-request-status'),'Coach access list refreshed.');
    }catch(e){
      notify($('cloud-request-status'),'Unable to load coach requests: '+friendly(e),true);
      pending.appendChild(emptyCoachRow('Please check that the new Firestore security rules are deployed.'));
    }
  }
  window.DZ_REFRESH_COACH_REQUESTS=()=>listCoaches();
  $('cloud-refresh-requests').addEventListener('click',()=>listCoaches());
  $('cloud-invite-form').addEventListener('submit',async e=>{
    e.preventDefault();if(staff?.role!=='admin')return;
    const email=emailKey($('cloud-invite-email').value),role='coach';
    if(!/^[^\\s/@]+@[^\\s/@]+\\.[^\\s/@]+$/.test(email)){
      notify($('cloud-invite-status'),'Enter a valid email.',true);return;
    }
    try{
      await db.collection('allowlist').doc(email).set({
        active:true,role,invitedBy:activeUser.email,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      $('cloud-invite-email').value='';
      notify($('cloud-invite-status'),email+' approved. The coach can create and verify an account.');
      await listCoaches();
    }catch(err){notify($('cloud-invite-status'),friendly(err),true);}
  });

  if(!window.DZ_FIREBASE_CONFIG?.apiKey||!window.DZ_FIREBASE_CONFIG?.projectId||!window.firebase){
    showAuth('Cloud setup needed',
      'The secure app has been built, but it needs your Firebase project details, Authentication, and published Firestore rules. Follow README.md.',
      'setup');return;
  }
  try{
    const app=firebase.initializeApp(window.DZ_FIREBASE_CONFIG);
    auth=app.auth();db=app.firestore();
    auth.onAuthStateChanged(user=>checkAccess(user));
  }catch(e){showAuth('Firebase setup error','Review your firebase-config.js file.','setup',friendly(e));}
})();
