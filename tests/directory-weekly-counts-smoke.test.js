/* Staff directory seven-day counts, automatic TrackMan records and manual overrides. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const week=require('../directory-weekly-counts.js');
const counts=require('../pitch-counts.js');
const dates=week.recentDays(new Date(2026,10,18,7,10));
assert.equal(dates.length,7);
assert.deepEqual(dates.map(d=>d.date),[
 '2026-11-12','2026-11-13','2026-11-14','2026-11-15',
 '2026-11-16','2026-11-17','2026-11-18'
]);
assert.equal(dates[0].label,'Thu 12');
assert.equal(dates[6].label,'Wed 18');
// No midnight/UTC off-by-one; daylight saving and month/year boundaries.
assert.deepEqual(week.recentDays(new Date(2026,10,1)).map(d=>d.date),[
 '2026-10-26','2026-10-27','2026-10-28','2026-10-29',
 '2026-10-30','2026-10-31','2026-11-01'
]);
assert.equal(week.recentDays(new Date(2027,0,2))[0].date,'2026-12-27');
assert.equal(week.recentDays(new Date(2024,2,2))[4].date,'2024-02-29');
assert.throws(()=>week.recentDays(new Date(NaN)));
const sessions=[
 {kind:'single',date:'2026-11-12',pitches:[{n:18},{n:0}]},
 {kind:'single',date:'2026-11-12',pitches:[{n:5}]},
 {kind:'single',date:'2026-11-13',pitches:[{n:20},{n:25}]},
 {kind:'single',date:'2026-11-14',pitches:[{n:30}]},
 {kind:'single',date:'2026-11-17',pitches:[{n:6}]},
 {kind:'single',date:'2026-11-19',pitches:[{n:99}]},
 {kind:'single',date:'2026-11-10',pitches:[{n:100}]},
 {kind:'historical',date:'2026-11-12',pitches:[{n:600}]},
 {kind:'baseline',date:'2026-11-13',pitches:[{n:900}]},
 {kind:'single',date:null,pitches:[{n:45}]}
];
const manuals=[
 {id:'2026-11-14',data:{date:'2026-11-14',count:12,type:'game'}},
 {id:'2026-11-15',data:{date:'2026-11-15',count:27,type:'bullpen'}},
 {id:'2026-11-17',data:{date:'2026-11-17',count:50}},
 {id:'2026-11-18',data:{date:'2026-11-17',count:99}}, // broken ID/date -> ignore
 {id:'2026-11-13',data:{date:'2026-11-13',count:0}},  // bad count -> ignore
 {id:'2026-11-10',data:{date:'2026-11-10',count:99}} // outside week -> ignore
];
const result=week.weekSummary(dates,sessions,manuals,counts);
assert.deepEqual(result.daily.map(d=>d.count),[23,45,12,27,0,50,0]);
assert.equal(result.total,157);
assert.equal(result.hasEntries,true);
assert.equal(result.daily[0].source,'trackman');
assert.equal(result.daily[2].source,'manual');
assert.equal(result.daily[2].type,'game');
assert.equal(result.daily[3].type,'bullpen');
assert.equal(result.daily[5].type,null); // older untyped manual corrections still apply
assert.equal(result.daily[4].hasEntry,false);
assert.equal(result.daily[6].hasEntry,false);
assert.equal(counts.band(result.daily[0].count),'orange');
assert.equal(counts.band(result.daily[1].count),'red');
assert.equal(counts.band(result.daily[2].count),'yellow');
assert.deepEqual(week.weekSummary(dates,[],[],counts).daily.map(d=>d.count),[0,0,0,0,0,0,0]);
assert.equal(week.weekSummary(dates,[],[],counts).hasEntries,false);
const boundaryDays=week.recentDays(new Date(2026,2,2));
const boundary=week.weekSummary(boundaryDays,[
 {kind:'single',date:'2026-02-28',pitches:[{n:21}]},
 {kind:'single',date:'2026-03-01',pitches:[{n:17}]}
],[{id:'2026-03-01',data:{date:'2026-03-01',count:9,type:'bullpen'}}],counts);
assert.equal(boundary.total,30);
assert.equal(boundary.daily.find(d=>d.date==='2026-02-28').count,21);
assert.equal(boundary.daily.find(d=>d.date==='2026-03-01').count,9);

const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('directory-weekly-counts.js','utf8');
const pitchJS=fs.readFileSync('pitch-counts.js','utf8');
const stage=fs.readFileSync('prepare-firebase-hosting.sh','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-firebase.yml','utf8');
for(const id of ['dz-directory-arsenal-view','dz-directory-weekly-view',
 'dz-weekly-status','dz-weekly-legend','dz-directory-order-text',
 'dz-directory-footnote','dz-directory-week-range']){
 assert.match(html,new RegExp('id="'+id+'"'));
}
assert.match(html,/Last 7 Days<\/button>/);
assert.match(html,/aria-pressed="true">Pitch Arsenal/);
assert.match(html,/\.dz-week-count-grid\{display:grid;grid-template-columns:repeat\(7,/);
assert.match(html,/\.dz-week-cell\.dz-week-yellow/);
assert.match(html,/\.dz-week-cell\.dz-week-orange/);
assert.match(html,/\.dz-week-cell\.dz-week-red/);
assert.match(html,/window\.DZ_WEEKLY_DIRECTORY_ON_RENDER\?\.\(\)/);
assert.match(html,/window\.DZ_WEEKLY_DIRECTORY_RESET\?\.\(\)/);
assert.match(html,/src="\.\/directory-weekly-counts\.js"/);
assert.ok(html.indexOf('src="./pitch-counts.js"')<html.indexOf('src="./directory-weekly-counts.js"'));
assert.ok(html.indexOf('src="./directory-weekly-counts.js"')<html.indexOf('src="./cloud.js"'));
assert.match(pitchJS,/window\.DZ_PITCH_COUNT_UTILS=helper/);
assert.match(js,/if\(!isStaff\(\)\)return;/);
assert.match(js,/\['admin','pitching_coach','coach'\]\.includes\(window\.DZ_ROLE\)/);
assert.match(js,/const pending=list\.filter\(row=>!state\.cache\.has\(row\.dataset\.playerId\)\)/);
assert.match(js,/length:Math\.min\(6,pending\.length\)/);
assert.match(stage,/directory-weekly-counts\.js/);
assert.match(workflow,/node tests\/directory-weekly-counts-smoke\.test\.js/);

// Both Firestore reads use a *single date field* index, not an all-players
// collection-group query that could bypass a parent's directory restriction.
const queryLog=[];
function mockCollection(kind){
 const conditions=[];
 return {
  where(field,op,value){queryLog.push([kind,field,op,value]);conditions.push([field,op,value]);return this;},
  async get(){
   const arr=kind==='sessions'?sessions:manuals;
   return {forEach(cb){for(const d of arr){
     const data=d.data||d;
     if(conditions.every(([field,op,value])=>op==='>='?data[field]>=value:data[field]<=value)){
       cb({id:d.id||'session-1',data:()=>data});
     }
   }}};
  }
 };
}
const db={collection(name){
 assert.equal(name,'players');
 return {doc(id){
   assert.equal(id,'pitcher-1');
   return {collection:mockCollection};
 }};
}};
(async()=>{
 const loaded=await week.loadPlayerWeek(db,'pitcher-1',dates,counts);
 assert.equal(loaded.total,157);
 assert.deepEqual(loaded.daily.map(d=>d.count),[23,45,12,27,0,50,0]);
 assert.deepEqual(queryLog,[
  ['sessions','date','>=','2026-11-12'],['sessions','date','<=','2026-11-18'],
  ['pitchCounts','date','>=','2026-11-12'],['pitchCounts','date','<=','2026-11-18']
 ]);
 console.log('Seven-day directory tests passed: week boundaries, sessions, manual precedence, 7-day total, filters and UI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
