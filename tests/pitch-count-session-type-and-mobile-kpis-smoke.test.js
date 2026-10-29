/* Manual Game/Bullpen pitch-count classification and compact mobile KPI smoke test. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const m=require('../pitch-counts.js');
assert.equal(m.validType('game'),true);
assert.equal(m.validType('bullpen'),true);
for(const t of ['',null,'practice','Game','game ','bullpen ',0]){
  assert.equal(m.validType(t),false,'unexpected type accepted: '+t);
}
assert.equal(m.typeLabel('game'),'Game');
assert.equal(m.typeLabel('bullpen'),'Bullpen');
assert.equal(m.typeLabel(undefined),null);
// Previous untyped pitch counts, manual overrides and dated TrackMan sessions
// must continue behaving exactly as before.
const auto=m.autoFromSessions([{kind:'single',date:'2026-10-28',pitches:[{n:18}]}],'2026-10');
assert.equal(auto['2026-10-28'].count,18);
assert.equal(m.combineCounts({'2026-10-28':22},auto)['2026-10-28'],22);
assert.equal(m.combineCounts({},auto)['2026-10-28'],18);

const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('pitch-counts.js','utf8');
const css=html.split('</style>')[0];
const rules=fs.readFileSync('firestore.rules','utf8');
const cloud=fs.readFileSync('cloud.js','utf8');
const profile=html.split('<!-- ============== PLAYER VIEW ============== -->')[1];
const rulesPart=rules.split('match /players/{playerId}/pitchCounts/{dayId}')[1].split('// Per-player calendars')[0];
assert.match(html,/id="dz-count-type"/);
assert.match(html,/<option value="game">Game<\/option>/);
assert.match(html,/<option value="bullpen">Bullpen<\/option>/);
assert.match(js,/validType\(data\.type\)/);
assert.match(js,/state\.manualTypes=types/);
assert.match(js,/label\.textContent=isManual\?\(classification\|\|'Edited'\):'TrackMan'/);
assert.match(js,/type=\$\('dz-count-type'\)\.value/);
assert.match(js,/Select Game or Bullpen before saving/);
assert.match(js,/ref\.set\(\{date,month:state\.month,count:value,type,/);
assert.match(js,/delete state\.manualTypes\[date\]/);
assert.match(js,/manualCounts:\{\},manualTypes:\{\},autoDetails:\{\}/);
assert.match(rulesPart,/keys\(\)\.hasOnly\(\['date', 'month', 'count', 'type', 'updatedBy', 'updatedAt'\]\)/);
assert.match(rulesPart,/!request\.resource\.data\.keys\(\)\.hasAny\(\['type'\]\)/);
assert.match(rulesPart,/request\.resource\.data\.type in \['game', 'bullpen'\]/);
assert.match(cloud,/\['game','bullpen'\]\.includes\(item\.data\.type\)/);
assert.match(cloud,/\.\.\.\(item\.data\.type!=null\?\{type:item\.data\.type\}:\{\}\)/);
assert.match(profile,/class="kpis" id="kpis"/);
assert.match(css,/@media \(max-width:640px\)\{\s*#view-player \.kpis/);
assert.match(css,/#view-player \.kpis>.kpi\{[\s\S]*?grid-column:span 2/);
assert.match(css,/#view-player \.kpis>.kpi:nth-child\(n\+4\)\{[\s\S]*?grid-column:span 3/);
assert.match(css,/#view-player \.kpis>.kpi:last-child\{grid-column:span 3/);
assert.match(css,/#view-player \.kpi-value\{[\s\S]*?font-size:23px/);
console.log('Game/Bullpen calendar and compact two-row mobile KPI smoke tests passed.');
