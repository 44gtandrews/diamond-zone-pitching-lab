/* Admin weekly-plan regression smoke tests. Run from the repository root. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const plan=require('../at-home-plan.js');

assert.equal(plan.monday('2026-10-27'),'2026-10-26');
assert.equal(plan.monday('2026-11-01'),'2026-10-26');
assert.equal(plan.monday('2026-10-26'),'2026-10-26');
assert.equal(plan.shiftWeek('2026-12-28',1),'2027-01-04');
assert.equal(plan.shiftWeek('2027-01-04',-1),'2026-12-28');
assert.equal(plan.monday('2028-02-29'),'2028-02-28');
assert.throws(()=>plan.monday('2027-02-29'));
assert.throws(()=>plan.monday('foo'));

assert.equal(plan.validResource(''),true);
assert.equal(plan.validResource('https://drive.google.com/file/d/abc/view'),true);
assert.equal(plan.validResource('http://example.com'),false);
assert.equal(plan.validResource('javascript:alert(1)'),false);
const rows=plan.normalizeRows([{day:'Friday',category:'Strength',exercise:'Goblet Squat',prescription:'3 x 10'}, {day:'Bogus',category:'Bogus'}]);
assert.equal(rows.length,2);
assert.equal(rows[0].day,'Friday');
assert.equal(rows[0].category,'Strength');
assert.equal(rows[0].exercise,'Goblet Squat');
assert.equal(rows[1].day,'Monday');
assert.equal(rows[1].category,'Other');

const html=fs.readFileSync('index.html','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const build=fs.readFileSync('prepare-firebase-hosting.sh','utf8');
assert.match(html,/id="tab-at-home-btn"/);
assert.match(html,/id="panel-at-home"/);
assert.match(html,/window\.DZ_AT_HOME_ON_PLAYER/);
assert.match(html,/src="\.\/at-home-plan\.js"/);
assert.match(build,/at-home-plan\.js/);
assert.match(rules,/match \/players\/\{playerId\}\/atHomePlans\/\{weekId\}/);
assert.match(rules,/allow get, list: if isAdmin\(\)/);
assert.match(rules,/allow create: if validPlan\(\)/);
assert.match(rules,/allow update: if validPlan\(\)/);
const planRules=rules.split('match /players/{playerId}/atHomePlans/{weekId}')[1].split('match /playerCodes/{code}')[0];
assert.doesNotMatch(planRules,/canViewAll\(|assignedParent\(|isPitchingCoach\(/);

console.log('Admin At-Home Plan tests passed: weekly dates, links, row defaults, UI wiring and admin-only rules.');
