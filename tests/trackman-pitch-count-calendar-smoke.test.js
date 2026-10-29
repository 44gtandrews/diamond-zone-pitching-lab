/* TrackMan session-derived daily pitch calendar and manual correction regressions. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const p=require('../pitch-counts.js');
const oct='2026-10';
const sample=[
 {id:'session-1',kind:'single',date:'2026-10-28',pitches:[{key:'FB',n:10},{key:'SL',n:8}]},
 {id:'session-2',kind:'single',date:'2026-10-28',pitches:[{key:'FB',n:12},{key:'CB',n:3}]},
 {id:'session-3',kind:'single',date:'2026-10-29',pitches:[{key:'FB',n:41}]},
 {id:'historic',kind:'historical',date:'2026-10-28',pitches:[{key:'FB',n:150}]},
 {id:'baseline',kind:'baseline',date:null,pitches:[{key:'FB',n:250}]},
 {id:'undated',kind:'single',date:null,pitches:[{key:'FB',n:15}]},
 {id:'wrong-month',kind:'single',date:'2026-09-28',pitches:[{key:'FB',n:99}]},
 {id:'bad-date',kind:'single',date:'2026-10-32',pitches:[{key:'FB',n:30}]},
 {id:'empty',kind:'single',date:'2026-10-30',pitches:[]}
];
const auto=p.autoFromSessions(sample,oct);
assert.deepEqual(auto,{
 '2026-10-28':{count:33,sessions:2},
 '2026-10-29':{count:41,sessions:1}
},'same-day sessions sum; historical, undated, invalid and empty are excluded');
assert.deepEqual(p.autoFromSessions(sample.slice(0,1),oct),{'2026-10-28':{count:18,sessions:1}},
  '18 pitch TrackMan bullpen on Oct 28 must auto-fill 18');
assert.equal(p.band(auto['2026-10-28'].count),'orange');
assert.equal(p.band(auto['2026-10-29'].count),'red');
const manual={'2026-10-28':25,'2026-10-31':12};
assert.deepEqual(p.combineCounts(manual,auto),{
 '2026-10-28':25,'2026-10-29':41,'2026-10-31':12
},'manual changes override automatic count; manually entered dates stay');
assert.deepEqual(p.combineCounts({},auto),{'2026-10-28':33,'2026-10-29':41},
 'deleting a manual correction restores the TrackMan total');
assert.deepEqual(p.combineCounts({'2026-10-28':0},auto),{
 '2026-10-28':33,'2026-10-29':41
},'invalid manual counts are never treated as valid corrections');
assert.equal(p.band(p.combineCounts({'2026-10-28':19},auto)['2026-10-28']),'yellow');

const html=fs.readFileSync('index.html','utf8');
const src=fs.readFileSync('pitch-counts.js','utf8');
const importer=fs.readFileSync('importer.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
assert.match(src,/collection\(\)\.where\('month','==',month\)\.get\(\)/);
assert.match(src,/\.where\('date','>=',month\+'-01'\)\.where\('date','<=',month\+'-31'\)\.get\(\)/);
assert.match(src,/state\.counts=combineCounts\(manual,state\.autoDetails\)/);
assert.match(src,/state\.counts=combineCounts\(state\.manualCounts,state\.autoDetails\)/);
assert.match(src,/delete state\.manualCounts\[date\]/);
assert.match(src,/window\.DZ_PITCH_COUNTS_REFRESH=id=>/);
assert.match(importer,/if\(sessionKind==='single'\)window\.DZ_PITCH_COUNTS_REFRESH\?\.\(pid\)/);
assert.match(importer,/if\(existingSession\.exists\)throw Error\('This session is already stored/);
assert.match(html,/id="dz-count-source"/);
assert.match(html,/Auto[matic]*|TrackMan sessions appear automatically/);
assert.match(src,/label\.textContent=isManual\?\(classification\|\|'Edited'\):'TrackMan'/);
assert.match(src,/auto\?'Use TrackMan count':'Remove'/);
assert.match(rules,/match \/players\/\{playerId\}\/pitchCounts\/\{dayId\}/);
assert.match(rules,/match \/players\/\{playerId\}\/sessions\/\{sessionId\}/);
console.log('TrackMan auto-fill tests passed: 18 pitch upload, same-day sum, manual override/reset, source labels and security.');
