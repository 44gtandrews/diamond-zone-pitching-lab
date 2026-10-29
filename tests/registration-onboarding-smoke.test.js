/* DiamondZone sign-up intent, secure pending queues, player match suggestions. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const policy=require('../registration-policy.js');
assert.equal(policy.validIntent('player','Jane Doe',''),true);
assert.equal(policy.validIntent('parent','Jane Doe','123456'),true);
assert.equal(policy.validIntent('coach','',''),true);
assert.equal(policy.validIntent('coach','Jane Doe',''),false);
assert.equal(policy.validIntent('player','J',''),false);
assert.equal(policy.validIntent('player','Jane Doe','000000'),false);
assert.equal(policy.validIntent('player','Jane Doe','12345'),false);
assert.equal(policy.validIntent('admin','',''),false);
assert.equal(policy.validIntent('pitching_coach','',''),false);
assert.equal(policy.family('parent'),true);
assert.equal(policy.family('player'),true);
assert.equal(policy.family('coach'),false);
assert.equal(policy.normalizeName('O’Neil, José'),'o neil jose');
const players={
 p1:{id:'p1',name:'Jane Doe',publicId:'123456',inactive:false},
 p2:{id:'p2',name:'Jane Doe',publicId:'987654',inactive:false},
 p3:{id:'p3',name:'John Doe',publicId:'654321',inactive:false},
 p4:{id:'p4',name:'Jane Doe',publicId:'111111',inactive:true}
};
const idMatch=policy.suggestions({requestedRole:'player',playerName:'Jane Doe',playerCode:'123456'},players);
assert.equal(idMatch.length,1);
assert.equal(idMatch[0].id,'p1');
assert.equal(idMatch[0].nameMatches,true);
assert.equal(idMatch[0].reason,'Player ID');
const mismatch=policy.suggestions({requestedRole:'parent',playerName:'Jane Doe',playerCode:'654321'},players);
assert.equal(mismatch.length,1);
assert.equal(mismatch[0].id,'p3');
assert.equal(mismatch[0].nameMatches,false);
assert.equal(policy.suggestions({requestedRole:'player',playerName:'Jane Doe',playerCode:''},players).length,2,
 'ambiguous name must never automatically link');
assert.deepEqual(policy.suggestions({requestedRole:'coach',playerName:'Jane Doe',playerCode:'123456'},players),[]);
assert.deepEqual(policy.suggestions({requestedRole:'parent',playerName:'Unknown Person',playerCode:'987654'},{
 p4:players.p4
}),[],'inactive players excluded');
const html=fs.readFileSync('index.html','utf8');
const cloud=fs.readFileSync('cloud.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const stage=fs.readFileSync('prepare-firebase-hosting.sh','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-firebase.yml','utf8');
for(const id of ['cloud-register-role','cloud-register-player-name','cloud-register-player-id',
 'cloud-register-player-fields','cloud-signup-confirm','cloud-request-intent-submit',
 'cloud-pending-family','cloud-pending-family-count','cloud-pending-coach-count',
 'cloud-awaiting-verification','cloud-awaiting-verification-count']){
 assert.match(html,new RegExp('id="'+id+'"'));
}
assert.match(html,/<option value="player">Player<\/option>/);
assert.match(html,/<option value="parent">Parent \/ Guardian<\/option>/);
assert.match(html,/<option value="coach">Coach<\/option>/);
assert.match(html,/Players &amp; Parents/);
assert.match(html,/<h4 class="dz-request-group-title">Coaches/);
assert.match(html,/src="\.\/registration-policy\.js"/);
assert.ok(html.indexOf('src="./registration-policy.js"')<html.indexOf('src="./cloud.js"'));
assert.match(cloud,/createAccessRequest\(result\.user,info\)/);
assert.match(cloud,/status:user\.emailVerified\?'pending':'awaiting_verification'/);
assert.match(cloud,/if\(request\.data\(\)\?\.status==='awaiting_verification'\)/);
assert.match(cloud,/await requestRef\.update\(\{status:'pending'\}\)/);
assert.match(cloud,/showAuth\('Complete your access request'/);
assert.match(cloud,/createAccessRequest\(auth\.currentUser,applicantIntent\(\)\)/);
assert.match(cloud,/const matches=registration\(\)\.suggestions\(d,PLAYERS\)/);
assert.match(cloud,/matches\.length===1&&matches\[0\]\.nameMatches/);
assert.match(cloud,/rolePicker\(isFamily\?'player_parent':'coach',guessedId\)/);
assert.match(cloud,/if\(!familyCount\)family\.appendChild/);
assert.match(cloud,/if\(!coachCount\)pending\.appendChild/);
assert.match(cloud,/if\(!awaitingCount\)awaiting\.appendChild/);
assert.match(cloud,/const linkedId=validateRoleChange\(role,playerId\)/);
assert.match(cloud,/batch\.set\(allowRef,next\)/);
assert.match(rules,/function validApplicant\(\)/);
assert.match(rules,/request\.resource\.data\.requestedRole in \['player','parent','coach'\]/);
assert.match(rules,/request\.resource\.data\.status ==\s*\(request\.auth\.token\.email_verified == true \? 'pending' : 'awaiting_verification'\)/);
assert.match(rules,/resource\.data\.status == 'awaiting_verification'/);
assert.match(rules,/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['status'\]\)/);
assert.match(rules,/allow list: if isAdmin\(\)/);
assert.match(rules,/allow get: if isAdmin\(\) \|\| \(verified\(\) && request\.auth\.uid == userId\)/);
assert.match(rules,/allow update: if \(verified\(\)/);
assert.match(rules,/request\.resource\.data\.status == 'pending'\)/);
assert.match(rules,/request\.resource\.data\.reviewedBy == request\.auth\.token\.email/);
assert.match(stage,/registration-policy\.js/);
assert.match(workflow,/node tests\/registration-onboarding-smoke\.test\.js/);
console.log('Role-aware registration, identity suggestions, admin approval boundaries and queue checks passed.');
