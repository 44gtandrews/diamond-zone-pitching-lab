/* Staff-only 20–80 scouting grades and safe player/parent redaction. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const cloud=fs.readFileSync('cloud.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const ci=fs.readFileSync('.github/workflows/deploy-firebase.yml','utf8');
const section=rules.split('match /playerEdits/{playerId}/sections/{section} {')[1]?.split('match /{document=**}')[0];
assert.ok(section,'Missing database section rules');
assert.match(section,/allow get: if canViewAll\(\) \|\| \(section in \['notes', 'mechanics', 'strength', 'visibility', 'type-overrides'\]/);
assert.doesNotMatch(section,/allow get: if canViewAll\(\) \|\| \(section != 'evaluation'/);
assert.match(section,/allow list: if canViewAll\(\)/);
assert.match(section,/allow create, update: if canWritePitching\(\)/);
assert.match(section,/section in \['notes', 'evaluation', 'mechanics', 'strength', 'grades', 'visibility', 'type-overrides'\]/);
assert.match(cloud,/\(notes\|evaluation\|mechanics\|strength\|grades\|visibility\|type-overrides\)/);
assert.match(cloud,/\(key\.endsWith\(':evaluation'\) \|\| key\.endsWith\(':grades'\)\)/);
assert.match(cloud,/\['admin','pitching_coach','coach'\]\.includes\(window\.DZ_ROLE\)/);
assert.match(cloud,/\['notes','evaluation','mechanics','strength','grades','visibility','type-overrides'\]\.includes\(item\.section\)/);
assert.match(html,/const parent=window\.DZ_ROLE==='player_parent';/);
assert.match(html,/if\(parent\)\{\s*player\._gradesByPitch=\{\};/);
assert.match(html,/window\.storage\.get\(player\.id\+':visibility',false\)/);
assert.match(html,/window\.storage\.set\(player\.id\+':visibility'/);
assert.match(html,/window\.storage\.get\(player\.id\+':grades',false\)/);
assert.match(html,/const coachView=window\.DZ_ROLE!=='player_parent';/);
assert.match(html,/if\(coachView\)await ensureGradesLoaded\(player\);/);
assert.match(html,/\.\.\.\(coachView\?\['Grade'\]:\[\]\)/);
assert.match(html,/\$\{coachView\?\`<td><select class="grade-select"/);
assert.match(html,/window\.DZ_ROLE==='player_parent'\?\[\]:\[\{label:'Highest Graded Pitch'/);
assert.match(html,/window\.DZ_ROLE==='player_parent'\?'':' Grade uses/);
assert.match(html,/window\.DZ_ROLE==='player_parent'\?'':' Grades remain/);
assert.match(html,/if\(window\.DZ_ROLE==='player_parent'\|\|currentPlayerId!==player\.id\)return;/);
assert.match(html,/body\[data-dz-role="player_parent"\] #view-player \.kpis/);
assert.match(ci,/node tests\/private-pitch-grades-smoke\.test\.js/);

// Execute the actual application loader under a fake parent identity to
// ensure it NEVER asks Firestore for the grades document, even on first load.
const start=html.indexOf('function dzHiddenKeys(input){');
const end=html.indexOf('function dzEscapeText(text){',start);
assert.ok(start>=0 && end>start,'Cannot find grade loading implementation');
function makeLoader(view,storage){
  const window={DZ_ROLE:view,DZ_EDIT_ENABLED:view==='admin'||view==='pitching_coach',storage};
  const gradeBlock=html.slice(start,end);
  const loader=new Function('window','GRADES','console',gradeBlock+
    '\nreturn ensureGradesLoaded;')(window,[80,75,70,65,60,55,50,45,40,35,30,25,20],{warn(){}});
  return loader;
}
(async()=>{
  const parentCalls=[];
  const parentLoader=makeLoader('player_parent',{
    async get(key){
      parentCalls.push(key);
      if(key.endsWith(':grades'))throw Error('Parent must never request private grade data');
      return {value:JSON.stringify({hiddenPitchTypes:['sl']})};
    },
    async set(){throw Error('Parent must never write');}
  });
  const player={id:'player-a',_gradesLoaded:false};
  await parentLoader(player);
  assert.deepEqual(parentCalls,['player-a:visibility']);
  assert.deepEqual(player._gradesByPitch,{});
  assert.deepEqual(player._hiddenPitchTypes,['sl']);
  assert.equal(player._gradesLoadFailed,false);
  assert.equal(player._gradesLoaded,true);

  const coachCalls=[];
  const coachLoader=makeLoader('coach',{
    async get(key){
      coachCalls.push(key);
      if(key.endsWith(':visibility'))return {value:JSON.stringify({hiddenPitchTypes:['cu']})};
      return {value:JSON.stringify({fb:65,sl:50,__hiddenPitchTypes:['sl']})};
    },
    async set(){throw Error('Read-only coach cannot save');}
  });
  const coach={id:'player-b'};
  await coachLoader(coach);
  assert.deepEqual(coachCalls,['player-b:visibility','player-b:grades']);
  assert.deepEqual(coach._gradesByPitch,{fb:65,sl:50});
  assert.deepEqual(coach._hiddenPitchTypes,['cu']);

  const migrated=[];
  const adminLoader=makeLoader('admin',{
    async get(key){
      if(key.endsWith(':visibility'))return null;
      return {value:JSON.stringify({fb:70,__hiddenPitchTypes:['sl','ch']})};
    },
    async set(key,value){migrated.push({key,value});}
  });
  const admin={id:'player-c'};
  await adminLoader(admin);
  assert.equal(admin._gradesByPitch.fb,70);
  assert.deepEqual(admin._hiddenPitchTypes,['sl','ch']);
  assert.equal(migrated.length,1);
  assert.equal(migrated[0].key,'player-c:visibility');
  assert.deepEqual(JSON.parse(migrated[0].value),{hiddenPitchTypes:['sl','ch']});
  console.log('Private pitch grade security tests passed: parent blocked, coaches retained, visibility migration and role-based UI.');
})().catch(err=>{console.error(err);process.exitCode=1;});
