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

  function showAuth(title, description, mode='login', message='') {
    window.DZ_AUTHORIZED=false;
    authScreen.style.display='block';
    $('cloud-bar').style.display='none';
    $('view-home').style.display='none';
    $('view-player').style.display='none';
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
  async function showAllowed() {
    window.DZ_AUTHORIZED=true;
    installStorage();
    authScreen.style.display='none';
    $('cloud-bar').style.display='block';
    $('cloud-identity').textContent=activeUser.email+' · '+(staff.role==='admin'?'Administrator':'Coach');
    $('admin-panel').style.display=staff.role==='admin'?'block':'none';
    await loadPlayers();
    const id=decodeURIComponent(location.hash.slice(1));
    if(PLAYERS[id]) await showPlayer(id);else showHome();
    if(staff.role==='admin') await listCoaches();
  }
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
        showAuth('Coach approval required','Your email is verified but has not been approved by the Diamond Zone administrator.','verify');
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
        for(const p of players.slice(i,i+300))batch.set(db.collection('players').doc(p.id),p);
        await batch.commit();
      }
      await loadPlayers();showHome();
      notify(msg,'Imported '+players.length+' players. Existing saved notes, grades and mechanical changes were preserved.');
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

  async function listCoaches() {
    if(staff?.role!=='admin')return;
    const list=$('cloud-allowlist');list.replaceChildren();
    try{
      const snapshot=await db.collection('allowlist').get();
      snapshot.forEach(doc=>{
        const d=doc.data(),li=document.createElement('li'),label=document.createElement('span');
        label.textContent=doc.id+' · '+d.role+' · '+(d.active?'Active':'Disabled')+' ';
        li.appendChild(label);
        if(doc.id!==emailKey(activeUser.email)){
          const btn=document.createElement('button');btn.type='button';
          btn.className='cloud-button secondary';btn.style.cssText='min-height:32px;padding:5px 9px';
          btn.textContent=d.active?'Disable':'Enable';
          btn.addEventListener('click',async()=>{
            try{await doc.ref.update({active:!d.active});await listCoaches();}
            catch(e){notify($('cloud-invite-status'),friendly(e),true);}
          });
          li.appendChild(btn);
        }
        list.appendChild(li);
      });
    }catch(e){notify($('cloud-invite-status'),friendly(e),true);}
  }
  $('cloud-invite-form').addEventListener('submit',async e=>{
    e.preventDefault();if(staff?.role!=='admin')return;
    const email=emailKey($('cloud-invite-email').value),role=$('cloud-invite-role').value;
    if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)||!['admin','coach'].includes(role)){
      notify($('cloud-invite-status'),'Enter a valid email and role.',true);return;
    }
    try{
      await db.collection('allowlist').doc(email).set({
        active:true,role,invitedBy:activeUser.email,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
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
