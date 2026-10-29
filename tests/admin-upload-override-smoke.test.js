/* Admin-only TrackMan source name/date override regression checks. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const policy=require('../upload-override-policy.js');
const mismatch=(rest={})=>policy.issues({
 mode:'update',sourceName:'Joe Colon Pitching practice',profileName:'Joseph Colon',
 reportFormat:'individual-session',sourceDate:'2026-10-17',enteredDate:'2026-10-18',...rest
});
let issues=mismatch();
assert.deepEqual(issues.map(x=>x.type),['name','date']);
assert.deepEqual(issues[0],{type:'name',source:'Joe Colon Pitching practice',target:'Joseph Colon'});
assert.deepEqual(issues[1],{type:'date',source:'2026-10-17',target:'2026-10-18'});
assert.equal(policy.approval(issues,false,true).allowed,false,'non-admin cannot override');
assert.equal(policy.approval(issues,true,false).allowed,false,'admin must opt in');
assert.deepEqual(policy.approval(issues,true,true),{allowed:true,needsConfirmation:true});
assert.deepEqual(policy.approval([],false,false),{allowed:true,needsConfirmation:false});
assert.deepEqual(mismatch({sourceName:'Joseph Colon Pitching practice',enteredDate:'2026-10-17'}),[]);
assert.deepEqual(mismatch({sourceName:'Colon, Joseph',enteredDate:'2026-10-17'}),[]);
assert.deepEqual(mismatch({sourceName:'Joe Colon',profileName:'Joseph Colon',enteredDate:'2026-10-17'}).map(x=>x.type),['name']);
assert.deepEqual(mismatch({sourceName:'Joe Colon',profileName:'Joe Colon'}).map(x=>x.type),['date']);
assert.deepEqual(mismatch({sourceDate:null,enteredDate:'2026-10-18'}).map(x=>x.type),['name','date']);
assert.deepEqual(mismatch({mode:'new',sourceDate:'2026-10-18',enteredDate:'2026-10-18'}),[]);
assert.deepEqual(mismatch({mode:'update',sourceName:null,sourceDate:'2026-10-18',enteredDate:'2026-10-18'}),[]);
assert.equal(policy.normalize('Colon, Joseph Pitching practice'),'josephcolon');
const html=fs.readFileSync('index.html','utf8');
const importer=fs.readFileSync('importer.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const stage=fs.readFileSync('prepare-firebase-hosting.sh','utf8');
assert.match(html,/id="session-admin-override"/);
assert.match(html,/id="session-admin-issues"/);
assert.match(html,/src="\.\/upload-override-policy\.js"/);
assert.ok(html.indexOf('src="./upload-override-policy.js"')<html.indexOf('src="./importer.js"'));
assert.match(importer,/window\.DZ_IS_ADMIN===true && \$\('session-admin-override'\)\.checked===true/);
assert.match(importer,/policy\(\)\.approval\(problems,window\.DZ_IS_ADMIN===true,overrideSelected\(\)\)/);
assert.match(importer,/The selected session date will be saved, and the override will be logged/);
assert.match(importer,/adminOverride:overrideAudit/);
assert.match(importer,/if\(existingSession\.exists\)throw Error\('This session is already stored/);
assert.match(importer,/history\.some\(h=>h\.sha256===fileHash/);
assert.match(importer,/if\(individualPitches\.length>600\)/);
assert.match(rules,/!request\.resource\.data\.keys\(\)\.hasAny\(\['adminOverride'\]\)/);
assert.match(rules,/request\.resource\.data\.adminOverride\.approvedBy == request\.auth\.token\.email\.lower\(\)/);
assert.match(stage,/upload-override-policy\.js/);
console.log('Admin name/date override regression checks passed; integrity and duplicate protections remain.');
