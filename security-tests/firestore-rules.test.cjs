/* Real Firestore Security Rules tests against the LOCAL emulator only.
 * These tests intentionally use fictional people and fixture player records.
 * Never use a production Firebase project or credentials for this suite.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=
  require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp}=
  require('firebase/firestore');

const PROJECT_ID='demo-diamond-zone-security';
const rules=fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!host)throw Error('Refusing to run: FIRESTORE_EMULATOR_HOST must point to the local emulator');
if(!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)){
 throw Error('Refusing to run: emulator must be on localhost, got '+host);
}
if(process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT!==PROJECT_ID){
 throw Error('Refusing to use an unexpected Google Cloud project');
}

async function main(){
 const parts=host.split(':');
 const port=Number(parts.at(-1));
 const env=await initializeTestEnvironment({
  projectId:PROJECT_ID,
  firestore:{rules,host:'127.0.0.1',port}
 });
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   const staff=[
    ['admin@example.test','admin',null],
    ['pitcher@example.test','pitching_coach',null],
    ['coach@example.test','coach',null],
    ['parent-a@example.test','player_parent','player-a'],
    ['parent-b@example.test','player_parent','player-b'],
    ['unverified@example.test','coach',null]
   ];
   for(const [email,role,playerId] of staff){
    const data={role,active:true};
    if(playerId)data.playerId=playerId;
    await setDoc(doc(db,'allowlist',email),data);
   }
   for(const [id,name] of [['player-a','Sample Pitcher A'],['player-b','Sample Pitcher B']]){
    await setDoc(doc(db,'players',id),{id,name,inactive:false,ageNum:14,
     pitches:[{key:'fb',name:'Fastball',n:12}],dataType:'aggregate'});
    await setDoc(doc(db,'players',id,'sessions','baseline'),{
     id:'baseline',kind:'baseline',pitches:[{key:'fb',name:'Fastball',n:12}],pitchData:[],
     importedBy:'pitcher@example.test'});
    for(const section of ['notes','mechanics','evaluation','grades']){
     await setDoc(doc(db,'playerEdits',id,'sections',section),
      {value:'Test '+section,updatedAt:serverTimestamp(),editedBy:'pitcher@example.test'});
    }
   }
   await setDoc(doc(db,'players','player-a','pitchCounts','2026-11-23'),{
    date:'2026-11-23',month:'2026-11',count:12,
    updatedAt:serverTimestamp(),updatedBy:'pitcher@example.test'
   });
   await setDoc(doc(db,'players','player-a','atHomePlans','2026-11-23'),{
    weekStart:'2026-11-23',title:'Practice plan',notes:'',
    rows:[],revision:1,updatedBy:'admin@example.test',updatedAt:serverTimestamp()
   });
   await setDoc(doc(db,'playerCodes','123456'),{playerId:'player-a'});
  });

  const auth=(uid,email,verified=true)=>
   env.authenticatedContext(uid,{email,email_verified:verified}).firestore();
  const admin=auth('admin-uid','admin@example.test');
  const pitching=auth('pitching-uid','pitcher@example.test');
  const coach=auth('coach-uid','coach@example.test');
  const parentA=auth('parent-a-uid','parent-a@example.test');
  const parentB=auth('parent-b-uid','parent-b@example.test');
  const pending=auth('pending-uid','pending@example.test');
  const unverified=auth('unverified-uid','unverified@example.test',false);
  const anonymous=env.unauthenticatedContext().firestore();
  let cases=0;
  async function success(label,promise){
   await assertSucceeds(promise);cases++;console.log('PASS allow: '+label);
  }
  async function denied(label,promise){
   await assertFails(promise);cases++;console.log('PASS deny: '+label);
  }

  await denied('anonymous reads roster',getDoc(doc(anonymous,'players','player-a')));
  await denied('unapproved account reads roster',getDoc(doc(pending,'players','player-a')));
  await denied('unverified approved account reads roster',getDoc(doc(unverified,'players','player-a')));
  await denied('anonymous reads account permissions',getDoc(doc(anonymous,'allowlist','admin@example.test')));
  await denied('unapproved user lists admin accounts',getDocs(collection(pending,'allowlist')));
  await success('approved administrator lists staff',getDocs(collection(admin,'allowlist')));

  await success('parent views assigned player',getDoc(doc(parentA,'players','player-a')));
  await denied('parent views another player',getDoc(doc(parentA,'players','player-b')));
  await denied('parent enumerates entire roster',getDocs(collection(parentA,'players')));
  await success('different parent views their own player',getDoc(doc(parentB,'players','player-b')));
  await denied('different parent views player A',getDoc(doc(parentB,'players','player-a')));
  await success('read-only coach lists roster',getDocs(collection(coach,'players')));

  await success('parent reads own TrackMan sessions',
   getDocs(collection(parentA,'players','player-a','sessions')));
  await denied('parent reads another player session',
   getDoc(doc(parentA,'players','player-b','sessions','baseline')));
  await denied('parent lists another player sessions',
   getDocs(collection(parentA,'players','player-b','sessions')));
  await success('parent reads own pitch-count calendar',
   getDoc(doc(parentA,'players','player-a','pitchCounts','2026-11-23')));
  await denied('parent reads another player pitch count',
   getDoc(doc(parentA,'players','player-b','pitchCounts','2026-11-23')));

  await success('parent reads own mechanics',
   getDoc(doc(parentA,'playerEdits','player-a','sections','mechanics')));
  await success('parent reads own coach-approved notes',
   getDoc(doc(parentA,'playerEdits','player-a','sections','notes')));
  await denied('parent reads other athlete notes',
   getDoc(doc(parentA,'playerEdits','player-b','sections','notes')));
  await denied('parent accesses confidential staff evaluations',
   getDoc(doc(parentA,'playerEdits','player-a','sections','evaluation')));
  await denied('parent accesses private pitch grades',
   getDoc(doc(parentA,'playerEdits','player-a','sections','grades')));
  await denied('parent enumerates sections',
   getDocs(collection(parentA,'playerEdits','player-a','sections')));
  await success('coach reads staff evaluation',
   getDoc(doc(coach,'playerEdits','player-a','sections','evaluation')));
  await denied('parent reads admin-only at-home plan',
   getDoc(doc(parentA,'players','player-a','atHomePlans','2026-11-23')));
  await denied('coach reads admin-only at-home plan',
   getDoc(doc(coach,'players','player-a','atHomePlans','2026-11-23')));
  await success('administrator reads admin-only at-home plan',
   getDoc(doc(admin,'players','player-a','atHomePlans','2026-11-23')));
  await denied('parent lists player codes',
   getDocs(collection(parentA,'playerCodes')));

  const edit={value:'Safe mechanical notes',updatedAt:serverTimestamp(),
   editedBy:'pitcher@example.test'};
  await denied('parent writes their own mechanics',
   setDoc(doc(parentA,'playerEdits','player-a','sections','mechanics'),
    {...edit,editedBy:'parent-a@example.test'}));
  await denied('read-only coach writes mechanical notes',
   setDoc(doc(coach,'playerEdits','player-a','sections','mechanics'),
    {...edit,editedBy:'coach@example.test'}));
  await success('pitching coach updates mechanics',
   setDoc(doc(pitching,'playerEdits','player-a','sections','mechanics'),edit));
  await denied('pitching coach spoofs another editor identity',
   setDoc(doc(pitching,'playerEdits','player-a','sections','mechanics'),
    {...edit,editedBy:'admin@example.test'}));
  await denied('unapproved account writes notes',
   setDoc(doc(pending,'playerEdits','player-a','sections','notes'),
    {...edit,editedBy:'pending@example.test'}));

  await denied('parent changes pitch count',
   setDoc(doc(parentA,'players','player-a','pitchCounts','2026-11-24'),
    {date:'2026-11-24',month:'2026-11',count:99,
     updatedBy:'parent-a@example.test',updatedAt:serverTimestamp()}));
  await success('pitching coach records a valid pitch count',
   setDoc(doc(pitching,'players','player-a','pitchCounts','2026-11-24'),
    {date:'2026-11-24',month:'2026-11',count:35,
     updatedBy:'pitcher@example.test',updatedAt:serverTimestamp()}));
  await denied('pitching coach records an invalid pitch count',
   setDoc(doc(pitching,'players','player-a','pitchCounts','2026-11-25'),
    {date:'2026-11-25',month:'2026-11',count:10000,
     updatedBy:'pitcher@example.test',updatedAt:serverTimestamp()}));
  const session={id:'new-session',kind:'single',pitches:[{key:'fb',name:'Fastball',n:8}],
   pitchData:[],importedBy:'pitcher@example.test'};
  await success('pitching coach creates an attributable session',
   setDoc(doc(pitching,'players','player-a','sessions','new-session'),session));
  await denied('parent creates session on assigned profile',
   setDoc(doc(parentA,'players','player-a','sessions','forged-session'),
    {...session,id:'forged-session',importedBy:'parent-a@example.test'}));
  await denied('pitching coach rewrites immutable session',
   updateDoc(doc(pitching,'players','player-a','sessions','new-session'),
    {kind:'historical'}));
  await denied('read-only coach deletes session',
   deleteDoc(doc(coach,'players','player-a','sessions','baseline')));

  await denied('unapproved user grants themselves admin access',
   setDoc(doc(pending,'allowlist','pending@example.test'),{role:'admin',active:true}));
  await denied('parent changes their own access role',
   updateDoc(doc(parentA,'allowlist','parent-a@example.test'),{role:'admin'}));
  await denied('admin demotes their own account',
   updateDoc(doc(admin,'allowlist','admin@example.test'),{role:'coach'}));
  await success('admin can approve a verified new coaching account',
   setDoc(doc(admin,'allowlist','new-coach@example.test'),{role:'coach',active:true}));

  const request={uid:'pending-uid',email:'pending@example.test',status:'pending',
   requestedAt:serverTimestamp(),requestedRole:'coach',playerName:'',playerCode:''};
  await success('unapproved verified applicant requests review',
   setDoc(doc(pending,'coachRequests','pending-uid'),request));
  await denied('applicant cannot self-approve request',
   updateDoc(doc(pending,'coachRequests','pending-uid'),{status:'approved'}));
  await denied('applicant cannot request admin role',
   setDoc(doc(pending,'coachRequests','pending-uid'),
    {...request,requestedRole:'admin'}));
  await denied('applicant cannot manipulate another request',
   setDoc(doc(pending,'coachRequests','admin-uid'),{...request,uid:'admin-uid'}));
  await denied('users cannot read server-only notification quota',
   getDoc(doc(admin,'_notificationQuota','2026-11-23')));
  await denied('users cannot modify server-only notification quota',
   setDoc(doc(admin,'_notificationQuota','2026-11-23'),{count:0}));

  // Private screening records must be inaccessible even to ordinary read-only coaches.
  const screenRef=db=>doc(db,'players','player-a','movementScreens','2026-11-24');
  const screenData=email=>({date:'2026-11-24',templateId:'example-v1',
   scores:[2,1,0,null,'P',2,0,1,2],revision:1,updatedBy:email,updatedAt:serverTimestamp()});
  await success('pitching coach saves private screening',setDoc(screenRef(pitching),screenData('pitcher@example.test')));
  await success('admin reads screening',getDoc(screenRef(admin)));
  await success('pitching coach reads screening',getDoc(screenRef(pitching)));
  await success('admin lists screening history',getDocs(collection(admin,'players','player-a','movementScreens')));
  await success('pitching coach lists screening history',getDocs(collection(pitching,'players','player-a','movementScreens')));
  for(const [label,db] of [['ordinary coach',coach],['assigned parent',parentA],['other parent',parentB],['unapproved user',pending],['unverified user',unverified],['anonymous visitor',anonymous]]){
    await denied(label+' cannot read private screening',getDoc(screenRef(db)));
    await denied(label+' cannot list private screening history',getDocs(collection(db,'players','player-a','movementScreens')));
  }
  await denied('ordinary coach cannot edit private screening',updateDoc(screenRef(coach),{revision:2,updatedBy:'coach@example.test',updatedAt:serverTimestamp()}));
  await denied('parent cannot edit private screening',updateDoc(screenRef(parentA),{revision:2,updatedBy:'parent-a@example.test',updatedAt:serverTimestamp()}));
  await denied('invalid score cannot be saved',updateDoc(screenRef(pitching),{scores:[2,1,3,null,'P',2,0,1,2],revision:2,updatedAt:serverTimestamp()}));
  await denied('injected score text cannot be saved',updateDoc(screenRef(pitching),{scores:[2,1,'unexpected',null,'P',2,0,1,2],revision:2,updatedAt:serverTimestamp()}));
  await denied('unexpected fields cannot be saved',updateDoc(screenRef(pitching),{extra:true,revision:2,updatedAt:serverTimestamp()}));
  await denied('invalid number of tests cannot be saved',updateDoc(screenRef(pitching),{scores:[2],revision:2,updatedAt:serverTimestamp()}));
  await denied('stale revision cannot overwrite a screening',updateDoc(screenRef(pitching),{scores:[2,2,2,2,2,2,2,2,2],revision:1,updatedAt:serverTimestamp()}));
  await denied('pitching coach cannot spoof editor identity',updateDoc(screenRef(pitching),{revision:2,updatedBy:'admin@example.test',updatedAt:serverTimestamp()}));
  await success('admin updates screening',updateDoc(screenRef(admin),{revision:2,updatedBy:'admin@example.test',updatedAt:serverTimestamp()}));
  await denied('pitching coach cannot delete screening history',deleteDoc(screenRef(pitching)));
  await success('admin may delete screening',deleteDoc(screenRef(admin)));

  assert.ok(cases>=35,'Expected substantial independent allow/deny coverage');
  console.log('PASS: '+cases+' real Firestore emulator authorization assertions.');
 }finally{
  await env.cleanup();
 }
}
main().catch(error=>{console.error('Firestore security tests failed:',error);process.exitCode=1;});