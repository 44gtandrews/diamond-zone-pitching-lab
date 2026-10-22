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

  // Last token is the surname; ignore common generational suffixes (Jr., III, etc.).
  // Hyphenated surnames remain a single last-name token.
  function surname(name) {
    const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
    while(parts.length>1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length-1].replace(/,$/,''))){
      parts.pop();
    }
    return parts.length?parts[parts.length-1]:'';
  }
  function byLastName(a,b) {
    return surname(a.name).localeCompare(surname(b.name),undefined,{sensitivity:'base'})||
      String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'})||
      String(a.id||'').localeCompare(String(b.id||''));
  }
  function sortGroups() {
    // Existing players without an affiliation are Internal. Inactive players are archived.
    const active=Object.values(PLAYERS).filter(p=>p.inactive!==true);
    const programPlayers=active.filter(p=>p.affiliation!=='external');
    const lessonPlayers=active.filter(p=>p.affiliation==='external');
    programPlayers.sort(byLastName);
    lessonPlayers.sort(byLastName);
    EXTERNAL_PLAYER_IDS.length=0;
    EXTERNAL_PLAYER_IDS.push(...lessonPlayers.map(p=>p.id));
    ROSTER_GROUPS.length=0;

    const byAge=new Map();
    for(const player of programPlayers){
      const coach=player.ageNum===28 || /coach|adult/i.test(player.ageLabel||'');
      const age=coach?'coach':String(player.ageNum)+'u';
      if(!byAge.has(age))byAge.set(age,[]);
      byAge.get(age).push(player.id);
    }
    const container=$('dz-internal-groups');
    container.replaceChildren();
    const ages=[...byAge.keys()].sort((a,b)=>{
      if(a==='coach')return 1;
      if(b==='coach')return -1;
      return Number.parseInt(a,10)-Number.parseInt(b,10);
    });
    for(const key of ages){
      const ids=byAge.get(key),section=document.createElement('section');
      section.className='group';
      const title=document.createElement('h2');
      title.className='group-title';
      const label=key==='coach'?'Coach / Adult':Number.parseInt(key,10)+'U';
      title.append(document.createTextNode(label+' '));
      const count=document.createElement('span');
      count.className='group-count';count.textContent=ids.length+' pitcher'+(ids.length===1?'':'s');
      title.append(count);
      const roster=document.createElement('div');
      roster.className='roster';roster.id='roster-'+key;
      section.append(title,roster);
      container.appendChild(section);
      ROSTER_GROUPS.push({containerId:roster.id,ids});
    }

    $('dz-internal-count').textContent=String(programPlayers.length);
    $('dz-external-count').textContent=String(lessonPlayers.length);
    $('dz-internal-empty').style.display=programPlayers.length?'none':'block';
    $('dz-external-empty').style.display=lessonPlayers.length?'none':'block';
    $('cloud-empty').style.display=active.length?'none':'block';
    document.querySelector('#view-home .page-sub').textContent=
      programPlayers.length+' internal · '+lessonPlayers.length+' external · '+
      (programPlayers.length+lessonPlayers.length)+' total pitchers';
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
    $('cloud-edit-profile').style.display=window.DZ_IS_ADMIN?'':'none';
    $('cloud-inactivate-player').style.display=window.DZ_IS_ADMIN?'':'none';
    $('cloud-delete-player').style.display=window.DZ_IS_ADMIN?'':'none';
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
    if(staff.role==='admin') {
      await listCoaches();
      renderInactivePlayers();
    }
  }
  window.DZ_RELOAD_ROSTER=async()=>{
    await loadPlayers();
    if(window.DZ_IS_ADMIN)renderInactivePlayers();
  };
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
        if(doc.exists && doc.data().active===false){
          const previous=await db.collection('coachRequests').doc(user.uid).get();
          if(version!==accessVersion)return;
          const declined=previous.exists && previous.data().status==='denied';
          showAuth(declined?'Access request denied':'Coach account disabled',
            declined?'Access was declined by the administrator. Contact Diamond Zone to inquire.':
            'This account has been disabled. Contact the administrator to inquire.','verify');
          return;
        }
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
          showAuth('Access request pending','Your verified account has been submitted to Diamond Zone for review. You cannot access player data until the administrator approves it. Select the continue button after approval.','verify');
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

  // Edit only mutable profile identity fields; all player IDs and sessions remain intact.
  let editingPlayer=null;
  const editOverlay=$('cloud-edit-overlay');
  function closeProfileEdit(){
    editOverlay.style.display='none';
    editingPlayer=null;
    notify($('cloud-edit-status'),'');
  }
  $('cloud-edit-profile').addEventListener('click',()=>{
    if(!window.DZ_IS_ADMIN)return;
    const player=PLAYERS[window.DZ_CURRENT_PLAYER()];
    if(!player)return;
    editingPlayer=player.id;
    $('cloud-edit-name').value=player.name;
    $('cloud-edit-age').value=/coach|adult/i.test(player.ageLabel)?'Coach':String(player.ageNum);
    $('cloud-edit-affiliation').value=player.affiliation==='external'?'external':'internal';
    notify($('cloud-edit-status'),'');
    editOverlay.style.display='flex';
    $('cloud-edit-name').focus();
  });
  $('cloud-edit-cancel').addEventListener('click',closeProfileEdit);
  editOverlay.addEventListener('click',e=>{if(e.target===editOverlay)closeProfileEdit();});
  editOverlay.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfileEdit();});
  $('cloud-edit-form').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!window.DZ_IS_ADMIN||!editingPlayer)return;
    const id=editingPlayer;
    const name=$('cloud-edit-name').value.trim().replace(/\s+/g,' ');
    const age=$('cloud-edit-age').value;
    const affiliation=$('cloud-edit-affiliation').value;
    if(!['internal','external'].includes(affiliation)){
      notify($('cloud-edit-status'),'Select Internal or External.',true);return;
    }
    if(!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(name)){
      notify($('cloud-edit-status'),'Enter a valid player name (2–100 letters, spaces or basic punctuation).',true);return;
    }
    if(age!=='Coach' && (!/^\d{2}$/.test(age)||Number(age)<10||Number(age)>18)){
      notify($('cloud-edit-status'),'Select a valid age group.',true);return;
    }
    const changes={name,ageNum:age==='Coach'?28:Number(age),ageLabel:age==='Coach'?'Coach / Adult':age+'U',
      affiliation,updatedBy:activeUser.email,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    const btn=$('cloud-edit-save');btn.disabled=true;
    try{
      notify($('cloud-edit-status'),'Saving player profile...');
      const doc=db.collection('players').doc(id);
      // Transaction: never recreate a missing player or change their permanent identity.
      await db.runTransaction(async tx=>{
        const snap=await tx.get(doc);
        if(!snap.exists)throw Error('Player no longer exists.');
        tx.update(doc,changes);
      });
      await loadPlayers();
      closeProfileEdit();
      await window.DZ_OPEN_CURRENT_URL();
    }catch(error){
      notify($('cloud-edit-status'),'Profile update failed: '+friendly(error),true);
    }finally{btn.disabled=false;}
  });

  // Administrators manage inactive pitchers without changing the player's IDs,
  // Trackman sessions or related coaching sections.
  function renderInactivePlayers() {
    if(!window.DZ_IS_ADMIN)return;
    const list=$('cloud-inactive-list');
    list.replaceChildren();
    const inactive=Object.values(PLAYERS).filter(p=>p.inactive===true).sort(byLastName);
    $('cloud-inactive-count').textContent=String(inactive.length);
    for(const player of inactive){
      const item=document.createElement('li');
      const summary=document.createElement('div');
      summary.className='dz-coach-detail';
      const name=document.createElement('div');name.className='dz-coach-email';
      name.textContent=player.name;
      const details=document.createElement('div');details.className='dz-inactive-meta';
      details.textContent=(player.affiliation==='external'?'External':'Internal')+
        ' · '+player.ageLabel+
        (player.publicId?' · ID '+player.publicId:'');
      summary.append(name,details);
      const actions=document.createElement('div');actions.className='dz-coach-actions';
      const restore=document.createElement('button');restore.type='button';
      restore.className='cloud-button';restore.textContent='Reactivate';
      restore.addEventListener('click',async()=>{
        restore.disabled=true;
        try{
          await setPlayerInactive(player.id,false);
          notify($('cloud-inactive-status'),player.name+' reactivated.');
        }catch(e){
          notify($('cloud-inactive-status'),'Reactivation failed: '+friendly(e),true);
          restore.disabled=false;
        }
      });
      const remove=document.createElement('button');remove.type='button';
      remove.className='cloud-button secondary dz-danger-button';remove.textContent='Delete';
      remove.addEventListener('click',async()=>{
        remove.disabled=true;
        try{await permanentlyDeletePlayer(player.id);}
        catch(e){
          notify($('cloud-inactive-status'),'Deletion failed: '+friendly(e),true);
          remove.disabled=false;
        }
      });
      actions.append(restore,remove);
      item.append(summary,actions);
      list.appendChild(item);
    }
    if(inactive.length===0){
      const message=document.createElement('li');
      message.className='dz-empty-requests';
      message.textContent='No inactive players. Inactivate a player from their profile to archive them here.';
      list.appendChild(message);
    }
  }
  window.DZ_REFRESH_INACTIVE=renderInactivePlayers;
  $('cloud-refresh-inactive').addEventListener('click',async()=>{
    if(!window.DZ_IS_ADMIN)return;
    try{
      await loadPlayers();
      renderInactivePlayers();
      notify($('cloud-inactive-status'),'Inactive players refreshed.');
    }catch(e){notify($('cloud-inactive-status'),friendly(e),true);}
  });

  async function setPlayerInactive(id,shouldInactivate){
    if(staff?.role!=='admin')throw Error('Administrator access required.');
    const ref=db.collection('players').doc(id);
    await db.runTransaction(async tx=>{
      const doc=await tx.get(ref);
      if(!doc.exists)throw Error('This player no longer exists.');
      tx.update(ref,{
        inactive:shouldInactivate,
        statusChangedAt:firebase.firestore.FieldValue.serverTimestamp(),
        statusChangedBy:activeUser.email
      });
    });
    await loadPlayers();
    renderInactivePlayers();
    if(shouldInactivate)window.DZ_GO_HOME();
  }
  $('cloud-inactivate-player').addEventListener('click',async()=>{
    if(staff?.role!=='admin')return;
    const id=window.DZ_CURRENT_PLAYER(),player=PLAYERS[id];
    if(!player || player.inactive===true)return;
    if(!window.confirm('Inactivate '+player.name+'?\n\nThe profile will be removed from coach directories and stored in Admin Dashboard → Inactive Players. All statistics and coaching notes will be preserved.'))return;
    const button=$('cloud-inactivate-player');button.disabled=true;
    try{
      await setPlayerInactive(id,true);
      notify($('cloud-inactive-status'),player.name+' archived. You can reactivate this profile anytime.');
    }catch(e){window.alert('Unable to inactivate player: '+friendly(e));}
    finally{button.disabled=false;}
  });

  async function permanentlyDeletePlayer(id){
    if(staff?.role!=='admin')throw Error('Administrator access required.');
    // Always read fresh metadata rather than deleting based on the in-memory list.
    const ref=db.collection('players').doc(id),record=await ref.get();
    if(!record.exists)throw Error('This player no longer exists.');
    const player=record.data();
    const accepted=window.prompt(
      'PERMANENTLY DELETE '+player.name+'?\n\nThis permanently erases their pitching records, notes, grades, and profile. It cannot be undone without a backup.\n\nConsider downloading a full JSON backup from Admin first.\n\nType DELETE to confirm:'
    );
    if(accepted!=='DELETE')return false;
    // An atomic batch prevents a partially deleted profile. We intentionally
    // retain the anonymous /playerCodes/{code} reservation as a permanent
    // tombstone, so an old share link cannot be assigned to a different athlete.
    const sections=await db.collection('playerEdits').doc(id).collection('sections').get();
    if(sections.size>400)throw Error('Unusually large coaching history. Contact an administrator to safely remove it.');
    const batch=db.batch();
    sections.forEach(doc=>batch.delete(doc.ref));
    batch.delete(ref);
    await batch.commit();
    const wasOpenProfile=window.DZ_CURRENT_PLAYER()===id;
    delete PLAYERS[id];
    await loadPlayers();
    renderInactivePlayers();
    if(wasOpenProfile)window.DZ_GO_HOME();
    notify($('cloud-inactive-status'),player.name+' permanently deleted. Their six-digit ID will never be recycled.');
    return true;
  }
  $('cloud-delete-player').addEventListener('click',async()=>{
    if(staff?.role!=='admin')return;
    const id=window.DZ_CURRENT_PLAYER();
    if(!id || !PLAYERS[id])return;
    const button=$('cloud-delete-player');button.disabled=true;
    try{await permanentlyDeletePlayer(id);}
    catch(e){window.alert('Unable to delete player: '+friendly(e));}
    finally{button.disabled=false;}
  });

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


  // Complete, admin-only Firestore application-data backup.
  // Authentication passwords and Firebase settings are not part of Firestore.
  function dzEncodeBackup(value){
    if(value instanceof firebase.firestore.Timestamp){
      return {__dzTimestamp:[value.seconds,value.nanoseconds]};
    }
    if(Array.isArray(value))return value.map(dzEncodeBackup);
    if(value && typeof value==='object'){
      const result={};
      for(const [key,item] of Object.entries(value))result[key]=dzEncodeBackup(item);
      return result;
    }
    return value;
  }
  function dzDecodeBackup(value){
    if(Array.isArray(value))return value.map(dzDecodeBackup);
    if(value && typeof value==='object'){
      const keys=Object.keys(value);
      if(keys.length===1 && keys[0]==='__dzTimestamp'){
        const parts=value.__dzTimestamp;
        if(!Array.isArray(parts)||parts.length!==2||!Number.isInteger(parts[0])||
          !Number.isInteger(parts[1])||parts[1]<0||parts[1]>=1e9)throw Error('Invalid timestamp in backup.');
        return new firebase.firestore.Timestamp(parts[0],parts[1]);
      }
      const result={};
      for(const [key,item] of Object.entries(value)){
        if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsupported field name in backup.');
        result[key]=dzDecodeBackup(item);
      }
      return result;
    }
    return value;
  }
  function dzBackupRow(doc){
    return {id:doc.id,data:dzEncodeBackup(doc.data())};
  }
  function dzDownloadJson(filename,payload){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;anchor.style.display='none';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const dzBackupMessage=(text,error=false)=>notify($('cloud-full-status'),text,error);
  $('cloud-full-backup').addEventListener('click',async()=>{
    if(staff?.role!=='admin')return;
    const button=$('cloud-full-backup');button.disabled=true;
    dzBackupMessage('Reading player, coach and ID records...');
    try{
      const collections=['players','playerCodes','allowlist','coachRequests'];
      const snaps=await Promise.all(collections.map(name=>db.collection(name).get()));
      const payload={format:'diamond-zone-full-backup',schemaVersion:2,
        projectId:firebase.app().options.projectId,
        exportedAt:new Date().toISOString(),collections:{}};
      collections.forEach((name,i)=>{
        payload.collections[name]=snaps[i].docs.map(dzBackupRow);
      });
      payload.collections.playerEdits=[];
      const players=snaps[0].docs;
      // Reading one player's note sections at a time avoids bursty Firestore reads.
      for(let i=0;i<players.length;i++){
        const player=players[i];
        const notes=await db.collection('playerEdits').doc(player.id).collection('sections').get();
        notes.docs.forEach(doc=>payload.collections.playerEdits.push({
          playerId:player.id,section:doc.id,data:dzEncodeBackup(doc.data())
        }));
        if((i+1)%10===0)dzBackupMessage('Collecting notes and grades: '+(i+1)+' / '+players.length+' players...');
      }
      const stamp=new Date().toISOString().slice(0,10);
      dzDownloadJson('diamond-zone-full-backup-'+stamp+'.json',payload);
      dzBackupMessage('Full backup downloaded: '+players.length+' players, '+
        payload.collections.playerEdits.length+' coaching records, '+
        payload.collections.playerCodes.length+' player IDs, '+
        payload.collections.allowlist.length+' staff records and '+
        payload.collections.coachRequests.length+' coach requests. Store the JSON securely.');
    }catch(e){dzBackupMessage('Full backup failed: '+friendly(e),true);}
    finally{button.disabled=false;}
  });

  function dzValidateBackup(parsed){
    if(!parsed||parsed.format!=='diamond-zone-full-backup'||parsed.schemaVersion!==2||
       !parsed.collections||typeof parsed.collections!=='object')throw Error('Select a Diamond Zone FULL backup (schema version 2).');
    if(parsed.projectId!==firebase.app().options.projectId)
      throw Error('Backup is from a different Firebase project. Restore cancelled.');
    const arrays=['players','playerCodes','allowlist','coachRequests','playerEdits'];
    for(const key of arrays){
      if(!Array.isArray(parsed.collections[key])||parsed.collections[key].length>5000)
        throw Error('Invalid or oversized '+key+' backup collection.');
    }
    const decoded={};
    for(const key of arrays){
      const seen=new Set();
      decoded[key]=parsed.collections[key].map(item=>{
        if(!item || typeof item!=='object' || !item.data || typeof item.data!=='object')
          throw Error('Invalid '+key+' entry.');
        const id=key==='playerEdits'?String(item.playerId||'')+':'+String(item.section||''):String(item.id||'');
        if(!id||id.includes('/')||seen.has(id))throw Error('Invalid or duplicate '+key+' ID: '+id);
        seen.add(id);
        return {...item,data:dzDecodeBackup(item.data)};
      });
    }
    const backupPlayers=new Map();
    for(const item of decoded.players){
      if(item.id!==item.data.id)throw Error('Player document ID mismatch: '+item.id);
      validPlayer(item.data);
      if(item.data.publicId!=null && !/^[1-9][0-9]{5}$/.test(String(item.data.publicId)))
        throw Error('Invalid six-digit ID for '+item.data.name);
      backupPlayers.set(item.id,item.data);
    }
    const codes=new Map();
    for(const item of decoded.playerCodes){
      if(!/^[1-9][0-9]{5}$/.test(item.id)||typeof item.data.playerId!=='string')
        throw Error('Invalid backup player-code reservation.');
      codes.set(item.id,item.data.playerId);
    }
    for(const [id,player] of backupPlayers){
      if(player.publicId && codes.get(String(player.publicId))!==id)
        throw Error('Six-digit ID reservation mismatch for '+player.name);
    }
    for(const item of decoded.playerEdits){
      if(!backupPlayers.has(item.playerId)||
         !['notes','mechanics','strength','grades','type-overrides'].includes(item.section)||
         typeof item.data.value!=='string'||item.data.value.length>50000||
         typeof item.data.editedBy!=='string')
        throw Error('Invalid player coaching section: '+item.playerId+' / '+item.section);
    }
    for(const item of decoded.allowlist){
      if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(item.id)||
        !['admin','coach'].includes(item.data.role)||typeof item.data.active!=='boolean')
        throw Error('Invalid staff approval entry.');
    }
    for(const item of decoded.coachRequests){
      if(typeof item.data.uid!=='string'||item.data.uid!==item.id||
         typeof item.data.email!=='string'||
         !['pending','approved','denied'].includes(item.data.status)||
         !(item.data.requestedAt instanceof firebase.firestore.Timestamp))
        throw Error('Invalid coach access-request entry.');
    }
    return {decoded,backupPlayers,codes};
  }
  async function dzRestoreBatch(records,createRef,transform,chunkSize=60){
    for(let i=0;i<records.length;i+=chunkSize){
      const batch=db.batch();
      for(const item of records.slice(i,i+chunkSize)){
        batch.set(createRef(item),transform(item));
      }
      await batch.commit();
    }
  }
  $('cloud-full-restore').addEventListener('click',async()=>{
    if(staff?.role!=='admin')return;
    const file=$('cloud-full-restore-file').files[0];
    if(!file){dzBackupMessage('Choose a full backup JSON file first.',true);return;}
    if(file.size>50_000_000){dzBackupMessage('Backup file exceeds 50 MB.',true);return;}
    const button=$('cloud-full-restore');button.disabled=true;
    try{
      const parsed=JSON.parse(await file.text());
      const {decoded,backupPlayers,codes}=dzValidateBackup(parsed);
      dzBackupMessage('Checking permanent player IDs and current database...');
      const [playerSnaps,codeSnaps,requestSnaps,staffSnaps]=await Promise.all([
        db.collection('players').get(),
        db.collection('playerCodes').get(),
        db.collection('coachRequests').get(),
        db.collection('allowlist').get()
      ]);
      const livePlayers=new Map(playerSnaps.docs.map(doc=>[doc.id,doc.data()]));
      const liveCodes=new Map(codeSnaps.docs.map(doc=>[doc.id,doc.data().playerId]));
      const liveRequests=new Set(requestSnaps.docs.map(doc=>doc.id));
      const liveStaff=new Map(staffSnaps.docs.map(doc=>[doc.id,doc.data()]));
      for(const [id,player] of backupPlayers){
        const current=livePlayers.get(id);
        if(current && current.publicId &&
           String(current.publicId)!==String(player.publicId||''))
          throw Error('Player ID conflict for '+player.name+'. No records were restored.');
        if(player.publicId && liveCodes.has(String(player.publicId)) &&
           liveCodes.get(String(player.publicId))!==id)
          throw Error('Six-digit ID collision for '+player.name+'. No records were restored.');
      }
      for(const [code,pid] of codes){
        if(liveCodes.has(code)&&liveCodes.get(code)!==pid)
          throw Error('Reserved ID '+code+' belongs to another player. No records were restored.');
      }
      const summary=decoded.players.length+' players, '+decoded.playerEdits.length+
        ' coaching records, '+decoded.allowlist.length+' staff approvals, '+
        decoded.coachRequests.length+' coach requests.';
      const permission=window.prompt('EMERGENCY RESTORE from '+parsed.exportedAt+'\n'+summary+
        '\n\nMatching existing records will be OVERWRITTEN, including coach notes and approvals. '+
        'Existing records not in the backup will not be deleted. '+
        'Admin permissions will NOT be restored or changed.\n\nType RESTORE to continue:');
      if(permission!=='RESTORE'){dzBackupMessage('Restore cancelled; no changes made.');return;}

      // Stage 1: restore profile documents without changing their permanent public IDs.
      // Small batches keep reads in Firestore security-rule write limits.
      dzBackupMessage('Restoring '+decoded.players.length+' player profiles...');
      await dzRestoreBatch(decoded.players,
        item=>db.collection('players').doc(item.id),
        item=>item.data,20);

      // Stage 2: create only missing reservations; never overwrite an existing code.
      const missingCodes=decoded.playerCodes.filter(item=>
        !liveCodes.has(item.id)&&backupPlayers.has(item.data.playerId));
      if(missingCodes.length){
        dzBackupMessage('Restoring '+missingCodes.length+' missing six-digit ID reservations...');
        await dzRestoreBatch(missingCodes,
          item=>db.collection('playerCodes').doc(item.id),
          item=>({playerId:item.data.playerId}),5);
      }

      // Stage 3: restore coaching sections after their parent players exist.
      dzBackupMessage('Restoring coaching notes, mechanical plans and pitch grades...');
      await dzRestoreBatch(decoded.playerEdits,
        item=>db.collection('playerEdits').doc(item.playerId).collection('sections').doc(item.section),
        item=>item.data,8);

      // Stage 4: restore coach access without touching ANY admin role or this account.
      const safeCoaches=decoded.allowlist.filter(item=>
        item.data.role==='coach'&&item.id!==emailKey(activeUser.email)&&
        liveStaff.get(item.id)?.role!=='admin');
      if(safeCoaches.length){
        dzBackupMessage('Restoring '+safeCoaches.length+' coach access records...');
        await dzRestoreBatch(safeCoaches,
          item=>db.collection('allowlist').doc(item.id),
          item=>item.data,40);
      }

      // Stage 5: don't overwrite newer administrator decisions on existing requests.
      const missingRequests=decoded.coachRequests.filter(item=>!liveRequests.has(item.id));
      if(missingRequests.length){
        dzBackupMessage('Restoring '+missingRequests.length+' missing access requests...');
        await dzRestoreBatch(missingRequests,
          item=>db.collection('coachRequests').doc(item.id),
          item=>({...item.data,restoredFromBackup:true}),30);
      }
      await loadPlayers();
      await listCoaches();
      dzBackupMessage('Restore completed. Recovered '+decoded.players.length+' player profiles and '+
        decoded.playerEdits.length+' coaching records. Existing admin roles and accounts were preserved. '+
        'Records absent from the backup were not deleted.');
    }catch(e){
      dzBackupMessage('RESTORE FAILED: '+friendly(e)+
        '. A multi-batch restore may have completed earlier stages; inspect the data and re-run the same file if needed.',true);
    }finally{button.disabled=false;}
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
    if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)){
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
